let allUniversities = [];
let filteredUniversities = [];

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

    // 3. Populate Header & Last Updated Metadata
    document.getElementById('track-title').textContent = dbData.trackTitle;
    document.getElementById('track-subtitle').textContent = `${currentTrack.code} · ${dbData.universities.length} Verified Programs Across ${dbData.countries.length} Countries`;
    document.getElementById('last-updated-year').textContent = dbData.lastUpdated.toUpperCase();

    allUniversities = dbData.universities;
    filteredUniversities = [...allUniversities];

    setupControls();
    setupModalContainer();
    applyFiltersAndSort();
  } catch (err) {
    console.error(err);
    document.getElementById('uni-grid').innerHTML = `
      <div class="col-span-full border border-ink bg-white p-8 font-mono text-xs text-red-700">
        <strong>Error loading database:</strong> Make sure you are running VS Code Live Server or viewing via GitHub Pages so fetch() can read local JSON files.
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
      // If user selects Cost Sort, reset Industry Sort to avoid conflict (and vice versa)
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

  // Sorting: Cost of Living / Accommodation
  if (costSort === 'ASC') {
    filteredUniversities.sort((a, b) => a.monthlyLivingCostUSD - b.monthlyLivingCostUSD);
  } else if (costSort === 'DESC') {
    filteredUniversities.sort((a, b) => b.monthlyLivingCostUSD - a.monthlyLivingCostUSD);
  }

  // Sorting: Industrial Connection / Affiliation
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
      <div class="col-span-full border border-border bg-white p-10 text-center font-mono text-xs text-neutral-500">
        No universities match the current filter combination. Try resetting one of the dropdowns.
      </div>
    `;
    return;
  }

  const scholarshipLabels = {
    'TA_RA': 'TA/RA Waiver + Stipend',
    'MERIT': 'Merit Fee Scholarship',
    'GOV_STEM': 'Gov / STEM / AI Grant'
  };

  grid.innerHTML = filteredUniversities.map((u, idx) => `
    <article class="border border-border bg-white p-5 flex flex-col justify-between hover:border-ink transition-all">
      <div>
        <!-- Top Meta Row -->
        <div class="flex items-center justify-between gap-2 mb-3 font-mono text-[11px]">
          <span class="px-2 py-0.5 bg-paper border border-border font-semibold text-ink">
            ${u.country} · ${u.city}
          </span>
          <span class="text-neutral-400">AUDIT: ${u.lastVerified}</span>
        </div>

        <!-- University & Program Name -->
        <h2 class="font-display font-bold text-base text-ink leading-snug mb-1">
          ${u.name}
        </h2>
        <p class="font-mono text-xs text-emerald font-medium mb-3">
          ${u.program}
        </p>

        <!-- Key Metrics Table -->
        <div class="grid grid-cols-2 gap-2 border-y border-border py-3 my-3 font-mono text-xs">
          <div>
            <span class="block text-[10px] uppercase text-neutral-400">Living + Accomm.</span>
            <strong class="text-ink">$${u.monthlyLivingCostUSD.toLocaleString()}/mo</strong>
            ${u.localCostNote ? `<span class="text-[10px] text-neutral-500 block">(${u.localCostNote})</span>` : ''}
          </div>
          <div>
            <span class="block text-[10px] uppercase text-neutral-400">Industry Pipeline</span>
            <strong class="text-ink">${'★'.repeat(u.industryScore)}${'☆'.repeat(5 - u.industryScore)} (${u.industryScore}/5)</strong>
            <span class="text-[10px] ${u.hasCoopOrPlacement ? 'text-emerald font-semibold' : 'text-neutral-500'} block">
              ${u.hasCoopOrPlacement ? '✓ Co-op / Placement Track' : 'Summer Internship Track'}
            </span>
          </div>
        </div>

        <!-- Scholarship Details -->
        <div class="mb-3">
          <div class="flex items-center justify-between mb-1">
            <span class="font-mono text-[10px] uppercase text-neutral-400">Financial Aid Option</span>
            <span class="font-mono text-[10px] px-1.5 py-0.5 bg-emerald/10 text-emerald border border-emerald/25">
              ${scholarshipLabels[u.scholarshipCategory] || u.scholarshipCategory}
            </span>
          </div>
          <p class="text-xs text-neutral-700 leading-relaxed">
            ${u.scholarshipDetail}
          </p>
        </div>

        <!-- Industry Affiliation -->
        <div class="mb-4">
          <span class="font-mono text-[10px] uppercase text-neutral-400 block mb-0.5">Industry Connections & Internships</span>
          <p class="text-xs text-neutral-600 leading-relaxed">
            ${u.industryConnection}
          </p>
        </div>
      </div>

      <!-- Inspect Curriculum Button -->
      <button onclick="openModal(${u.id})" class="w-full mt-2 pt-2.5 border-t border-border flex items-center justify-between font-mono text-xs text-ink hover:text-emerald font-medium transition">
        <span>Inspect Verified Modules & EEE Fit</span>
        <span>[View Specs →]</span>
      </button>
    </article>
  `).join('');
}

