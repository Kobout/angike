/* =========================================================
   ANGIKE — página do produto: fotos, tamanho, quantidade, adicionar à sacola
   ========================================================= */
(async function () {
  const { $, $$, esc, money, param, getProduct, getProducts, mediaHTML, tone, Cart, toast } = window.Angike;
  const root = $('#pdp');
  const id = param('id');
  const product = id ? await getProduct(id) : null;
  root.removeAttribute('aria-busy');

  if (!product) {
    root.innerHTML = `
      <div class="empty-state">
        <h1 class="page__title">Produto não encontrado</h1>
        <p class="muted">Ele pode ter saído de linha ou o link está incompleto.</p>
        <a class="btn btn--dark" href="index.html#novidades">VER PRODUTOS</a>
      </div>`;
    return;
  }

  document.title = `${product.name} — ANGIKE`;
  const idx = (await getProducts()).findIndex((p) => p.id === product.id);
  const images = product.images && product.images.length ? product.images : [''];
  const sizes = product.sizes || [];

  root.innerHTML = `
    <div class="pdp__gallery">
      <div class="pdp__main media" style="--tone:${tone(idx)}" id="pdp-main">${mediaHTML(images[0], product.name)}</div>
      ${images.length > 1 ? `<div class="pdp__thumbs">${images.map((src, i) => `
        <button class="pdp__thumb media" style="--tone:${tone(idx)}" data-src="${esc(src)}" aria-label="Ver foto ${i + 1}" aria-current="${i === 0}">
          ${mediaHTML(src, '', String(i + 1))}
        </button>`).join('')}</div>` : ''}
    </div>

    <div class="pdp__info">
      ${product.is_new ? '<span class="eyebrow">NOVO</span>' : ''}
      <h1 class="pdp__name">${esc(product.name)}</h1>
      <div class="pdp__price">${money(product.price_cents)}</div>

      <form id="add-form" class="pdp__form" novalidate>
        ${sizes.length ? `
        <fieldset class="sizes">
          <legend>Tamanho</legend>
          <div class="sizes__list">
            ${sizes.map((s, i) => `
              <input type="radio" name="size" id="size-${i}" value="${esc(s)}">
              <label for="size-${i}">${esc(s)}</label>`).join('')}
          </div>
          <p class="field__error" id="size-error" hidden>Escolha um tamanho.</p>
        </fieldset>` : ''}

        <div class="qty-row">
          <span class="label">Quantidade</span>
          <div class="qty" data-qty>
            <button type="button" class="qty__btn" data-step="-1" aria-label="Diminuir quantidade">−</button>
            <input type="number" id="qty" class="qty__input" value="1" min="1" max="10" inputmode="numeric" aria-label="Quantidade">
            <button type="button" class="qty__btn" data-step="1" aria-label="Aumentar quantidade">+</button>
          </div>
        </div>

        <button type="submit" class="btn btn--dark btn--block">ADICIONAR À SACOLA</button>
      </form>

      <div class="pdp__desc">
        <h2 class="label">Descrição</h2>
        <p>${esc(product.description || '')}</p>
      </div>
    </div>`;

  // miniaturas
  $$('.pdp__thumb', root).forEach((btn) => btn.addEventListener('click', () => {
    $('#pdp-main').innerHTML = mediaHTML(btn.dataset.src, product.name);
    $$('.pdp__thumb', root).forEach((b) => b.setAttribute('aria-current', String(b === btn)));
  }));

  // quantidade
  const qtyInput = $('#qty');
  const clampQty = (v) => Math.max(1, Math.min(10, parseInt(v, 10) || 1));
  $$('[data-step]', root).forEach((b) => b.addEventListener('click', () => {
    qtyInput.value = clampQty(Number(qtyInput.value) + Number(b.dataset.step));
  }));
  qtyInput.addEventListener('change', () => (qtyInput.value = clampQty(qtyInput.value)));

  // adicionar
  $('#add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    let size = '';
    if (sizes.length) {
      const checked = $('input[name="size"]:checked', root);
      $('#size-error').hidden = Boolean(checked);
      if (!checked) { $('input[name="size"]', root).focus(); return; }
      size = checked.value;
    }
    Cart.add(product.id, size, clampQty(qtyInput.value));
    toast(`Adicionado à sacola. <a href="carrinho.html">Ver sacola</a>`, 4000);
  });
})();
