let allUniversities = [];
let filteredUniversities = [];
let currentTrackId = null;

const AID_LABELS = {
  TA_RA: 'TA / RA Waiver',
  MERIT: 'Merit Scholarship',
  GOV_STEM: 'Gov / STEM Grant'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

async function initExplorer() {
  const params = new URLSearchParams(window.location.search);
  const initialCountry = params.get('country');
  const initialAid = params.get('aid');
  const initialQuery = params.get('q');

  try {
    // 1. Load the track registry (single source of truth for every track)
    const tracksRes = await fetch('data/tracks.json');
    const tracksData = await tracksRes.json();

    // 2. Resolve the requested track. With no ?track= param, fall back to the
    //    first active track in tracks.json instead of a hard-coded ID.
    const requestedId = params.get('track');
    const currentTrack = requestedId
      ? tracksData.tracks.find(t => t.id === requestedId)
      : tracksData.tracks.find(t => t.active);

    if (!currentTrack || !currentTrack.active) {
      const title = currentTrack ? currentTrack.title : (requestedId || 'Unknown track');
      window.location.href = `404.html?course=${encodeURIComponent(title)}`;
      return;
    }

    currentTrackId = currentTrack.id;

    // 3. Load the track's program database
    const dbRes = await fetch(currentTrack.dataFile);
    const dbData = await dbRes.json();

    // 4. Header: title and a short summary line
    document.title = `${dbData.trackTitle} — GradIndex`;
    const titleEl = document.getElementById('track-title');
    const subtitleEl = document.getElementById('track-subtitle');

    if (titleEl) titleEl.textContent = dbData.trackTitle;
    if (subtitleEl) {
      subtitleEl.textContent = `${dbData.universities.length} verified programs across ${dbData.countries.length} countries · Verified ${dbData.lastUpdated}`;
    }

    allUniversities = dbData.universities;
    filteredUniversities = [...allUniversities];

    // 5. Build the country dropdown from this track's own country list
    populateCountryFilter(dbData.countries || []);

    // 6. Hydrate controls if URL params are present
    if (initialCountry) {
      const countryEl = document.getElementById('country-filter');
      if (countryEl && [...countryEl.options].some(o => o.value === initialCountry)) {
        countryEl.value = initialCountry;
      }
    }
    if (initialAid) {
      const aidEl = document.getElementById('scholarship-filter');
      if (aidEl && [...aidEl.options].some(o => o.value === initialAid)) {
        aidEl.value = initialAid;
      }
    }
    if (initialQuery) {
      const searchEl = document.getElementById('search-input');
      if (searchEl) searchEl.value = initialQuery;
    }

    setupControls();
    applyFiltersAndSort();
  } catch (err) {
    console.error(err);
    const grid = document.getElementById('uni-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="notice notice--error">
          <strong>Couldn't load the index.</strong>
          Serve this site through GitHub Pages or a local web server so the JSON files can be read.
        </div>
      `;
    }
  }
}

function populateCountryFilter(countries) {
  const countryEl = document.getElementById('country-filter');
  if (!countryEl) return;

  // Keep the existing "All" option's label, replace the rest
  const allLabel = countryEl.options.length ? countryEl.options[0].textContent : 'All countries';
  countryEl.innerHTML = '';
  countryEl.add(new Option(allLabel, 'ALL'));
  countries.forEach(c => countryEl.add(new Option(c, c)));
  countryEl.value = 'ALL';
}

function setupControls() {
  const controls = ['search-input', 'country-filter', 'scholarship-filter', 'cost-sort', 'industry-sort'];
  controls.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id === 'search-input' ? 'input' : 'change', (e) => {
      // Cost sort and industry sort are mutually exclusive
      if (id === 'cost-sort' && e.target.value !== 'NONE') {
        const indEl = document.getElementById('industry-sort');
        if (indEl) indEl.value = 'NONE';
      }
      if (id === 'industry-sort' && e.target.value !== 'NONE') {
        const costEl = document.getElementById('cost-sort');
        if (costEl) costEl.value = 'NONE';
      }
      applyFiltersAndSort();
    });
  });
}

function applyFiltersAndSort() {
  const searchEl = document.getElementById('search-input');
  const countryEl = document.getElementById('country-filter');
  const scholarshipEl = document.getElementById('scholarship-filter');
  const costSortEl = document.getElementById('cost-sort');
  const industrySortEl = document.getElementById('industry-sort');

  const query = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const country = countryEl ? countryEl.value : 'ALL';
  const scholarship = scholarshipEl ? scholarshipEl.value : 'ALL';
  const costSort = costSortEl ? costSortEl.value : 'NONE';
  const industrySort = industrySortEl ? industrySortEl.value : 'NONE';

  filteredUniversities = allUniversities.filter(u => {
    const matchesSearch = !query ||
      u.name.toLowerCase().includes(query) ||
      u.city.toLowerCase().includes(query) ||
      u.country.toLowerCase().includes(query) ||
      u.program.toLowerCase().includes(query) ||
      u.industryConnection.toLowerCase().includes(query) ||
      (u.eeeFitNote && u.eeeFitNote.toLowerCase().includes(query));

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
    filteredUniversities.sort((a, b) => b.industryScore - a.industryScore || (b.hasCoopOrPlacement ? 1 : -1) || (a.monthlyLivingCostUSD - b.monthlyLivingCostUSD));
  } else if (industrySort === 'COOP') {
    filteredUniversities.sort((a, b) => (b.hasCoopOrPlacement === a.hasCoopOrPlacement ? b.industryScore - a.industryScore : b.hasCoopOrPlacement ? 1 : -1));
  }

  updateResetButtonState({ query, country, scholarship, costSort, industrySort });
  renderGrid();
}

function updateResetButtonState({ query, country, scholarship, costSort, industrySort }) {
  const resetBtn = document.getElementById('reset-filters-btn');
  if (!resetBtn) return;

  let activeCount = 0;
  if (query) activeCount++;
  if (country !== 'ALL') activeCount++;
  if (scholarship !== 'ALL') activeCount++;
  if (costSort !== 'NONE') activeCount++;
  if (industrySort !== 'NONE') activeCount++;

  if (activeCount > 0) {
    resetBtn.textContent = `Reset filters (${activeCount})`;
    resetBtn.classList.add('reset-btn--active');
  } else {
    resetBtn.textContent = 'Reset filters';
    resetBtn.classList.remove('reset-btn--active');
  }
}

function renderGrid() {
  const grid = document.getElementById('uni-grid');
  const countEl = document.getElementById('results-count');
  if (!grid || !countEl) return;

  const n = filteredUniversities.length;

  // Compute quick live summary stats for the currently filtered set
  if (n > 0) {
    const minCost = Math.min(...filteredUniversities.map(u => u.monthlyLivingCostUSD));
    const maxCost = Math.max(...filteredUniversities.map(u => u.monthlyLivingCostUSD));
    countEl.innerHTML = `Showing <strong>${n}</strong> of ${allUniversities.length} universities · Living cost range: <strong>$${minCost.toLocaleString('en-US')} – $${maxCost.toLocaleString('en-US')}/mo</strong>`;
  } else {
    countEl.textContent = `Showing 0 of ${allUniversities.length} universities`;
  }

  if (n === 0) {
    grid.innerHTML = `
      <div class="notice">
        <strong>No programs match your active filter combination.</strong>
        <p style="margin-top:6px">Try clearing the search query or switching Scholarship / Country back to "All".</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filteredUniversities.map(u => {
    const aidLabel = AID_LABELS[u.scholarshipCategory] || u.scholarshipCategory;
    const costFormatted = `$${Number(u.monthlyLivingCostUSD).toLocaleString('en-US')}/mo`;
    const coopBadge = u.hasCoopOrPlacement
      ? `<span class="telemetry-pill telemetry-pill--coop">Co-op / Placement</span>`
      : `<span class="telemetry-pill">Internship Track</span>`;

    // Program IDs (UNI-001 etc.) repeat across tracks, so the track must be passed along
    const specsHref = `program.html?track=${encodeURIComponent(currentTrackId)}&id=${encodeURIComponent(u.id)}`;

    return `
      <article class="card">
        <div class="card__top-row">
          <span class="card__loc">${escapeHtml(u.country)} · ${escapeHtml(u.city)}</span>
          <span class="card__id">${escapeHtml(u.id)}</span>
        </div>

        <h2 class="card__name">${escapeHtml(u.name)}</h2>
        <p class="card__program">${escapeHtml(u.program)}</p>

        <div class="card__metrics" aria-label="Program telemetry">
          <div class="metric-box">
            <span class="metric-box__label">EST. LIVING</span>
            <span class="metric-box__val">${costFormatted}</span>
          </div>
          <div class="metric-box">
            <span class="metric-box__label">PRIMARY AID</span>
            <span class="metric-box__val metric-box__val--aid">${escapeHtml(aidLabel)}</span>
          </div>
        </div>

        <p class="card__industry-preview">${escapeHtml(u.industryConnection)}</p>

        <div class="card__rating">
          <div class="card__rating-left">
            <span class="label">Industry pipeline</span>
            <span class="stars" aria-hidden="true">${'★'.repeat(u.industryScore)}${'☆'.repeat(5 - u.industryScore)}</span>
            <span class="score-num">${u.industryScore}/5</span>
          </div>
          ${coopBadge}
        </div>

        <a class="card__link" href="${specsHref}">View full specs</a>
      </article>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', initExplorer);