import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CONFIG = {
  apiBase: '/api',
  mobileBreakpoint: 768,
  globeRadius: 1.72,
  nodeCount: 42,
  arcCount: 18,
  atmosphereRadius: 1.78,
  autoRotateSpeed: 0.18,
  searchDebounce: 220,
};

const state = {
  activeEntity: null,
  activeResult: null,
  searchQuery: '',
  searchResults: [],
  searchAbortController: null,
  selectedSource: 'all',
  mobileLeftOpen: false,
  mobileRightOpen: false,
  sceneReady: false,
};

const sampleEntities = [
  {
    id: 'gh-kubernetes',
    type: 'repository',
    source: 'GitHub',
    title: 'kubernetes/kubernetes',
    subtitle: 'Production-grade container orchestration',
    location: { lat: 37.7749, lon: -122.4194 },
    tags: ['repo', 'cloud', 'cncf'],
    score: 98,
    details: {
      summary: 'Core Kubernetes repository with broad contributor activity and global operational relevance.',
      fields: {
        Stars: '111k',
        Language: 'Go',
        License: 'Apache-2.0',
        Updated: '2h ago',
      },
    },
    timeline: [
      { date: '2024-02-11', title: 'Release branch cut', detail: 'Stabilization milestone observed across maintainer activity.' },
      { date: '2024-04-03', title: 'Security advisory referenced', detail: 'Linked issue and patch cadence increased sharply.' },
      { date: '2024-06-18', title: 'Contributor surge', detail: 'Sustained PR volume from multiple organizations.' },
    ],
  },
  {
    id: 'oa-transformers',
    type: 'paper',
    source: 'OpenAlex',
    title: 'Attention Is All You Need',
    subtitle: 'Foundational transformer architecture paper',
    location: { lat: 51.5072, lon: -0.1276 },
    tags: ['paper', 'ml', 'citation'],
    score: 95,
    details: {
      summary: 'High-centrality research artifact with enduring citation velocity and derivative ecosystem impact.',
      fields: {
        Citations: '132k',
        Year: '2017',
        Venue: 'NeurIPS',
        Concept: 'Transformers',
      },
    },
    timeline: [
      { date: '2017-12-06', title: 'Publication indexed', detail: 'Initial publication entered academic graph.' },
      { date: '2019-08-20', title: 'Citation acceleration', detail: 'Cross-domain adoption expanded beyond NLP.' },
      { date: '2024-05-01', title: 'Derivative work cluster', detail: 'New survey papers cite the work as canonical baseline.' },
    ],
  },
  {
    id: 'place-geneva',
    type: 'location',
    source: 'Nominatim',
    title: 'Geneva, Switzerland',
    subtitle: 'Geospatial anchor for institutions and events',
    location: { lat: 46.2044, lon: 6.1432 },
    tags: ['place', 'geo', 'europe'],
    score: 88,
    details: {
      summary: 'Strategic location entity frequently co-occurring with diplomacy, standards bodies, and research institutions.',
      fields: {
        Country: 'Switzerland',
        Class: 'Boundary',
        Importance: '0.78',
        Region: 'Europe',
      },
    },
    timeline: [
      { date: '2024-01-09', title: 'Location pinned', detail: 'Analyst geocoded event cluster to Geneva.' },
      { date: '2024-03-14', title: 'Institution overlap', detail: 'Multiple organizations linked to same metro area.' },
      { date: '2024-06-02', title: 'Travel pattern noted', detail: 'Repeated references across public schedules and filings.' },
    ],
  },
  {
    id: 'gh-fastapi',
    type: 'repository',
    source: 'GitHub',
    title: 'fastapi/fastapi',
    subtitle: 'High-performance Python APIs',
    location: { lat: -34.6037, lon: -58.3816 },
    tags: ['repo', 'python', 'api'],
    score: 91,
    details: {
      summary: 'Backend framework repository with strong adoption signal across developer ecosystems.',
      fields: {
        Stars: '82k',
        Language: 'Python',
        License: 'MIT',
        Updated: '5h ago',
      },
    },
    timeline: [
      { date: '2024-02-01', title: 'Release published', detail: 'New version propagated through package mirrors.' },
      { date: '2024-04-22', title: 'Dependency references rose', detail: 'Increased mentions in public repositories.' },
      { date: '2024-06-11', title: 'Docs refresh', detail: 'Major documentation updates aligned with release cycle.' },
    ],
  },
  {
    id: 'oa-crispr',
    type: 'paper',
    source: 'OpenAlex',
    title: 'A Programmable Dual-RNA–Guided DNA Endonuclease in Adaptive Bacterial Immunity',
    subtitle: 'CRISPR-Cas9 landmark paper',
    location: { lat: 42.3601, lon: -71.0589 },
    tags: ['paper', 'biology', 'genomics'],
    score: 93,
    details: {
      summary: 'Seminal life sciences publication with persistent translational and commercial relevance.',
      fields: {
        Citations: '24k',
        Year: '2012',
        Venue: 'Science',
        Concept: 'Genome editing',
      },
    },
    timeline: [
      { date: '2012-06-28', title: 'Publication indexed', detail: 'Paper entered scholarly graph with immediate uptake.' },
      { date: '2015-10-13', title: 'Patent references expanded', detail: 'Commercial and legal citations increased.' },
      { date: '2024-05-19', title: 'Clinical mention cluster', detail: 'Recent trial summaries cite foundational work.' },
    ],
  },
];

