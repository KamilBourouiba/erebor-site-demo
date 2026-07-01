const DEFAULT_EVENTS = [
  {
    id: "seed-1",
    ts: "2026-06-30T08:12:00Z",
    type: "search",
    title: "Omnibar query executed",
    summary: 'Cross-source search for "rare earth logistics" returned GitHub, OpenAlex, and geocoding matches.',
    source: "omnibar",
    entityId: "query:rare-earth-logistics",
    tags: ["query", "multi-source"],
    importance: 0.48,
    meta: {
      query: "rare earth logistics",
      providers: ["GitHub", "OpenAlex", "Nominatim"]
    }
  },
  {
    id: "seed-2",
    ts: "2026-06-30T08:14:00Z",
    type: "entity:selected",
    title: "Repository inspected",
    summary: "Selected GitHub repository tied to maritime telemetry ingestion and route analytics.",
    source: "github",
    entityId: "github:repo:telemetry-route-lab",
    tags: ["repository", "github"],
    importance: 0.62,
    meta: {
      owner: "telemetry-lab",
      repo: "route-analytics"
    }
  },
  {
    id: "seed-3",
    ts: "2026-06-30T08:19:00Z",
    type: "entity:linked",
    title: "Research paper linked",
    summary: "OpenAlex work connected to repository topic cluster via shared terminology and cited methods.",
    source: "openalex",
    entityId: "openalex:work:W2741809807",
    tags: ["paper", "research"],
    importance: 0.71,
    meta: {
      doi: "10.1016/j.trc.2024.104221"
    }
  }
];

const STORAGE_KEY = "erebor:timeline:v1";
const MAX_EVENTS = 250;
const EVENT_NAME = "erebor:timeline:update";

function safeNowIso() {
  return new Date().toISOString();
}

function clampImportance(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
}

