// gallery.js — Auto gallery with categories + pagination + lightbox + protection
// - แบ่งหน้า: page size จาก data-page-size (ดีฟอลต์ 20)
// - หมวดหมู่: สร้างจากแท็กใน .meta.json + จัดเข้ากลุ่มอัตโนมัติ (ขยายได้ในอนาคต)
// - คงไว้: ลายน้ำ, lightbox, hide downloads (หรือเปลี่ยน data-downloads="show")

(async () => {
  const grid   = document.getElementById('grid');
  const filters= document.getElementById('filters');
  const pager  = document.getElementById('pager');
  if (!grid) return;

  // --- config ---
  const OWNER  = grid.dataset.owner  || 'Jacknarak';
  const REPO   = grid.dataset.repo   || 'design-portfolio';
  const BRANCH = grid.dataset.branch || 'main';
  const WM_TEXT = grid.dataset.watermark || '© Preview Only';
  const SHOW_DOWNLOADS = (grid.dataset.downloads || 'hide').toLowerCase() === 'show';
  const PAGE_SIZE = Math.max(1, parseInt(grid.dataset.pageSize || '20', 10));

  const candidatePaths = [];
  if (grid.dataset.path) candidatePaths.push(grid.dataset.path);
  candidatePaths.push('docs/assets','assets');

  // --- utils ---
  const TYPE_RE = /-(thumb|full|pack|ai|eps|psd|svg|png|jpg|jpeg|pdf|zip)\.(ai|eps|psd|svg|png|jpg|jpeg|pdf|zip)$/i;
  const LABELS  = { pack:'Pack', ai:'AI', eps:'EPS', psd:'PSD', svg:'SVG', png:'PNG', jpg:'JPG', jpeg:'JPG', pdf:'PDF', zip:'ZIP' };
  const titleCase = s => s.replace(/[_\-]+/g,' ').replace(/\s+/g,' ').trim().replace(/\w\S*/g, t => t[0].toUpperCase()+t.slice(1));
  const qs = new URLSearchParams(location.search);

  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  // Toast
  const toast = document.getElementById('toast');
  function showToast(msg, ms=1800){ if(!toast) return; toast.textContent=msg; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'), ms); }

  // Soft protection
  const block = e => e.preventDefault();
  document.addEventListener('contextmenu', block, {capture:true});
  document.addEventListener('dragstart', block, {capture:true});
  function keyHandler(e){
    const k = e.key?.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'p')) {
      e.preventDefault(); e.stopPropagation();
      showToast(k === 's' ? 'Saving disabled for previews' : 'Printing disabled for previews');
    }
  }
  window.addEventListener('keydown', keyHandler, true);
  document.addEventListener('keydown', keyHandler, true);
  document.body.addEventListener('keydown', keyHandler, true);
  window.addEventListener('beforeprint', () => {
    const vimg = document.getElementById('viewer-img');
    if (vimg) vimg.src = '';
  });

  // --- load assets list ---
  let list=null, ASSETS_PATH=null;
  for (const p of candidatePaths) {
    const path = p.replace(/^\/+|\/+$/g,'');
    const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;
    const res = await fetchJSON(api);
    if (Array.isArray(res)) { list=res; ASSETS_PATH=path; break; }
  }
  if (!Array.isArray(list)) {
    grid.innerHTML = `<p style="color:#b00">Cannot load assets. Check repo settings or try again later.</p>`;
    return;
  }

  // Group by slug
  const groupsMap = {};
  for (const f of list) {
    const m = f.name.match(TYPE_RE);
    if (!m) continue;
    const slug = f.name.replace(TYPE_RE, '');
    const type = m[1].toLowerCase();
    groupsMap[slug] ??= { slug, files: {}, meta: null };
    groupsMap[slug].files[type] = f.download_url || f.html_url;
  }
  const allItems = Object.values(groupsMap).filter(g => g.files.thumb && g.files.full);

  // Load meta
  for (const g of allItems) {
    const metaURL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${ASSETS_PATH}/${g.slug}.meta.json`;
    g.meta = await fetchJSON(metaURL) || {};
    g.title = g.meta.title || titleCase(g.slug);
    g.desc  = g.meta.description || 'Production-ready seamless print with balanced scale and refined color.';
    g.tags  = Array.isArray(g.meta.tags) ? g.meta.tags.map(s=>s.toLowerCase()) : [];
  }

  // Categorize
  function categorize(item){
    const t = new Set(item.tags);
    const title = item.title.toLowerCase();

    const matchAny = (arr) => arr.some(k => t.has(k) || title.includes(k));

    if (matchAny(['floral','botanical','flower','foliage','leaf','garden'])) return 'Floral';
    if (matchAny(['geo','geometric','pattern','stripe','check','plaid','dot','polka'])) return 'Geometric';
    if (matchAny(['animal','leopard','tiger','zebra','wildlife','bird','butterfly'])) return 'Animal';
    if (matchAny(['nature','landscape','forest','mountain','ocean','sea','stone','wood'])) return 'Nature';
    if (matchAny(['textile','fabric','weave','ikat','batik','paisley'])) return 'Textile';
    return 'Uncategorized';
  }
  allItems.forEach(i => i.category = categorize(i));

  // Build category list (sorted, 'All' first)
  const categories = Array.from(new Set(allItems.map(i => i.category))).sort();
  const catParam = qs.get('cat') || 'All';
  let currentCategory = categories.includes(catParam) ? catParam : 'All';

  // Render filter chips
  if (filters) {
    const chips = [];
    const makeChip = (name) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip' + (name===currentCategory ? ' active':'');
      btn.textContent = name;
      btn.addEventListener('click', () => {
        currentCategory = name;
        // reset to page 1 on category change
        qs.set('cat', name==='All' ? '' : name);
        qs.set('page','1');
        history.replaceState({}, '', location.pathname + '?' + qs.toString());
        render();
      });
      return btn;
    };
    filters.innerHTML = '';
    filters.appendChild(Object.assign(document.createElement('span'), {className:'label', textContent:'Category:'}));
    filters.appendChild(makeChip('All'));
    for (const c of categories) filters.appendChild(makeChip(c));
  }

  // Viewer
  const viewer = document.getElementById('viewer');
  const viewerImg = document.getElementById('viewer-img');
  const viewerClose = document.getElementById('viewer-close');
  const viewerWM = viewer.querySelector('.wm-large');
  viewerWM.textContent = WM_TEXT;
  function openViewer(src){ viewerImg.src = src; viewer.classList.add('show'); viewer.setAttribute('aria-hidden','false'); }
  function closeViewer(){ viewer.classList.remove('show'); viewer.setAttribute('aria-hidden','true'); viewerImg.src=''; }
  viewer.addEventListener('click', e => { if (e.target === viewer) closeViewer(); });
  viewerClose.addEventListener('click', closeViewer);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeViewer(); }, true);

  // Render with pagination
  function render(){
    // filter
    const filtered = currentCategory==='All'
      ? allItems
      : allItems.filter(i => i.category === currentCategory);

    // sort newest-first by slug name
    filtered.sort((a,b)=> a.slug < b.slug ? 1 : -1);

    // pagination
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    let page = parseInt(qs.get('page') || '1', 10);
    if (isNaN(page) || page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    qs.set('page', String(page));
    history.replaceState({}, '', location.pathname + '?' + qs.toString());

    const start = (page-1)*PAGE_SIZE;
    const items = filtered.slice(start, start + PAGE_SIZE);

    // grid
    grid.innerHTML = '';
    for (const g of items) {
      const downloads = [];
      if (SHOW_DOWNLOADS) {
        for (const key of Object.keys(LABELS)) {
          if (g.files[key]) downloads.push(`<li><a href="${g.files[key]}" download>${LABELS[key]}</a></li>`);
        }
      } else {
        downloads.push(`<li><a href="mailto:inkchaniai@gmail.com?subject=Licensing%20request:%20${encodeURIComponent(g.title)}">Request license</a></li>`);
      }
      if (g.tags.length) downloads.push(...g.tags.slice(0,6).map(t => `<li>${t}</li>`));

      const html = `
        <article class="card">
          <figure class="thumb">
            <img src="${g.files.thumb}" alt="${g.title}" draggable="false"/>
            <div class="wm">${WM_TEXT}</div>
          </figure>
          <div class="card-body">
            <h3>${g.title}</h3>
            <p>${g.desc}</p>
            <ul class="meta">${downloads.join('')}</ul>
          </div>
        </article>
      `;
      const tpl = document.createElement('template');
      tpl.innerHTML = html.trim();
      const card = tpl.content.firstElementChild;
      card.querySelector('.thumb').addEventListener('click', () => openViewer(g.files.full));
      grid.appendChild(card);
    }

    if (!items.length) {
      grid.innerHTML = `<p>No works found.</p>`;
    }

    // pager
    if (pager) {
      pager.innerHTML = '';
      const makeBtn = (label, disabled, onClick, isActive=false) => {
        const b = document.createElement('button');
        b.type='button'; b.className='btn' + (isActive?' active':'');
        b.textContent = label;
        if (disabled) b.disabled = true;
        b.addEventListener('click', onClick);
        return b;
      };
      const prev = makeBtn('Prev', page<=1, () => { qs.set('page', String(page-1)); history.replaceState({}, '', location.pathname + '?' + qs.toString()); render(); });
      pager.appendChild(prev);

      const windowSize = 5; // show up to 5 page buttons
      let startP = Math.max(1, page - Math.floor(windowSize/2));
      let endP = Math.min(totalPages, startP + windowSize - 1);
      startP = Math.max(1, endP - windowSize + 1);

      for (let p = startP; p <= endP; p++) {
        pager.appendChild(makeBtn(String(p), false, () => { qs.set('page', String(p)); history.replaceState({}, '', location.pathname + '?' + qs.toString()); render(); }, p===page));
      }
      const next = makeBtn('Next', page>=totalPages, () => { qs.set('page', String(page+1)); history.replaceState({}, '', location.pathname + '?' + qs.toString()); render(); });
      pager.appendChild(next);
    }
  }

  render();
})();
