/* =========================================================
   ANGIKE — checkout: endereço de entrega + pagamento pelo Mercado Pago
   O preço e o frete cobrados são recalculados no servidor
   (função create-checkout), nunca confiando no navegador.
   ========================================================= */
(async function () {
  const { $, esc, money, sb, configured, requireUser, Cart } = window.Angike;
  const root = $('#checkout');

  const done = (html) => { root.removeAttribute('aria-busy'); root.innerHTML = html; };

  const cart = await Cart.detailed();
  if (!cart.lines.length) {
    return done(`<div class="empty-state"><p>Sua sacola está vazia.</p><a class="btn btn--dark" href="index.html#novidades">VER PRODUTOS</a></div>`);
  }

  if (!configured) {
    return done(`<div class="notice">
      <strong>Pagamento ainda não configurado.</strong>
      <p>Preencha o Supabase em <code>js/config.js</code> e publique as funções do Mercado Pago (passo a passo no README.md).</p>
        <p class="muted">Motivo: ${esc(window.Angike.notConfiguredReason)}</p>
      <a class="btn btn--outline" href="carrinho.html">VOLTAR PARA A SACOLA</a>
    </div>`);
  }

  const user = await requireUser();
  if (!user) return;

  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const p = profile || {};
  const v = (k) => esc(p[k] || '');

  done(`
    <div class="cart-layout">
      <form id="checkout-form" class="form" novalidate>
        <fieldset class="form__group">
          <legend class="form__legend">Seus dados</legend>
          <div class="field">
            <label for="full_name">Nome completo</label>
            <input id="full_name" name="full_name" autocomplete="name" required maxlength="120" value="${v('full_name') || esc(user.user_metadata?.full_name || '')}">
          </div>
          <div class="field-row">
            <div class="field">
              <label for="email">E-mail</label>
              <input id="email" type="email" value="${esc(user.email)}" disabled>
            </div>
            <div class="field">
              <label for="phone">Celular (com DDD)</label>
              <input id="phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="20" placeholder="(11) 99999-9999" value="${v('phone')}">
            </div>
          </div>
        </fieldset>

        <fieldset class="form__group">
          <legend class="form__legend">Endereço de entrega</legend>
          <div class="field field--cep">
            <label for="cep">CEP</label>
            <input id="cep" name="cep" inputmode="numeric" autocomplete="postal-code" required maxlength="9" placeholder="00000-000" value="${v('cep')}">
            <span class="field__hint" id="cep-hint" role="status"></span>
          </div>
          <div class="field">
            <label for="street">Rua</label>
            <input id="street" name="street" autocomplete="address-line1" required maxlength="160" value="${v('street')}">
          </div>
          <div class="field-row">
            <div class="field">
              <label for="number">Número</label>
              <input id="number" name="number" required maxlength="20" value="${v('number')}">
            </div>
            <div class="field">
              <label for="complement">Complemento <span class="muted">(opcional)</span></label>
              <input id="complement" name="complement" autocomplete="address-line2" maxlength="80" value="${v('complement')}">
            </div>
          </div>
          <div class="field">
            <label for="district">Bairro</label>
            <input id="district" name="district" required maxlength="80" value="${v('district')}">
          </div>
          <div class="field-row">
            <div class="field">
              <label for="city">Cidade</label>
              <input id="city" name="city" autocomplete="address-level2" required maxlength="80" value="${v('city')}">
            </div>
            <div class="field field--uf">
              <label for="state">UF</label>
              <input id="state" name="state" autocomplete="address-level1" required maxlength="2" value="${v('state')}">
            </div>
          </div>
        </fieldset>

        <fieldset class="form__group">
          <legend class="form__legend">Forma de entrega</legend>
          <div id="shipping-options" class="ship-options" role="radiogroup" aria-label="Forma de entrega">
            <p class="muted">Informe o CEP para ver as opções de entrega.</p>
          </div>
        </fieldset>
      </form>

      <aside class="summary" aria-label="Resumo do pedido">
        <h2 class="summary__title">Seu pedido</h2>
        <ul class="summary__items">
          ${cart.lines.map((l) => `<li><span>${l.qty}× ${esc(l.product.name)}${l.size ? ` (${esc(l.size)})` : ''}</span><span>${money(l.lineCents)}</span></li>`).join('')}
        </ul>
        <dl class="summary__rows">
          <div><dt>Subtotal</dt><dd>${money(cart.subtotal)}</dd></div>
          <div><dt>Frete</dt><dd id="sum-shipping">—</dd></div>
          <div class="summary__total"><dt>Total</dt><dd id="sum-total">${money(cart.subtotal)}</dd></div>
        </dl>
        <button type="submit" form="checkout-form" class="btn btn--dark btn--block" id="pay-btn">PAGAR COM MERCADO PAGO</button>
        <p class="form__error" id="form-error" role="alert" hidden></p>
        <p class="summary__hint">O pagamento (Pix, cartão ou boleto) é feito no site do Mercado Pago. Depois você volta para cá.</p>
      </aside>
    </div>`);

  const form = $('#checkout-form');
  const errBox = $('#form-error');

  // máscaras simples
  const cep = $('#cep');
  cep.addEventListener('input', () => {
    const d = cep.value.replace(/\D/g, '').slice(0, 8);
    cep.value = d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
    if (d.length === 8) { lookupCep(d); quoteShipping(d); }
  });
  $('#state').addEventListener('input', (e) => (e.target.value = e.target.value.replace(/[^a-z]/gi, '').toUpperCase()));

  /* ---------- frete (SuperFrete, via função shipping-quote) ---------- */
  let shipOptions = [];
  let shipChosen = null;
  let quotedCep = '';
  const shipBox = $('#shipping-options');

  function updateTotals() {
    const opt = shipOptions.find((o) => o.id === shipChosen);
    $('#sum-shipping').textContent = opt ? (opt.price_cents > 0 ? money(opt.price_cents) : 'Grátis') : '—';
    $('#sum-total').textContent = money(cart.subtotal + (opt ? opt.price_cents : 0));
  }

  async function quoteShipping(cepDigits) {
    if (cepDigits === quotedCep) return;
    quotedCep = cepDigits;
    shipOptions = []; shipChosen = null; updateTotals();
    shipBox.innerHTML = '<p class="muted">Calculando frete…</p>';
    try {
      const { data, error } = await sb.functions.invoke('shipping-quote', { body: { cep: cepDigits, items: Cart.items() } });
      if (error) {
        let msg = 'Não foi possível calcular o frete. Confira o CEP e tente de novo.';
        try { const j = await error.context.json(); if (j.error) msg = j.error; } catch { /* sem corpo */ }
        throw new Error(msg);
      }
      if (cepDigits !== quotedCep) return; // o CEP mudou enquanto calculava
      shipOptions = data.options || [];
      if (!shipOptions.length) throw new Error('Nenhuma forma de entrega disponível para esse CEP.');
      shipChosen = shipOptions[0].id; // a mais barata vem primeiro
      shipBox.innerHTML = shipOptions.map((o) => `
        <label class="ship-option">
          <input type="radio" name="shipping_service" value="${esc(o.id)}" ${o.id === shipChosen ? 'checked' : ''}>
          <span class="ship-option__body">
            <span class="ship-option__name">${esc(o.name)}${o.company ? ` <span class="muted">· ${esc(o.company)}</span>` : ''}</span>
            <span class="muted">${o.days ? `Chega em até ${o.days} dia${o.days > 1 ? 's' : ''} úte${o.days > 1 ? 'is' : 'il'} após o envio` : 'Prazo informado no envio'}</span>
          </span>
          <span class="ship-option__price">${o.price_cents > 0 ? money(o.price_cents) : '<strong>Grátis</strong>'}</span>
        </label>`).join('');
      shipBox.querySelectorAll('input[name="shipping_service"]').forEach((r) =>
        r.addEventListener('change', () => { shipChosen = r.value; updateTotals(); }));
      updateTotals();
    } catch (err) {
      quotedCep = '';
      shipBox.innerHTML = `<p class="form__error">${esc(err.message)}</p>`;
    }
  }

  // preenche endereço pelo CEP (ViaCEP, gratuito)
  async function lookupCep(d) {
    const hint = $('#cep-hint');
    hint.textContent = 'Buscando endereço…';
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j.erro) { hint.textContent = 'CEP não encontrado. Preencha o endereço manualmente.'; return; }
      $('#street').value = j.logradouro || $('#street').value;
      $('#district').value = j.bairro || $('#district').value;
      $('#city').value = j.localidade || $('#city').value;
      $('#state').value = j.uf || $('#state').value;
      hint.textContent = '';
      $('#number').focus();
    } catch {
      hint.textContent = 'Não foi possível buscar o CEP. Preencha o endereço manualmente.';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;

    // validação
    let firstInvalid = null;
    form.querySelectorAll('input[required]').forEach((input) => {
      const ok = input.value.trim() !== '' && input.checkValidity();
      input.setAttribute('aria-invalid', String(!ok));
      if (!ok && !firstInvalid) firstInvalid = input;
    });
    const cepDigits = cep.value.replace(/\D/g, '');
    if (cepDigits.length !== 8) { cep.setAttribute('aria-invalid', 'true'); firstInvalid = firstInvalid || cep; }
    if ($('#phone').value.replace(/\D/g, '').length < 10) { $('#phone').setAttribute('aria-invalid', 'true'); firstInvalid = firstInvalid || $('#phone'); }
    if (!firstInvalid && !shipChosen) {
      errBox.textContent = 'Escolha a forma de entrega (informe o CEP para calcular).';
      errBox.hidden = false;
      return;
    }
    if (firstInvalid) {
      errBox.textContent = 'Confira os campos destacados.';
      errBox.hidden = false;
      firstInvalid.focus();
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    delete data.shipping_service;
    Object.keys(data).forEach((k) => (data[k] = String(data[k]).trim()));
    data.cep = cepDigits;

    const btn = $('#pay-btn');
    btn.disabled = true;
    btn.textContent = 'ABRINDO O MERCADO PAGO…';

    try {
      // salva os dados para a próxima compra
      await sb.from('profiles').upsert({ id: user.id, ...data, updated_at: new Date().toISOString() });

      const { data: res, error } = await sb.functions.invoke('create-checkout', {
        body: { items: Cart.items(), address: data, shipping_service: shipChosen }
      });
      if (error) {
        let msg = 'Não foi possível iniciar o pagamento. Tente novamente.';
        try { const j = await error.context.json(); if (j.error) msg = j.error; } catch { /* sem corpo */ }
        throw new Error(msg);
      }
      location.href = res.init_point;
    } catch (err) {
      console.error(err);
      errBox.textContent = err.message;
      errBox.hidden = false;
      btn.disabled = false;
      btn.textContent = 'PAGAR COM MERCADO PAGO';
    }
  });

  // CEP já salvo no perfil: calcula o frete ao abrir a página
  const savedCep = cep.value.replace(/\D/g, '');
  if (savedCep.length === 8) quoteShipping(savedCep);
})();
