/* =========================================================
   ANGIKE — minha conta: entrar, criar conta, recuperar senha,
   meus pedidos, meus dados e sair (Supabase Auth)
   ========================================================= */
(async function () {
  const { $, $$, esc, money, sb, configured, getUser, param, statusPill, toast } = window.Angike;
  const root = $('#account');
  const next = param('next');
  const safeNext = next && /^[a-z]+\.html(\?[^\s]*)?$/i.test(next) ? next : null; // só páginas do próprio site
  const siteUrl = location.origin + location.pathname.replace(/[^/]*$/, '');

  const show = (html) => { root.removeAttribute('aria-busy'); root.innerHTML = html; };

  if (!configured) {
    return show(`
      <h1 class="page__title">Minha conta</h1>
      <div class="notice">
        <strong>Login ainda não configurado.</strong>
        <p>Preencha o Supabase em <code>js/config.js</code> para ativar cadastro, login e histórico de pedidos (passo a passo no README.md).</p>
        <p class="muted">Motivo: ${esc(window.Angike.notConfiguredReason)}</p>
      </div>`);
  }

  const AUTH_ERRORS = {
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'Email not confirmed': 'Confirme seu e-mail antes de entrar. Procure a mensagem na sua caixa de entrada (e no spam).',
    'User already registered': 'Já existe uma conta com esse e-mail. Use "Entrar" ou "Esqueci a senha".',
    'Password should be at least 6 characters.': 'A senha precisa ter pelo menos 6 caracteres.'
  };
  const authMsg = (err) => AUTH_ERRORS[err.message] || (err.message === 'CEP inválido' ? 'O CEP precisa ter 8 números.' : 'Algo deu errado. Confira os dados e tente de novo.');

  /* ---------- visitante: entrar / criar conta / esqueci a senha ---------- */
  function renderGuest(tab = 'login', notice = '') {
    show(`
      <h1 class="page__title">Minha conta</h1>
      ${safeNext ? '<p class="muted">Entre ou crie sua conta para finalizar a compra.</p>' : ''}
      <div class="tabs" role="tablist">
        <button role="tab" class="tabs__tab" id="tab-login" aria-selected="${tab === 'login'}" data-tab="login">Entrar</button>
        <button role="tab" class="tabs__tab" id="tab-signup" aria-selected="${tab === 'signup'}" data-tab="signup">Criar conta</button>
      </div>
      ${notice ? `<div class="notice notice--ok" role="status">${notice}</div>` : ''}

      ${tab === 'login' ? `
      <form class="form" id="login-form" novalidate>
        <div class="field"><label for="login-email">E-mail</label>
          <input id="login-email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="login-pass">Senha</label>
          <input id="login-pass" name="password" type="password" autocomplete="current-password" required></div>
        <p class="form__error" role="alert" hidden></p>
        <button class="btn btn--dark btn--block" type="submit">ENTRAR</button>
        <button class="link-btn" type="button" data-tab="forgot">Esqueci a senha</button>
      </form>` : ''}

      ${tab === 'signup' ? `
      <form class="form" id="signup-form" novalidate>
        <div class="field"><label for="su-name">Nome completo</label>
          <input id="su-name" name="full_name" autocomplete="name" required maxlength="120"></div>
        <div class="field"><label for="su-email">E-mail</label>
          <input id="su-email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="su-pass">Senha <span class="muted">(mínimo 6 caracteres)</span></label>
          <input id="su-pass" name="password" type="password" autocomplete="new-password" minlength="6" required></div>
        <p class="form__error" role="alert" hidden></p>
        <button class="btn btn--dark btn--block" type="submit">CRIAR CONTA</button>
      </form>` : ''}

      ${tab === 'forgot' ? `
      <form class="form" id="forgot-form" novalidate>
        <p class="muted">Informe seu e-mail e enviaremos um link para criar uma nova senha.</p>
        <div class="field"><label for="fg-email">E-mail</label>
          <input id="fg-email" name="email" type="email" autocomplete="email" required></div>
        <p class="form__error" role="alert" hidden></p>
        <button class="btn btn--dark btn--block" type="submit">ENVIAR LINK</button>
        <button class="link-btn" type="button" data-tab="login">Voltar para entrar</button>
      </form>` : ''}`);

    $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => renderGuest(b.dataset.tab)));

    bindForm('#login-form', async (d) => {
      const { error } = await sb.auth.signInWithPassword({ email: d.email, password: d.password });
      if (error) throw error;
      afterLogin();
    });

    bindForm('#signup-form', async (d) => {
      const { data, error } = await sb.auth.signUp({
        email: d.email, password: d.password,
        options: { data: { full_name: d.full_name }, emailRedirectTo: siteUrl + 'conta.html' + (safeNext ? '?next=' + encodeURIComponent(safeNext) : '') }
      });
      if (error) throw error;
      if (data.session) afterLogin();
      else renderGuest('login', `Conta criada! Enviamos um e-mail para <strong>${esc(d.email)}</strong>. Clique no link para confirmar e depois entre.`);
    });

    bindForm('#forgot-form', async (d) => {
      const { error } = await sb.auth.resetPasswordForEmail(d.email, { redirectTo: siteUrl + 'conta.html' });
      if (error) throw error;
      renderGuest('login', 'Se existir uma conta com esse e-mail, você vai receber o link em instantes.');
    });
  }

  function bindForm(sel, handler) {
    const form = $(sel, root);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('.form__error', form);
      err.hidden = true;
      const invalid = [...form.querySelectorAll('input[required]')].find((i) => !i.value.trim() || !i.checkValidity());
      if (invalid) { err.textContent = 'Preencha os campos corretamente.'; err.hidden = false; invalid.focus(); return; }
      const btn = $('button[type="submit"]', form);
      btn.disabled = true;
      try {
        const d = Object.fromEntries(new FormData(form).entries());
        if (d.email) d.email = d.email.trim().toLowerCase();
        await handler(d);
      } catch (ex) {
        console.error(ex);
        err.textContent = authMsg(ex);
        err.hidden = false;
        btn.disabled = false;
      }
    });
  }

  function afterLogin() {
    if (safeNext) location.href = safeNext;
    else renderUser();
  }

  /* ---------- nova senha (link do e-mail) ---------- */
  function renderNewPassword() {
    show(`
      <h1 class="page__title">Criar nova senha</h1>
      <form class="form" id="newpass-form" novalidate>
        <div class="field"><label for="np-pass">Nova senha <span class="muted">(mínimo 6 caracteres)</span></label>
          <input id="np-pass" name="password" type="password" autocomplete="new-password" minlength="6" required></div>
        <p class="form__error" role="alert" hidden></p>
        <button class="btn btn--dark btn--block" type="submit">SALVAR SENHA</button>
      </form>`);
    bindForm('#newpass-form', async (d) => {
      const { error } = await sb.auth.updateUser({ password: d.password });
      if (error) throw error;
      toast('Senha alterada.');
      renderUser();
    });
  }

  /* ---------- logado: pedidos + dados ---------- */
  async function renderUser() {
    const user = await getUser();
    if (!user) return renderGuest();

    const [{ data: profile }, { data: orders, error: ordersErr }] = await Promise.all([
      sb.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      sb.from('orders').select('id, status, total_cents, created_at, order_items(name, size, quantity)').order('created_at', { ascending: false })
    ]);
    const p = profile || {};
    const firstName = (p.full_name || user.user_metadata?.full_name || '').split(' ')[0];
    const fmtDate = (s) => new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

    show(`
      <div class="account-head">
        <h1 class="page__title">Olá${firstName ? ', ' + esc(firstName) : ''}</h1>
        <button class="btn btn--outline" id="logout">SAIR</button>
      </div>

      <section class="block">
        <h2 class="block__title">Meus pedidos</h2>
        ${ordersErr ? '<p class="muted">Não foi possível carregar seus pedidos agora.</p>' :
          !orders.length ? '<p class="muted">Você ainda não fez nenhum pedido. <a href="index.html#novidades">Ver produtos</a></p>' : `
          <ul class="orders">
            ${orders.map((o) => `
              <li>
                <a class="order-row" href="pedido.html?id=${o.id}">
                  <div>
                    <div class="order-row__id">Pedido #${o.id.slice(0, 8).toUpperCase()}</div>
                    <div class="muted">${fmtDate(o.created_at)} · ${o.order_items.reduce((n, i) => n + i.quantity, 0)} item(ns)</div>
                  </div>
                  <div class="order-row__end">${statusPill(o.status)}<span>${money(o.total_cents)}</span></div>
                </a>
              </li>`).join('')}
          </ul>`}
      </section>

      <section class="block">
        <h2 class="block__title">Meus dados</h2>
        <form class="form" id="profile-form" novalidate>
          <div class="field"><label for="pf-name">Nome completo</label>
            <input id="pf-name" name="full_name" autocomplete="name" required maxlength="120" value="${esc(p.full_name || '')}"></div>
          <div class="field"><label for="pf-email">E-mail</label>
            <input id="pf-email" type="email" value="${esc(user.email)}" disabled></div>
          <div class="field"><label for="pf-phone">Celular (com DDD)</label>
            <input id="pf-phone" name="phone" type="tel" autocomplete="tel" maxlength="20" value="${esc(p.phone || '')}"></div>

          <fieldset class="form__group">
            <legend class="form__legend">Endereço de entrega</legend>
            <div class="field field--cep"><label for="pf-cep">CEP</label>
              <input id="pf-cep" name="cep" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000" value="${esc(p.cep ? p.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '')}">
              <span class="field__hint" id="pf-cep-hint" role="status"></span></div>
            <div class="field"><label for="pf-street">Rua</label>
              <input id="pf-street" name="street" autocomplete="address-line1" maxlength="160" value="${esc(p.street || '')}"></div>
            <div class="field-row">
              <div class="field"><label for="pf-number">Número</label>
                <input id="pf-number" name="number" maxlength="20" value="${esc(p.number || '')}"></div>
              <div class="field"><label for="pf-complement">Complemento <span class="muted">(opcional)</span></label>
                <input id="pf-complement" name="complement" autocomplete="address-line2" maxlength="80" value="${esc(p.complement || '')}"></div>
            </div>
            <div class="field"><label for="pf-district">Bairro</label>
              <input id="pf-district" name="district" maxlength="80" value="${esc(p.district || '')}"></div>
            <div class="field-row">
              <div class="field"><label for="pf-city">Cidade</label>
                <input id="pf-city" name="city" autocomplete="address-level2" maxlength="80" value="${esc(p.city || '')}"></div>
              <div class="field field--uf"><label for="pf-state">UF</label>
                <input id="pf-state" name="state" autocomplete="address-level1" maxlength="2" value="${esc(p.state || '')}"></div>
            </div>
          </fieldset>

          <p class="form__error" role="alert" hidden></p>
          <button class="btn btn--dark" type="submit">SALVAR</button>
        </form>
      </section>`);

    $('#logout').addEventListener('click', async () => { await sb.auth.signOut(); renderGuest(); });
    bindForm('#profile-form', async (d) => {
      const clean = (k) => String(d[k] || '').trim();
      const cepDigits = clean('cep').replace(/\D/g, '');
      if (cepDigits && cepDigits.length !== 8) throw new Error('CEP inválido');
      const { error } = await sb.from('profiles').upsert({
        id: user.id,
        full_name: clean('full_name'), phone: clean('phone'),
        cep: cepDigits, street: clean('street'), number: clean('number'), complement: clean('complement'),
        district: clean('district'), city: clean('city'), state: clean('state').toUpperCase(),
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      toast('Dados salvos.');
      $('#profile-form button[type="submit"]').disabled = false;
    });

    // CEP: máscara + preenchimento automático (ViaCEP)
    const cep = $('#pf-cep');
    cep.addEventListener('input', async () => {
      const dgt = cep.value.replace(/\D/g, '').slice(0, 8);
      cep.value = dgt.length > 5 ? dgt.slice(0, 5) + '-' + dgt.slice(5) : dgt;
      if (dgt.length !== 8) return;
      const hint = $('#pf-cep-hint');
      hint.textContent = 'Buscando endereço…';
      try {
        const j = await (await fetch(`https://viacep.com.br/ws/${dgt}/json/`)).json();
        if (j.erro) { hint.textContent = 'CEP não encontrado. Preencha manualmente.'; return; }
        $('#pf-street').value = j.logradouro || $('#pf-street').value;
        $('#pf-district').value = j.bairro || $('#pf-district').value;
        $('#pf-city').value = j.localidade || $('#pf-city').value;
        $('#pf-state').value = j.uf || $('#pf-state').value;
        hint.textContent = '';
        $('#pf-number').focus();
      } catch { hint.textContent = 'Não foi possível buscar o CEP. Preencha manualmente.'; }
    });
    $('#pf-state').addEventListener('input', (e) => (e.target.value = e.target.value.replace(/[^a-z]/gi, '').toUpperCase()));
  }

  /* ---------- início ---------- */
  let recovering = false;
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') { recovering = true; renderNewPassword(); }
  });

  const user = await getUser();
  if (recovering) return;
  if (user && safeNext) { location.href = safeNext; return; }
  if (user) renderUser(); else renderGuest();
})();
