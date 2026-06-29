import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const API_BASE = (() => {
  const meta = document.querySelector('meta[name="erebor-api-base"]');
  return meta?.content?.trim() || '/api';
})();

const state = {
  query: '',
  activeEntity: null,
  timeline: [],
  searchResults: {
    github: [],
    openalex: [],
    nominatim: [],
  },
  loading: false,
  mobile: window.innerWidth < 768,
  panels: {
    search: true,
    inspector: !window.innerWidth < 768,
    timeline: false,
  },
};

const sceneState = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  globe: null,
  globeGroup: null,
  atmosphere: null,
  stars: null,
  arcsGroup: null,
  nodesGroup: null,
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  hoveredNode: null,
  nodeMeshes: [],
  arcMeshes: [],
  clock: new THREE.Clock(),
  frame: 0,
};

const seedEntities = [
  {
    id: 'gh-torvalds-linux',
    source: 'GitHub',
    type: 'repository',
    label: 'torvalds/linux',
    title: 'Linux kernel',
    subtitle: 'GitHub repository',
    description: 'High-signal OSS repository with global contributor graph and issue activity.',
    lat: 37.7749,
    lon: -122.4194,
    score: 98,
    tags: ['repository', 'oss', 'infrastructure'],
    meta: {
      stars: '184k',
      language: 'C',
      updated: 'Active',
    },
  },
  {
    id: 'oa-transformers',
    source: 'OpenAlex',
    type: 'work',
    label: 'Attention Is All You Need',
    title: 'Attention Is All You Need',
    subtitle: 'OpenAlex work',
    description: 'Foundational paper in transformer architectures with broad downstream citation impact.',
    lat: 51.5072,
    lon: -0.1276,
    score: 94,
    tags: ['paper', 'ml', 'citation'],
    meta: {
      citations: '132k',
      year: '2017',
      venue: 'NeurIPS',
    },
  },
  {
    id: 'nm-geneva',
    source: 'Nominatim',
    type: 'location',
    label: 'Geneva',
    title: 'Geneva, Switzerland',
    subtitle: 'Geospatial entity',
    description: 'Neutral coordination hub often used in geopolitical and NGO investigations.',
    lat: 46.2044,
    lon: 6.1432,
    score: 88,
    tags: ['location', 'geo', 'europe'],
    meta: {
      country: 'Switzerland',
      class: 'boundary',
      importance: '0.78',
    },
  },
  {
    id: 'gh-kubernetes',
    source: 'GitHub',
    type: 'repository',
    label: 'kubernetes/kubernetes',
    title: 'Kubernetes',
    subtitle: 'GitHub repository',
    description: 'Cloud-native orchestration project with extensive ecosystem and release cadence.',
    lat: 47.6062,
    lon: -122.3321,
    score: 91,
    tags: ['cloud', 'repository', 'cncf'],
    meta: {
      stars: '112k',
      language: 'Go',
      updated: 'Today',
    },
  },
  {
    id: 'oa-crispr',
    source: 'OpenAlex',
    type: 'work',
    label: 'CRISPR genome editing',
    title: 'A programmable dual-RNA-guided DNA endonuclease in adaptive bacterial immunity',
    subtitle: 'OpenAlex work',
    description: 'Landmark life sciences paper with major translational and legal significance.',
    lat: 42.3601,
    lon: -71.0589,
    score: 89,
    tags: ['biology', 'paper', 'research'],
    meta: {
      citations: '24k',
      year: '2012',
      venue: 'Science',
    },
  },
  {
    id: 'nm-singapore',
    source: 'Nominatim',
    type: 'location',
    label: 'Singapore',
    title: 'Singapore',
    subtitle: 'Geospatial entity',
    description: 'Strategic logistics and finance node with dense corporate and maritime activity.',
    lat: 1.3521,
    lon: 103.8198,
    score: 86,
    tags: ['location', 'apac', 'finance'],
    meta: {
      country: 'Singapore',
      class: 'boundary',
      importance: '0.91',
    },
  },
];

const seedLinks = [
  ['gh-torvalds-linux', 'gh-kubernetes'],
  ['gh-kubernetes', 'nm-singapore'],
  ['oa-transformers', 'gh-kubernetes'],
  ['oa-transformers', 'nm-geneva'],
  ['oa-crispr', 'nm-geneva'],
  ['oa-crispr', 'nm-singapore'],
  ['gh-torvalds-linux', 'oa-transformers'],
];

document.addEventListener('DOMContentLoaded', () => {
  bootstrap();
});

