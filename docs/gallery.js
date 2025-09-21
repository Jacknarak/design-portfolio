// gallery.js — ใช้พาธ relative ไปยัง assets/, categories จาก meta, pagination, lightbox, debug
(async () => {
  const grid    = document.getElementById('grid');
  const filters = document.getElementById('filters');
  const pager   = document.getElementById('pager');
  const qs      = new URLSearchParams(location.search);
  const isDebug = qs.has('debug');
  const dbgBox  = document.getElementById('debug');
  if (!grid) return;

  // --- config ---
  const OWNER   = grid.dataset.owner  || 'Jacknarak';
  const REPO    = grid.dataset.repo   || 'design-portfolio';
  const BRANCH  = grid.dataset.branch || 'main';
  const WM_TEXT = grid.dataset.watermark || '© Preview Only';
  const SHOW_DOWNLOADS = (grid.dataset.downloads || 'hide').toLowerCase() === 'show';
  const PAGE_SIZE = Math.max(1, parseInt(grid.dataset.pageSize || '20', 10));

  const candidatePaths = [];
  if (grid.dataset.path) candidatePaths.push(grid.dataset.path);
  candidatePaths.push('docs/assets','assets');

  // --- utils ---
  const TYPE_RE = /[ _-](thumb|full|pack|ai|eps|psd|svg|png|jpg|jpeg|pdf|zip|webp)\.(ai|eps|psd|svg|png|jpg|jpeg|pdf|zip|webp)$/i;
  const LABELS  = { pack:'Pack', ai:'AI', eps:'EPS', psd:'PSD', svg:'SVG', png:'PNG', jpg:'JPG', jpeg:'JPG', pdf:'PDF', zip:'ZIP', webp:'WEBP' };
  const titleCase = s => s.replace(/[_\-]+/g,' ').replace(/\s+/g,' ').trim().replace(/\w\S*/g, t => t[0].toUpperCase()+t.slice(1));

  function dbg(...args){
    if (!isDebug) return;
    if (dbgBox && dbgBox.hasAttribute('hidden')) dbgBox.removeAttribute('hidden');
    const line = args.map(a => typeof a==='string'?a:JSON.stringify(a)).join(' ');
    if (dbgBox) dbgBox.innerHTML += `<div>${line}</div>`;
    console.log('[DEBUG]', ...args);
  }
  function dbgLink(label, href){
    if (!isDebug) return;
    if (dbgBox && dbgBox.hasAttribute('hidden')) dbgBox.removeAttribute('hidden');
    if (dbgBox) dbgBox.innerHTML += `<div><a href="${href}" target="_blank" rel="noopener">${label}</a></div>`;
  }

  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  // ป้องกันพื้นฐาน
  const toast = document.getElementById('toast');
  function showToast(msg, ms=1800){ if(!toast) return; toast.textContent=msg; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'), ms); }
  const block = e => e.preventDefault();
  document.addEventListener('contextmenu', block, {capture:true});
  document.addEventListener('dragstart', block, {capture:true});
  function keyHandler(e){
    const k = e.key?.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'p')) { e.preventDefault(); e.stopPropagation(); showToast(k==='s'?'Saving disabled for previews':'Printing disabled for previews'); }
  }
  window.addEventListener('keydown', keyHandler, true);
  document.addEventListener('keydown', keyHandler, true);
  document.body.addEventListener('keydown', keyHandler, true);
  window.addEventListener('beforeprint', () => {
    const vimg = document.getElementById('viewer-img'); if (vimg) vimg.src = '';
  });

  // --- โหลดรายการไฟล์จาก GitHub API ---
  let list=null, ASSETS_PATH=null;
  for (const p of candidatePaths) {
    const path = p.replace(/^\/+|\/+$/g,'');
    const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;
    const res = await fetchJSON(api);
    if (Array.isArray(res)) { list=res; ASSETS_PATH=path; break; }
  }
  if (!Array.isArray(list)) {
    grid.innerHTML = `<p style="color:#b00">Cannot load assets. Check repo settings or try later.</p>`;
    dbg('No list from GitHub API.');
    return;
  }
  const SITE_ASSETS_PATH = ASSETS_PATH.replace(/^docs\//,''); // 'docs/assets' -> 'assets'
  dbg('<h3>Assets path (repo):</h3>', ASSETS_PATH);
  dbg('<h3>Assets path (site/relative):</h3>', SITE_ASSETS_PATH);
  dbg('<h3>Files found:</h3>', list.length);

  // --- จับคู่เป็นกลุ่มตาม slug และเก็บ "ชื่อไฟล์จริง" ---
  const groupsMap = {};
  const parseLog = [];
  for (const f of list) {
    const name = f.name;                  // เช่น darkbloom_moss-thumb.jpg
    const m = name.match(TYPE_RE);
    if (!m) { parseLog.push({file:name, matched:false}); continue; }
    const type = m[1].toLowerCase();      // thumb/full/ai/png...
    let slug = name.replace(TYPE_RE, '');
    slug = slug.replace(/[ _.-]+$/,'').trim();
    groupsMap[slug] ??= { slug, files: {}, meta: null };
    groupsMap[slug].files[type] = { name, raw: f.download_url || f.html_url };
    parseLog.push({file:name, matched:true, slug, type});
  }
  if (!Object.keys(groupsMap).length) {
    grid.innerHTML = `<p>No works parsed. Check file naming.</p>`;
    dbg(parseLog.slice(0,50));
    return;
  }

  // เอาเฉพาะงานที่มีคู่ thumb+full
  let allItems = Object.values(groupsMap).filter(g => g.files.thumb && g.files.full);

  // โหลด meta และคำนวณหมวด + สร้าง URL แบบ relative
  for (const g of allItems) {
    const metaURL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${ASSETS_PATH}/${g.slug}.meta.json`;
    const meta = await fetchJSON(metaURL);
    g.meta  = meta || {};
    g.title = (meta && meta.title) || titleCase(g.slug);
    g.desc  = (meta && meta.description) || 'Production-ready seamless print with balanced scale and refined color.';
    g.tags  = (meta && Array.isArray(meta.tags)) ? meta.tags.map(s=>s.toLowerCase()) : [];
    let category = (meta && meta.category ? String(meta.category).trim() : '');
    if (!category && meta && Array.isArray(meta.categories) && meta.categories.length) category = String(meta.categories[0]).trim();
    if (!category) category = 'Uncategorized';
    g.category = category;

    // พาธ relative (ไม่ใส่ / นำหน้า) -> จะกลายเป็น /design-portfolio/assets/<ไฟล์>
    const thumbName = g.files.thumb.name;
    const fullName  = g.files.full.name;
    g.thumbUrl = `${SITE_ASSETS_PATH}/${thumbName}`;
    g.fullUrl  = `${SITE_ASSETS_PATH}/${fullName}`;

    if (isDebug) {
      dbg(`meta for ${g.slug}:`, {title:g.title, category:g.category});
      dbgLink(`thumb: ${g.thumbUrl}`, g.thumbUrl);
      dbgLink(`full:  ${g.fullUrl}`,  g.fullUrl);
    }
  }

  if (!allItems.length) {
    grid.innerHTML = `<p>No works found. Ensure pairs like <code>slug-thumb.jpg/png</code> and <code>slug-full.jpg/png</code>.</p>`;
    return;
  }

  // หมวดจากข้อมูลจริง
  const categoriesSet = new Set(allItems.map(i => i.category));
  const categories = Array.from(categoriesSet).sort((a,b)=>a.localeCompare(b));
  let currentCategory = qs.get('cat') || 'All';
  if (currentCategory !== 'All' && !categoriesSet.has(currentCategory)) currentCategory = 'All';

  // สร้างปุ่มหมวด
  if (filters) {
    filters.innerHTML = '';
    const label = Object.assign(document.createElement('span'), {className:'label', textContent:'Category:'});
    filters.appendChild(label);
    const addChip = (name) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip' + (name===currentCategory?' active':'');
      btn.textContent = name;
      btn.addEventListener('click', () => {
        currentCategory = name;
        qs.set('cat', name==='All' ? '' : name);
        qs.set('page','1');
        history.replaceState({}, '', location.pathname + '?' + qs.toString());
        render();
      });
      filters.appendChild(btn);
    };
    addChip('All');
    for (const c of categories) addChip(c);
  }

  // viewer
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

  // render + pagination
  function fileUrl(rec){ return `${SITE_ASSETS_PATH}/${rec.name}`; }

  function render(){
    const filtered = currentCategory==='All' ? allItems : allItems.filter(i => i.category === currentCategory);
    filtered.sort((a,b)=> a.slug < b.slug ? 1 : -1);

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    let page = parseInt(qs.get('page') || '1', 10);
    if (isNaN(page) || page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    qs.set('page', String(page));
    history.replaceState({}, '', location.pathname + '?' + qs.toString());

    const start = (page-1)*PAGE_SIZE;
    const items = filtered.slice(start, start + PAGE_SIZE);

    grid.innerHTML = '';
    for (const g of items) {
      const downloads = [];
      if (SHOW_DOWNLOADS) {
        for (const key of Object.keys(LABELS)) {
          if (g.files[key]) downloads.push(`<li><a href="${fileUrl(g.files[key])}" download>${LABELS[key]}</a></li>`);
        }
      } else {
        downloads.push(`<li><a href="mailto:inkchaniai@gmail.com?subject=Licensing%20request:%20${encodeURIComponent(g.title)}">Request license</a></li>`);
      }
      if (g.tags.length) downloads.push(...g.tags.slice(0,6).map(t => `<li>${t}</li>`));

      const html = `
        <article class="card">
          <figure class="thumb">
            <img src="${g.thumbUrl}" alt="${g.title}" draggable="false" referrerpolicy="no-referrer"/>
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
      card.querySelector('.thumb').addEventListener('click', () => openViewer(g.fullUrl));
      grid.appendChild(card);
    }

    if (!items.length) grid.innerHTML = `<p>No works found under this category.</p>`;

    // pager
    if (pager) {
      pager.innerHTML = '';
      const makeBtn = (label, disabled, onClick, isActive=false) => {
        const b = document.createElement('button'); b.type='button'; b.className='btn' + (isActive?' active':'');
        b.textContent = label; if (disabled) b.disabled = true; b.addEventListener('click', onClick); return b;
      };
      const totalPagesLocal = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const prev = makeBtn('Prev', page<=1, () => { qs.set('page', String(page-1)); history.replaceState({}, '', location.pathname + '?' + qs.toString()); render(); });
      pager.appendChild(prev);

      const windowSize = 5;
      let startP = Math.max(1, page - Math.floor(windowSize/2));
      let endP = Math.min(totalPagesLocal, startP + windowSize - 1);
      startP = Math.max(1, endP - windowSize + 1);

      for (let p = startP; p <= endP; p++) {
        pager.appendChild(makeBtn(String(p), false, () => { qs.set('page', String(p)); history.replaceState({}, '', location.pathname + '?' + qs.toString()); render(); }, p===page));
      }
      const next = makeBtn('Next', page>=totalPagesLocal, () => { qs.set('page', String(page+1)); history.replaceState({}, '', location.pathname + '?' + qs.toString()); render(); });
      pager.appendChild(next);
    }
  }

  render();

  // โชว์พาธ/ลิงก์สำหรับตรวจใน debug
  if (isDebug) {
    dbg('<h3>Parse sample (first 50):</h3>');
    dbg(parseLog.slice(0,50));
  }
})();
