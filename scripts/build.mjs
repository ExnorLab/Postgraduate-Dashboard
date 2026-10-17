// Builds the static GradIndex site into the repo root from data/ and src/.
// Run after scripts/validate.mjs. No dependencies.
//   src/pages/*.html      page bodies with <!--@header--> and <!--@footer--> markers
//   src/partials/*.html   shared header and footer, with {{aria:…}} and {{verified}}
//   src/styles/*.css      shared.css + <page>.css are concatenated into assets/css/<page>.css
//   src/pages/404.inline.js  script kept on the 404 page
//   data/tracks.json, data/<track>.json  everything shown on the site comes from these
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readRel = p => readFileSync(join(ROOT, p), 'utf8');
const readJson = p => JSON.parse(readRel(p));
const writeRel = (p, s) => {
  const f = join(ROOT, p);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, s);
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const joinList = items => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Montserrat:wght@600;700;800&display=swap';
const AID = { TA_RA: 'TA / RA tuition waiver', MERIT: 'Merit scholarship', GOV_STEM: 'Government / STEM grant' };
const PAGE_IDS = ['index', 'courses', 'about', 'explore', '404', 'program'];

// ---------- data ----------
const tracksFile = readJson('data/tracks.json');
const activeTracks = tracksFile.tracks.filter(t => t.active);
const activeData = activeTracks.map(t => ({ track: t, data: readJson(t.dataFile) }));
const programs = activeData.flatMap(({ track, data }) =>
  data.universities.map(u => ({ ...u, trackId: track.id })));

const countries = [...new Set(programs.map(p => p.country))];
const stats = {
  programs: String(programs.length),
  universities: String(new Set(programs.map(p => p.name)).size),
  countries: String(countries.length),
  openTracks: String(activeTracks.length),
  verified: esc(tracksFile.lastSystemSync),
};

// ---------- shared chrome ----------
function chrome(current, prefix = '') {
  let header = readRel('src/partials/header.html')
    .replace('{{aria:courses}}', current === 'courses' ? ' aria-current="page"' : '')
    .replace('{{aria:about}}', current === 'about' ? ' aria-current="page"' : '');
  let footer = readRel('src/partials/footer.html').replace('{{verified}}', stats.verified);
  if (prefix) {
    const withPrefix = html => html
      .replace(/(href|src)="(?!https?:|#|mailto:)([^"]*)"/g, (_, a, v) => `${a}="${prefix}${v}"`)
      .replace('href="#exnorlabs"', `href="${prefix}about.html#exnorlabs"`);
    header = withPrefix(header);
    footer = withPrefix(footer);
  }
  return { header, footer };
}

// Fills {{key}} values. Fails the build if any placeholder is left over.
function fill(html, values, file) {
  let out = html;
  for (const [k, v] of Object.entries(values)) out = out.split(`{{${k}}}`).join(v);
  const left = out.match(/\{\{[^}]*\}\}/);
  if (left) throw new Error(`${file}: unfilled placeholder ${left[0]}`);
  return out;
}

function fromTemplate(file, current) {
  const { header, footer } = chrome(current);
  return readRel(`src/pages/${file}`)
    .replace('<!--@header-->', header)
    .replace('<!--@footer-->', footer);
}