function bootstrap() {
  injectShell();
  initScene();
  bindUI();
  populateSeedData();
  renderSearchResults();
  renderTimeline();
  renderInspector();
  animate();
}

function injectShell() {
  document.body.innerHTML = `
    <div class="canvas-shell erebor-shell" data-canvas-shell>
      <div class="canvas-stage erebor-stage" data-canvas-stage>
        <canvas class="erebor-canvas" data-globe-canvas aria-label="Investigation globe"></canvas>

        <div class="erebor-grid"></div>
        <div class="erebor-vignette"></div>

        <header class="erebor-topbar">
          <div class="erebor-brand">
            <div class="erebor-brand__mark" aria-hidden="true"></div>
            <div class="erebor-brand__copy">
              <span class="erebor-brand__eyebrow">Erebor</span>
              <strong class="erebor-brand__title">Open-source intelligence workspace</strong>
            </div>
          </div>

          <div class="erebor-status">
            <span class="erebor-status__dot"></span>
            <span>Live OSS federation</span>
          </div>
        </header>

        <section class="erebor-omnibar" aria-label="Unified search">
          <div class="erebor-omnibar__inner">
            <div class="erebor-omnibar__icon" aria-hidden="true">⌕</div>
            <input
              class="erebor-omnibar__input"
              data-search-input
              type="search"
              placeholder="Search GitHub, OpenAlex, Nominatim…"
              autocomplete="off"
              spellcheck="false"
              aria-label="Search across GitHub, OpenAlex, and Nominatim"
            />
            <button class="erebor-omnibar__action" data-search-button type="button">Investigate</button>
          </div>
          <div class="erebor-omnibar__meta">
            <span>Sources: GitHub REST · OpenAlex · Nominatim</span>
            <span data-search-status>Ready</span>
          </div>
        </section>

        <div class="erebor-mobile-tabs" data-mobile-tabs>
          <button class="erebor-mobile-tabs__button is-active" data-panel-toggle="search" type="button">Search</button>
          <button class="erebor-mobile-tabs__button" data-panel-toggle="inspector" type="button">Inspector</button>
          <button class="erebor-mobile-tabs__button" data-panel-toggle="timeline" type="button">Timeline</button>
        </div>

        <aside class="erebor-panel erebor-panel--left is-open" data-panel="search" aria-label="Search results"></aside>
        <aside class="erebor-panel erebor-panel--right is-open" data-panel="inspector" aria-label="Entity inspector"></aside>
        <section class="erebor-panel erebor-panel--bottom" data-panel="timeline" aria-label="Investigation timeline"></section>

        <div class="erebor-hud">
          <div class="erebor-hud__card">
            <span class="erebor-hud__label">Entities</span>
            <strong class="erebor-hud__value" data-hud-entities>0</strong>
          </div>
          <div class="erebor-hud__card">
            <span class="erebor-hud__label">Links</span>
            <strong class="erebor-hud__value" data-hud-links>0</strong>
          </div>
          <div class="erebor-hud__card">
            <span class="erebor-hud__label">Focus</span>
            <strong class="erebor-hud__value" data-hud-focus>Global</strong>
          </div>
        </div>
      </div>
    </div>
  `;

  injectStyles();
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --erebor-bg-0: rgba(8, 11, 15, 0.84);
      --erebor-bg-1: rgba(14, 18, 24, 0.92);
      --erebor-bg-2: rgba(20, 26, 34, 0.94);
      --erebor-border: rgba(170, 182, 200, 0.14);
      --erebor-border-strong: rgba(143, 214, 230, 0.24);
      --erebor-text: #eef3f8;
      --erebor-text-muted: #aab6c8;
      --erebor-text-dim: #7f8b99;
      --erebor-accent: #8fd6e6;
      --erebor-accent-strong: #b8edf6;
      --erebor-success: #7fd0a6;
      --erebor-warn: #e8be87;
      --erebor-shadow: 0 24px 64px rgba(0, 0, 0, 0.38);
      --erebor-radius: 18px;
      --erebor-radius-sm: 14px;
      --erebor-panel-blur: blur(18px);
      --erebor-topbar-h: 72px;
      --erebor-omnibar-h: 92px;
      --erebor-bottom-h: 208px;
      --erebor-left-w: min(24rem, calc(100vw - 2rem));
      --erebor-right-w: min(24rem, calc(100vw - 2rem));
    }

    body {
      overflow: hidden;
    }

    .erebor-shell,
    .erebor-stage {
      min-height: 100vh;
      min-height: 100dvh;
    }

    .erebor-canvas,
    [data-globe-canvas] {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .erebor-grid,
    .erebor-vignette {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .erebor-grid {
      background-image:
        linear-gradient(rgba(143, 214, 230, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(143, 214, 230, 0.04) 1px, transparent 1px);
      background-size: 48px 48px;
      mask-image: radial-gradient(circle at 50% 50%, black 35%, transparent 88%);
      opacity: 0.55;
    }

    .erebor-vignette {
      background:
        radial-gradient(circle at 50% 50%, transparent 34%, rgba(4, 6, 9, 0.18) 68%, rgba(4, 6, 9, 0.72) 100%),
        linear-gradient(180deg, rgba(4, 6, 9, 0.08), rgba(4, 6, 9, 0.42));
    }

    .erebor-topbar,
    .erebor-omnibar,
    .erebor-panel,
    .erebor-hud,
    .erebor-mobile-tabs {
      position: absolute;
      z-index: 20;
    }

    .erebor-topbar {
      top: max(1rem, env(safe-area-inset-top));
      left: max(1rem, env(safe-area-inset-left));
      right: max(1rem, env(safe-area-inset-right));
      height: var(--erebor-topbar-h);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      pointer-events: none;
    }

    .erebor-brand,
    .erebor-status {
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      gap: 0.875rem;
      padding: 0.875rem 1rem;
      border: 1px solid var(--erebor-border);
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(18, 24, 31, 0.78), rgba(10, 14, 19, 0.88));
      backdrop-filter: var(--erebor-panel-blur);
      box-shadow: var(--erebor-shadow);
    }

    .erebor-brand__mark {
      width: 0.875rem;
      height: 0.875rem;
      border-radius: 999px;
      background:
        radial-gradient(circle at 35% 35%, #d9fbff 0%, #8fd6e6 38%, rgba(27, 150, 181, 0.18) 72%, transparent 100%);
      box-shadow:
        0 0 0 6px rgba(143, 214, 230, 0.08),
        0 0 24px rgba(143, 214, 230, 0.34);
    }

    .erebor-brand__copy {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .erebor-brand__eyebrow,
    .erebor-status {
      color: var(--erebor-text-muted);
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .erebor-brand__title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--erebor-text);
    }

    .erebor-status {
      gap: 0.625rem;
      font-size: 0.75rem;
      white-space: nowrap;
    }

    .erebor-status__dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 999px;
      background: var(--erebor-success);
      box-shadow: 0 0 16px rgba(127, 208, 166, 0.6);
    }

    .erebor-omnibar {
      top: calc(max(1rem, env(safe-area-inset-top)) + var(--erebor-topbar-h) + 0.75rem);
      left: 50%;
      transform: translateX(-50%);
      width: min(52rem, calc(100vw - 2rem));
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }

    .erebor-omnibar__inner {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 0.75rem;
      padding: 0.875rem 0.875rem 0.875rem 1rem;
      border-radius: var(--erebor-radius);
      border: 1px solid var(--erebor-border-strong);
      background: linear-gradient(180deg, rgba(18, 24, 31, 0.88), rgba(10, 14, 19, 0.94));
      backdrop-filter: var(--erebor-panel-blur);
      box-shadow: var(--erebor-shadow);
    }

    .erebor-omnibar__icon {
      color: var(--erebor-accent);
      font-size: 1.125rem;
      opacity: 0.9;
    }

    .erebor-omnibar__input {
      min-width: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--erebor-text);
      font-size: 1rem;
    }

    .erebor-omnibar__input::placeholder {
      color: var(--erebor-text-dim);
    }

    .erebor-omnibar__action {
      padding: 0.8rem 1rem;
      border-radius: 0.875rem;
      border: 1px solid rgba(143, 214, 230, 0.18);
      background: linear-gradient(180deg, rgba(143, 214, 230, 0.16), rgba(143, 214, 230, 0.08));
      color: var(--erebor-accent-strong);
      font-weight: 600;
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
    }

    .erebor-omnibar__action:hover {
      transform: translateY(-1px);
      border-color: rgba(143, 214, 230, 0.32);
      background: linear-gradient(180deg, rgba(143, 214, 230, 0.22), rgba(143, 214, 230, 0.1));
    }

    .erebor-omnibar__meta {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0 0.25rem;
      color: var(--erebor-text-dim);
      font-size: 0.75rem;
      letter-spacing: 0.02em;
    }

    .erebor-panel {
      overflow: hidden;
      border: 1px solid var(--erebor-border);
      background: linear-gradient(180deg, rgba(18, 24, 31, 0.84), rgba(10, 14, 19, 0.92));
      backdrop-filter: var(--erebor-panel-blur);
      box-shadow: var(--erebor-shadow);
    }