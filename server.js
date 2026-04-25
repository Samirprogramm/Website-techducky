require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const express = require('express');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');

const PRODUCT_CATALOG = require('./catalog');
const {
  buildAdminEmail,
  buildCustomerEmail
} = require('./lib/emailTemplates');

const app = express();
const port = Number(process.env.PORT || 3000);
const baseUrl = String(process.env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
const orderStorePath = path.join(__dirname, 'data', 'orders.json');
const supportEmail = normalizeInput(process.env.SUPPORT_EMAIL) || 'support@techducky.ch';
const adminEmail = normalizeInput(process.env.ADMIN_EMAIL);
const smtpFrom = normalizeInput(process.env.SMTP_FROM);
const bankIban = normalizeInput(process.env.BANK_IBAN);
const bankAccountHolder = normalizeInput(process.env.BANK_ACCOUNT_HOLDER);
const bankName = normalizeInput(process.env.BANK_NAME);
const stripeWebhookSecret = normalizeInput(process.env.STRIPE_WEBHOOK_SECRET);
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' -]{0,99}$/u;
const ADDRESS_RE = /^[\p{L}\p{M}\d][\p{L}\p{M}\d\s.,'\/-]{4,299}$/u;
const CITY_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,99}$/u;
const POSTAL_RE = /^[A-Za-z0-9][A-Za-z0-9\s-]{1,19}$/;
const PHONE_RE = /^[+\d][\d\s()-]{5,29}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_COUNTRIES = new Set(['CH', 'DE', 'AT', 'FR', 'IT', 'OTHER']);
const ALLOWED_PAY_METHODS = new Set(['standard', 'apple_pay', 'google_pay', 'bank_transfer']);
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'self'",
  "media-src 'self'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https://i.imgur.com",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests'
].join('; ');

let storeQueue = Promise.resolve();
const rateLimitBuckets = new Map();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP_DIRECTIVES);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');

  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }

  next();
});

app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !stripeWebhookSecret) {
    res.status(503).json({ error: 'Stripe webhook ist noch nicht konfiguriert.' });
    return;
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    res.status(400).json({ error: 'Fehlende Stripe-Signatur.' });
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
  } catch (error) {
    res.status(400).json({ error: `Webhook konnte nicht verifiziert werden: ${error.message}` });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        await syncCheckoutSession(event.data.object);
        break;
      default:
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing failed:', error);
    res.status(500).json({ error: 'Webhook konnte nicht verarbeitet werden.' });
  }
});

app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => {
  const health = { ok: true };

  if (process.env.NODE_ENV !== 'production' || process.env.DETAILED_HEALTH === 'true') {
    health.stripeReady = Boolean(stripe);
    health.webhookReady = Boolean(stripeWebhookSecret);
    health.smtpReady = Boolean(createTransporter());
  }

  res.json(health);
});

