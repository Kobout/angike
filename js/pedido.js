/* =========================================================
   ANGIKE — página do pedido (também é a volta do Mercado Pago)
   O status oficial vem do banco, atualizado pelo webhook mp-webhook.
   ========================================================= */
(async function () {
  const { $, esc, money, sb, configured, requireUser, param, statusPill, Cart } = window.Angike;
  const root = $('#order');
  const show = (html) => { root.removeAttribute('aria-busy'); root.innerHTML = html; };

  if (!configured) return show('<div class="notice">Pedidos ainda não configurados (veja o README.md).</div>');

  const id = param('id');
  const mpStatus = param('collection_status') || param('status'); // vem na URL de retorno do Mercado Pago
  if (!id) return show('<div class="empty-state"><p>Pedido não informado.</p><a class="btn btn--dark" href="conta.html">MEUS PEDIDOS</a></div>');

  const user = await requireUser();
  if (!user) return;

  const MESSAGES = {
    paid: ['Pagamento aprovado!', 'Obrigada pela compra. Você vai receber as atualizações de envio por e-mail.'],
    created: ['Aguardando pagamento', 'O pagamento ainda não foi concluído. Se quiser, volte para a sacola e tente de novo.'],
    pending: ['Pagamento pendente', 'Se você pagou com Pix ou boleto, a confirmação pode levar alguns minutos.'],
    in_process: ['Pagamento em análise', 'O Mercado Pago está analisando o pagamento. Avisaremos assim que for aprovado.'],
    rejected: ['Pagamento recusado', 'Nenhum valor foi cobrado. Você pode tentar de novo com outra forma de pagamento.'],
    cancelled: ['Pedido cancelado', ''],
    shipped: ['Pedido enviado', 'Seu pedido está a caminho.'],
    delivered: ['Pedido entregue', 'Esperamos que você goste!']
  };

  let tries = 0;
  async function load() {
    const { data: o, error } = await sb
      .from('orders')
      .select('id, status, subtotal_cents, shipping_cents, total_cents, shipping_address, created_at, order_items(name, size, quantity, unit_price_cents)')
      .eq('id', id)
      .maybeSingle();

    if (error || !o) return show('<div class="empty-state"><p>Não encontramos esse pedido na sua conta.</p><a class="btn btn--dark" href="conta.html">MEUS PEDIDOS</a></div>');

    // pagamento iniciado: a sacola já virou pedido
    if (['paid', 'pending', 'in_process'].includes(o.status) || ['approved', 'pending', 'in_process'].includes(mpStatus)) Cart.clear();

    // o webhook pode chegar alguns segundos depois da volta do Mercado Pago
    const waiting = mpStatus === 'approved' && ['created', 'pending'].includes(o.status) && tries < 6;
    const [title, text] = waiting
      ? ['Confirmando pagamento…', 'Recebemos a resposta do Mercado Pago. Só um instante.']
      : (MESSAGES[o.status] || ['Pedido', '']);
    const a = o.shipping_address || {};

    show(`
      <div class="order-head">
        <span class="eyebrow">PEDIDO #${o.id.slice(0, 8).toUpperCase()}</span>
        <h1 class="page__title">${title}</h1>
        ${text ? `<p class="muted">${text}</p>` : ''}
        <div>${statusPill(o.status)}</div>
      </div>

      <section class="block">
        <h2 class="block__title">Itens</h2>
        <ul class="summary__items">
          ${o.order_items.map((i) => `<li><span>${i.quantity}× ${esc(i.name)}${i.size ? ` (${esc(i.size)})` : ''}</span><span>${money(i.unit_price_cents * i.quantity)}</span></li>`).join('')}
        </ul>
        <dl class="summary__rows">
          <div><dt>Subtotal</dt><dd>${money(o.subtotal_cents)}</dd></div>
          <div><dt>Frete</dt><dd>${o.shipping_cents > 0 ? money(o.shipping_cents) : 'Grátis'}</dd></div>
          <div class="summary__total"><dt>Total</dt><dd>${money(o.total_cents)}</dd></div>
        </dl>
      </section>

      <section class="block">
        <h2 class="block__title">Entrega</h2>
        <p>${esc(a.full_name)}<br>
          ${esc(a.street)}, ${esc(a.number)}${a.complement ? ' — ' + esc(a.complement) : ''}<br>
          ${esc(a.district)} · ${esc(a.city)}/${esc(a.state)} · CEP ${esc(a.cep)}</p>
      </section>

      <div class="actions">
        ${['rejected', 'created'].includes(o.status) && !waiting ? '<a class="btn btn--dark" href="carrinho.html">TENTAR DE NOVO</a>' : ''}
        <a class="btn btn--outline" href="conta.html">MEUS PEDIDOS</a>
        <a class="btn btn--outline" href="index.html#novidades">CONTINUAR COMPRANDO</a>
      </div>`);

    if (waiting) { tries += 1; setTimeout(load, 3000); }
  }

  load();
})();
