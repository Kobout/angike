/* =========================================================
   ANGIKE — página inicial: carrossel, vitrine (com filtro e busca) e newsletter
   ========================================================= */
(function () {
  const { $, $$, esc, sb, getProducts, productCard, param } = window.Angike;

  /* ---------- carrossel ---------- */
  const SLIDES = [
    { tone: '#6B1E2E', img: 'img/banner-1.jpg', script: 'the new drop:',   title: 'COLEÇÃO PRIMAVERA.', text: 'PEÇAS LEVES EM LINHO E ALGODÃO, FEITAS PARA OS DIAS QUENTES.', link: '#novidades' },
    { tone: '#5A1A27', img: 'img/banner-2.jpg', script: 'everyday basics:', title: 'ESSENCIAIS.',        text: 'AS PEÇAS QUE COMBINAM COM TUDO, EM CORES NEUTRAS.',          link: '#novidades' },
    { tone: '#7A2433', img: 'img/banner-3.jpg', script: 'back in stock:',   title: 'RESTOCK.',           text: 'OS FAVORITOS QUE ESGOTARAM ESTÃO DE VOLTA.',                  link: '#novidades' },
    { tone: '#6E1F30', img: 'img/banner-4.jpg', script: 'the new charm:',   title: 'BRINDE EXCLUSIVO.',  text: 'BRINDE DISPONÍVEL PARA COMPRAS ACIMA DE R$ [VALOR]*',         link: '#novidades' },
    { tone: '#4F1622', img: 'img/banner-5.jpg', script: 'last call:',       title: 'SALE ATÉ [X]% OFF.', text: 'PEÇAS SELECIONADAS POR TEMPO LIMITADO.',                      link: '#novidades' }
  ];
  const AUTOPLAY_MS = 5000;

  (function carousel() {
    const wrap = $('#hero-slides');
    const dotsWrap = $('#hero-dots');
    let current = 0;
    let timer;

    SLIDES.forEach((s, i) => {
      const slide = document.createElement('div');
      slide.className = 'slide';
      slide.style.setProperty('--tone', s.tone);
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'slide');
      slide.setAttribute('aria-label', `${i + 1} de ${SLIDES.length}`);
      slide.innerHTML = `
        <div class="slide__placeholder">FOTO DA CAMPANHA ${i + 1}</div>
        <img class="slide__img" src="${s.img}" alt="" ${i === 0 ? '' : 'loading="lazy"'}>
        <div class="slide__shade"></div>
        <div class="slide__content">
          <div class="slide__script">${s.script}</div>
          <div class="slide__title">${s.title}</div>
          <p class="slide__text">${s.text}</p>
          <a class="slide__cta" href="${s.link}">VER AGORA</a>
        </div>`;
      const img = $('.slide__img', slide);
      img.addEventListener('error', () => { img.nextElementSibling.remove(); img.remove(); });
      img.addEventListener('load', () => { const p = $('.slide__placeholder', slide); if (p) p.remove(); });
      wrap.appendChild(slide);

      const dot = document.createElement('button');
      dot.className = 'dot';
      dot.setAttribute('aria-label', `Ir para o slide ${i + 1}`);
      dot.addEventListener('click', () => { go(i); restart(); });
      dotsWrap.appendChild(dot);
    });

    const slides = $$('.slide', wrap);
    const dots = $$('.dot', dotsWrap);

    function go(i) {
      current = (i + SLIDES.length) % SLIDES.length;
      slides.forEach((el, k) => {
        const active = k === current;
        el.classList.toggle('is-active', active);
        el.setAttribute('aria-hidden', String(!active));
        $$('a', el).forEach((a) => (a.tabIndex = active ? 0 : -1));
      });
      dots.forEach((d, k) => d.setAttribute('aria-current', String(k === current)));
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = () => { if (!reduce) timer = setInterval(() => go(current + 1), AUTOPLAY_MS); };
    const stop = () => clearInterval(timer);
    const restart = () => { stop(); start(); };

    let x0 = null;
    const hero = $('#hero');
    hero.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; stop(); }, { passive: true });
    hero.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) go(current + (dx < 0 ? 1 : -1));
      x0 = null; start();
    });
    hero.addEventListener('mouseenter', stop);
    hero.addEventListener('mouseleave', start);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : restart()));

    go(current);
    start();
  })();

  /* ---------- vitrine ---------- */
  const CAT_NAMES = { vestidos: 'Vestidos', blusas: 'Blusas e camisas', calcas: 'Calças', saias: 'Saias e shorts', conjuntos: 'Conjuntos', alfaiataria: 'Alfaiataria' };

  (async function products() {
    const grid = $('#products');
    const cat = param('cat');
    const q = (param('q') || '').trim();
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    let list = await getProducts();
    if (cat) list = list.filter((p) => p.category === cat);
    if (q) list = list.filter((p) => norm(p.name + ' ' + (p.description || '')).includes(norm(q)));

    if (q) $('#products-title').textContent = `Busca: “${q}”`;
    else if (cat) $('#products-title').textContent = CAT_NAMES[cat] || 'Produtos';

    grid.innerHTML = list.map(productCard).join('');
    $('#products-empty').hidden = list.length > 0;
    if ((cat || q) && location.hash === '#novidades') $('#novidades').scrollIntoView();
    const input = $('#menu-busca'); if (input && q) input.value = q;
  })();

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
