import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const state = {
  mobileBreakpoint: 768,
  shell: null,
  stage: null,
  leftPanel: null,
  rightPanel: null,
  timelinePanel: null,
  omnibarInput: null,
  omnibarResults: null,
  inspectorBody: null,
  timelineBody: null,
  statusEl: null,
  mobileToggles: null,
  scene3d: null,
  searchAbortController: null,
  searchSeq: 0,
  selectedEntity: null,
  timeline: [],
  entities: [],
  links: [],
};

const seedEntities = [
  {
    id: "gh-openai",
    type: "repository",
    source: "GitHub",
    label: "openai/openai-python",
    title: "openai/openai-python",
    subtitle: "Official Python library for the OpenAI API",
    lat: 37.7749,
    lon: -122.4194,
    score: 98,
    meta: {
      stars: "24.8k",
      language: "Python",
      updated: "2026-06-18",
      url: "https://github.com/openai/openai-python",
    },
  },
  {
    id: "gh-fastapi",
    type: "repository",
    source: "GitHub",
    label: "fastapi/fastapi",
    title: "fastapi/fastapi",
    subtitle: "FastAPI framework, high performance APIs",
    lat: -12.0464,
    lon: -77.0428,
    score: 95,
    meta: {
      stars: "84.1k",
      language: "Python",
      updated: "2026-06-22",
      url: "https://github.com/fastapi/fastapi",
    },
  },
  {
    id: "oa-llm-survey",
    type: "paper",
    source: "OpenAlex",
    label: "Survey of Large Language Models",
    title: "A Survey of Large Language Models",
    subtitle: "Research synthesis across model families and evaluation",
    lat: 42.3601,
    lon: -71.0589,
    score: 91,
    meta: {
      year: "2024",
      citations: "1,284",
      venue: "OpenAlex",
      url: "https://openalex.org/",
    },
  },
  {
    id: "oa-graph-intel",
    type: "paper",
    source: "OpenAlex",
    label: "Graph Intelligence Systems",
    title: "Graph Intelligence Systems for Open-Source Investigations",
    subtitle: "Entity resolution, provenance, and analyst workflows",
    lat: 51.5072,
    lon: -0.1276,
    score: 88,
    meta: {
      year: "2025",
      citations: "214",
      venue: "OpenAlex",
      url: "https://openalex.org/",
    },
  },
  {
    id: "nm-berlin",
    type: "place",
    source: "Nominatim",
    label: "Berlin, Germany",
    title: "Berlin, Germany",
    subtitle: "Administrative boundary / geocoded place",
    lat: 52.52,
    lon: 13.405,
    score: 82,
    meta: {
      class: "boundary",
      type: "administrative",
      importance: "0.84",
      url: "https://www.openstreetmap.org/",
    },
  },
  {
    id: "nm-singapore",
    type: "place",
    source: "Nominatim",
    label: "Singapore",
    title: "Singapore",
    subtitle: "City-state / geocoded place",
    lat: 1.3521,
    lon: 103.8198,
    score: 86,
    meta: {
      class: "boundary",
      type: "administrative",
      importance: "0.91",
      url: "https://www.openstreetmap.org/",
    },
  },
];

const seedLinks = [
  { source: "gh-openai", target: "oa-llm-survey", weight: 0.92, kind: "citation" },
  { source: "gh-fastapi", target: "gh-openai", weight: 0.74, kind: "dependency" },
  { source: "oa-graph-intel", target: "nm-berlin", weight: 0.58, kind: "affiliation" },
  { source: "oa-llm-survey", target: "nm-singapore", weight: 0.49, kind: "conference" },
  { source: "gh-fastapi", target: "nm-berlin", weight: 0.36, kind: "maintainer" },
];

const seedTimeline = [
  {
    id: "evt-1",
    ts: "2026-06-22T08:14:00Z",
    title: "Repository activity spike",
    detail: "fastapi/fastapi observed elevated issue and release velocity.",
    tag: "GitHub",
  },
  {
    id: "evt-2",
    ts: "2026-06-23T13:42:00Z",
    title: "Research citation cluster formed",
    detail: "OpenAlex records show accelerated cross-citation around LLM survey literature.",
    tag: "OpenAlex",
  },
  {
    id: "evt-3",
    ts: "2026-06-24T17:05:00Z",
    title: "Geospatial pivot executed",
    detail: "Analyst geocoded Berlin and Singapore to anchor investigation context.",
    tag: "Nominatim",
  },
];

