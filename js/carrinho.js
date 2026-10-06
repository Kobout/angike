/* =========================================================
   ANGIKE — sacola: alterar quantidade, remover, resumo com frete
   ========================================================= */
(function () {
  const { $, $$, esc, money, brl, Cart, mediaHTML, tone, missingForFreeShipping } = window.Angike;
  const root = $('#cart');

  async function render() {
    const { lines, subtotal } = await Cart.detailed();
    root.removeAttribute('aria-busy');

    if (!lines.length) {
      root.innerHTML = `
        <div class="empty-state">
          <p>Sua sacola está vazia.</p>
          <a class="btn btn--dark" href="index.html#novidades">VER PRODUTOS</a>
        </div>`;
      return;
    }

    const missing = missingForFreeShipping(subtotal);
    const freeMsg = missing === null ? ''
      : missing > 0 ? `<p class="summary__hint">Faltam <strong>${brl.format(missing / 100)}</strong> para o frete grátis.</p>`
      : '<p class="summary__hint">Você ganhou frete grátis (opção mais econômica).</p>';

    root.innerHTML = `
      <div class="cart-layout">
        <ul class="cart-lines">
          ${lines.map((l, i) => `
            <li class="cart-line" data-id="${esc(l.id)}" data-size="${esc(l.size)}">
              <a class="cart-line__media media" style="--tone:${tone(i)}" href="produto.html?id=${encodeURIComponent(l.id)}">
                ${mediaHTML(l.product.images && l.product.images[0], l.product.name, 'FOTO')}
              </a>
              <div class="cart-line__info">
                <a class="cart-line__name" href="produto.html?id=${encodeURIComponent(l.id)}">${esc(l.product.name)}</a>
                ${l.size ? `<span class="muted">Tamanho: ${esc(l.size)}</span>` : ''}
                <span class="muted">${money(l.product.price_cents)} cada</span>
                <div class="cart-line__actions">
                  <div class="qty qty--sm">
                    <button type="button" class="qty__btn" data-step="-1" aria-label="Diminuir quantidade">−</button>
                    <span class="qty__value" aria-live="polite">${l.qty}</span>
                    <button type="button" class="qty__btn" data-step="1" aria-label="Aumentar quantidade">+</button>
                  </div>
                  <button type="button" class="link-btn" data-remove>Remover</button>
                </div>
              </div>
              <div class="cart-line__total">${money(l.lineCents)}</div>
            </li>`).join('')}
        </ul>

        <aside class="summary" aria-label="Resumo do pedido">
          <h2 class="summary__title">Resumo</h2>
          <dl class="summary__rows">
            <div><dt>Subtotal</dt><dd>${money(subtotal)}</dd></div>
            <div><dt>Frete</dt><dd>Calculado no checkout</dd></div>
          </dl>
          ${freeMsg}
          <a class="btn btn--dark btn--block" href="checkout.html">FINALIZAR COMPRA</a>
          <a class="btn btn--outline btn--block" href="index.html#novidades">CONTINUAR COMPRANDO</a>
        </aside>
      </div>`;

    $$('.cart-line', root).forEach((li) => {
      const id = li.dataset.id;
      const size = li.dataset.size;
      const line = lines.find((l) => l.id === id && l.size === size);
      $$('[data-step]', li).forEach((b) => b.addEventListener('click', () => {
        Cart.setQty(id, size, line.qty + Number(b.dataset.step));
        render();
      }));
      $('[data-remove]', li).addEventListener('click', () => { Cart.remove(id, size); render(); });
    });
  }

  render();
  window.addEventListener('storage', render);
})();
