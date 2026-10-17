let allUniversities = [];
let filteredUniversities = [];

const SCHOLARSHIP_LABELS = {
  TA_RA: 'TA / RA tuition waiver',
  MERIT: 'Merit scholarship',
  GOV_STEM: 'Government / STEM grant'
};

async function initExplorer() {
  const params = new URLSearchParams(window.location.search);
  const trackId = params.get('track') || 'ai-ml';

  try {
    // 1. Check tracks.json first to verify track status
    const tracksRes = await fetch('data/tracks.json');
    const tracksData = await tracksRes.json();
    const currentTrack = tracksData.tracks.find(t => t.id === trackId);

    if (!currentTrack || !currentTrack.active) {
      const title = currentTrack ? currentTrack.title : trackId;
      window.location.href = `404.html?course=${encodeURIComponent(title)}`;
      return;
    }

    // 2. Load the specific track's JSON database
    const dbRes = await fetch(currentTrack.dataFile);
    const dbData = await dbRes.json();

    // 3. Populate header metadata (track code comes from tracks.json)
    document.getElementById('track-title').textContent = dbData.trackTitle;
    document.getElementById('track-subtitle').textContent =
      `${currentTrack.code} · ${dbData.universities.length} verified programs across ${dbData.countries.length} countries`;
    document.getElementById('last-updated-year').textContent = dbData.lastUpdated;

    allUniversities = dbData.universities;
    filteredUniversities = [...allUniversities];

    setupControls();
    setupModalContainer();
    applyFiltersAndSort();
  } catch (err) {
    console.error(err);
    document.getElementById('uni-grid').innerHTML = `
      <div class="notice notice--error">
        <strong>Couldn't load the database.</strong>
        Open this site through GitHub Pages or a local web server so fetch() can read the JSON files.
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

  // Sort: industry connections
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
  countEl.textContent = `Showing ${filteredUniversities.length} of ${allUniversities.length} verified universities`;

  if (filteredUniversities.length === 0) {
    grid.innerHTML = `
      <div class="notice">
        No universities match this combination of filters. Try clearing one of the dropdowns.
      </div>
    `;
    return;
  }

  grid.innerHTML = filteredUniversities.map(u => `
    <article class="uni-card">
      <div class="uni-card__head">
        <span class="chip">${u.country} · ${u.city}</span>
        <span class="uni-card__verified">Verified ${u.lastVerified}</span>
      </div>

      <h2 class="uni-card__title">${u.name}</h2>
      <p class="uni-card__program">${u.program}</p>

      <div class="stats">
        <div>
          <span class="stat__label">Living + accommodation</span>
          <span class="stat__value">$${u.monthlyLivingCostUSD.toLocaleString()} <small>/ mo</small></span>
          ${u.localCostNote ? `<span class="stat__note">${u.localCostNote}</span>` : ''}
        </div>
        <div>
          <span class="stat__label">Industry pipeline</span>
          <span class="stat__value"><span class="stars">${'★'.repeat(u.industryScore)}${'☆'.repeat(5 - u.industryScore)}</span> <small>${u.industryScore}/5</small></span>
          <span class="stat__pipeline ${u.hasCoopOrPlacement ? 'stat__pipeline--coop' : ''}">
            ${u.hasCoopOrPlacement ? 'Co-op / placement track' : 'Summer internship track'}
          </span>
        </div>
      </div>

      <div class="uni-card__block">
        <div class="uni-card__aid">
          <span class="uni-card__label">Financial aid</span>
          <span class="chip chip--accent">${SCHOLARSHIP_LABELS[u.scholarshipCategory] || u.scholarshipCategory}</span>
        </div>
        <p class="uni-card__text">${u.scholarshipDetail}</p>
      </div>

      <div class="uni-card__block">
        <p class="uni-card__label" style="margin:0 0 4px">Industry connections</p>
        <p class="uni-card__text">${u.industryConnection}</p>
      </div>

      <button type="button" class="uni-card__action" onclick="openModal(${u.id})">
        <span>Modules and EEE fit</span>
        <span>View specs</span>
      </button>
    </article>
  `).join('');
}

function setupModalContainer() {
  if (document.getElementById('spec-modal')) return;

  const modalHTML = `
    <div id="spec-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="m-uni">
      <div class="modal__panel">
        <div class="modal__head">
          <div>
            <span id="m-meta" class="modal__eyebrow"></span>
            <h3 id="m-uni" class="modal__title"></h3>
            <p id="m-prog" class="modal__program"></p>
          </div>
          <button type="button" onclick="closeModal()" class="btn shrink-0">Close</button>
        </div>

        <div class="modal__grid">
          <div class="modal__box">
            <h3>Core theoretical foundations</h3>
            <ul id="m-core" class="modal__list"></ul>
          </div>
          <div class="modal__box">
            <h3>Applied and practical modules</h3>
            <ul id="m-applied" class="modal__list"></ul>
          </div>
        </div>

        <div class="modal__section">
          <h3>Fit for a B.Eng Electrical/Electronics graduate</h3>
          <p id="m-fit"></p>
        </div>

        <div class="modal__section">
          <h3>Scholarship and funding</h3>
          <p id="m-schol"></p>
        </div>

        <div class="modal__foot">
          <span id="m-cost"></span>
          <span id="m-audit"></span>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modal = document.getElementById('spec-modal');
  // Click the backdrop (outside the panel) to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

window.openModal = function(id) {
  const u = allUniversities.find(item => item.id === id);
  if (!u) return;

  document.getElementById('m-meta').textContent = `${u.country} · ${u.city} · Industry rating ${u.industryScore}/5`;
  document.getElementById('m-uni').textContent = u.name;
  document.getElementById('m-prog').textContent = u.program;

  document.getElementById('m-core').innerHTML = u.coreModules.map(m => `<li>${m}</li>`).join('');
  document.getElementById('m-applied').innerHTML = u.appliedModules.map(m => `<li>${m}</li>`).join('');
  document.getElementById('m-fit').textContent = u.eeeFitNote;
  document.getElementById('m-schol').textContent = u.scholarshipDetail;
  document.getElementById('m-cost').textContent =
    `Estimated living + accommodation: $${u.monthlyLivingCostUSD.toLocaleString()}/month${u.localCostNote ? ` (${u.localCostNote})` : ''}`;
  document.getElementById('m-audit').textContent = `Curriculum verified ${u.lastVerified}`;

  document.getElementById('spec-modal').classList.remove('hidden');
  document.querySelector('#spec-modal .btn').focus();
};

window.closeModal = function() {
  const modal = document.getElementById('spec-modal');
  if (modal) modal.classList.add('hidden');
};

document.addEventListener('DOMContentLoaded', initExplorer);