function init() {
  state.entities = [...seedEntities];
  state.links = [...seedLinks];
  state.timeline = [...seedTimeline];

  ensureShell();
  buildLayout();
  initScene();
  bindEvents();
  renderSearchResults(state.entities.slice(0, 6), "Seeded open-source graph");
  renderTimeline();
  selectEntity(state.entities[0], { addTimeline: false });
  updateResponsiveState();
}

function ensureShell() {
  let shell = document.querySelector(".canvas-shell");
  if (!shell) {
    shell = document.createElement("div");
    shell.className = "canvas-shell";
    document.body.appendChild(shell);
  }
  state.shell = shell;
}

function buildLayout() {
  injectStyles();

  state.shell.innerHTML = "";

  const stage = document.createElement("div");
  stage.className = "canvas-stage";
  stage.setAttribute("aria-hidden", "true");

  const noise = document.createElement("div");
  noise.className = "canvas-noise";

  const app = document.createElement("div");
  app.className = "erebor-app-shell";

  const topbar = document.createElement("header");
  topbar.className = "erebor-topbar";
  topbar.innerHTML = `
    <div class="brand-lockup">
      <div class="brand-mark" aria-hidden="true">
        <span></span>
      </div>
      <div class="brand-copy">
        <div class="brand-kicker">EREBOR / OSS INTELLIGENCE</div>
        <h1>Unified investigation workspace</h1>
      </div>
    </div>
    <div class="topbar-actions">
      <button class="mobile-toggle" data-target="left" aria-expanded="false" aria-controls="panel-left">Search</button>
      <button class="mobile-toggle" data-target="right" aria-expanded="false" aria-controls="panel-right">Inspector</button>
      <button class="mobile-toggle" data-target="timeline" aria-expanded="false" aria-controls="panel-timeline">Timeline</button>
    </div>
  `;

  const omnibar = document.createElement("section");
  omnibar.className = "omnibar-panel panel-glass";
  omnibar.innerHTML = `
    <div class="omnibar-head">
      <div>
        <div class="eyebrow">Omnibar</div>
        <h2>Search GitHub, OpenAlex, Nominatim</h2>
      </div>
      <div class="status-pill" data-role="status">Ready</div>
    </div>
    <form class="omnibar-form" autocomplete="off">
      <label class="sr-only" for="omnibar-input">Search open-source intelligence sources</label>
      <div class="omnibar-input-wrap">
        <svg viewBox="0 0 24 24" class="omnibar-icon" aria-hidden="true">
          <path d="M10.5 4a6.5 6.5 0 1 0 4.03 11.6l4.43 4.43 1.41-1.41-4.43-4.43A6.5 6.5 0 0 0 10.5 4Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z" fill="currentColor"></path>
        </svg>
        <input id="omnibar-input" name="q" type="search" placeholder="Search repositories, papers, places…" spellcheck="false" />
      </div>
      <button type="submit" class="primary-action">Query</button>
    </form>
    <div class="omnibar-hints">
      <button class="chip" data-query="openai">openai</button>
      <button class="chip" data-query="berlin ai safety">berlin ai safety</button>
      <button class="chip" data-query="graph intelligence">graph intelligence</button>
      <button class="chip" data-query="fastapi">fastapi</button>
    </div>
  `;

  const grid = document.createElement("div");
  grid.className = "workspace-grid";
  grid.innerHTML = `
    <aside class="workspace-panel panel-glass panel-left" id="panel-left">
      <div class="panel-head">
        <div>
          <div class="eyebrow">Results</div>
          <h3>Entity graph</h3>
        </div>
        <div class="panel-meta">Live</div>
      </div>
      <div class="panel-body results-body" data-role="results"></div>
    </aside>

    <section class="workspace-center">
      <div class="hero-card panel-glass">
        <div class="hero-copy">
          <div class="eyebrow">Operational picture</div>
          <h2>Open-source entities rendered as a live globe</h2>
          <p>Quadratic arc links, emissive nodes, and touch-friendly controls tuned for analyst workflows.</p>
        </div>
        <div class="hero-stats">
          <div class="stat">
            <span class="stat-label">Entities</span>
            <strong class="stat-value" data-role="entity-count">0</strong>
          </div>
          <div class="stat">
            <span class="stat-label">Links</span>
            <strong class="stat-value" data-role="link-count">0</strong>
          </div>
          <div class="stat">
            <span class="stat-label">Sources</span>
            <strong class="stat-value">3</strong>
          </div>
        </div>
      </div>
    </section>

    <aside class="workspace-panel panel-glass panel-right" id="panel-right">
      <div class="panel-head">
        <div>
          <div class="eyebrow">Inspector</div>
          <h3>Selected entity</h3>
        </div>
        <div class="panel-meta">Focus</div>
      </div>
      <div class="panel-body inspector-body" data-role="inspector"></div>
    </aside>
  `;

  const timeline = document.createElement("section");
  timeline.className = "timeline-panel panel-glass";
  timeline.id = "panel-timeline";
  timeline.innerHTML = `
    <div class="panel-head">
      <div>
        <div class="eyebrow">Timeline</div>
        <h3>Investigation activity</h3>
      </div>
      <div class="panel-meta">Chronology</div>
    </div>
    <div class="panel-body timeline-body" data-role="timeline"></div>
  `;

  app.append(topbar, omnibar, grid, timeline);
  state.shell.append(stage, noise, app);

  state.stage = stage;
  state.leftPanel = app.querySelector(".panel-left");
  state.rightPanel = app.querySelector(".panel-right");
  state.timelinePanel = timeline;
  state.omnibarInput = app.querySelector("#omnibar-input");
  state.omnibarResults = app.querySelector('[data-role="results"]');
  state.inspectorBody = app.querySelector('[data-role="inspector"]');
  state.timelineBody = app.querySelector('[data-role="timeline"]');
  state.statusEl = app.querySelector('[data-role="status"]');
  state.mobileToggles = [...app.querySelectorAll(".mobile-toggle")];

  updateCounts();
}

