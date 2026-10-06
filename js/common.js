/* =========================================================
   ANGIKE — código compartilhado por todas as páginas:
   cabeçalho, menu, rodapé, sacola, catálogo, login (Supabase) e utilidades.
   ========================================================= */
(function () {
  const CFG = window.ANGIKE_CONFIG || {};

  /* ---------- utilidades ---------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = (cents) => (cents > 0 ? brl.format(cents / 100) : 'R$ [PREÇO]');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const param = (name) => new URLSearchParams(location.search).get(name);

  const storage = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* sem storage */ } }
  };

  /* ---------- Supabase ---------- */
  const configured = Boolean(CFG.SUPABASE_URL && CFG.SUPABASE_KEY && window.supabase);
  // explica por que o login não está ativo (aparece nos avisos das páginas)
  const notConfiguredReason = configured ? '' :
    !window.ANGIKE_CONFIG ? 'O arquivo js/config.js não carregou ou tem erro de digitação (aspas, vírgulas).' :
    !(CFG.SUPABASE_URL && CFG.SUPABASE_KEY) ? 'SUPABASE_URL ou SUPABASE_KEY estão vazios no js/config.js publicado.' :
    'A biblioteca do Supabase (cdn.jsdelivr.net) não carregou. Algum bloqueador de anúncios ou extensão pode estar impedindo.';
  if (!configured) console.warn('[ANGIKE] Modo demonstração:', notConfiguredReason);
  const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY) : null;

  async function getUser() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session ? data.session.user : null;
  }

  /** Exige login: manda para conta.html e volta para a página atual depois. */
  async function requireUser() {
    const user = await getUser();
    if (!user) {
      const next = location.pathname.split('/').pop() + location.search;
      location.href = 'conta.html?next=' + encodeURIComponent(next);
      return null;
    }
    return user;
  }

  /* ---------- catálogo ---------- */
  let productsPromise = null;
  function getProducts() {
    if (!productsPromise) {
      productsPromise = (async () => {
        if (sb) {
          const { data, error } = await sb.from('products').select('*').eq('active', true).order('sort');
          if (!error && data) return data;
          console.warn('Erro ao carregar produtos do Supabase:', error);
        }
        return window.ANGIKE_FALLBACK_PRODUCTS || [];
      })();
    }
    return productsPromise;
  }
  async function getProduct(id) {
    return (await getProducts()).find((p) => p.id === id) || null;
  }

  const TONES = ['#DDD7D0', '#D3CCC4', '#E2DCD5', '#CFC8C0', '#D8D1C9', '#E0D9D2'];
  const tone = (i) => TONES[i % TONES.length];

  /** Imagem com espaço reservado: se o arquivo não existir, fica o placeholder. */
  function mediaHTML(src, alt, label = 'FOTO DO PRODUTO') {
    return `<span class="media__placeholder">${label}</span>` +
      (src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onload="this.previousElementSibling&&this.previousElementSibling.remove()" onerror="this.remove()">` : '');
  }

  function productCard(p, i) {
    const img = (p.images && p.images[0]) || '';
    return `
      <article class="product">
        <a class="product__link" href="produto.html?id=${encodeURIComponent(p.id)}">
          <div class="product__media media" style="--tone:${tone(i)}">
            ${mediaHTML(img, p.name)}
            ${p.is_new ? '<span class="product__tag">NOVO</span>' : ''}
          </div>
          <h3 class="product__name">${esc(p.name)}</h3>
          <div class="product__price">${money(p.price_cents)}</div>
        </a>
        <a class="product__add" href="produto.html?id=${encodeURIComponent(p.id)}">COMPRAR</a>
      </article>`;
  }

  /* ---------- sacola ---------- */
  const CART_KEY = 'angikeCart.v2';
  const MAX_QTY = 10;
  const sameLine = (a, id, size) => a.id === id && (a.size || '') === (size || '');

  const Cart = {
    items() {
      const v = storage.get(CART_KEY, []);
      return Array.isArray(v) ? v.filter((i) => i && typeof i.id === 'string' && Number.isInteger(i.qty) && i.qty > 0) : [];
    },
    save(items) { storage.set(CART_KEY, items); updateBadge(); },
    add(id, size, qty = 1) {
      const items = Cart.items();
      const line = items.find((i) => sameLine(i, id, size));
      if (line) line.qty = Math.min(MAX_QTY, line.qty + qty);
      else items.push({ id, size: size || '', qty: Math.min(MAX_QTY, qty) });
      Cart.save(items);
    },
    setQty(id, size, qty) {
      let items = Cart.items();
      if (qty <= 0) items = items.filter((i) => !sameLine(i, id, size));
      else { const line = items.find((i) => sameLine(i, id, size)); if (line) line.qty = Math.min(MAX_QTY, qty); }
      Cart.save(items);
    },
    remove(id, size) { Cart.setQty(id, size, 0); },
    clear() { Cart.save([]); },
    count() { return Cart.items().reduce((n, i) => n + i.qty, 0); },
    /** Linhas com dados do produto + subtotal, frete e total (em centavos). */
    async detailed() {
      const products = await getProducts();
      const lines = Cart.items().map((i) => {
        const product = products.find((p) => p.id === i.id);
        return product ? { ...i, product, lineCents: product.price_cents * i.qty } : null;
      }).filter(Boolean);
      const subtotal = lines.reduce((n, l) => n + l.lineCents, 0);
      return { lines, subtotal };
    }
  };

  /** Frete grátis a partir de quanto (centavos). 0 = sempre grátis; vazio/null = nunca. */
  function freeShippingMin() {
    const v = CFG.FREE_SHIPPING_MIN_CENTS;
    return (typeof v === 'number' && v >= 0) ? v : null;
  }
  /** Quanto falta para o frete grátis (0 = já ganhou; null = não há frete grátis). */
  function missingForFreeShipping(subtotal) {
    const min = freeShippingMin();
    return min === null ? null : Math.max(0, min - subtotal);
  }

  function updateBadge() {
    const badge = $('#cart-count');
    if (!badge) return;
    badge.textContent = Cart.count();
    badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
  }

  /* ---------- status de pedido ---------- */
  const ORDER_STATUS = {
    created: ['Aguardando pagamento', 'warn'],
    pending: ['Pagamento pendente', 'warn'],
    in_process: ['Pagamento em análise', 'warn'],
    paid: ['Pago', 'ok'],
    shipped: ['Enviado', 'ok'],
    delivered: ['Entregue', 'ok'],
    rejected: ['Pagamento recusado', 'bad'],
    cancelled: ['Cancelado', 'bad'],
    refunded: ['Reembolsado', 'bad'],
    review: ['Em revisão', 'warn'],
    error: ['Erro ao iniciar pagamento', 'bad']
  };
  function statusPill(status) {
    const [label, kind] = ORDER_STATUS[status] || [status, 'warn'];
    return `<span class="pill pill--${kind}">${esc(label)}</span>`;
  }

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg, ms = 2600) {
    const el = $('#toast');
    if (!el) return;
    el.innerHTML = msg;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), ms);
  }

  /* ---------- layout (aviso, cabeçalho, menu, rodapé) ---------- */
  const ICON = {
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    search: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7"/><path d="M16 16l5 5"/></svg>',
    bag: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M4 10h16l-1.2 10H5.2z"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"/></svg>',
    menu: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    chevron: '<svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    user: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/></svg>'
  };

  const CATEGORIES = [
    ['', 'Ver tudo'], ['vestidos', 'Vestidos'], ['blusas', 'Blusas e camisas'], ['calcas', 'Calças'],
    ['saias', 'Saias e shorts'], ['conjuntos', 'Conjuntos'], ['alfaiataria', 'Alfaiataria']
  ];

  function renderLayout() {
    const freeMin = freeShippingMin();
    const notices = [
      ...(freeMin === null ? [] : [freeMin === 0 ? 'FRETE GRÁTIS PARA TODO O BRASIL.' : `FRETE GRÁTIS ACIMA DE ${brl.format(freeMin / 100)}.`]),
      'PAGUE COM PIX OU CARTÃO.', 'ENTREGAMOS PARA TODO O BRASIL.'
    ];
    const track = notices.map((t) => `<span>${t}</span>`).join('') + notices.map((t) => `<span aria-hidden="true">${t}</span>`).join('');

    let closed = false;
    try { closed = sessionStorage.getItem('announceClosed') === '1'; } catch { /* ignore */ }

    document.body.insertAdjacentHTML('afterbegin', `
      <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <div class="announce" id="announce" ${closed ? 'hidden' : ''}>
        <div class="marquee" aria-label="Avisos da loja"><div class="marquee__track">${track}</div></div>
        <button class="icon-btn announce__close" id="announce-close" aria-label="Fechar aviso">${ICON.close}</button>
      </div>
      <header class="header">
        <div class="header__inner">
          <a href="./" class="logo" aria-label="ANGIKE — página inicial">ANGIKE</a>
          <div class="header__actions">
            <button class="icon-btn" id="btn-search" aria-label="Buscar">${ICON.search}</button>
            <a class="icon-btn cart-btn" href="carrinho.html" aria-label="Sacola de compras">${ICON.bag}<span class="cart-badge" id="cart-count">0</span></a>
            <button class="icon-btn" id="btn-menu" aria-label="Abrir menu" aria-controls="drawer" aria-expanded="false">${ICON.menu}</button>
          </div>
        </div>
      </header>`);

    const ig = CFG.INSTAGRAM ? `<a href="https://instagram.com/${esc(CFG.INSTAGRAM)}" target="_blank" rel="noopener">@${esc(CFG.INSTAGRAM)}</a>` : '';
    const wa = CFG.WHATSAPP ? `<a href="https://wa.me/${esc(CFG.WHATSAPP)}" target="_blank" rel="noopener">WhatsApp</a>` : '';

    document.body.insertAdjacentHTML('beforeend', `
      <footer class="footer">
        <div class="footer__grid">
          <div>
            <div class="footer__logo">ANGIKE</div>
            <p class="footer__muted">[Uma frase curta sobre a marca.]</p>
          </div>
          <nav aria-label="Ajuda">
            <div class="footer__label">AJUDA</div>
            <a href="conta.html">Minha conta</a>
            <a href="carrinho.html">Sacola</a>
            <a href="#">Trocas e devoluções</a>
            <a href="#">Guia de tamanhos</a>
          </nav>
          <div>
            <div class="footer__label">CONTATO</div>
            ${CFG.EMAIL ? `<span>${esc(CFG.EMAIL)}</span>` : ''}
            ${ig}${wa}
          </div>
        </div>
        <div class="footer__bottom">© ${new Date().getFullYear()} ANGIKE · CNPJ [00.000.000/0000-00]</div>
      </footer>

      <div class="drawer" id="drawer" hidden>
        <div class="drawer__overlay" data-close-menu></div>
        <nav class="drawer__panel" aria-label="Menu principal">
          <div class="drawer__top">
            <a href="./" class="drawer__logo">ANGIKE</a>
            <button class="icon-btn" data-close-menu aria-label="Fechar menu">${ICON.close}</button>
          </div>
          <form class="drawer__search" role="search" action="index.html" method="get">
            <label for="menu-busca" class="sr-only">Buscar produtos</label>
            <input id="menu-busca" type="search" name="q" placeholder="Buscar">
            <button type="submit" class="icon-btn" aria-label="Buscar">${ICON.search}</button>
          </form>
          <div class="drawer__group">
            <button class="drawer__item" id="btn-roupas" aria-expanded="false" aria-controls="sub-roupas">
              <span>Roupas</span>${ICON.chevron}
            </button>
            <div class="drawer__sub" id="sub-roupas" hidden>
              ${CATEGORIES.map(([slug, label]) => `<a href="index.html${slug ? '?cat=' + slug : ''}#novidades">${label}</a>`).join('')}
            </div>
          </div>
          <a href="conta.html" class="drawer__account">${ICON.user}<span id="drawer-account-label">Minha Conta</span></a>
        </nav>
      </div>

      <div class="toast" id="toast" role="status" aria-live="polite"></div>`);

    // aviso
    $('#announce-close').addEventListener('click', () => {
      $('#announce').hidden = true;
      try { sessionStorage.setItem('announceClosed', '1'); } catch { /* ignore */ }
    });

    // menu
    const drawer = $('#drawer');
    const btnMenu = $('#btn-menu');
    let lastFocus = null;
    const open = (focusSearch) => {
      lastFocus = document.activeElement;
      drawer.hidden = false;
      document.body.classList.add('no-scroll');
      btnMenu.setAttribute('aria-expanded', 'true');
      (focusSearch ? $('#menu-busca') : $('.drawer__panel [data-close-menu]')).focus();
    };
    const close = () => {
      drawer.hidden = true;
      document.body.classList.remove('no-scroll');
      btnMenu.setAttribute('aria-expanded', 'false');
      if (lastFocus) lastFocus.focus();
    };
    btnMenu.addEventListener('click', () => open(false));
    $('#btn-search').addEventListener('click', () => open(true));
    $$('[data-close-menu]', drawer).forEach((el) => el.addEventListener('click', close));
    $$('#sub-roupas a', drawer).forEach((el) => el.addEventListener('click', () => { drawer.hidden = true; document.body.classList.remove('no-scroll'); }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) close(); });

    const btnRoupas = $('#btn-roupas');
    btnRoupas.addEventListener('click', () => {
      const expanded = btnRoupas.getAttribute('aria-expanded') === 'true';
      btnRoupas.setAttribute('aria-expanded', String(!expanded));
      $('#sub-roupas').hidden = expanded;
    });

    updateBadge();
    window.addEventListener('storage', (e) => { if (e.key === CART_KEY) updateBadge(); });

    // nome no menu quando logado
    getUser().then((u) => {
      if (u) $('#drawer-account-label').textContent = 'Minha Conta (' + (u.user_metadata?.full_name?.split(' ')[0] || u.email) + ')';
    });
  }

  window.Angike = {
    CFG, $, $$, esc, money, brl, param, storage, toast,
    sb, configured, notConfiguredReason, getUser, requireUser,
    getProducts, getProduct, productCard, mediaHTML, tone,
    Cart, freeShippingMin, missingForFreeShipping, statusPill, ORDER_STATUS
  };

  renderLayout();
})();