function document({ id, title, description, prefix = '', body, scripts = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${FONTS}" rel="stylesheet">
  <link rel="stylesheet" href="${prefix}assets/css/${id}.css" />
</head>
<body>
${body}
${scripts}</body>
</html>
`;
}

// ---------- generated fragments ----------
function trackCards() {
  return tracksFile.tracks.map(t => {
    const when = t.lastUpdated.replace('Pending ', '');
    const href = t.active
      ? `explore.html?track=${encodeURIComponent(t.id)}`
      : `404.html?course=${encodeURIComponent(t.title)}`;
    const top = t.active
      ? `<span class="pill"><span class="dot"></span>Open now</span>`
      : `<span class="pill pill--muted">Coming ${esc(when)}</span>`;
    const { universitiesCount, countriesCount } = activeCounts(t);
    const foot = t.active
      ? `<span>${universitiesCount} programs · ${countriesCount} countries</span><span class="card__cta">Explore programs →</span>`
      : `<span>Updated ${esc(when)}</span><span class="card__cta">View status →</span>`;
    return `
        <a href="${href}" class="card ${t.active ? '' : 'card--locked'}">
          <div class="card__top">
            <span class="card__code">${esc(t.code)}</span>
            ${top}
          </div>
          <h2>${esc(t.title)}</h2>
          <p class="desc">${esc(t.shortDesc)}</p>
          <div class="card__foot">${foot}</div>
        </a>`;
  }).join('');
}

function activeCounts(track) {
  const hit = activeData.find(d => d.track.id === track.id);
  if (!hit) return { universitiesCount: 0, countriesCount: 0 };
  return {
    universitiesCount: hit.data.universities.length,
    countriesCount: new Set(hit.data.universities.map(u => u.country)).size,
  };
}

function plansList() {
  const items = tracksFile.tracks.map(t => {
    const when = t.active ? 'Open now' : t.lastUpdated.replace('Pending', 'Planned');
    const cls = t.active ? 'plans__when plans__when--open' : 'plans__when';
    return `            <li><span class="plans__name">${esc(t.title)}</span><span class="${cls}">${esc(when)}</span></li>`;
  });
  return `<ul class="plans">\n${items.join('\n')}\n          </ul>`;
}

function programBody(u) {
  const list = items => (items || []).map(i => `<li>${esc(i)}</li>`).join('');
  const aid = esc(AID[u.scholarshipCategory] || u.scholarshipCategory);
  const { header, footer } = chrome('', '../');
  return `${header}
  <main class="wrap" id="program">
    <a class="back" href="../explore.html?track=${encodeURIComponent(u.trackId)}">&larr; Back to the index</a>

    <section class="hero">
      <span class="hero__loc">${esc(u.country)} · ${esc(u.city)}</span>
      <h1>${esc(u.name)}</h1>
      <p class="hero__program">${esc(u.program)}</p>
    </section>

    <section class="facts" aria-label="Key facts">
      <div class="fact">
        <span class="fact__label">Living and accommodation</span>
        <span class="fact__value">$${Number(u.monthlyLivingCostUSD).toLocaleString('en-US')}</span>
        <span class="fact__note">per month, estimated${u.localCostNote ? ' · ' + esc(u.localCostNote) : ''}</span>
      </div>
      <div class="fact">
        <span class="fact__label">Industry pipeline</span>
        <span class="fact__value">${u.industryScore}/5</span>
        <span class="fact__note">${u.hasCoopOrPlacement ? 'Co-op or placement track' : 'Summer internship track'}</span>
      </div>
      <div class="fact">
        <span class="fact__label">Financial aid</span>
        <span class="fact__value" style="font-size:1.1rem">${aid}</span>
      </div>
      <div class="fact">
        <span class="fact__label">Last verified</span>
        <span class="fact__value" style="font-size:1.1rem">${esc(u.lastVerified)}</span>
      </div>
    </section>

    <section class="section">
      <h2>Overview</h2>
      <div class="placeholder">Programme overview coming soon.</div>
    </section>

    <section class="section">
      <h2>Modules and fit</h2>
      <div class="two">
        <div class="panel">
          <h3>Core modules</h3>
          <ul>${list(u.coreModules)}</ul>
        </div>
        <div class="panel">
          <h3>Applied modules</h3>
          <ul>${list(u.appliedModules)}</ul>
        </div>
      </div>
      <div class="panel" style="margin-top:12px">
        <h3>Fit for an engineering graduate</h3>
        <p>${esc(u.eeeFitNote)}</p>
      </div>
    </section>

    <section class="section">
      <h2>Financial aid</h2>
      <div class="panel">
        <span class="aid-chip">${aid}</span>
        <p>${esc(u.scholarshipDetail)}</p>
      </div>
    </section>

    <section class="section">
      <h2>Industry connections</h2>
      <div class="panel"><p>${esc(u.industryConnection)}</p></div>
    </section>
  </main>
${footer}`;
}

// ---------- build ----------
const outputs = {};

outputs['index.html'] = document({
  id: 'index',
  title: "GradIndex — Find the right master's abroad",
  description: 'GradIndex helps undergraduates compare verified master\'s programs abroad by cost, scholarship and industry links.',
  body: fill(fromTemplate('index.html', ''), stats, 'index.html'),
});

outputs['courses.html'] = document({
  id: 'courses',
  title: 'Course tracks — GradIndex',
  description: "Choose a postgraduate course track to explore verified master's programs abroad for engineers and graduates.",
  body: fill(fromTemplate('courses.html', 'courses'), { ...stats, cards: trackCards() }, 'courses.html'),
});

outputs['about.html'] = document({
  id: 'about',
  title: 'About — GradIndex',
  description: 'What GradIndex covers, when it was last verified, and what comes next.',
  body: fill(fromTemplate('about.html', 'about'), {
    ...stats,
    openTrackSummary: `The open ${activeTracks.length === 1 ? 'track is' : 'tracks are'} ${esc(joinList(activeTracks.map(t => t.title)))}, covering programs in ${esc(joinList(countries))}.`,
    plans: plansList(),
  }, 'about.html'),
});

outputs['explore.html'] = document({
  id: 'explore',
  title: 'Course explorer — GradIndex',
  description: 'Search, filter and compare verified postgraduate programs by country, scholarship, cost and industry pipeline.',
  body: fill(fromTemplate('explore.html', ''), {}, 'explore.html'),
  scripts: '  <script src="assets/app.js"></script>\n',
});

outputs['404.html'] = document({
  id: '404',
  title: 'Track not verified yet — GradIndex',
  description: 'This course track has not been verified yet. Browse the active track or return to course selection.',
  body: fill(fromTemplate('404.html', ''), {}, '404.html'),
  scripts: `<script>\n${readRel('src/pages/404.inline.js')}</script>\n`,
});

// Old runtime template is replaced by static program pages. Keep the old URL working.
outputs['program.html'] = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GradIndex</title>
  <meta name="robots" content="noindex" />
  <script>
    (function () {
      var id = new URLSearchParams(window.location.search).get('id');
      window.location.replace(id ? 'program/' + encodeURIComponent(id) + '.html' : 'explore.html');
    })();
  </script>
</head>
<body>
  <p>Redirecting… <a href="explore.html">Browse the index</a>.</p>
</body>
</html>
`;

for (const u of programs) {
  outputs[`program/${u.id}.html`] = document({
    id: 'program',
    prefix: '../',
    title: `${u.name} — GradIndex`,
    description: `${u.program} at ${u.name}, ${u.city}, ${u.country}. Living cost, industry pipeline and financial aid.`,
    body: programBody(u),
  });
}

// Write pages. The program/ folder is fully regenerated so removed programs disappear.
rmSync(join(ROOT, 'program'), { recursive: true, force: true });
for (const [path, html] of Object.entries(outputs)) writeRel(path, html);

// Stylesheets: shared rules first, then each page's own rules (same cascade order as before).
const shared = readRel('src/styles/shared.css');
for (const id of PAGE_IDS) writeRel(`assets/css/${id}.css`, `${shared}\n${readRel(`src/styles/${id}.css`)}`);

console.log(`built ${Object.keys(outputs).length} pages (${programs.length} program pages) and ${PAGE_IDS.length} stylesheets`);