function injectStyles() {
  if (document.getElementById("erebor-app-inline-styles")) return;

  const style = document.createElement("style");
  style.id = "erebor-app-inline-styles";
  style.textContent = `
    :root {
      --color-bg: #07090d;
      --color-panel: rgba(10, 14, 20, 0.72);
      --color-panel-strong: rgba(12, 17, 24, 0.88);
      --color-border: rgba(151, 176, 204, 0.16);
      --color-border-strong: rgba(151, 176, 204, 0.28);
      --color-text: #d8e2ef;
      --color-text-strong: #f5f9ff;
      --color-text-muted: #8ea0b5;
      --color-accent: #5ea8ff;
      --color-accent-strong: #8bc0ff;
      --color-success: #6ee7b7;
      --shadow-panel: 0 24px 80px rgba(0, 0, 0, 0.34);
      --radius-xl: 24px;
      --radius-lg: 18px;
      --radius-md: 14px;
      --radius-sm: 10px;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .erebor-app-shell {
      position: relative;
      z-index: 3;
      min-height: 100vh;
      min-height: 100dvh;
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: 16px;
      padding: 18px;
    }

    .panel-glass {
      background:
        linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015)),
        var(--color-panel);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-panel);
      backdrop-filter: blur(18px) saturate(120%);
      -webkit-backdrop-filter: blur(18px) saturate(120%);
    }

    .erebor-topbar,
    .omnibar-panel,
    .workspace-panel,
    .hero-card,
    .timeline-panel {
      border-radius: var(--radius-xl);
    }

    .erebor-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px;
      background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
      border: 1px solid rgba(151, 176, 204, 0.14);
      box-shadow: 0 18px 60px rgba(0,0,0,0.24);
    }

    .brand-lockup {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }

    .brand-mark {
      width: 42px;
      height: 42px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 50% 50%, rgba(94,168,255,0.28), rgba(94,168,255,0.06) 58%, transparent 70%),
        rgba(255,255,255,0.02);
      border: 1px solid rgba(94,168,255,0.24);
      box-shadow: inset 0 0 24px rgba(94,168,255,0.12);
    }

    .brand-mark span {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      background: #d9ecff;
      box-shadow:
        0 0 0 5px rgba(94,168,255,0.18),
        0 0 24px rgba(94,168,255,0.55);
    }

    .brand-copy {
      min-width: 0;
    }

    .brand-copy h1 {
      font-size: clamp(1.05rem, 1.8vw, 1.4rem);
      margin-top: 2px;
    }

    .brand-kicker,
    .eyebrow,
    .panel-meta,
    .status-pill,
    .stat-label {
      font-family: "IBM Plex Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .brand-kicker,
    .eyebrow,
    .panel-meta,
    .stat-label {
      color: var(--color-text-muted);
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .mobile-toggle {
      display: none;
      min-height: 40px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid rgba(151, 176, 204, 0.18);
      background: rgba(255,255,255,0.03);
      color: var(--color-text);
    }

    .mobile-toggle.is-active {
      border-color: rgba(94,168,255,0.42);
      color: