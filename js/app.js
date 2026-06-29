import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const API_BASE = (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8000';
  return '';
})();

const SEARCH_SOURCES = [
  { key: 'github', label: 'GitHub', endpoint: '/api/search/github' },
  { key: 'openalex', label: 'OpenAlex', endpoint: '/api/search/openalex' },
  { key: 'nominatim', label: 'Nominatim', endpoint: '/api/search/nominatim' }
];

const GLOBE_RADIUS = 1.8;
const MOBILE_BREAKPOINT = 768;

const state = {
  query: '',
  activeEntity: null,
  searchResults: [],
  timeline: [],
  selectedNodeId: null,
  mobilePanelsOpen: false,
  loading: false
};

const seedNodes = [
  {
    id: 'node-github-linux',
    label: 'linux',
    type: 'repository',
    source: 'GitHub',
    lat: 37.7749,
    lon: -122.4194,
    intensity: 1,
    detail: 'Kernel repository activity, contributor graph, release cadence.',
    meta: { stars: '182k', language: 'C', region: 'San Francisco' }
  },
  {
    id: 'node-github-fastapi',
    label: 'fastapi',
    type: 'repository',
    source: 'GitHub',
    lat: -12.0464,
    lon: -77.0428,
    intensity: 0.82,
    detail: 'API framework dependency network and issue velocity.',
    meta: { stars: '79k', language: 'Python', region: 'Lima' }
  },
  {
    id: 'node-openalex-transformers',
    label: 'Transformers',
    type: 'paper',
    source: 'OpenAlex',
    lat: 51.5072,
    lon: -0.1276,
    intensity: 0.88,
    detail: 'Citation cluster around sequence modeling and downstream adaptation.',
    meta: { citations: '124k', venue: 'NeurIPS', region: 'London' }
  },
  {
    id: 'node-openalex-graph',
    label: 'Graph Learning',
    type: 'concept',
    source: 'OpenAlex',
    lat: 52.52,
    lon: 13.405,
    intensity: 0.72,
    detail: 'Research concept density across graph representation learning.',
    meta: { works: '18.2k', field: 'Computer Science', region: 'Berlin' }
  },
  {
    id: 'node-nominatim-singapore',
    label: 'Singapore',
    type: 'location',
    source: 'Nominatim',
    lat: 1.3521,
    lon: 103.8198,
    intensity: 0.94,
    detail: 'Geospatial anchor for logistics, maritime, and trade routing.',
    meta: { class: 'boundary', importance: '0.91', region: 'Singapore' }
  },
  {
    id: 'node-nominatim-reykjavik',
    label: 'Reykjavík',
    type: 'location',
    source: 'Nominatim',
    lat: 64.1466,
    lon: -21.9426,
    intensity: 0.66,
    detail: 'North Atlantic waypoint with sparse but strategic signal overlap.',
    meta: { class: 'place', importance: '0.64', region: 'Iceland' }
  },
  {
    id: 'node-github-three',
    label: 'three.js',
    type: 'repository',
    source: 'GitHub',
    lat: 35.6762,
    lon: 139.6503,
    intensity: 0.9,
    detail: 'Visualization stack dependency and ecosystem package spread.',
    meta: { stars: '106k', language: 'JavaScript', region: 'Tokyo' }
  },
  {
    id: 'node-openalex-osint',
    label: 'OSINT Methods',
    type: 'concept',
    source: 'OpenAlex',
    lat: 40.7128,
    lon: -74.006,
    intensity: 0.76,
    detail: 'Methodological cluster spanning retrieval, verification, and fusion.',
    meta: { works: '6.4k', field: 'Information Science', region: 'New York' }
  }
];

const seedLinks = [
  ['node-github-linux', 'node-openalex-transformers'],
  ['node-github-fastapi', 'node-github-three'],
  ['node-openalex-transformers', 'node-openalex-graph'],
  ['node-openalex-osint', 'node-nominatim-singapore'],
  ['node-github-three', 'node-nominatim-reykjavik'],
  ['node-github-linux', 'node-openalex-osint'],
  ['node-github-fastapi', 'node-nominatim-singapore']
];