const timelineSeed = [
  { date: '2024-06-28 08:12', title: 'Search session initialized', detail: 'Unified search shell online across GitHub, OpenAlex, and Nominatim.' },
  { date: '2024-06-28 08:14', title: 'World graph hydrated', detail: 'Baseline entities projected to globe with emissive node overlays.' },
  { date: '2024-06-28 08:17', title: 'Inspector standing by', detail: 'Select any result or globe node to pivot into entity detail.' },
];

let app;
let globe;

function init() {
  injectShell();
  cacheDom();
  bindUI();
  renderSourceChips();
  renderTimeline(timelineSeed);
  renderSearchResults(sampleEntities, 'Baseline entities');
  setActiveEntity(sampleEntities[0], { appendTimeline: false });
  initGlobe();
  updateResponsiveState();
  window.addEventListener('resize', handleResize, { passive: true });
}

function injectShell() {
  document.body.innerHTML = `
    <div class="erebor-app" data-app-shell>
      <div class="app-backdrop" aria-hidden="true">
        <div class="backdrop-grid"></div>
        <div class="backdrop-vignette"></div>
      </div>

      <header class="topbar">
        <div class="brand-lockup">
          <button class="mobile-toggle mobile-toggle-left" type="button" data-panel-toggle="left" aria-label="Toggle search panel">
            <span></span><span></span><span></span>
          </button>
          <div class="brand-mark" aria-hidden="true">
            <div class="brand-mark-core"></div>
          </div>
          <div class="brand-copy">
            <div class="eyebrow">Erebor</div>
            <h1>Open-source intelligence workspace</h1>
          </div>
        </div>

        <div class="omnibar-wrap">
          <form class="omnibar" data-search-form>
            <div class="omnibar-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M10.5 18a7.5 7.5 0 1 1 5.303-2.197L21 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <input
              type="search"
              name="q"
              autocomplete="off"
              spellcheck="false"
              placeholder="Search repositories, papers, places…"
              aria-label="Unified search"
              data-search-input
            />
            <button class="omnibar-submit" type="submit">Query</button>
          </form>
          <div class="source-strip" data-source-strip></div>
        </div>

        <div class="topbar-actions">
          <div class="status-pill">
            <span class="status-dot"></span>
            <span>Open APIs</span>
          </div>
          <button class="mobile-toggle mobile-toggle-right" type="button" data-panel-toggle="right" aria-label="Toggle inspector panel">
            <span></span><span></span><span></span>
          </button>
        </div>
      </header>

      <main class="workspace">
        <aside class="panel panel-left" data-panel="left">
          <div class="panel-header">
            <div>
              <div class="panel-kicker">Unified search</div>
              <h2>Results</h2>
            </div>
            <div class="panel-meta" data-results-meta>5 entities</div>
          </div>

          <div class="panel-section panel-section-search">
            <div class="section-label">Coverage</div>
            <div class="coverage-grid">
              <div class="coverage-card">
                <strong>GitHub</strong>
                <span>Repos, users, orgs</span>
              </div>
              <div class="coverage-card">
                <strong>OpenAlex</strong>
                <span>Works, authors, concepts</span>
              </div>
              <div class="coverage-card">
                <strong>Nominatim</strong>
                <span>Places, addresses, regions</span>
              </div>
            </div>
          </div>

          <div class="panel-section">
            <div class="section-row">
              <div class="section-label">Result set</div>
              <button class="ghost-button" type="button" data-clear-search>Reset</button>
            </div>
            <div class="results-list" data-results-list></div>
          </div>
        </aside>

        <section class="stage-shell">
          <div class="stage-head">
            <div class="stage-title-group">
              <div class="panel-kicker">World graph</div>
              <h2>Global activity surface</h2>
            </div>
            <div class="stage-stats">
              <div class="stat-chip">
                <span class="stat-label">Nodes</span>
                <strong data-stat-nodes>${CONFIG.nodeCount}</strong>
              </div>
              <div class="stat-chip">
                <span class="stat-label">Links</span>
                <strong data-stat-links>${CONFIG.arcCount}</strong>
              </div>
              <div class="stat-chip">
                <span class="stat-label">Mode</span>
                <strong>Live proxy</strong>
              </div>
            </div>
          </div>

          <div class="canvas-stage" data-canvas-stage>
            <canvas class="globe-canvas" data-globe-canvas></canvas>

            <div class="hud hud-top-left">
              <div class="hud-card">
                <div class="hud-label">Focus</div>
                <div class="hud-value" data-focus-label>kubernetes/kubernetes</div>
              </div>
            </div>

            <div class="hud hud-bottom-left">
              <div class="hud-card hud-card-wide">
                <div class="hud-label">Investigation note</div>
                <div class="hud-value hud-value-small" data-hud-note>
                  Select a node or search result to inspect linked metadata and timeline context.
                </div>
              </div>
            </div>

            <div class="hud hud-bottom-right">
              <div class="hud-card">
                <div class="hud-label">Controls</div>
                <div class="hud-value hud-value-small">Drag orbit · Pinch zoom · Tap nodes</div>
              </div>
            </div>

            <div class="loading-veil" data-loading-veil hidden>
              <div class="loading-core"></div>
              <div class="loading-copy">Querying open sources…</div>
            </div>
          </div>
        </section>

        <aside class="panel panel-right" data-panel="right">
          <div class="panel-header">
            <div>
              <div class="panel-kicker">Entity inspector</div>
              <h2 data-inspector-title>kubernetes/kubernetes</h2>
            </div>
            <div class="panel-meta" data-inspector-source>GitHub</div>
          </div>

          <div class="panel-section">
            <div class="entity-summary" data-entity-summary></div>
            <div class="entity-tags" data-entity-tags></div>
            <div class="entity-fields" data-entity-fields></div>
          </div>

          <div class="panel-section">
            <div class="section-row">
              <div class="section-label">Investigation timeline</div>
              <div class="timeline-badge" data-timeline-count>3 events</div>
            </div>
            <div class="timeline-list" data-timeline-list></div>
          </div>
        </aside>
      </main>
    </div>
  `;

  injectStyles();
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --font-sans: "IBM Plex Sans", system-ui, sans-serif;
      --font-mono: "IBM Plex Mono", ui-monospace, monospace;
      --color-bg: #070a0f;
      --color-bg-elevated: rgba(12, 17, 24, 0.82);
      --color-bg-panel: rgba(10, 14, 20, 0.78);
      --color-text: #edf3fb;
      --color-text-muted: rgba(214, 223, 235, 0.68);
      --color-text-dim: rgba(214, 223, 235, 0.48);
      --color-accent: #63d6ff;
      --color-accent-2: #4dd7a8;
      --color-warning: #f7c66b;
      --color-danger: #ff6b7a;
      --color-success: #4dd7a8;
    }

    body {
      background:
        radial-gradient(circle at 20% 20%, rgba(99, 214, 255, 0.08), transparent 28%),
        radial-gradient(circle at 80% 12%, rgba(77, 215, 168, 0.06), transparent 24%),
        linear-gradient(180deg, #06090d 0%, #0a0f15 100%);
      color: var(--color-text);
      overflow: hidden;
    }

    button,
    input {
      font: inherit;
    }

    .erebor-app {
      position: relative;
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
      padding: var(--shell-padding);
      gap: var(--space-4);
    }

    .app-backdrop,
    .backdrop-grid,
    .backdrop-vignette {
      position: fixed;
      inset: 0;
      pointer-events: none;
    }

    .app-backdrop {
      z-index: 0;
    }

    .backdrop-grid {
      opacity: 0.22;
      background-image:
        linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
      background-size: 48px 48px;
      mask-image: radial-gradient(circle at 50% 50%, black 35%, transparent 85%);
    }

    .backdrop-vignette {
      background:
        radial-gradient(circle at 50% 45%, transparent 0%, rgba(7, 10, 15, 0.18) 48%, rgba(7, 10, 15, 0.82) 100%);
    }

    .topbar,
    .panel,
    .stage-shell,
    .hud-card,
    .omnibar {
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .topbar {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: minmax(0, 320px) minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-4);
      padding: 0.875rem 1rem;
      border: 1px solid rgba(164, 175, 191, 0.14);
      border-radius: 1.25rem;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01)),
        rgba(8, 12, 18, 0.72);
      box-shadow:
        0 24px 60px rgba(0, 0, 0, 0.34),
        inset 0 1px 0 rgba(255,255,255,0.04);
    }

    .brand-lockup {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      min-width: 0;
    }

    .brand-mark {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.9rem;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 50% 45%, rgba(99,214,255,0.28), rgba(99,214,255,0.06) 45%, transparent 70%),