function normalizeEvent(input = {}) {
  const ts = input.ts || input.timestamp || safeNowIso();
  const id = input.id || `evt-${Date.parse(ts)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    ts: new Date(ts).toISOString(),
    type: String(input.type || "note"),
    title: String(input.title || "Untitled event"),
    summary: String(input.summary || ""),
    source: String(input.source || "system"),
    entityId: input.entityId ? String(input.entityId) : null,
    tags: normalizeTags(input.tags),
    importance: clampImportance(input.importance),
    meta: input.meta && typeof input.meta === "object" ? { ...input.meta } : {}
  };
}

function sortEvents(events) {
  return [...events].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

function readStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(normalizeEvent);
  } catch {
    return null;
  }
}

function writeStorage(events) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    return false;
  }
  return true;
}

function formatAbsoluteTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatRelativeTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);

  const units = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
    ["second", 1000]
  ];

  for (const [unit, size] of units) {
    if (abs >= size || unit === "second") {
      const value = Math.round(diffMs / size);
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(value, unit);
    }
  }

  return "now";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function eventTone(type) {
  if (type.startsWith("entity:selected")) return "focus";
  if (type.startsWith("entity:linked")) return "link";
  if (type.startsWith("search")) return "search";
  if (type.startsWith("note")) return "note";
  return "system";
}

function eventIcon(type) {
  if (type.startsWith("search")) return "⌕";
  if (type.startsWith("entity:selected")) return "◎";
  if (type.startsWith("entity:linked")) return "⇄";
  if (type.startsWith("entity")) return "◈";
  return "•";
}

class InvestigationTimeline {
  constructor(options = {}) {
    this.events = sortEvents(
      (options.seed === false ? [] : readStorage() || options.seed || DEFAULT_EVENTS).map(normalizeEvent)
    ).slice(0, MAX_EVENTS);

    this.subscribers = new Set();
    this.root = null;
    this.listEl = null;
    this.emptyEl = null;
    this.countEl = null;
    this.filter = {
      entityId: null,
      source: null,
      type: null
    };

    this.boundStorage = this.handleStorage.bind(this);
    this.boundTick = this.refreshTimeLabels.bind(this);

    window.addEventListener("storage", this.boundStorage);
    this.tickHandle = window.setInterval(this.boundTick, 30_000);

    if (!readStorage()) {
      writeStorage(this.events);
    }
  }

  destroy() {
    window.removeEventListener("storage", this.boundStorage);
    window.clearInterval(this.tickHandle);
    this.subscribers.clear();
    if (this.root) {
      this.root.innerHTML = "";
    }
  }

  handleStorage(event) {
    if (event.key !== STORAGE_KEY) return;
    const next = readStorage();
    if (!next) return;
    this.events = sortEvents(next).slice(0, MAX_EVENTS);
    this.render();
    this.emit();
  }

  emit() {
    const payload = this.getState();
    this.subscribers.forEach((callback) => {
      try {
        callback(payload);
      } catch {}
    });
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
  }

  subscribe(callback) {
    if (typeof callback !== "function") return () => {};
    this.subscribers.add(callback);
    callback(this.getState());
    return () => {
      this.subscribers.delete(callback);
    };
  }

  getState() {
    return {
      events: [...this.events],
      visibleEvents: this.getVisibleEvents(),
      filter: { ...this.filter }
    };
  }

  getVisibleEvents() {
    return this.events.filter((event) => {
      if (this.filter.entityId && event.entityId !== this.filter.entityId) return false;
      if (this.filter.source && event.source !== this.filter.source) return false;
      if (this.filter.type && event.type !== this.filter.type) return false;
      return true;
    });
  }

  setFilter(next = {}) {
    this.filter = {
      entityId: next.entityId || null,
      source: next.source || null,
      type: next.type || null
    };
    this.render();
    this.emit();
  }

  clearFilter() {
    this.setFilter({});
  }

  add(eventInput) {
    const event = normalizeEvent(eventInput);
    this.events = sortEvents([event, ...this.events]).slice(0, MAX_EVENTS);
    writeStorage(this.events);
    this.render();
    this.emit();
    return event;
  }

  addSearch(query, results = {}) {
    const providers = Object.keys(results).filter((key) => Array.isArray(results[key]) && results[key].length > 0);
    return this.add({
      type: "search",
      title: "Omnibar query executed",
      summary: `Search for "${query}" returned ${providers.length || 0} active source${providers.length === 1 ? "" : "s"}.`,
      source: "omnibar",
      entityId: `query:${query}`,
      tags: ["query", ...providers.map((provider) => provider.toLowerCase())],
      importance: Math.min(0.9, 0.35 + providers.length * 0.12),
      meta: {
        query,
        providers
      }
    });
  }

  addEntitySelection(entity = {}) {
    const label = entity.title || entity.name || entity.label || entity.id || "Unknown entity";
    return this.add({
      type: "entity:selected",
      title: "Entity inspected",
      summary: `${label} opened in inspector.`,
      source: entity.source || "inspector",
      entityId: entity.id || null,
      tags: [entity.kind || "entity", entity.source || "inspector"],
      importance: entity.importance ?? 0.6,
      meta: { ...entity }
    });
  }

  addLink(fromEntity, toEntity, context = {}) {
    const fromLabel = fromEntity?.title || fromEntity?.name || fromEntity?.id || "Source entity";
    const toLabel = toEntity?.title || toEntity?.name || toEntity?.id || "Target entity";
    return this.add({
      type: "entity:linked",
      title: "Entities connected",
      summary: `${fromLabel} linked to ${toLabel}.`,
      source: context.source || "graph",
      entityId: toEntity?.id || fromEntity?.id || null,
      tags: ["link", fromEntity?.source, toEntity?.source].filter(Boolean),
      importance: context.importance ?? 0.72,
      meta: {
        from: fromEntity || null,
        to: toEntity || null,
        ...context
      }
    });
  }

  reset(seed = DEFAULT_EVENTS) {
    this.events = sortEvents(seed.map(normalizeEvent)).slice(0, MAX_EVENTS);
    writeStorage(this.events);
    this.render();
    this.emit();
  }

  mount(root) {
    if (!(root instanceof HTMLElement)) {
      throw new Error("Timeline mount target must be an HTMLElement.");
    }

    this.root = root;
    this.root.classList.add("timeline");
    this.root.innerHTML = `
      <div class="timeline__header">
        <div>
          <p class="timeline__eyebrow">Investigation trail</p>
          <h3 class="timeline__title">Activity timeline</h3>
        </div>
        <div class="timeline__meta">
          <span class="timeline__count" data-timeline-count>0 events</span>
          <button class="timeline__clear-filter" type="button" data-timeline-clear hidden>Clear filter</button>
        </div>
      </div>
      <div class="timeline__body">
        <div class="timeline__empty" data-timeline-empty hidden>No events recorded yet.</div>
        <ol class="timeline__list" role="list" data-timeline-list></ol>
      </div>
    `;

    this.listEl = this.root.querySelector("[data-timeline-list]");
    this.emptyEl = this.root.querySelector("[data-timeline-empty]");
    this.countEl = this.root.querySelector("[data-timeline-count]");
    this.clearFilterEl = this.root.querySelector("[data-timeline-clear]");

    this.clearFilterEl?.addEventListener("click", () => this.clearFilter());

    this.root.addEventListener("click", (event) => {
      const target = event.target.closest("[data-filter-entity],[data-filter-source],[data-filter-type]");
      if (!target) return;

      if (target.hasAttribute("data-filter-entity")) {
        this.setFilter({ ...this.filter, entityId: target.getAttribute("data-filter-entity") });
      } else if (target.hasAttribute("data-filter-source")) {
        this.setFilter({ ...this.filter, source: target.getAttribute("data-filter-source") });
      } else if (target.hasAttribute("data-filter-type")) {
        this.setFilter({ ...this.filter, type: target.getAttribute("data-filter-type") });
      }
    });

    this.render();
    return this;
  }

  refreshTimeLabels() {
    if (!this.root) return;
    this.root.querySelectorAll("[data-time-absolute]").forEach((node) => {
      const value = node.getAttribute("data-time-absolute");
      node.textContent = formatRelativeTime(value);
      node.setAttribute("title", formatAbsoluteTime(value));
    });
  }

  render() {
    if (!this.root || !this.listEl) return;

    const visible = this.getVisibleEvents();
    const hasFilter = Boolean(this.filter.entityId || this.filter.source || this.filter.type);

    this.countEl.textContent = `${visible.length} event${visible.length === 1 ? "" : "s"}`;
    if (this.clearFilterEl) {
      this.clearFilterEl.hidden = !hasFilter;
    }

    this.emptyEl.hidden = visible.length > 0;
    this.listEl.innerHTML = visible.map((event) => this.renderEvent(event)).join("");
    this.refreshTimeLabels();
  }

  renderEvent(event) {
    const tone = eventTone(event.type);
    const icon = eventIcon(event.type);
    const tags = event.tags
      .slice(0, 4)
      .map(
        (tag) =>
          `<button class="timeline__tag" type="button" data-filter-type="${escapeHtml(event.type)}">${escapeHtml(tag)}</button>`
      )
      .join("");

    const sourceButton = `<button class="timeline__source" type="button" data-filter-source="${escapeHtml(event.source)}">${escapeHtml(event.source)}</button>`;
    const entityButton = event.entityId
      ? `<button class="timeline__entity" type="button" data-filter-entity="${escapeHtml(event.entityId)}">Focus entity</button>`
      : "";

    const importanceWidth = `${Math.round(event.importance * 100)}%`;

    return `
      <li class="timeline__item timeline__item--${tone}" data-event-id="${escapeHtml(event.id)}">
        <div class="timeline__rail">
          <span class="timeline__dot" aria-hidden="true">${icon}</span>
          <span class="timeline__line" aria-hidden="true"></span>
        </div>
        <article class="timeline__card">
          <header class="timeline__card-header">
            <div class="timeline__headline">
              <h4 class="timeline__event-title">${escapeHtml(event.title)}</h4>
              <div class="timeline__event-actions">
                ${sourceButton}
                ${entityButton}
              </div>
            </div>
            <div class="timeline__time">
              <time datetime="${escapeHtml(event.ts)}" data-time-absolute="${escapeHtml(event.ts)}" title="${escapeHtml(formatAbsoluteTime(event.ts))}">
                ${escapeHtml(formatRelativeTime(event.ts))}
              </time>
            </div>
          </header>
          <p class="timeline__summary">${escapeHtml(event.summary)}</p>
          <footer class="timeline__footer">
            <div class="timeline__tags">${tags}</div>
            <div class="timeline__importance" aria-label="Event importance">
              <span class="timeline__importance-bar" style="width:${importanceWidth}"></span>
            </div>
          </footer>
        </article>
      </li>
    `;
  }
}

let singleton = null;

export function createTimeline(options = {}) {
  return new InvestigationTimeline(options);
}

export function getTimeline() {
  if (!singleton) {
    singleton = new InvestigationTimeline();
  }
  return singleton;
}

export function mountTimeline(root, options = {}) {
  const timeline = options.singleton === false ? createTimeline(options) : getTimeline();
  if (options.seed && options.singleton !== false && singleton && singleton.events.length === 0) {
    singleton.reset(options.seed);
  }
  return timeline.mount(root);
}

export function addTimelineEvent(event) {
  return getTimeline().add(event);
}

export function addSearchEvent(query, results) {
  return getTimeline().addSearch(query, results);
}

export function addEntitySelectionEvent(entity) {
  return getTimeline().addEntitySelection(entity);
}

export function addEntityLinkEvent(fromEntity, toEntity, context) {
  return getTimeline().addLink(fromEntity, toEntity, context);
}

export function subscribeTimeline(callback) {
  return getTimeline().subscribe(callback);
}

export function filterTimeline(filter) {
  return getTimeline().setFilter(filter);
}

export function clearTimelineFilter() {
  return getTimeline().clearFilter();
}

export function resetTimeline(seed) {
  return getTimeline().reset(seed);
}

export { EVENT_NAME as TIMELINE_EVENT_NAME, DEFAULT_EVENTS };