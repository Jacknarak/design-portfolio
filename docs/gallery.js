// gallery.js — robust auto gallery (multi-path)
(async () => {
  const grid = document.getElementById('grid');
  if (!grid) return;

  const OWNER  = grid.dataset.owner  || 'Jacknarak';
  const REPO   = grid.dataset.repo   || 'design-portfolio';
  const BRANCH = grid.dataset.branch || 'main';

  // 1) candidate paths to try
  const candidatePaths = [];
  if (grid.dataset.path) candidatePaths.push(grid.dataset.path);
  candidatePaths.push('docs/assets', 'assets');

  const TYPE_RE = /-(thumb|full|pack|ai|eps|psd|svg|png|jpg|jpeg|pdf|zip)\.(ai|eps|psd|svg|png|jpg|jpeg|pdf|zip)$/i;
  const LABELS  = { pack:'Pack', ai:'AI', eps:'EPS', psd:'PSD', svg:'SVG', png:'PNG', jpg:'JPG', jpeg:'JPG', pdf:'PDF', zip:'ZIP' };

  const titleCase = s => s.replace(/[_\-]+/g,' ')
    .replace(/\s+/g,' ').trim()
    .replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1));

  const fetchJSON = async (url) => {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  };

  // 2) try to load listing from first working path
  let list = null, ASSETS_PATH = null;
  for (const p of candidatePaths) {
    const path = p.replace(/^\/+|\/+$/g,'');
    const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;
    const res = await fetchJSON(api);
    if (Array.isArray(res)) { list = res; ASSETS_PATH = path; break; }
  }

  if (!Array.isArray(list)) {
    grid.innerHTML = `<p style="color:#b00">Cannot load assets. Tried: ${candidatePaths.join(', ')}. Check that images are in one of these folders.</p>`;
    return;
  }

  // 3) group files by slug
  const groups = Object.values(list.reduce((acc, f) => {
    const m = f.name.match(TYPE_RE);
    if (!m) return acc;
    const slug = f.name.replace(TYPE_RE, '');
    const type = m[1].toLowerCase();
    acc[slug] ??= { slug, files: {} };
    acc[slug].files[type] = f.download_url || f.html_url;
    return acc;
  }, {}));

  // 4) sort newest-first (by name)
  groups.sort((a,b) => a.slug < b.slug ? 1 : -1);

  // 5) render cards (thumb + full required)
  for (const g of groups) {
    if (!g.files.thumb || !g.files.full) continue;

    const metaURL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${ASSETS_PATH}/${g.slug}.meta.json`;
    const meta = await fetchJSON(metaURL);

    const title = (meta && meta.title) || titleCase(g.slug);
    const desc  = (meta && meta.description) ||
      'Production-ready seamless print with balanced scale and refined color.';
    const tags  = (meta && Array.isArray(meta.tags)) ? meta.tags.slice(0,6) : [];

    const downloads = [];
    for (const k of Object.keys(LABELS)) {
      if (g.files[k]) downloads.push(`<li><a href="${g.files[k]}" download>${LABELS[k]}</a></li>`);
    }
    if (tags.length) downloads.push(...tags.map(t => `<li>${t}</li>`));

    const html = `
      <article class="card">
        <a href="${g.files.full}" target="_blank" rel="noopener">
          <img src="${g.files.thumb}" alt="${title}"/>
        </a>
        <div class="card-body">
          <h3>${title}</h3>
          <p>${desc}</p>
          <ul class="meta">${downloads.join('')}</ul>
        </div>
      </article>
    `;
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    grid.appendChild(tpl.content.firstElementChild);
  }

  if (!grid.children.length) {
    grid.innerHTML = `<p>No works found in <code>${ASSETS_PATH}</code>. Ensure pairs like <em>slug-thumb.jpg</em> and <em>slug-full.jpg</em> exist.</p>`;
  }
})();
