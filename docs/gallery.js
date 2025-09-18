// Auto gallery: reads /assets via GitHub API and renders cards.
// Naming rule per work (slug): 
//   slug-thumb.jpg  (1200x900 recommended)
//   slug-full.jpg   (1600x1200 recommended)
// Optional sell/download files in same slug:
//   slug-pack.zip / slug-ai.ai / slug-eps.eps / slug-psd.psd / slug-svg.svg
//   slug-png.png / slug-jpg.jpg / slug-pdf.pdf / slug-zip.zip
// Optional metadata: slug.meta.json  -> { "title": "...", "description": "...", "tags": ["..."] }

(async () => {
  const grid = document.getElementById('grid');
  if (!grid) return;

  const OWNER  = grid.dataset.owner || '';
  const REPO   = grid.dataset.repo  || '';
  const BRANCH = grid.dataset.branch|| 'main';
  const API    = `https://api.github.com/repos/${OWNER}/${REPO}/contents/assets?ref=${BRANCH}`;

  const TYPE_RE = /-(thumb|full|pack|ai|eps|psd|svg|png|jpg|jpeg|pdf|zip)\.(ai|eps|psd|svg|png|jpg|jpeg|pdf|zip)$/i;
  const LABELS  = { pack:'Pack', ai:'AI', eps:'EPS', psd:'PSD', svg:'SVG', png:'PNG', jpg:'JPG', jpeg:'JPG', pdf:'PDF', zip:'ZIP' };

  const titleCase = s => s.replace(/[_\-]+/g,' ')
    .replace(/\s+/g,' ').trim()
    .replace(/\w\S*/g, t => t[0].toUpperCase()+t.slice(1));

  const fetchJSON = async (url) => {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  };

  // 1) list files in /assets
  const list = await fetchJSON(API);
  if (!Array.isArray(list)) {
    grid.innerHTML = `<p style="color:#b00">Cannot load assets. Check repo settings or try again later.</p>`;
    return;
  }

  // 2) group files by slug
  const groupsMap = {};
  for (const f of list) {
    const m = f.name.match(TYPE_RE);
    if (!m) continue;
    const slug = f.name.replace(TYPE_RE, '');
    const type = m[1].toLowerCase(); // thumb/full/ai/...
    groupsMap[slug] ??= { slug, files: {} };
    groupsMap[slug].files[type] = f.download_url || f.html_url;
  }
  let groups = Object.values(groupsMap);

  // 3) newest-first by name (tip: use yyyymmdd- or 001- prefixes)
  groups.sort((a,b) => a.slug < b.slug ? 1 : -1);

  // 4) render cards (thumb+full required)
  for (const g of groups) {
    if (!g.files.thumb || !g.files.full) continue;

    // optional metadata
    const metaURL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/assets/${g.slug}.meta.json`;
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
    grid.innerHTML = `<p>No works found. Add files to <code>assets/</code> using the naming rules.</p>`;
  }
})();