const app = {
  root: null,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  globeGroup: null,
  nodeGroup: null,
  arcGroup: null,
  atmosphere: null,
  stars: null,
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  clock: new THREE.Clock(),
  nodeMeshes: [],
  arcMeshes: [],
  resizeObserver: null,
  elements: {}
};

function init() {
  injectShell();
  cacheElements();
  bindUI();
  buildScene();
  populateSeedData();
  renderSearchResults([]);
  renderTimeline();
  updateInspector(null);
  updateStatus('System ready');
  animate();
}

function injectShell() {
  document.body.classList.add('erebor-app');

  const style = document.createElement('style');
  style.textContent = `
    :root {
      --obs-accent: #4fc0de;
      --obs-accent-soft: rgba(79, 192, 222, 0.14);
      --obs-warm: #c9871d;
      --obs-warm-soft: rgba(201, 135, 29, 0.14);
      --obs-danger: #d96c6c;
      --shell-max: 1680px;
      --panel-width-left: 23rem;
      --panel-width-right: 22rem;
      --header-h: 4.25rem;
    }

    body.erebor-app {
      background: var(--page-bg, #05070a);
      color: var(--text-primary, #e5ebf3);
      overflow: hidden;
    }

    .app-shell {
      position: relative;
      min-height: 100vh;
      display: grid;
      grid-template-rows: var(--header-h) 1fr;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.02), transparent 12rem),
        var(--page-bg, #05070a);
    }

    .topbar {
      position: relative;
      z-index: 20;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 1rem;
      padding: 0.875rem 1rem;
      border-bottom: 1px solid rgba(111, 130, 157, 0.16);
      background:
        linear-gradient(180deg, rgba(14, 19, 26, 0.92), rgba(8, 11, 16, 0.82));
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.24);
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 0.875rem;
      min-width: 0;
    }

    .brand-mark {
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 0.8rem;
      display: grid;
      place-items: center;
      color: #d8eef5;
      background:
        radial-gradient(circle at 30% 30%, rgba(79, 192, 222, 0.28), transparent 55%),
        linear-gradient(180deg, rgba(24, 33, 45, 0.96), rgba(10, 14, 20, 0.98));
      border: 1px solid rgba(79, 192, 222, 0.24);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.06),
        0 10px 24px rgba(0,0,0,0.28);
      font-family: "IBM Plex Mono", monospace;
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: 0.08em;
    }

    .brand-copy {
      min-width: 0;
    }

    .brand-title {
      margin: 0;
      font-size: 0.98rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-primary, #e5ebf3);
    }

    .brand-subtitle {
      margin: 0.1rem 0 0;
      font-size: 0.75rem;
      color: var(--text-muted, #6f829d);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .omnibar {
      position: relative;
      min-width: 0;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.75rem;
      height: 3rem;
      padding: 0 0.875rem;
      border-radius: 999px;
      border: 1px solid rgba(111, 130, 157, 0.22);
      background:
        linear-gradient(180deg, rgba(20, 28, 38, 0.92), rgba(10, 14, 20, 0.96));
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.03),
        0 12px 28px rgba(0,0,0,0.22);
    }

    .omnibar:focus-within {
      border-color: rgba(79, 192, 222, 0.42);
      box-shadow:
        0 0 0 1px rgba(79, 192, 222, 0.55),
        0 0 0 4px rgba(79, 192, 222, 0.14),
        0 12px 28px rgba(0,0,0,0.22);
    }

    .omnibar-icon,
    .omnibar-kbd {
      color: var(--text-muted, #6f829d);
      font-size: 0.78rem;
      white-space: nowrap;
    }

    .omnibar-input {
      width: 100%;
      min-width: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--text-primary, #e5ebf3);
      font: inherit;
      font-size: 0.95rem;
    }

    .omnibar-input::placeholder {
      color: color-mix(in srgb, var(--text-muted, #6f829d) 82%, transparent);
    }

    .topbar-actions {
      display: inline-flex;
      align-items: center;
      gap: 0.625rem;
    }

    .ghost-btn,
    .icon-btn,
    .source-chip,
    .result-item,
    .timeline-item {
      transition:
        background-color 140ms ease,
        border-color 140ms ease,
        color 140ms ease,
        transform 140ms ease,
        box-shadow 140ms ease;
    }

    .ghost-btn,
    .icon-btn {
      appearance: none;
      border: 1px solid rgba(111, 130, 157, 0.2);
      background:
        linear-gradient(180deg, rgba(20, 28, 38, 0.88), rgba(10, 14, 20, 0.94));
      color: var(--text-secondary, #9aabc2);
      border-radius: 0.875rem;
      height: 2.75rem;
      padding: 0 0.9rem;
      font: inherit;
      cursor: pointer;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }

    .icon-btn {
      width: 2.75rem;
      padding: 0;
      display: grid;
      place-items: center;
      font-size: 1rem;
    }

    .ghost-btn:hover,
    .icon-btn:hover,
    .source-chip:hover,
    .result-item:hover,
    .timeline-item:hover {
      border-color: rgba(79, 192, 222, 0.28);
      color: var(--text-primary, #e5ebf3);
      transform: translateY(-1px);
    }

    .workspace {
      min-height: 0;
      display: grid;
      grid-template-columns: var(--panel-width-left) minmax(0, 1fr) var(--panel-width-right);
      gap: 1rem;
      padding: 1rem;
      max-width: var(--shell-max);
      width: 100%;
      margin: 0 auto;
    }

    .panel {
      min-height: 0;
      display: flex;
      flex-direction: column;
      border-radius: 1.25rem;
      border: 1px solid rgba(111, 130, 157, 0.16);
      background:
        linear-gradient(180deg, rgba(20, 28, 38, 0.82), rgba(10, 14, 20, 0.92));
      box-shadow:
        0 18px 40px rgba(0,0,0,0.34),
        inset 0 1px 0 rgba(255,255,255,0.03);
      overflow: hidden;
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 1rem 1rem 0.875rem;
      border-bottom: 1px solid rgba(111, 130, 157, 0.12);
    }

    .panel-title-wrap {
      min-width: 0;
    }

    .eyebrow {
      display: block;
      margin-bottom: 0.2rem;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted, #6f829d);
    }

    .panel-title {
      margin: 0;
      font-size: 0.98rem;
      font-weight: 600;
      color: var(--text-primary, #e5ebf3);
    }

    .panel-body {
      min-height: 0;
      overflow: auto;
      padding: 1rem;
    }

    .panel-section + .panel-section {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(111, 130, 157, 0.1);
    }

    .section-label {
      margin: 0 0 0.75rem;
      font-size: 0.76rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted, #6f829d);
    }

    .source-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .source-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.5rem 0.7rem;
      border-radius: 999px;
      border: 1px solid rgba(111, 130, 157, 0.18);
      background: rgba(255,255,255,0.02);
      color: var(--text-secondary, #9aabc2);
      font-size: 0.8rem;
    }

    .source-chip-dot {
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 999px;
      background: currentColor;
      opacity: 0.9;
    }

    .source-chip[data-source="github"] { color: #8bc4ff; }
    .source-chip[data-source="openalex"] { color: #7fd6b2; }
    .source-chip[data-source="nominatim"] { color: #f0b35f; }

    .status-card {
      padding: 0.875rem 0.95rem;
      border-radius: 1rem;
      border: 1px solid rgba(79, 192, 222, 0.16);
      background:
        linear-gradient(180deg, rgba(79, 192, 222, 0.08), rgba(79, 192, 222, 0.03));
    }

    .status-line {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      color: var(--text-secondary, #9aabc2);
      font-size: 0.85rem;
    }

    .status-pulse {
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 999px;
      background: var(--obs-accent);
      box-shadow: 0 0 0 0 rgba(79, 192, 222, 0.45);
      animation: pulse 2.2s infinite;
    }

    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(79, 192, 222, 0.45); }
      70% { box-shadow: 0 0 0 10px rgba(79, 192, 222, 0); }
      100% { box-shadow: 0 0 0 0 rgba(79, 192, 222, 0); }
    }

    .results-list,
    .timeline-list {