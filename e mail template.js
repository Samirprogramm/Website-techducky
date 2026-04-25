const COUNTRY_NAMES = {
  CH: 'Schweiz',
  DE: 'Deutschland',
  AT: 'Oesterreich',
  FR: 'Frankreich',
  IT: 'Italien',
  OTHER: 'International'
};

const PAYMENT_LABELS = {
  standard: 'Stripe Checkout',
  apple_pay: 'Apple Pay via Stripe',
  google_pay: 'Google Pay via Stripe',
  bank_transfer: 'Bankueberweisung'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
  return `CHF ${Number(value || 0).toFixed(2)}`;
}

function formatTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat('de-CH', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function getCountryLabel(code) {
  return COUNTRY_NAMES[code] || code || 'International';
}

function getPaymentLabel(method) {
  return PAYMENT_LABELS[method] || 'Stripe Checkout';
}

function buildItemRows(items) {
  return items.map(item => `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #ececf5;vertical-align:top;">
        <div style="font-size:14px;font-weight:700;color:#151526;">${escapeHtml(item.name)}</div>
        <div style="margin-top:4px;font-size:12px;line-height:1.6;color:#6f7087;">${escapeHtml(item.summary || item.description || '')}</div>
        <div style="margin-top:8px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8a8ca4;">Menge ${item.qty}</div>
      </td>
      <td style="padding:16px 0;border-bottom:1px solid #ececf5;text-align:right;vertical-align:top;font-size:15px;font-weight:800;color:#151526;white-space:nowrap;">${formatCurrency(item.price * item.qty)}</td>
    </tr>
  `).join('');
}

function buildPlainText(order, intro) {
  const lines = [
    intro,
    '',
    `Bestellnummer: ${order.orderId}`,
    `Status: ${order.status}`,
    `Bezahlt am: ${formatTimestamp(order.paidAt || order.updatedAt)}`,
    `Zahlungsart: ${getPaymentLabel(order.requestedPayMethod)}`,
    '',
    'Artikel:'
  ];

  order.items.forEach(item => {
    lines.push(`- ${item.name} x${item.qty} (${formatCurrency(item.price * item.qty)})`);
  });

  lines.push('');
  lines.push(`Total: ${formatCurrency(order.total)}`);
  lines.push('');
  lines.push('Lieferadresse:');
  lines.push(`${order.customer.firstName} ${order.customer.lastName}`.trim());
  lines.push(order.customer.address);
  lines.push(`${order.customer.zip} ${order.customer.city}`.trim());
  lines.push(getCountryLabel(order.customer.country));

  if (order.customer.phone) {
    lines.push(`Telefon: ${order.customer.phone}`);
  }

  return lines.join('\n');
}

function buildShell({ eyebrow, title, subtitle, accentNote, detailCardTitle, detailCardBody, summaryRows, footerNote }) {
  return `<!DOCTYPE html>
<html lang="de">
  <body style="margin:0;background:#f4f5fb;padding:24px 12px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#151526;">
    <div style="max-width:680px;margin:0 auto;border-radius:28px;overflow:hidden;background:#ffffff;box-shadow:0 28px 90px rgba(17,18,35,0.08);">
      <div style="background:linear-gradient(135deg,#0f1020 0%,#191b31 48%,#263962 100%);padding:36px 32px 30px;">
        <div style="display:inline-block;padding:7px 14px;border-radius:999px;background:rgba(255,255,255,0.08);color:#d7dbff;font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(eyebrow)}</div>
        <h1 style="margin:18px 0 10px;font-size:30px;line-height:1.1;color:#ffffff;">${escapeHtml(title)}</h1>
        <p style="margin:0;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.72);">${escapeHtml(subtitle)}</p>
        <div style="margin-top:20px;display:inline-flex;align-items:center;gap:10px;padding:10px 16px;border-radius:16px;background:rgba(255,255,255,0.08);color:#ffffff;font-size:13px;font-weight:700;">${escapeHtml(accentNote)}</div>
      </div>

      <div style="padding:28px 28px 12px;">
        <div style="border:1px solid #ececf5;border-radius:22px;padding:20px 22px;background:#fcfcff;">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#7c5cfc;">${escapeHtml(detailCardTitle)}</div>
          <div style="margin-top:10px;font-size:14px;line-height:1.7;color:#50526a;">${detailCardBody}</div>
        </div>
      </div>

      <div style="padding:8px 28px 4px;">
        <div style="border:1px solid #ececf5;border-radius:22px;padding:22px;background:#ffffff;">
          <div style="display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:14px;">
            <div style="font-size:13px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#7a7d97;">Bestelluebersicht</div>
            <div style="font-size:13px;font-weight:700;color:#7c5cfc;">Bezahlt & bestaetigt</div>
          </div>
          <table role="presentation" style="width:100%;border-collapse:collapse;">${summaryRows}</table>
        </div>
      </div>

      <div style="padding:20px 28px 30px;">
        <div style="border:1px solid #ececf5;border-radius:22px;padding:18px 20px;background:#f8f9ff;">
          <div style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#7a7d97;">Hinweis</div>
          <p style="margin:10px 0 0;font-size:13px;line-height:1.7;color:#5d6078;">${escapeHtml(footerNote)}</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function buildCustomerEmail(order, supportEmail) {
  const subject = `Deine Tech Ducky Bestellung ${order.orderId}`;
  const summaryRows = `
    ${buildItemRows(order.items)}
    <tr>
      <td style="padding-top:16px;font-size:13px;color:#7a7d97;">Zwischensumme</td>
      <td style="padding-top:16px;text-align:right;font-size:13px;color:#5d6078;">${formatCurrency(order.subtotal)}</td>
    </tr>
    <tr>
      <td style="padding-top:6px;font-size:13px;color:#7a7d97;">Versand</td>
      <td style="padding-top:6px;text-align:right;font-size:13px;color:#16a34a;font-weight:700;">Kostenlos</td>
    </tr>
    <tr>
      <td style="padding-top:14px;border-top:2px solid #ececf5;font-size:16px;font-weight:800;color:#151526;">Total</td>
      <td style="padding-top:14px;border-top:2px solid #ececf5;text-align:right;font-size:20px;font-weight:900;color:#7c5cfc;">${formatCurrency(order.total)}</td>
    </tr>
  `;

  const detailBody = `
    <strong style="display:block;font-size:18px;color:#151526;">${escapeHtml(order.customer.firstName)} ${escapeHtml(order.customer.lastName)}</strong>
    <div style="margin-top:10px;">Bestellnummer: <strong>${escapeHtml(order.orderId)}</strong></div>
    <div>Zahlungsart: <strong>${escapeHtml(getPaymentLabel(order.requestedPayMethod))}</strong></div>
    <div>Bezahlt am: <strong>${escapeHtml(formatTimestamp(order.paidAt || order.updatedAt))}</strong></div>
    <div style="margin-top:12px;">Lieferadresse:<br>${escapeHtml(order.customer.address)}<br>${escapeHtml(order.customer.zip)} ${escapeHtml(order.customer.city)}<br>${escapeHtml(getCountryLabel(order.customer.country))}</div>
  `;

  const footerNote = supportEmail
    ? `Deine Bestellung ist jetzt fest bestaetigt. Falls du Fragen hast, antworte bitte nicht auf diese E-Mail, sondern schreibe an ${supportEmail}.`
    : 'Deine Bestellung ist jetzt fest bestaetigt. Wir melden uns mit Versand-Updates, sobald dein Paket unterwegs ist.';

  const html = buildShell({
    eyebrow: 'Payment confirmed',
    title: 'Danke fuer deinen Einkauf bei Tech Ducky',
    subtitle: 'Deine Zahlung wurde erfolgreich bestaetigt. Wir haben die Bestellung angenommen und die Versandvorbereitung gestartet.',
    accentNote: `Order ${order.orderId}`,
    detailCardTitle: 'Dein Kauf',
    detailCardBody: detailBody,
    summaryRows,
    footerNote
  });

  const text = buildPlainText(order, 'Danke fuer deine Bestellung bei Tech Ducky. Deine Zahlung wurde bestaetigt.');
  return { subject, html, text };
}

function buildAdminEmail(order) {
  const subject = `Neue bezahlte Bestellung ${order.orderId}`;
  const summaryRows = `
    ${buildItemRows(order.items)}
    <tr>
      <td style="padding-top:14px;border-top:2px solid #ececf5;font-size:16px;font-weight:800;color:#151526;">Total</td>
      <td style="padding-top:14px;border-top:2px solid #ececf5;text-align:right;font-size:20px;font-weight:900;color:#7c5cfc;">${formatCurrency(order.total)}</td>
    </tr>
  `;

  const phoneLine = order.customer.phone
    ? `<div>Telefon: <strong>${escapeHtml(order.customer.phone)}</strong></div>`
    : '';

  const detailBody = `
    <div>Kunde: <strong>${escapeHtml(order.customer.firstName)} ${escapeHtml(order.customer.lastName)}</strong></div>
    <div>E-Mail: <strong>${escapeHtml(order.customer.email)}</strong></div>
    ${phoneLine}
    <div style="margin-top:12px;">Adresse:<br>${escapeHtml(order.customer.address)}<br>${escapeHtml(order.customer.zip)} ${escapeHtml(order.customer.city)}<br>${escapeHtml(getCountryLabel(order.customer.country))}</div>
  `;

  const html = buildShell({
    eyebrow: 'Paid order',
    title: 'Neue bezahlte Bestellung',
    subtitle: 'Stripe hat die Zahlung bestaetigt. Die Kundenmail wurde verschickt oder erneut angestossen.',
    accentNote: `Order ${order.orderId}`,
    detailCardTitle: 'Kundendaten',
    detailCardBody: detailBody,
    summaryRows,
    footerNote: 'Diese Nachricht dient als interne Bestellbenachrichtigung.'
  });

  const text = buildPlainText(order, 'Neue bezahlte Bestellung bei Tech Ducky.');
  return { subject, html, text };
}

module.exports = {
  buildAdminEmail,
  buildCustomerEmail,
  COUNTRY_NAMES,
  PAYMENT_LABELS,
  formatCurrency
};
