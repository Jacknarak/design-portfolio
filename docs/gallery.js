// gallery.js — auto gallery with configurable path (assetsPath)
// Usage: set data-path on #grid, e.g. "docs/assets" or "assets"

(async () => {
  const grid = document.getElementById('grid');
  if (!grid) return;

  const OWNER   = grid.dataset.owner  || '';
  const REPO    = grid.dataset.repo   || '';
  const BRANCH  = grid.dataset.branch || 'main';
  const SUBPATH = (grid.dataset.path  || 'assets').replace(/^\/+|\/+$/g, ''); // normalize

  // GitHub API: list directory contents
  const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${SUBPATH}?ref=${BRANCH}`;

  const TYPE_RE = /-(thumb|full|pack|ai|eps|psd|svg|png|jpg|jpeg|pdf|zip)\.(ai|eps|psd|svg|png|jpg|jpeg|pdf|zip)$/i;
  const LABELS  = { pack:'Pack', ai:'AI', eps:'EPS', psd:'PSD', svg:'SVG', png:'PNG', jpg:'JPG', jpeg:'JPG', pdf:'PDF', zip:'ZIP' };

  const titleCase = s => s.replace(/[_\-]+/g,' ')
    .replace(/\s+/g,' ').trim()
    .replace(/\w\S*/g, t => t[0].toUpperCase()+t.slice(1));

  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  // 1) list files
  const list = await fetchJSON(API);
  if (!Array.isArray(list)) {
    grid.innerHTML = `<p style="color:#b00">Cannot load assets from <code>${SUBPATH}</code>. Check repository path or permissions.</p>`;
    return;
  }

  // 2) group by slug
  const groups = Object.values(list.reduce((acc, f) => {
    const m = f.name.match(TYPE_RE);
    if (!m) return acc;
    const slug = f.name.replace(TYPE_RE, '');
    const type = m[1].toLowerCase();
    acc[slug] ??= { slug, files: {} };
    acc[slug].files[type] = f.download_url || f.html_url;
    return acc;
  }, {}));

  // 3) sort newest-first by slug
  groups.sort((a,b) => a.slug < b.slug ? 1 : -1);

  // 4) render cards (require thumb + full)
  for (const g of groups) {
    if (!g.files.thumb || !g.files.full) continue;

    const metaURL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${SUBPATH}/${g.slug}.meta.json`;
    const meta = await fetchJSON(metaURL);

    const title = (meta && meta.title) || titleCase(g.slug);
    const desc  = (meta && meta.description) ||
      'Production-ready seamless print with balanced scale and refined color.';
    const tags  = (meta && Array.isArray(meta.tags)) ? meta.tags.slice(0,6) : [];

    const downloads = [];
    for (const key of Object.keys(LABELS)) {
      if (g.files[key]) downloads.push(`<li><a href="${g.files[key]}" download>${LABELS[key]}</a></li>`);
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
    grid.innerHTML = `<p>No works found in <code>${SUBPATH}</code>. Ensure files like <em>slug-thumb.jpg</em> and <em>slug-full.jpg</em> exist.</p>`;
  }
})();
