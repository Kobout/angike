/* =========================================================
   ANGIKE — painel de administração
   Só funciona para contas cadastradas na tabela "admins" (supabase/admin.sql).
   A proteção real está no banco (RLS): sem ser admin, o banco não devolve
   pedidos de outras pessoas, mesmo que alguém abra esta página.
   ========================================================= */
(async function () {
  const { $, $$, esc, money, brl, sb, configured, requireUser, statusPill, toast } = window.Angike;
  const root = $('#admin');
  const show = (html) => { root.removeAttribute('aria-busy'); root.innerHTML = html; };

  if (!configured) return show('<div class="notice">Supabase não configurado.</div>');
  const user = await requireUser();
  if (!user) return;

  const { data: isAdmin, error: adminErr } = await sb.rpc('is_admin');
  if (adminErr || !isAdmin) {
    return show(`
      <h1 class="page__title">Acesso restrito</h1>
      <div class="notice">
        <p>A conta <strong>${esc(user.email)}</strong> não é administradora.</p>
        <p class="muted">Entre com a conta de admin ou cadastre esta conta na tabela <code>admins</code> (veja supabase/admin.sql).</p>
        <a class="btn btn--outline" href="conta.html">TROCAR DE CONTA</a>
      </div>`);
  }

  const FILTERS = [
    ['to_ship', 'A enviar', ['paid']],
    ['shipped', 'Enviados', ['shipped']],
    ['delivered', 'Entregues', ['delivered']],
    ['waiting', 'Aguardando pagamento', ['created', 'pending', 'in_process']],
    ['all', 'Todos', null]
  ];
  const SOLD = ['paid', 'shipped', 'delivered'];
  let filter = 'to_ship';
  let orders = [];

  const fmtDate = (s) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const addressText = (a) => [
    a.full_name,
    `${a.street}, ${a.number}${a.complement ? ' — ' + a.complement : ''}`,
    `${a.district} · ${a.city}/${a.state}`,
    `CEP ${String(a.cep || '').replace(/^(\d{5})(\d{3})$/, '$1-$2')}`,
    a.phone ? `Tel: ${a.phone}` : ''
  ].filter(Boolean).join('\n');

  async function load() {
    const { data, error } = await sb
      .from('orders')
      .select('id, status, created_at, subtotal_cents, shipping_cents, total_cents, shipping_address, shipping_method, customer_email, tracking_code, mp_payment_id, order_items(name, size, quantity, unit_price_cents)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) { console.error(error); return show('<div class="notice">Não foi possível carregar os pedidos. Atualize a página.</div>'); }
    orders = data;
    render();
  }

  function render() {
    const now = new Date();
    const sold = orders.filter((o) => SOLD.includes(o.status));
    const sameDay = (d) => d.toDateString() === now.toDateString();
    const sameMonth = (d) => d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    const sum = (list) => list.reduce((n, o) => n + o.total_cents, 0);
    const today = sold.filter((o) => sameDay(new Date(o.created_at)));
    const month = sold.filter((o) => sameMonth(new Date(o.created_at)));
    const toShip = orders.filter((o) => o.status === 'paid').length;

    const [, , statuses] = FILTERS.find(([k]) => k === filter);
    const list = statuses ? orders.filter((o) => statuses.includes(o.status)) : orders;

    show(`
      <div class="account-head">
        <h1 class="page__title">Painel de vendas</h1>
        <button class="btn btn--outline" id="reload">ATUALIZAR</button>
      </div>

      <div class="kpis">
        <div class="kpi"><span class="kpi__label">Vendido hoje</span><span class="kpi__value">${brl.format(sum(today) / 100)}</span><span class="muted">${today.length} pedido(s)</span></div>
        <div class="kpi"><span class="kpi__label">Vendido no mês</span><span class="kpi__value">${brl.format(sum(month) / 100)}</span><span class="muted">${month.length} pedido(s)</span></div>
        <div class="kpi ${toShip ? 'kpi--alert' : ''}"><span class="kpi__label">A enviar</span><span class="kpi__value">${toShip}</span><span class="muted">pagos, aguardando envio</span></div>
      </div>

      <div class="tabs tabs--scroll" role="tablist">
        ${FILTERS.map(([k, label, st]) => {
          const n = st ? orders.filter((o) => st.includes(o.status)).length : orders.length;
          return `<button role="tab" class="tabs__tab" data-filter="${k}" aria-selected="${k === filter}">${label} <span class="muted">(${n})</span></button>`;
        }).join('')}
      </div>

      ${!list.length ? '<p class="muted">Nenhum pedido aqui.</p>' : `
      <ul class="admin-orders">
        ${list.map((o) => {
          const a = o.shipping_address || {};
          return `
          <li class="admin-order" data-id="${o.id}">
            <div class="admin-order__head">
              <div>
                <div class="order-row__id">#${o.id.slice(0, 8).toUpperCase()}</div>
                <div class="muted">${fmtDate(o.created_at)}</div>
              </div>
              <div class="order-row__end">${statusPill(o.status)}<strong>${money(o.total_cents)}</strong></div>
            </div>

            <div class="admin-order__grid">
              <div>
                <div class="label">Itens</div>
                <ul class="admin-items">
                  ${o.order_items.map((i) => `<li><strong>${i.quantity}×</strong> ${esc(i.name)}${i.size ? ` — tam. <strong>${esc(i.size)}</strong>` : ''}</li>`).join('')}
                </ul>
                <div class="label" style="margin-top:12px">Frete</div>
                <p>${esc(o.shipping_method || '—')} · ${o.shipping_cents > 0 ? money(o.shipping_cents) : 'Grátis'}</p>
              </div>
              <div>
                <div class="label">Entrega</div>
                <pre class="admin-address">${esc(addressText(a))}</pre>
                <p class="muted">${esc(o.customer_email || '')}</p>
                <button class="link-btn" data-copy>Copiar endereço</button>
              </div>
            </div>

            ${o.status === 'paid' ? `
            <form class="admin-ship" data-ship>
              <label for="trk-${o.id}" class="sr-only">Código de rastreio</label>
              <input id="trk-${o.id}" name="tracking" placeholder="Código de rastreio (opcional)" maxlength="40">
              <button class="btn btn--dark" type="submit">MARCAR COMO ENVIADO</button>
            </form>` : ''}
            ${o.status === 'shipped' ? `
            <div class="admin-ship">
              <span>Rastreio: <strong>${esc(o.tracking_code || '—')}</strong></span>
              <button class="btn btn--outline" data-delivered>MARCAR COMO ENTREGUE</button>
            </div>` : ''}
            ${o.status === 'delivered' && o.tracking_code ? `<p class="muted">Rastreio: ${esc(o.tracking_code)}</p>` : ''}
          </li>`;
        }).join('')}
      </ul>`}`);

    $('#reload').addEventListener('click', load);
    $$('[data-filter]', root).forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; render(); }));

    $$('.admin-order', root).forEach((li) => {
      const o = orders.find((x) => x.id === li.dataset.id);

      $('[data-copy]', li).addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(addressText(o.shipping_address || {})); toast('Endereço copiado.'); }
        catch { toast('Não foi possível copiar. Selecione o texto e copie.'); }
      });

      const shipForm = $('[data-ship]', li);
      if (shipForm) shipForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const tracking = shipForm.tracking.value.trim().toUpperCase();
        await update(o, { status: 'shipped', tracking_code: tracking || null }, 'Pedido marcado como enviado.');
      });

      const deliveredBtn = $('[data-delivered]', li);
      if (deliveredBtn) deliveredBtn.addEventListener('click', () => update(o, { status: 'delivered' }, 'Pedido marcado como entregue.'));
    });
  }

  async function update(order, changes, msg) {
    const { error } = await sb.from('orders').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', order.id);
    if (error) { console.error(error); toast('Não foi possível salvar. Tente de novo.'); return; }
    Object.assign(order, changes);
    toast(msg);
    render();
  }

  load();
})();