function setupModalContainer() {
  const modalHTML = `
    <div id="spec-modal" class="fixed inset-0 z-50 hidden bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div class="bg-paper border-2 border-ink max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl">
        <div class="flex items-start justify-between border-b border-border pb-4 mb-5">
          <div>
            <span id="m-meta" class="font-mono text-xs text-neutral-500 uppercase"></span>
            <h3 id="m-uni" class="font-display font-extrabold text-xl sm:text-2xl text-ink mt-0.5"></h3>
            <p id="m-prog" class="font-mono text-xs text-emerald font-semibold mt-1"></p>
          </div>
          <button onclick="closeModal()" class="font-mono text-xs border border-ink bg-white px-3 py-1.5 hover:bg-ink hover:text-paper transition">
            ESC / CLOSE
          </button>
        </div>

        <div class="space-y-5 text-xs">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="border border-border bg-white p-4">
              <div class="font-mono text-[11px] uppercase text-neutral-400 mb-2">Core Theoretical Foundations</div>
              <ul id="m-core" class="space-y-1.5 font-mono text-ink list-disc list-inside"></ul>
            </div>
            <div class="border border-border bg-white p-4">
              <div class="font-mono text-[11px] uppercase text-neutral-400 mb-2">Practical / Applied ML Modules</div>
              <ul id="m-applied" class="space-y-1.5 font-mono text-ink list-disc list-inside"></ul>
            </div>
          </div>

          <div class="border border-border bg-white p-4">
            <div class="font-mono text-[11px] uppercase text-neutral-400 mb-1">B.Eng Electrical/Electronics (2nd Class) + SQL/Tableau Fit</div>
            <p id="m-fit" class="text-neutral-700 leading-relaxed"></p>
          </div>

          <div class="border border-border bg-white p-4">
            <div class="font-mono text-[11px] uppercase text-neutral-400 mb-1">Scholarship & Funding Breakdown</div>
            <p id="m-schol" class="text-neutral-700 leading-relaxed"></p>
          </div>

          <div class="flex items-center justify-between font-mono text-[11px] text-neutral-500 pt-2 border-t border-border">
            <span id="m-cost"></span>
            <span id="m-audit"></span>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

window.openModal = function(id) {
  const u = allUniversities.find(item => item.id === id);
  if (!u) return;

  document.getElementById('m-meta').textContent = `${u.country} · ${u.city} · INDUSTRY RATING: ${u.industryScore}/5`;
  document.getElementById('m-uni').textContent = u.name;
  document.getElementById('m-prog').textContent = u.program;

  document.getElementById('m-core').innerHTML = u.coreModules.map(m => `<li>${m}</li>`).join('');
  document.getElementById('m-applied').innerHTML = u.appliedModules.map(m => `<li>${m}</li>`).join('');
  document.getElementById('m-fit').textContent = u.eeeFitNote;
  document.getElementById('m-schol').textContent = u.scholarshipDetail;
  document.getElementById('m-cost').textContent = `Est. Living + Accommodation: $${u.monthlyLivingCostUSD}/month${u.localCostNote ? ` (${u.localCostNote})` : ''}`;
  document.getElementById('m-audit').textContent = `Curriculum Verified: ${u.lastVerified}`;

  document.getElementById('spec-modal').classList.remove('hidden');
};

window.closeModal = function() {
  document.getElementById('spec-modal').classList.add('hidden');
};

document.addEventListener('DOMContentLoaded', initExplorer);