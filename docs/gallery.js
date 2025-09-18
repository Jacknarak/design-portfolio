// gallery.js — Auto gallery with lightbox + basic protection + toast + print block hooks
(async () => {
  const grid = document.getElementById('grid');
  if (!grid) return;

  const OWNER  = grid.dataset.owner  || 'Jacknarak';
  const REPO   = grid.dataset.repo   || 'design-portfolio';
  const BRANCH = grid.dataset.branch || 'main';
  const WM_TEXT = grid.dataset.watermark || '© Preview Only';
  const SHOW_DOWNLOADS = (grid.dataset.downloads || 'hide').toLowerCase() === 'show';

  // Candidate asset paths
  const candidatePaths = [];
  if (grid.dataset.path) candidatePaths.push(grid.dataset.path);
  candidatePaths.push('docs/assets','assets');

  const TYPE_RE = /-(thumb|full|pack|ai|eps|psd|svg|png|jpg|jpeg|pdf|zip)\.(ai|eps|psd|svg|png|jpg|jpeg|pdf|zip)$/i;
  const LABELS  = { pack:'Pack', ai:'AI', eps:'EPS', psd:'PSD', svg:'SVG', png:'PNG', jpg:'JPG', jpeg:'JPG', pdf:'PDF', zip:'ZIP' };
  const titleCase = s => s.replace(/[_\-]+/g,' ').replace(/\s+/g,' ').trim().replace(/\w\S*/g, t => t[0].toUpperCase()+t.slice(1));

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

  // Block right-click/drag (soft)
  const block = e => e.preventDefault();
  document.addEventListener('contextmenu', block, {capture:true});
  document.addEventListener('dragstart', block, {capture:true});

  // Try to suppress Ctrl/Cmd + S/P and show toast
  function keyHandler(e){
    const k = e.key?.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'p')) {
      e.preventDefault();
      e.stopPropagation();
      showToast(k === 's' ? 'Saving disabled for previews' : 'Printing disabled for previews');
    }
  }
  window.addEventListener('keydown', keyHandler, true);
  document.addEventListener('keydown', keyHandler, true);
  document.body.addEventListener('keydown', keyHandler, true);

  // Extra: blank the viewer before print (fallback)
  window.addEventListener('beforeprint', () => {
    const vimg = document.getElementById('viewer-img');
    if (vimg) vimg.src = '';
  });

  // Resolve working assets path
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

  // Group files by slug
  const groupsMap = {};
  for (const f of list) {
    const m = f.name.match(TYPE_RE);
    if (!m) continue;
    const slug = f.name.replace(TYPE_RE, '');
    const type = m[1].toLowerCase();
    groupsMap[slug] ??= { slug, files: {} };
    groupsMap[slug].files[type] = f.download_url || f.html_url;
  }
  const groups = Object.values(groupsMap).sort((a,b)=>a.slug<b.slug?1:-1);

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

  // Render
  for (const g of groups) {
    if (!g.files.thumb || !g.files.full) continue;

    const metaURL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${ASSETS_PATH}/${g.slug}.meta.json`;
    const meta = await fetchJSON(metaURL);

    const title = (meta && meta.title) || titleCase(g.slug);
    const desc  = (meta && meta.description) ||
      'Production-ready seamless print with balanced scale and refined color.';
    const tags  = (meta && Array.isArray(meta.tags)) ? meta.tags.slice(0,6) : [];

    const downloads = [];
    if (SHOW_DOWNLOADS) {
      for (const key of Object.keys(LABELS)) {
        if (g.files[key]) downloads.push(`<li><a href="${g.files[key]}" download>${LABELS[key]}</a></li>`);
      }
    } else {
      downloads.push(`<li><a href="mailto:inkchaniai@gmail.com?subject=Licensing%20request:%20${encodeURIComponent(title)}">Request license</a></li>`);
    }
    if (tags.length) downloads.push(...tags.map(t => `<li>${t}</li>`));

    const html = `
      <article class="card">
        <figure class="thumb">
          <img src="${g.files.thumb}" alt="${title}" draggable="false"/>
          <div class="wm">${WM_TEXT}</div>
        </figure>
        <div class="card-body">
          <h3>${title}</h3>
          <p>${desc}</p>
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

  if (!grid.children.length) {
    grid.innerHTML = `<p>No works found in <code>${ASSETS_PATH}</code>. Ensure pairs like <em>slug-thumb.jpg</em> and <em>slug-full.jpg</em> exist.</p>`;
  }
})();
