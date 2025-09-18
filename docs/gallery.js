// gallery.js — Auto gallery with basic protection + lightbox
// - Reads files from docs/assets (or assets), supports slug.meta.json
// - Disables right-click/drag, shows watermark, opens preview in lightbox (no direct link)

(async () => {
  const grid = document.getElementById('grid');
  if (!grid) return;

  // Basic site config
  const OWNER  = grid.dataset.owner  || 'Jacknarak';
  const REPO   = grid.dataset.repo   || 'design-portfolio';
  const BRANCH = grid.dataset.branch || 'main';
  const WM_TEXT = grid.dataset.watermark || '© Preview Only';
  const SHOW_DOWNLOADS = (grid.dataset.downloads || 'hide').toLowerCase() === 'show';

  // Candidate asset paths (first one that works will be used)
  const candidatePaths = [];
  if (grid.dataset.path) candidatePaths.push(grid.dataset.path);
  candidatePaths.push('docs/assets','assets');

  // --- utilities ---
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

  // --- find working assets path ---
  let list = null, ASSETS_PATH = null;
  for (const p of candidatePaths) {
    const path = p.replace(/^\/+|\/+$/g,'');
    const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;
    const res = await fetchJSON(api);
    if (Array.isArray(res)) { list = res; ASSETS_PATH = path; break; }
  }
  if (!Array.isArray(list)) {
    grid.innerHTML = `<p style="color:#b00">Cannot load assets. Check repo settings or try again later.</p>`;
    return;
  }

  // --- group files by slug ---
  const groupsMap = {};
  for (const f of list) {
    const m = f.name.match(TYPE_RE);
    if (!m) continue;
    const slug = f.name.replace(TYPE_RE, '');
    const type = m[1].toLowerCase();
    groupsMap[slug] ??= { slug, files: {} };
    groupsMap[slug].files[type] = f.download_url || f.html_url;
  }
  const groups = Object.values(groupsMap);
  groups.sort((a,b) => a.slug < b.slug ? 1 : -1); // newest-first by name

  // --- viewer (lightbox) setup ---
  const viewer = document.getElementById('viewer');
  const viewerImg = document.getElementById('viewer-img');
  const viewerClose = document.getElementById('viewer-close');
  const viewerWM = viewer.querySelector('.wm-large');
  viewerWM.textContent = WM_TEXT;

  function openViewer(src) {
    viewerImg.src = src;
    viewer.setAttribute('aria-hidden', 'false');
    viewer.classList.add('show');
  }
  function closeViewer() {
    viewer.classList.remove('show');
    viewer.setAttribute('aria-hidden', 'true');
    viewerImg.src = '';
  }
  viewer.addEventListener('click', e => { if (e.target === viewer) closeViewer(); });
  viewerClose.addEventListener('click', closeViewer);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeViewer(); });

  // --- render cards ---
  for (const g of groups) {
    if (!g.files.thumb || !g.files.full) continue;

    const metaURL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${ASSETS_PATH}/${g.slug}.meta.json`;
    const meta = await fetchJSON(metaURL);

    const title = (meta && meta.title) || titleCase(g.slug);
    const desc  = (meta && meta.description) ||
      'Production-ready seamless print with balanced scale and refined color.';
    const tags  = (meta && Array.isArray(meta.tags)) ? meta.tags.slice(0,6) : [];

    // Downloads list (optional)
    const downloads = [];
    if (SHOW_DOWNLOADS) {
      for (const key of Object.keys(LABELS)) {
        if (g.files[key]) downloads.push(`<li><a href="${g.files[key]}" download>${LABELS[key]}</a></li>`);
      }
    } else {
      // โหมดป้องกัน: โชว์ปุ่มติดต่อแทนดาวน์โหลด
      downloads.push(`<li><a href="mailto:inkchaniai@gmail.com?subject=Licensing%20request:%20${encodeURIComponent(title)}">Request license</a></li>`);
    }
    if (tags.length) downloads.push(...tags.map(t => `<li>${t}</li>`));

    // Card HTML
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

    // เปิดภาพแบบ lightbox (ใช้ไฟล์ full ภายในหน้า ไม่ออกแท็บใหม่)
    const fig = card.querySelector('.thumb');
    fig.addEventListener('click', () => openViewer(g.files.full));
    grid.appendChild(card);
  }

  if (!grid.children.length) {
    grid.innerHTML = `<p>No works found in <code>${ASSETS_PATH}</code>. Ensure pairs like <em>slug-thumb.jpg</em> and <em>slug-full.jpg</em> exist.</p>`;
  }

  // --- soft protection: block right-click/drag/print/save ---
  const block = e => e.preventDefault();
  document.addEventListener('contextmenu', block, {capture:true});
  document.addEventListener('dragstart', block, {capture:true});
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['s','p','S','P'].includes(e.key)) { e.preventDefault(); }
  }, {capture:true});
})();
