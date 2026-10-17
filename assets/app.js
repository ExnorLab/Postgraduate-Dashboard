let allUniversities = [];
let filteredUniversities = [];

async function initExplorer() {
  const params = new URLSearchParams(window.location.search);
  const trackId = params.get('track') || 'ai-ml';

  try {
    // 1. Check tracks.json first to verify the track is open
    const tracksRes = await fetch('data/tracks.json');
    const tracksData = await tracksRes.json();
    const currentTrack = tracksData.tracks.find(t => t.id === trackId);

    if (!currentTrack || !currentTrack.active) {
      const title = currentTrack ? currentTrack.title : trackId;
      window.location.href = `404.html?course=${encodeURIComponent(title)}`;
      return;
    }

    // 2. Load the track's program database
    const dbRes = await fetch(currentTrack.dataFile);
    const dbData = await dbRes.json();

    // 3. Header: title and a short summary line
    document.title = `${dbData.trackTitle} — GradIndex`;
    document.getElementById('track-title').textContent = dbData.trackTitle;
    document.getElementById('track-subtitle').textContent =
      `${dbData.universities.length} verified programs across ${dbData.countries.length} countries · Verified ${dbData.lastUpdated}`;

    allUniversities = dbData.universities;
    filteredUniversities = [...allUniversities];

    setupControls();
    applyFiltersAndSort();
  } catch (err) {
    console.error(err);
    document.getElementById('uni-grid').innerHTML = `
      <div class="notice notice--error">
        <strong>Couldn't load the index.</strong>
        Serve this site through GitHub Pages or a local web server so the JSON files can be read.
      </div>
    `;
  }
}

function setupControls() {
  const controls = ['search-input', 'country-filter', 'scholarship-filter', 'cost-sort', 'industry-sort'];
  controls.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id === 'search-input' ? 'input' : 'change', (e) => {
      // Cost sort and industry sort are mutually exclusive
      if (id === 'cost-sort' && e.target.value !== 'NONE') {
        document.getElementById('industry-sort').value = 'NONE';
      }
      if (id === 'industry-sort' && e.target.value !== 'NONE') {
        document.getElementById('cost-sort').value = 'NONE';
      }
      applyFiltersAndSort();
    });
  });
}

function applyFiltersAndSort() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  const country = document.getElementById('country-filter').value;
  const scholarship = document.getElementById('scholarship-filter').value;
  const costSort = document.getElementById('cost-sort').value;
  const industrySort = document.getElementById('industry-sort').value;

  filteredUniversities = allUniversities.filter(u => {
    const matchesSearch = !query ||
      u.name.toLowerCase().includes(query) ||
      u.city.toLowerCase().includes(query) ||
      u.program.toLowerCase().includes(query) ||
      u.industryConnection.toLowerCase().includes(query);

    const matchesCountry = country === 'ALL' || u.country === country;
    const matchesScholarship = scholarship === 'ALL' || u.scholarshipCategory === scholarship;

    return matchesSearch && matchesCountry && matchesScholarship;
  });

  // Sort: living cost
  if (costSort === 'ASC') {
    filteredUniversities.sort((a, b) => a.monthlyLivingCostUSD - b.monthlyLivingCostUSD);
  } else if (costSort === 'DESC') {
    filteredUniversities.sort((a, b) => b.monthlyLivingCostUSD - a.monthlyLivingCostUSD);
  }

  // Sort: industry links
  if (industrySort === 'HIGH') {
    filteredUniversities.sort((a, b) => b.industryScore - a.industryScore || (b.hasCoopOrPlacement ? 1 : -1));
  } else if (industrySort === 'COOP') {
    filteredUniversities.sort((a, b) => (b.hasCoopOrPlacement === a.hasCoopOrPlacement ? b.industryScore - a.industryScore : b.hasCoopOrPlacement ? 1 : -1));
  }

  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById('uni-grid');
  const countEl = document.getElementById('results-count');
  const n = filteredUniversities.length;
  countEl.textContent = `Showing ${n} of ${allUniversities.length} universities`;

  if (n === 0) {
    grid.innerHTML = `
      <div class="notice">No programs match these filters. Try clearing one of them.</div>
    `;
    return;
  }

  grid.innerHTML = filteredUniversities.map(u => `
    <article class="card">
      <span class="card__loc">${u.country} · ${u.city}</span>
      <h2 class="card__name">${u.name}</h2>
      <p class="card__program">${u.program}</p>
      <div class="card__rating">
        <span class="label">Industry pipeline</span>
        <span class="stars" aria-hidden="true">${'★'.repeat(u.industryScore)}${'☆'.repeat(5 - u.industryScore)}</span>
        <span>${u.industryScore}/5</span>
      </div>
      <a class="card__link" href="program.html?id=${encodeURIComponent(u.id)}">View full specs</a>
    </article>
  `).join('');
}

document.addEventListener('DOMContentLoaded', initExplorer);