app.post('/api/create-checkout-session', enforceRateLimit('checkout', 20, 15 * 60 * 1000), async (req, res) => {
  if (!hasTrustedOrigin(req)) {
    res.status(403).json({ error: 'Unbekannte Herkunft fuer Checkout-Anfrage.' });
    return;
  }

  const configErrors = getCheckoutConfigErrors();
  if (configErrors.length) {
    res.status(503).json({ error: configErrors.join(' ') });
    return;
  }

  let payload;
  try {
    payload = sanitizeCheckoutPayload(req.body);
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  const orderId = createOrderId();
  const now = new Date().toISOString();
  const subtotal = payload.items.reduce((sum, item) => sum + item.price * item.qty, 0);

  const orderRecord = {
    orderId,
    status: 'pending_payment',
    paymentStatus: 'unpaid',
    checkoutStatus: 'open',
    requestedPayMethod: payload.requestedPayMethod,
    createdAt: now,
    updatedAt: now,
    paidAt: null,
    subtotal,
    total: subtotal,
    currency: 'CHF',
    stripeSessionId: null,
    stripePaymentIntentId: null,
    customerEmailSent: false,
    adminEmailSent: false,
    lastEmailError: '',
    customer: payload.customer,
    items: payload.items
  };

  await withOrderStore(async store => {
    store.orders[orderId] = orderRecord;
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'de',
      billing_address_collection: 'required',
      customer_email: payload.customer.email,
      client_reference_id: orderId,
      line_items: payload.items.map(item => ({
        quantity: item.qty,
        price_data: {
          currency: 'chf',
          unit_amount: Math.round(item.price * 100),
          product_data: {
            name: item.name,
            description: item.summary
          }
        }
      })),
      payment_intent_data: {
        metadata: {
          orderId,
          requestedPayMethod: payload.requestedPayMethod
        }
      },
      metadata: {
        orderId,
        requestedPayMethod: payload.requestedPayMethod
      },
      success_url: `${baseUrl}/index.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/index.html?checkout=cancelled`
    });

    await withOrderStore(async store => {
      const current = store.orders[orderId];
      current.stripeSessionId = session.id;
      current.updatedAt = new Date().toISOString();
    });

    res.status(201).json({
      orderId,
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    await withOrderStore(async store => {
      const current = store.orders[orderId];
      if (!current) return;

      current.status = 'session_error';
      current.updatedAt = new Date().toISOString();
      current.lastEmailError = '';
    });

    console.error('Stripe checkout session creation failed:', error);
    res.status(500).json({ error: 'Stripe-Session konnte nicht erstellt werden.' });
  }
});

app.get('/api/checkout-session-status', enforceRateLimit('checkout-status', 60, 15 * 60 * 1000), async (req, res) => {
  if (!stripe) {
    res.status(503).json({ error: 'Stripe ist nicht konfiguriert.' });
    return;
  }

  const sessionId = normalizeInput(req.query.session_id);
  if (!sessionId || !/^cs_/i.test(sessionId)) {
    res.status(400).json({ error: 'Ungueltige Stripe-Session.' });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const order = await syncCheckoutSession(session);
    if (!order) {
      res.status(404).json({ error: 'Bestellung wurde nicht gefunden.' });
      return;
    }

    res.json({
      paid: session.payment_status === 'paid',
      sessionStatus: session.status,
      paymentStatus: session.payment_status,
      order: buildClientOrderSnapshot(order)
    });
  } catch (error) {
    console.error('Stripe checkout session lookup failed:', error);
    res.status(500).json({ error: 'Checkout-Status konnte nicht geladen werden.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/catalog.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'catalog.js'));
});

app.post('/api/create-bank-transfer-order', enforceRateLimit('bank-transfer', 20, 15 * 60 * 1000), async (req, res) => {
  if (!hasTrustedOrigin(req)) {
    res.status(403).json({ error: 'Unbekannte Herkunft fuer Checkout-Anfrage.' });
    return;
  }

  if (!bankIban || !bankAccountHolder) {
    res.status(503).json({ error: 'Bankueberweisung ist noch nicht konfiguriert. BANK_IBAN und BANK_ACCOUNT_HOLDER fehlen.' });
    return;
  }

  let payload;
  try {
    payload = sanitizeCheckoutPayload({
      ...req.body,
      requestedPayMethod: 'bank_transfer'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  const orderId = createOrderId();
  const now = new Date().toISOString();
  const subtotal = payload.items.reduce((sum, item) => sum + item.price * item.qty, 0);

  const orderRecord = {
    orderId,
    status: 'awaiting_bank_transfer',
    paymentStatus: 'pending_bank_transfer',
    checkoutStatus: 'bank_transfer_instructions',
    requestedPayMethod: 'bank_transfer',
    createdAt: now,
    updatedAt: now,
    paidAt: null,
    subtotal,
    total: subtotal,
    currency: 'CHF',
    stripeSessionId: null,
    stripePaymentIntentId: null,
    customerEmailSent: false,
    adminEmailSent: false,
    lastEmailError: '',
    bankTransfer: {
      iban: bankIban,
      accountHolder: bankAccountHolder,
      bankName,
      reference: orderId
    },
    customer: payload.customer,
    items: payload.items
  };

  await withOrderStore(async store => {
    store.orders[orderId] = orderRecord;
  });

  res.status(201).json({
    orderId,
    total: subtotal,
    currency: 'CHF',
    paymentStatus: 'pending_bank_transfer',
    bankTransfer: {
      iban: bankIban,
      accountHolder: bankAccountHolder,
      bankName,
      reference: orderId
    },
    order: buildClientOrderSnapshot(orderRecord)
  });
});

app.get('/app.js', (req, res) => {
  res.type('application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'app.js'));
});

app.get('/logo.jpg', (req, res) => {
  res.sendFile(path.join(__dirname, 'logo.jpg'), error => {
    if (error) {
      res.status(404).end();
    }
  });
});

app.listen(port, async () => {
  await ensureOrderStore();
  const configErrors = getCheckoutConfigErrors();
  console.log(`Tech Ducky server listening on ${baseUrl}`);

  if (configErrors.length) {
    console.warn('Checkout setup incomplete:', configErrors.join(' '));
  }
});

function normalizeInput(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function createTransporter() {
  const host = normalizeInput(process.env.SMTP_HOST);
  const portValue = Number(process.env.SMTP_PORT || 0);
  const user = normalizeInput(process.env.SMTP_USER);
  const pass = process.env.SMTP_PASS || '';

  if (!host || !portValue || !user || !pass || !smtpFrom) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: portValue,
    secure: portValue === 465,
    auth: {
      user,
      pass
    }
  });
}

function getCheckoutConfigErrors() {
  const errors = [];

  if (!stripe) {
    errors.push('STRIPE_SECRET_KEY fehlt.');
  }

  if (!stripeWebhookSecret) {
    errors.push('STRIPE_WEBHOOK_SECRET fehlt.');
  }

  if (!createTransporter()) {
    errors.push('SMTP-Konfiguration fehlt oder ist unvollstaendig.');
  }

  return errors;
}

function hasTrustedOrigin(req) {
  const origin = req.get('origin');
  const referer = req.get('referer');
  const source = origin || referer;
  if (!source) {
    return true;
  }

  try {
    return new URL(source).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function enforceRateLimit(name, maxRequests, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${name}:${getClientIp(req)}`;
    const bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      cleanupRateLimits(now);
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: 'Zu viele Anfragen. Bitte versuche es gleich noch einmal.' });
      return;
    }

    next();
  };
}

function getClientIp(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function cleanupRateLimits(now) {
  if (rateLimitBuckets.size < 500) {
    return;
  }

  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

function sanitizeCheckoutPayload(body) {
  const customer = sanitizeCustomer(body && body.customer);
  const items = sanitizeItems(body && body.items);
  const requestedPayMethod = normalizeInput(body && body.requestedPayMethod);

  if (!ALLOWED_PAY_METHODS.has(requestedPayMethod)) {
    throw new Error('Ungueltige Zahlungsart.');
  }

  return {
    customer,
    items,
    requestedPayMethod
  };
}

function sanitizeCustomer(customer) {
  const email = normalizeInput(customer && customer.email).toLowerCase();
  const firstName = normalizeInput(customer && customer.firstName);
  const lastName = normalizeInput(customer && customer.lastName);
  const address = normalizeInput(customer && customer.address);
  const zip = normalizeInput(customer && customer.zip);
  const city = normalizeInput(customer && customer.city);
  const country = normalizeInput(customer && customer.country);
  const phone = normalizeInput(customer && customer.phone);

  if (!EMAIL_RE.test(email)) {
    throw new Error('Bitte gib eine gueltige E-Mail-Adresse ein.');
  }
  if (!NAME_RE.test(firstName) || !NAME_RE.test(lastName)) {
    throw new Error('Bitte gib einen gueltigen Vor- und Nachnamen ein.');
  }
  if (!ADDRESS_RE.test(address)) {
    throw new Error('Bitte gib eine gueltige Strasse und Hausnummer ein.');
  }
  if (!CITY_RE.test(city)) {
    throw new Error('Bitte gib einen gueltigen Ort ein.');
  }
  if (!POSTAL_RE.test(zip)) {
    throw new Error('Bitte gib eine gueltige PLZ ein.');
  }
  if (!ALLOWED_COUNTRIES.has(country)) {
    throw new Error('Bitte waehle ein gueltiges Land aus.');
  }
  if (phone && !PHONE_RE.test(phone)) {
    throw new Error('Bitte gib eine gueltige Telefonnummer ein.');
  }

  return {
    email,
    firstName,
    lastName,
    address,
    zip,
    city,
    country,
    phone
  };
}

function sanitizeItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 25) {
    throw new Error('Dein Warenkorb ist leer oder ungueltig.');
  }

  return items.map(item => {
    const id = normalizeInput(item && item.id);
    const qty = Number(item && item.qty);
    const product = PRODUCT_CATALOG[id];

    if (!product) {
      throw new Error('Ein Artikel im Warenkorb ist ungueltig.');
    }

    if (!Number.isInteger(qty) || qty < 1 || qty > 25) {
      throw new Error('Eine Artikelmenge ist ungueltig.');
    }

    return {
      id,
      name: product.name,
      price: Number(product.price),
      qty,
      summary: product.summary,
      description: product.description
    };
  });
}

function createOrderId() {
  return `DK-${crypto.randomUUID().split('-')[0].toUpperCase()}`;
}

async function ensureOrderStore() {
  await fs.mkdir(path.dirname(orderStorePath), { recursive: true });

  try {
    await fs.access(orderStorePath);
  } catch {
    await fs.writeFile(orderStorePath, JSON.stringify({ orders: {} }, null, 2));
  }
}

async function readOrderStore() {
  await ensureOrderStore();
  const raw = await fs.readFile(orderStorePath, 'utf8');
  const parsed = JSON.parse(raw || '{"orders":{}}');

  if (!parsed.orders || typeof parsed.orders !== 'object') {
    parsed.orders = {};
  }

  return parsed;
}

function withOrderStore(mutator) {
  const previousQueue = storeQueue;
  const next = previousQueue.then(async () => {
    const store = await readOrderStore();
    const result = await mutator(store);
    await fs.writeFile(orderStorePath, JSON.stringify(store, null, 2));
    return result;
  });

  storeQueue = next.catch(() => undefined);
  return next;
}

function buildClientOrderSnapshot(order) {
  if (!order) {
    return null;
  }

  return {
    orderId: order.orderId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paidAt: order.paidAt,
    total: order.total,
    requestedPayMethod: order.requestedPayMethod,
    customerEmailSent: Boolean(order.customerEmailSent),
    customer: {
      firstName: order.customer && order.customer.firstName,
      lastName: order.customer && order.customer.lastName,
      email: order.customer && order.customer.email
    },
    items: Array.isArray(order.items)
      ? order.items.map(item => ({
          id: item.id,
          name: item.name,
          qty: item.qty,
          price: item.price,
          summary: item.summary
        }))
      : []
  };
}

async function syncCheckoutSession(session) {
  const orderId = normalizeInput(session && (session.client_reference_id || (session.metadata && session.metadata.orderId)));
  if (!orderId) {
    return null;
  }

  return withOrderStore(async store => {
    const now = new Date().toISOString();
    const current = store.orders[orderId];
    if (!current) {
      console.warn(`Ignoring Stripe session for unknown order ${orderId}.`);
      return null;
    }

    current.updatedAt = now;
    current.checkoutStatus = session.status || current.checkoutStatus;
    current.paymentStatus = session.payment_status || current.paymentStatus;
    current.stripeSessionId = session.id || current.stripeSessionId || null;
    current.stripePaymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : current.stripePaymentIntentId || null;

    if (session.customer_details) {
      current.customer.email = normalizeInput(session.customer_details.email || current.customer.email);
      current.customer.phone = normalizeInput(session.customer_details.phone || current.customer.phone);
    }

    if (session.payment_status === 'paid') {
      current.status = 'paid';
      current.paidAt = current.paidAt || now;
    } else if (session.status === 'expired') {
      current.status = 'expired';
    } else {
      current.status = 'pending_payment';
    }

    const transporter = createTransporter();
    if (current.status === 'paid' && transporter) {
      await maybeSendOrderEmails(current, transporter);
    }

    store.orders[orderId] = current;
    return current;
  });
}

async function maybeSendOrderEmails(order, transporter) {
  order.lastEmailError = '';

  if (!order.customerEmailSent && order.customer.email) {
    try {
      const email = buildCustomerEmail(order, supportEmail);
      await transporter.sendMail({
        from: smtpFrom,
        to: order.customer.email,
        subject: email.subject,
        html: email.html,
        text: email.text
      });
      order.customerEmailSent = true;
    } catch (error) {
      order.lastEmailError = `customer:${error.message}`;
      console.error(`Customer email failed for ${order.orderId}:`, error);
    }
  }

  if (adminEmail && !order.adminEmailSent) {
    try {
      const email = buildAdminEmail(order);
      await transporter.sendMail({
        from: smtpFrom,
        to: adminEmail,
        subject: email.subject,
        html: email.html,
        text: email.text
      });
      order.adminEmailSent = true;
    } catch (error) {
      order.lastEmailError = order.lastEmailError
        ? `${order.lastEmailError}; admin:${error.message}`
        : `admin:${error.message}`;
      console.error(`Admin email failed for ${order.orderId}:`, error);
    }
  }
}
