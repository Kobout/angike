/* =========================================================
   ANGIKE — página inicial: destaque, vitrine (com filtro e busca),
   edição de produtos pela conta admin e newsletter
   ========================================================= */
(function () {
  const { $, $$, esc, sb, getProducts, productCard, param, isAdmin, toast } = window.Angike;

  /* ---------- destaque (uma imagem só, sem carrossel) ---------- */
  const HERO = {
    tone: '#6B1E2E',
    img: 'img/banner-1.jpg',
    title: 'COLEÇÃO PRIMAVERA.',
    text: 'PEÇAS LEVES EM LINHO E ALGODÃO, FEITAS PARA OS DIAS QUENTES.',
    link: '#novidades'
  };

  (function hero() {
    const wrap = $('#hero-slides');
    const slide = document.createElement('div');
    slide.className = 'slide is-active';
    slide.style.setProperty('--tone', HERO.tone);
    slide.innerHTML = `
      <div class="slide__placeholder">FOTO DA CAMPANHA</div>
      <img class="slide__img" src="${HERO.img}" alt="">
      <div class="slide__shade"></div>
      <div class="slide__content">
        <div class="slide__title">${HERO.title}</div>
        <p class="slide__text">${HERO.text}</p>
        <a class="slide__cta" href="${HERO.link}">VER AGORA</a>
      </div>`;
    const img = $('.slide__img', slide);
    img.addEventListener('error', () => { img.nextElementSibling.remove(); img.remove(); });
    img.addEventListener('load', () => { const p = $('.slide__placeholder', slide); if (p) p.remove(); });
    wrap.appendChild(slide);
  })();

  /* ---------- vitrine ---------- */
  const CATEGORIES = [
    ['vestidos', 'Vestidos'], ['blusas', 'Blusas e camisas'], ['calcas', 'Calças'],
    ['saias', 'Saias e shorts'], ['conjuntos', 'Conjuntos'], ['alfaiataria', 'Alfaiataria'], ['outros', 'Outros']
  ];
  const CAT_NAMES = Object.fromEntries(CATEGORIES);
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let admin = false;
  let allProducts = [];

  async function loadProducts() {
    if (admin) {
      // a conta admin vê também os produtos ocultos, para poder reativar
      const { data, error } = await sb.from('products').select('*').order('sort').order('created_at');
      if (!error && data) return data;
    }
    return getProducts();
  }

  async function renderProducts() {
    const grid = $('#products');
    const cat = param('cat');
    const q = (param('q') || '').trim();

    let list = allProducts;
    if (cat) list = list.filter((p) => p.category === cat);
    if (q) list = list.filter((p) => norm(p.name + ' ' + (p.description || '')).includes(norm(q)));

    if (q) $('#products-title').textContent = `Busca: “${q}”`;
    else if (cat) $('#products-title').textContent = CAT_NAMES[cat] || 'Produtos';

    grid.innerHTML = list.map((p, i) => {
      let html = productCard(p, i);
      if (admin) {
        html = html.replace('<article class="product">',
          `<article class="product${p.active ? '' : ' product--hidden'}">
            <button type="button" class="product__edit" data-edit="${esc(p.id)}" aria-label="Editar ${esc(p.name)}">EDITAR</button>
            ${p.active ? '' : '<span class="product__hidden-tag">OCULTO</span>'}`);
      }
      return html;
    }).join('') + (admin ? `
      <button type="button" class="product-add-card" id="add-product" aria-label="Adicionar produto">
        <span class="product-add-card__plus">+</span>
        <span>Adicionar produto</span>
      </button>` : '');

    $('#products-empty').hidden = list.length > 0 || admin;
    if ((cat || q) && location.hash === '#novidades') $('#novidades').scrollIntoView();
    const input = $('#menu-busca'); if (input && q) input.value = q;

    if (admin) {
      $$('[data-edit]', grid).forEach((b) => b.addEventListener('click', () => openEditor(allProducts.find((p) => p.id === b.dataset.edit))));
      $('#add-product').addEventListener('click', () => openEditor(null));
    }
  }

  (async function init() {
    admin = await isAdmin();
    allProducts = await loadProducts();
    renderProducts();
  })();

  /* ---------- editor de produto (só admin) ---------- */
  const slugify = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  const centsToInput = (c) => (c > 0 ? (c / 100).toFixed(2).replace('.', ',') : '');
  const inputToCents = (v) => {
    const n = Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
  };

  /** Reduz a foto para no máx. 1600px e JPEG ~85% (fica leve para o site). */
  async function compressImage(file) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      return await new Promise((res) => canvas.toBlob((b) => res(b || file), 'image/jpeg', 0.85));
    } catch {
      return file; // formato que o navegador não converte: envia como está
    }
  }

  function openEditor(product) {
    const p = product || { name: '', description: '', price_cents: 0, sizes: ['P', 'M', 'G'], category: 'vestidos', is_new: true, active: true, images: [] };
    const isNew = !product;
    let newPhoto = null;

    const dlg = document.createElement('dialog');
    dlg.className = 'editor';
    dlg.innerHTML = `
      <form method="dialog" class="form editor__form" novalidate>
        <div class="editor__head">
          <h2 class="block__title">${isNew ? 'Novo produto' : 'Editar produto'}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Fechar">✕</button>
        </div>

        <div class="editor__photo">
          <div class="editor__preview media" id="ed-preview">
            ${p.images && p.images[0] ? `<img src="${esc(p.images[0])}" alt="">` : '<span class="media__placeholder">SEM FOTO</span>'}
          </div>
          <label class="btn btn--outline editor__upload">
            ${p.images && p.images[0] ? 'TROCAR FOTO' : 'ESCOLHER FOTO'}
            <input type="file" accept="image/*" id="ed-file" hidden>
          </label>
        </div>

        <div class="field"><label for="ed-name">Nome</label>
          <input id="ed-name" required maxlength="80" value="${esc(p.name)}" placeholder="Ex.: Vestido Midi Linho"></div>
        <div class="field"><label for="ed-desc">Legenda / descrição</label>
          <textarea id="ed-desc" rows="3" maxlength="600" placeholder="Tecido, caimento, medidas da modelo…">${esc(p.description || '')}</textarea></div>
        <div class="field-row">
          <div class="field"><label for="ed-price">Preço (R$)</label>
            <input id="ed-price" inputmode="decimal" required placeholder="189,90" value="${centsToInput(p.price_cents)}"></div>
          <div class="field"><label for="ed-cat">Categoria</label>
            <select id="ed-cat">${CATEGORIES.map(([k, l]) => `<option value="${k}" ${p.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label for="ed-sizes">Tamanhos <span class="muted">(separados por vírgula; vazio = tamanho único)</span></label>
          <input id="ed-sizes" maxlength="80" value="${esc((p.sizes || []).join(', '))}" placeholder="P, M, G"></div>
        <label class="check"><input type="checkbox" id="ed-new" ${p.is_new ? 'checked' : ''}> Mostrar etiqueta “NOVO”</label>
        <label class="check"><input type="checkbox" id="ed-active" ${p.active !== false ? 'checked' : ''}> Visível na loja</label>

        <p class="form__error" role="alert" hidden></p>
        <div class="editor__actions">
          <button type="button" class="btn btn--outline" data-close>CANCELAR</button>
          <button type="submit" class="btn btn--dark" id="ed-save">SALVAR</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.showModal();

    const close = () => { dlg.close(); dlg.remove(); };
    $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', close));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

    $('#ed-file', dlg).addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      newPhoto = f;
      $('#ed-preview', dlg).innerHTML = `<img src="${URL.createObjectURL(f)}" alt="">`;
    });

    $('form', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('.form__error', dlg);
      err.hidden = true;
      const name = $('#ed-name', dlg).value.trim();
      const price = inputToCents($('#ed-price', dlg).value);
      if (!name) { err.textContent = 'Preencha o nome.'; err.hidden = false; return; }
      if (!(price > 0)) { err.textContent = 'Preço inválido. Use, por exemplo, 189,90.'; err.hidden = false; return; }

      const btn = $('#ed-save', dlg);
      btn.disabled = true; btn.textContent = 'SALVANDO…';
      try {
        const id = isNew ? `${slugify(name) || 'produto'}-${Date.now().toString(36)}` : p.id;
        let images = p.images || [];

        if (newPhoto) {
          const blob = await compressImage(newPhoto);
          const path = `${id}/${Date.now()}.jpg`;
          const { error: upErr } = await sb.storage.from('produtos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
          if (upErr) throw upErr;
          images = [sb.storage.from('produtos').getPublicUrl(path).data.publicUrl];
        }

        const row = {
          id, name, images,
          description: $('#ed-desc', dlg).value.trim(),
          price_cents: price,
          category: $('#ed-cat', dlg).value,
          sizes: $('#ed-sizes', dlg).value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
          is_new: $('#ed-new', dlg).checked,
          active: $('#ed-active', dlg).checked
        };
        if (isNew) row.sort = (allProducts.reduce((m, x) => Math.max(m, x.sort || 0), 0)) + 1;

        const { error } = isNew
          ? await sb.from('products').insert(row)
          : await sb.from('products').update(row).eq('id', id);
        if (error) throw error;

        allProducts = await loadProducts();
        renderProducts();
        close();
        toast(isNew ? 'Produto adicionado.' : 'Produto salvo.');
      } catch (ex) {
        console.error(ex);
        err.textContent = 'Não foi possível salvar. Confira se rodou o supabase/produtos-admin.sql e se está logado como admin.';
        err.hidden = false;
        btn.disabled = false; btn.textContent = 'SALVAR';
      }
    });
  }

  /* ---------- newsletter ---------- */
  $('#newsletter-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const email = form.email.value.trim().toLowerCase();
    const msg = $('#newsletter-msg');
    const btn = $('button', form);
    btn.disabled = true;
    try {
      if (sb) {
        const { error } = await sb.from('newsletter').insert({ email });
        if (error && error.code !== '23505') throw error; // 23505 = e-mail já cadastrado
      }
      msg.textContent = 'Pronto! Você vai receber nossas novidades.';
      form.reset();
    } catch (err) {
      console.error(err);
      msg.textContent = 'Não foi possível cadastrar agora. Tente de novo em alguns minutos.';
    } finally {
      btn.disabled = false;
    }
  });

})();
