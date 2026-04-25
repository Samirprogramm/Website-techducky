(() => {
    const LOGO_SRC = 'logo.jpg';
    const PRODUCT_CATALOG = window.TECH_DUCKY_PRODUCTS || {};
    const PRODUCT_ORDER = ['ducky-v1', 'ducky-v1-case-rubber', 'enclosure-clear', 'enclosure-black'];
    document.querySelectorAll('img[src="logo.jpg"]').forEach(img => img.src = LOGO_SRC);

    // ===== SECURITY: XSS Sanitization =====
    function esc(str) {
      const d = document.createElement('div');
      d.textContent = String(str ?? '');
      return d.innerHTML;
    }

    function normalizeInput(value) {
      return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function isValidName(value) {
      return /^[\p{L}\p{M}][\p{L}\p{M}' -]{0,99}$/u.test(value);
    }

    function isValidAddress(value) {
      return /^[\p{L}\p{M}\d][\p{L}\p{M}\d\s.,'\/-]{4,299}$/u.test(value);
    }

    function isValidCity(value) {
      return /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,99}$/u.test(value);
    }

    function isValidPostalCode(value) {
      return /^[A-Za-z0-9][A-Za-z0-9\s-]{1,19}$/.test(value);
    }

    function isValidPhone(value) {
      return /^[+\d][\d\s()-]{5,29}$/.test(value);
    }

    function isAllowedStripeLink(value) {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && (url.hostname === 'stripe.com' || url.hostname === 'buy.stripe.com' || url.hostname.endsWith('.stripe.com'));
      } catch {
        return false;
      }
    }

    function getSafeCartItems(items) {
      if (!Array.isArray(items) || items.length === 0 || items.length > 25) return null;

      const safeItems = items.map(item => {
        const safeName = normalizeInput(item?.name);
        const safePrice = Number(item?.price);
        const safeQty = Number(item?.qty);
        const safeId = normalizeInput(item?.id);
        const product = PRODUCT_CATALOG[safeId];

        if (!product || !safeName || safeName.length > 120) return null;
        if (!Number.isFinite(safePrice) || safePrice < 0 || safePrice > 100000) return null;
        if (!Number.isInteger(safeQty) || safeQty < 1 || safeQty > 99) return null;
        if (safeName !== product.name) return null;
        if (Math.abs(safePrice - Number(product.price)) > 0.001) return null;

        return {
          id: safeId,
          name: product.name,
          price: Number(product.price),
          qty: safeQty
        };
      });

      return safeItems.every(Boolean) ? safeItems : null;
    }

    function setCheckoutButtonDefault(totalText) {
      coSubmitBtn.disabled = false;
      coSubmitBtn.replaceChildren('💳 Mit Karte bezahlen — ');

      const totalSpan = document.createElement('span');
      totalSpan.id = 'coTotalBtn';
      totalSpan.textContent = totalText;
      coSubmitBtn.appendChild(totalSpan);
    }

    function setCheckoutButtonLoading() {
      coSubmitBtn.disabled = true;
      coSubmitBtn.replaceChildren();

      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      spinner.setAttribute('aria-hidden', 'true');

      coSubmitBtn.append(spinner, ' Bestellung wird vorbereitet...');
    }

    // ===== SECURITY: Rate Limiting =====
    let lastSubmitTime = 0;
    let checkoutFormOpenedAt = 0;
    const SUBMIT_COOLDOWN = 5000; // 5 Sekunden zwischen Bestellungen
    const MIN_CHECKOUT_FILL_MS = 1200;

    // Particle constellation background removed — replaced by CSS `#bgCanvas` mesh + orbs.

    // ===== NAV =====
    const nav = document.getElementById('nav');
    const progressBar = document.getElementById('scrollProgress');
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', scrollY > 50);
      // Scroll progress
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      if (docH > 0) progressBar.style.width = (scrollY / docH * 100) + '%';
    }, { passive: true });

    // ===== FULLSCREEN MOBILE MENU =====
    const hb = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileMenuClose = document.getElementById('mobileMenuClose');
    const mobileThemeToggle = document.getElementById('mobileThemeToggle');
    const mobileCartToggle = document.getElementById('mobileCartToggle');
    let mmScrollPos = 0;

    function openMobileMenu() {
      mmScrollPos = window.scrollY;
      mobileMenu.classList.add('open');
      hb.classList.add('open');
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    function closeMobileMenu() {
      mobileMenu.classList.remove('open');
      hb.classList.remove('open');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }

    hb.addEventListener('click', () => {
      if (mobileMenu.classList.contains('open')) closeMobileMenu();
      else openMobileMenu();
    });
    mobileMenuClose.addEventListener('click', closeMobileMenu);

    // Close on link click
    mobileMenu.querySelectorAll('.mm-link').forEach(a => {
      a.addEventListener('click', closeMobileMenu);
    });

    // Mobile theme toggle
    mobileThemeToggle.addEventListener('click', () => {
      document.getElementById('themeToggle').click();
    });

    // Mobile cart toggle
    mobileCartToggle.addEventListener('click', () => {
      closeMobileMenu();
      document.getElementById('cartToggle').click();
    });

    // ===== SCROLL REVEAL (STAGGERED) =====
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          // Stagger cards within same parent grid
          const parent = e.target.parentElement;
          if (parent && parent.classList.contains('cat-grid')) {
            const cards = [...parent.querySelectorAll('[data-anim]')];
            const idx = cards.indexOf(e.target);
            setTimeout(() => e.target.classList.add('visible'), idx * 80);
          } else {
            e.target.classList.add('visible');
          }
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('[data-anim]').forEach(el => obs.observe(el));

    // ===== THEME TOGGLE =====
    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('ducky-theme');
    if (savedTheme) document.documentElement.dataset.theme = savedTheme;

    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme;
      const next = current === 'light' ? 'dark' : 'light';
      if (next === 'dark') {
        delete document.documentElement.dataset.theme;
      } else {
        document.documentElement.dataset.theme = next;
      }
      localStorage.setItem('ducky-theme', next);
    });

    // ===== SMOOTH SCROLL =====
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const h = a.getAttribute('href'); if (h === '#') return;
        const t = document.querySelector(h); if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
      });
    });

    // ===== INTERACTION GUARDS =====
    let lastTouchEnd = 0;
    document.addEventListener('touchend', event => {
      const now = Date.now();
      if (now - lastTouchEnd <= 280) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });
    document.addEventListener('gesturestart', event => event.preventDefault());
    document.addEventListener('dragstart', event => {
      if (event.target instanceof HTMLImageElement) {
        event.preventDefault();
      }
    });

    document.querySelectorAll('.variant-pills').forEach(group => {
      group.addEventListener('click', event => {
        const button = event.target instanceof HTMLElement ? event.target.closest('.variant-pill') : null;
        if (!button) return;
        group.querySelectorAll('.variant-pill').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
      });
    });

    // ===== PRODUCT GRID =====
    const productGrid = document.getElementById('productGrid');

    function renderProductGrid() {
      if (!productGrid) return;

      const fragment = document.createDocumentFragment();

      PRODUCT_ORDER.filter(productId => productId !== 'ducky-v1').forEach(productId => {
        const product = PRODUCT_CATALOG[productId];
        if (!product) return;

        const card = document.createElement('article');
        card.className = 'product-card';
        card.setAttribute('data-anim', '');

        const media = document.createElement('div');
        media.className = 'product-media';

        const mediaImg = document.createElement('img');
        mediaImg.src = LOGO_SRC;
        mediaImg.alt = product.name;

        const mediaLabel = document.createElement('span');
        mediaLabel.textContent = product.badge;

        media.append(mediaImg, mediaLabel);

        const top = document.createElement('div');
        top.className = 'product-top';

        const badge = document.createElement('span');
        badge.className = 'product-badge';
        badge.textContent = product.badge;

        const price = document.createElement('span');
        price.className = 'product-price';
        price.textContent = 'CHF ' + Number(product.price).toFixed(2);

        top.append(badge, price);

        const body = document.createElement('div');
        body.className = 'product-body';

        const title = document.createElement('h3');
        title.className = 'product-title';
        title.textContent = product.name;

        const copy = document.createElement('p');
        copy.className = 'product-copy';
        copy.textContent = product.description;

        const list = document.createElement('ul');
        list.className = 'product-list';
        product.features.slice(0, 4).forEach(feature => {
          const item = document.createElement('li');
          item.textContent = feature;
          list.appendChild(item);
        });

        body.append(title, copy, list);

        const action = document.createElement('div');
        action.className = 'product-action';

        const note = document.createElement('span');
        note.className = 'product-note';
        note.textContent = product.summary;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-primary add-to-cart-btn product-add-btn';
        button.dataset.product = product.id;
        button.dataset.name = product.name;
        button.dataset.price = String(product.price);
        button.textContent = 'In den Warenkorb';

        action.append(note, button);
        card.append(media, top, body, action);
        fragment.appendChild(card);
      });

      productGrid.replaceChildren(fragment);
    }

    renderProductGrid();

    // ===== SHOPPING CART =====
    const cart = { items: [] };
    const cartOverlay = document.getElementById('cartOverlay');
    const cartDrawer = document.getElementById('cartDrawer');
    const cartToggle = document.getElementById('cartToggle');
    const cartClose = document.getElementById('cartClose');
    const cartBody = document.getElementById('cartBody');
    const cartEmpty = document.getElementById('cartEmpty');
    const cartBadge = document.getElementById('cartBadge');
    const cartHeadCount = document.getElementById('cartHeadCount');
    const cartTotal = document.getElementById('cartTotal');
    const cartCheckout = document.getElementById('cartCheckout');

    let scrollPos = 0;

    function resetBodyLock(restoreScroll) {
      document.body.classList.remove('cart-open');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      if (restoreScroll) {
        window.scrollTo(0, scrollPos);
      }
    }

    resetBodyLock(false);
    window.addEventListener('pageshow', () => resetBodyLock(false));

    function openCart() {
      scrollPos = window.scrollY;
      document.body.classList.add('cart-open');
      cartOverlay.classList.add('open');
      cartDrawer.classList.add('open');
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = -scrollPos + 'px';
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
    }
    function closeCart() {
      cartOverlay.classList.remove('open');
      cartDrawer.classList.remove('open');
      resetBodyLock(true);
    }

    cartToggle.addEventListener('click', openCart);
    cartClose.addEventListener('click', closeCart);
    cartOverlay.addEventListener('click', closeCart);

    function getTotalQty() { return cart.items.reduce((s, i) => s + i.qty, 0); }
    function getTotalPrice() { return cart.items.reduce((s, i) => s + i.price * i.qty, 0); }

    function renderCart() {
      const qty = getTotalQty();
      const total = getTotalPrice();

      // Badge
      cartBadge.textContent = qty;
      cartBadge.classList.toggle('show', qty > 0);
      cartHeadCount.textContent = qty;
      cartTotal.textContent = 'CHF ' + total.toFixed(2);
      cartCheckout.disabled = qty === 0;

      // Items
      const existingItems = cartBody.querySelectorAll('.cart-item');
      existingItems.forEach(el => el.remove());

      if (qty === 0) {
        cartEmpty.style.display = 'flex';
      } else {
        cartEmpty.style.display = 'none';
        const fragment = document.createDocumentFragment();
        cart.items.forEach((item, idx) => {
          const product = PRODUCT_CATALOG[item.id];
          const div = document.createElement('div');
          div.className = 'cart-item';

          const imageWrap = document.createElement('div');
          imageWrap.className = 'cart-item-img';
          const image = document.createElement('img');
          image.src = LOGO_SRC;
          image.alt = item.name;
          imageWrap.appendChild(image);

          const info = document.createElement('div');
          info.className = 'cart-item-info';

          const name = document.createElement('span');
          name.className = 'cart-item-name';
          name.textContent = item.name;

          const variant = document.createElement('span');
          variant.className = 'cart-item-variant';
          variant.textContent = item.summary || (product && product.summary) || 'Research hardware';

          const bottom = document.createElement('div');
          bottom.className = 'cart-item-bottom';

          const qtyWrap = document.createElement('div');
          qtyWrap.className = 'cart-qty';

          const decBtn = document.createElement('button');
          decBtn.type = 'button';
          decBtn.dataset.action = 'dec';
          decBtn.dataset.idx = String(idx);
          decBtn.textContent = '−';

          const qtyValue = document.createElement('span');
          qtyValue.textContent = String(item.qty);

          const incBtn = document.createElement('button');
          incBtn.type = 'button';
          incBtn.dataset.action = 'inc';
          incBtn.dataset.idx = String(idx);
          incBtn.textContent = '+';

          const price = document.createElement('span');
          price.className = 'cart-item-price';
          price.textContent = 'CHF ' + (item.price * item.qty).toFixed(2);

          qtyWrap.append(decBtn, qtyValue, incBtn);
          bottom.append(qtyWrap, price);
          info.append(name, variant, bottom);
          div.append(imageWrap, info);
          fragment.appendChild(div);
        });
        cartBody.appendChild(fragment);
      }
    }

    function addToCart(productId, name, price, options = {}) {
      const product = PRODUCT_CATALOG[productId];
      const safeName = product ? product.name : normalizeInput(name);
      const parsedPrice = product ? Number(product.price) : parseFloat(price);
      const safeSummary = product ? product.summary : 'Research hardware';
      const openAfter = options.openAfter !== false;
      if (!productId || !safeName || !Number.isFinite(parsedPrice) || parsedPrice < 0) return;

      const existing = cart.items.find(i => i.id === productId);
      if (existing) {
        existing.qty++;
        existing.summary = safeSummary;
        existing.name = safeName;
        existing.price = parsedPrice;
      } else {
        cart.items.push({ id: productId, name: safeName, price: parsedPrice, summary: safeSummary, qty: 1 });
      }
      renderCart();
      // Badge bump animation
      cartBadge.classList.remove('bump');
      void cartBadge.offsetWidth;
      cartBadge.classList.add('bump');
      if (openAfter) {
        openCart();
      }
    }

    // Quantity buttons (event delegation)
    cartBody.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      const action = btn.dataset.action;
      if (action === 'inc') {
        cart.items[idx].qty++;
      } else if (action === 'dec') {
        cart.items[idx].qty--;
        if (cart.items[idx].qty <= 0) cart.items.splice(idx, 1);
      }
      renderCart();
    });

    // Add-to-cart buttons
    document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        if (btn.id === 'heroBuyBtn' && document.getElementById('bundleCase')?.checked) {
          const caseProduct = PRODUCT_CATALOG['ducky-v1-case-rubber'];
          addToCart(btn.dataset.product, btn.dataset.name, btn.dataset.price, { openAfter: false });
          if (caseProduct) {
            addToCart(caseProduct.id, caseProduct.name, caseProduct.price);
          } else {
            openCart();
          }
          return;
        }

        addToCart(btn.dataset.product, btn.dataset.name, btn.dataset.price);
      });
    });

    // Checkout — opens legal disclaimer modal
    const checkoutOverlay = document.getElementById('checkoutLegalOverlay');
    const checkoutModal = document.getElementById('checkoutLegalModal');
    const checkoutClose = document.getElementById('checkoutLegalClose');
    const checkoutAcceptBox = document.getElementById('checkoutAcceptBox');
    const checkoutProceedBtn = document.getElementById('checkoutProceedBtn');

    function openCheckoutLegal() {
      checkoutAcceptBox.checked = false;
      checkoutProceedBtn.classList.remove('enabled');
      checkoutProceedBtn.disabled = true;
      checkoutOverlay.classList.add('open');
      checkoutModal.classList.add('open');
    }
    function closeCheckoutLegal() {
      checkoutOverlay.classList.remove('open');
      checkoutModal.classList.remove('open');
    }

    cartCheckout.addEventListener('click', () => {
      if (getTotalQty() === 0) return;
      closeCart();
      openCheckoutLegal();
    });

    checkoutClose.addEventListener('click', closeCheckoutLegal);
    checkoutOverlay.addEventListener('click', closeCheckoutLegal);

    checkoutAcceptBox.addEventListener('change', () => {
      if (checkoutAcceptBox.checked) {
        checkoutProceedBtn.classList.add('enabled');
        checkoutProceedBtn.disabled = false;
      } else {
        checkoutProceedBtn.classList.remove('enabled');
        checkoutProceedBtn.disabled = true;
      }
    });

    checkoutProceedBtn.addEventListener('click', () => {
      if (!checkoutAcceptBox.checked) return;
      closeCheckoutLegal();
      openCheckoutForm();
    });

    // ===== CHECKOUT FORM =====
    const coFormOverlay = document.getElementById('checkoutFormOverlay');
    const coFormModal = document.getElementById('checkoutFormModal');
    const coFormClose = document.getElementById('checkoutFormClose');
    const coForm = document.getElementById('checkoutForm');
    const coOrderSummary = document.getElementById('coOrderSummary');
    const coTotalBtn = document.getElementById('coTotalBtn');
    const coSubmitBtn = document.getElementById('coSubmitBtn');
    const coSuccess = document.getElementById('coSuccess');
    const coOrderId = document.getElementById('coOrderId');
    const coHoneypot = document.getElementById('coWebsite');
    const coModalTitle = coFormModal.querySelector('h2');
    const coModalSubtitle = coFormModal.querySelector('.modal-subtitle');
    const coSteps = coFormModal.querySelector('.checkout-steps');
    const coSecure = coFormModal.querySelector('.co-secure');
    const coSuccessTitle = coSuccess.querySelector('h3');
    const coSuccessMessage = coSuccess.querySelector('p');

    function setCheckoutStepState(mode) {
      const steps = coFormModal.querySelectorAll('.checkout-step');
      steps.forEach((step, index) => {
        step.classList.remove('done', 'active');
        if (mode === 'success') {
          step.classList.add('done');
          return;
        }
        if (index === 0) step.classList.add('done');
        if (index === 1) step.classList.add('active');
      });
    }

    function showCheckoutStatus(title, message, orderId) {
      coForm.style.display = 'none';
      coOrderSummary.style.display = 'none';
      coModalSubtitle.style.display = 'none';
      coSteps.style.display = 'none';
      coSecure.style.display = 'none';
      coSuccess.style.display = '';
      coSuccessTitle.textContent = title;
      coSuccessMessage.textContent = message;
      coOrderId.textContent = orderId ? 'Bestellnummer: ' + orderId : '';
    }

    function showCheckoutSuccessState(order) {
      const firstName = order?.customer?.firstName ? ', ' + order.customer.firstName : '';
      showCheckoutStatus(
        'Zahlung bestätigt' + firstName + '!',
        order?.customerEmailSent
          ? 'Deine Zahlung wurde bestätigt und deine Bestätigungs-E-Mail wurde verschickt.'
          : 'Deine Zahlung wurde bestätigt. Die Bestätigungs-E-Mail wird jetzt verarbeitet.',
        order?.orderId
      );
      coModalTitle.textContent = '🎉 Danke' + firstName + '!';
      setCheckoutStepState('success');
      cart.items = [];
      renderCart();
      coForm.reset();
      coHoneypot.value = '';
    }

    function renderCheckoutSummary() {
      const fragment = document.createDocumentFragment();
      const heading = document.createElement('h4');
      heading.textContent = 'Bestellübersicht';
      fragment.appendChild(heading);

      cart.items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'co-order-item';

        const label = document.createElement('span');
        label.textContent = item.name + ' ';

        const qty = document.createElement('span');
        qty.className = 'item-qty';
        qty.textContent = '×' + item.qty;
        label.appendChild(qty);

        const price = document.createElement('span');
        price.textContent = 'CHF ' + (item.price * item.qty).toFixed(2);

        row.append(label, price);
        fragment.appendChild(row);
      });

      const totalRow = document.createElement('div');
      totalRow.className = 'co-order-total';

      const totalLabel = document.createElement('span');
      totalLabel.textContent = 'Total';

      const totalValue = document.createElement('span');
      totalValue.textContent = 'CHF ' + getTotalPrice().toFixed(2);

      totalRow.append(totalLabel, totalValue);
      fragment.appendChild(totalRow);

      coOrderSummary.replaceChildren(fragment);
    }

    function openCheckoutForm() {
      // Render order summary
      checkoutFormOpenedAt = Date.now();
      coHoneypot.value = '';
      renderCheckoutSummary();

      // Reset form state
      coForm.style.display = '';
      coOrderSummary.style.display = '';
      coSuccess.style.display = 'none';
      setCheckoutButtonDefault('CHF ' + getTotalPrice().toFixed(2));
      coModalTitle.textContent = '🛒 Checkout';
      coModalSubtitle.style.display = '';
      coSteps.style.display = '';
      coSecure.style.display = '';
      coSuccessTitle.textContent = 'Zahlung bestätigt!';
      coSuccessMessage.textContent = 'Deine Zahlung wurde bestätigt. Die Bestätigungs-E-Mail wird jetzt verarbeitet.';
      coOrderId.textContent = '';
      setCheckoutStepState('form');

      coFormOverlay.classList.add('open');
      coFormModal.classList.add('open');
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    function closeCheckoutForm() {
      coFormOverlay.classList.remove('open');
      coFormModal.classList.remove('open');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }

    coFormClose.addEventListener('click', closeCheckoutForm);
    coFormOverlay.addEventListener('click', closeCheckoutForm);

    async function createCheckoutSession(payload) {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Der Checkout konnte nicht gestartet werden.');
      }
      if (!data.url) {
        throw new Error('Stripe-Checkout URL fehlt.');
      }

      return data;
    }

    async function createBankTransferOrder(payload) {
      const response = await fetch('/api/create-bank-transfer-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Die Bankueberweisung konnte nicht vorbereitet werden.');
      }
      if (!data.bankTransfer || !data.bankTransfer.iban) {
        throw new Error('IBAN fuer Bankueberweisung fehlt.');
      }

      return data;
    }

    async function verifyCheckoutReturnFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const sessionId = normalizeInput(params.get('session_id'));
      const cancelled = params.get('checkout') === 'cancelled';

      if (!sessionId && !cancelled) {
        return;
      }

      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('session_id');
      cleanUrl.searchParams.delete('checkout');
      window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.hash);

      if (cancelled && !sessionId) {
        alert('Die Zahlung wurde abgebrochen. Die Bestellung wurde nicht abgeschlossen.');
        return;
      }

      openCheckoutForm();
      showCheckoutStatus(
        'Zahlung wird geprüft...',
        'Wir bestätigen deine Stripe-Zahlung und senden danach automatisch deine Bestätigungs-E-Mail.',
        ''
      );
      coModalTitle.textContent = '⏳ Zahlung wird geprüft';

      try {
        const response = await fetch('/api/checkout-session-status?session_id=' + encodeURIComponent(sessionId), {
          headers: { 'Accept': 'application/json' }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'Der Zahlungsstatus konnte nicht geladen werden.');
        }
        if (!data.paid || !data.order) {
          throw new Error('Die Zahlung wurde noch nicht bestätigt. Die Bestellung wurde nicht abgeschlossen.');
        }

        showCheckoutSuccessState(data.order);
      } catch (error) {
        lastSubmitTime = 0;
        closeCheckoutForm();
        alert(error.message || 'Der Zahlungsstatus konnte nicht geladen werden.');
      }
    }

    async function processOrder(payMethod) {
      // Validate form
      if (!cart.items.length) {
        alert('Dein Warenkorb ist leer.');
        return;
      }

      const email = normalizeInput(document.getElementById('coEmail').value);
      const first = normalizeInput(document.getElementById('coFirst').value);
      const last = normalizeInput(document.getElementById('coLast').value);
      const address = normalizeInput(document.getElementById('coAddress').value);
      const zip = normalizeInput(document.getElementById('coZip').value);
      const city = normalizeInput(document.getElementById('coCity').value);
      const country = document.getElementById('coCountry').value;
      const phone = normalizeInput(document.getElementById('coPhone').value);
      const honeypot = normalizeInput(coHoneypot.value);
      const safeCartItems = getSafeCartItems(cart.items);
      const allowedPayMethods = new Set(['standard', 'apple_pay', 'google_pay', 'bank_transfer']);
      const allowedCountries = new Set(['CH', 'DE', 'AT', 'FR', 'IT', 'OTHER']);

      document.getElementById('coEmail').value = email;
      document.getElementById('coFirst').value = first;
      document.getElementById('coLast').value = last;
      document.getElementById('coAddress').value = address;
      document.getElementById('coZip').value = zip;
      document.getElementById('coCity').value = city;
      document.getElementById('coPhone').value = phone;

      if (honeypot) {
        console.warn('Blocked suspicious checkout submission.');
        return;
      }

      if (!email || !first || !last || !address || !zip || !city) {
        alert('Bitte fülle alle Pflichtfelder aus.');
        return;
      }

      if (!safeCartItems) {
        alert('Dein Warenkorb enthält ungültige Daten. Bitte lade die Seite neu.');
        return;
      }

      if (!allowedPayMethods.has(payMethod)) {
        alert('Ungültige Zahlungsmethode.');
        return;
      }

      if (!allowedCountries.has(country)) {
        alert('Bitte wähle ein gültiges Land aus.');
        return;
      }

      // Email format validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert('Bitte gib eine gültige E-Mail-Adresse ein.');
        return;
      }

      if (!isValidName(first) || !isValidName(last)) {
        alert('Bitte gib einen gültigen Vor- und Nachnamen ein.');
        return;
      }

      if (!isValidAddress(address)) {
        alert('Bitte gib eine gültige Strasse und Hausnummer ein.');
        return;
      }

      if (!isValidCity(city)) {
        alert('Bitte gib einen gültigen Ort ein.');
        return;
      }

      // ===== SECURITY: Rate Limiting =====
      const now = Date.now();
      if (checkoutFormOpenedAt && now - checkoutFormOpenedAt < MIN_CHECKOUT_FILL_MS) {
        alert('Bitte prüfe deine Angaben kurz und versuche es erneut.');
        return;
      }
      if (now - lastSubmitTime < SUBMIT_COOLDOWN) {
        alert('Bitte warte einen Moment bevor du erneut bestellst.');
        return;
      }
      lastSubmitTime = now;

      // ===== SECURITY: Input Length Validation =====
      if (first.length > 100 || last.length > 100 || address.length > 300 || city.length > 100 || zip.length > 20 || phone.length > 30) {
        alert('Eingabe zu lang. Bitte überprüfe deine Daten.');
        return;
      }

      // ZIP format validation
      if (!isValidPostalCode(zip)) {
        alert('Bitte gib eine gültige PLZ ein.');
        return;
      }

      // Phone validation (optional, if filled)
      if (phone && !isValidPhone(phone)) {
        alert('Bitte gib eine gültige Telefonnummer ein.');
        return;
      }
      const totalText = 'CHF ' + getTotalPrice().toFixed(2);

      // Show loading
      setCheckoutButtonLoading();

      try {
        const orderPayload = {
          requestedPayMethod: payMethod,
          customer: {
            email,
            firstName: first,
            lastName: last,
            address,
            zip,
            city,
            country,
            phone
          },
          items: safeCartItems.map(item => ({ id: item.id, qty: item.qty }))
        };

        if (payMethod === 'bank_transfer') {
          const bankOrder = await createBankTransferOrder(orderPayload);
          const bank = bankOrder.bankTransfer;
          const bankLines = [
            `Bitte ueberweise ${totalText} auf ${bank.iban}.`,
            `Empfaenger: ${bank.accountHolder}.`,
            bank.bankName ? `Bank: ${bank.bankName}.` : '',
            `Verwendungszweck: ${bank.reference}.`
          ].filter(Boolean).join(' ');

          showCheckoutStatus(
            'Bestellung erstellt',
            bankLines,
            bankOrder.orderId
          );
          coModalTitle.textContent = 'Bankueberweisung';
          setCheckoutStepState('success');
          cart.items = [];
          renderCart();
          coForm.reset();
          coHoneypot.value = '';
          lastSubmitTime = 0;
          return;
        }

        const checkout = await createCheckoutSession({
          ...orderPayload,
          requestedPayMethod: payMethod
        });

        window.location.href = checkout.url;
      } catch (error) {
        lastSubmitTime = 0;
        setCheckoutButtonDefault(totalText);
        alert(error.message || 'Der Checkout konnte nicht gestartet werden.');
      }
    }

    // Form submit (standard checkout)
    coForm.addEventListener('submit', e => {
      e.preventDefault();
      processOrder('standard');
    });

    // Apple Pay button — Stripe Checkout shows wallet options automatically
    document.getElementById('payApple').addEventListener('click', () => {
      processOrder('apple_pay');
    });

    // Google Pay button — Stripe Checkout shows wallet options automatically
    document.getElementById('payGoogle').addEventListener('click', () => {
      processOrder('google_pay');
    });

    document.getElementById('payBank').addEventListener('click', () => {
      processOrder('bank_transfer');
    });

    renderCart();
    verifyCheckoutReturnFromUrl();
  })();

  // ===== PAGE MODALS =====
  (() => {
    const modals = {
      privacy: { overlay: document.getElementById('privacyOverlay'), modal: document.getElementById('privacyModal') },
      terms: { overlay: document.getElementById('termsOverlay'), modal: document.getElementById('termsModal') },
      firmware: { overlay: document.getElementById('firmwareOverlay'), modal: document.getElementById('firmwareModal') },
      community: { overlay: document.getElementById('communityOverlay'), modal: document.getElementById('communityModal') }
    };

    function openModal(name) {
      const m = modals[name];
      if (!m) return;
      m.overlay.classList.add('open');
      m.modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    function closeModal(name) {
      const m = modals[name];
      if (!m) return;
      m.overlay.classList.remove('open');
      m.modal.classList.remove('open');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }

    // Open modal links
    document.querySelectorAll('[data-modal]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        openModal(link.dataset.modal);
      });
    });

    // Close buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });

    // Close on overlay click
    Object.entries(modals).forEach(([name, m]) => {
      m.overlay.addEventListener('click', () => closeModal(name));
    });

    // Close on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        Object.keys(modals).forEach(closeModal);
      }
    });
  })();
