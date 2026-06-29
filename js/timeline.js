const DEFAULT_EVENTS = [
  {
    id: "evt-1",
    ts: "2025-01-14T08:12:00Z",
    type: "search",
    title: "Seeded investigation from omnibar",
    summary: "Queried GitHub, OpenAlex, and Nominatim for Erebor-related entities and geospatial references.",
    source: "omnibar",
    entityIds: ["ent-erebor", "ent-openalex"],
    tags: ["seed", "multi-source"],
    importance: 0.62,
    status: "complete",
    location: { lat: 51.5072, lon: -0.1276, label: "London, UK" },
    meta: {
      query: "erebor intelligence graph",
      providers: ["github", "openalex", "nominatim"],
      resultCount: 37
    }
  },
  {
    id: "evt-2",
    ts: "2025-01-14T08:19:00Z",
    type: "entity",
    title: "Repository cluster identified",
    summary: "Correlated GitHub repositories, maintainers, and organization metadata into a candidate cluster.",
    source: "github",
    entityIds: ["ent-erebor", "ent-github-org"],
    tags: ["github", "repo-cluster"],
    importance: 0.74,
    status: "complete",
    location: null,
    meta: {
      repositories: 6,
      maintainers: 4,
      confidence: 0.81
    }
  },
  {
    id: "evt-3",
    ts: "2025-01-14T08:31:00Z",
    type: "publication",
    title: "Academic references linked",
    summary: "Matched OpenAlex works and authors discussing adjacent intelligence workflows and graph analysis.",
    source: "openalex",
    entityIds: ["ent-openalex", "ent-author-1"],
    tags: ["research", "citation"],
    importance: 0.58,
    status: "complete",
    location: null,
    meta: {
      works: 12,
      authors: 8,
      topConcept: "knowledge graphs"
    }
  },
  {
    id: "evt-4",
    ts: "2025-01-14T08:44:00Z",
    type: "geo",
    title: "Geospatial anchor resolved",
    summary: "Resolved a place reference through Nominatim and attached a map anchor for downstream correlation.",
    source: "nominatim",
    entityIds: ["ent-location-1"],
    tags: ["geo", "anchor"],
    importance: 0.66,
    status: "complete",
    location: { lat: 37.7749, lon: -122.4194, label: "San Francisco, US" },
    meta: {
      precision: "city",
      provider: "nominatim"
    }
  },
  {
    id: "evt-5",
    ts: "2025-01-14T09:02:00Z",
    type: "note",
    title: "Analyst note added",
    summary: "Flagged overlap between repository maintainers and cited authors for manual review.",
    source: "analyst",
    entityIds: ["ent-erebor", "ent-author-1", "ent-github-org"],
    tags: ["note", "review"],
    importance: 0.71,
    status: "active",
    location: null,
    meta: {
      author: "operator",
      disposition: "watch"
    }
  }
];

const TYPE_LABELS = {
  search: "Search",
  entity: "Entity",
  publication: "Publication",
  geo: "Geo",
  note: "Note",
  alert: "Alert",
  link: "Link"
};

const STATUS_WEIGHT = {
  active: 3,
  queued: 2,
  complete: 1,
  archived: 0
};

function uid(prefix = "trail") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toDate(value) {
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeEvent(event, index = 0) {
  const ts = toDate(event.ts || event.timestamp || Date.now()).toISOString();
  return {
    id: event.id || uid("evt"),
    ts,
    type: event.type || "note",
    title: event.title || "Untitled event",
    summary: event.summary || "",
    source: event.source || "system",
    entityIds: Array.isArray(event.entityIds) ? [...event.entityIds] : [],
    tags: Array.isArray(event.tags) ? [...event.tags] : [],
    importance: typeof event.importance === "number" ? Math.max(0, Math.min(1, event.importance)) : 0.5,
    status: event.status || "complete",
    location: event.location || null,
    meta: event.meta && typeof event.meta === "object" ? { ...event.meta } : {},
    index
  };
}

function compareEventsDesc(a, b) {
  const timeDiff = toDate(b.ts).getTime() - toDate(a.ts).getTime();
  if (timeDiff !== 0) return timeDiff;
  const statusDiff = (STATUS_WEIGHT[b.status] || 0) - (STATUS_WEIGHT[a.status] || 0);
  if (statusDiff !== 0) return statusDiff;
  return (b.importance || 0) - (a.importance || 0);
}

function formatTime(ts, locale = undefined) {
  const date = toDate(ts);
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatRelativeTime(ts, now = Date.now(), locale = undefined) {
  const date = toDate(ts).getTime();
  const diffMs = date - now;
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const units = [
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000]
  ];

  for (const [unit, size] of units) {
    if (abs >= size || unit === "minute") {
      return rtf.format(Math.round(diffMs / size), unit);
    }
  }

  return "now";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function eventMatchesQuery(event, query) {
  if (!query) return true;
  const haystack = [
    event.title,
    event.summary,
    event.source,
    event.type,
    ...(event.tags || []),
    ...(event.entityIds || []),
    ...Object.values(event.meta || {}).map((v) => (typeof v === "string" || typeof v === "number" ? String(v) : ""))
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function eventMatchesFilters(event, filters = {}) {
  if (filters.types?.size && !filters.types.has(event.type)) return false;
  if (filters.statuses?.size && !filters.statuses.has(event.status)) return false;
  if (filters.sources?.size && !filters.sources.has(event.source)) return false;
  if (typeof filters.entityId === "string" && filters.entityId && !event.entityIds.includes(filters.entityId)) return false;
  if (typeof filters.minImportance === "number" && event.importance < filters.minImportance) return false;
  if (typeof filters.query === "string" && !eventMatchesQuery(event, filters.query)) return false;
  return true;
}

function summarize(events) {
  const summary = {
    total: events.length,
    active: 0,
    complete: 0,
    queued: 0,
    archived: 0,
    withLocation: 0,
    entities: new Set(),
    sources: new Set(),
    tags: new Set()
  };

  for (const event of events) {
    if (summary[event.status] !== undefined) summary[event.status] += 1;
    if (event.location) summary.withLocation += 1;
    event.entityIds.forEach((id) => summary.entities.add(id));
    summary.sources.add(event.source);
    event.tags.forEach((tag) => summary.tags.add(tag));
  }

  return {
    ...summary,
    entities: summary.entities.size,
    sources: summary.sources.size,
    tags: summary.tags.size
  };
}

function createEmitter() {
  const listeners = new Map();

  return {
    on(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
      return () => listeners.get(type)?.delete(handler);
    },
    emit(type, payload) {
      listeners.get(type)?.forEach((handler) => handler(payload));
      listeners.get("*")?.forEach((handler) => handler({ type, payload }));
    }
  };
}

export class InvestigationTimeline {
  constructor(options = {}) {
    this.emitter = createEmitter();
    this.locale = options.locale;
    this.maxEvents = Number.isFinite(options.maxEvents) ? options.maxEvents : 500;
    this.events = [];
    this.selectedId = null;
    this.filters = {
      query: "",
      types: new Set(),
      statuses: new Set(),
      sources: new Set(),
      entityId: null,
      minImportance: 0
    };

    const seed = Array.isArray(options.events) && options.events.length ? options.events : DEFAULT_EVENTS;
    this.replace(seed, { silent: true });

    if (options.selectedId) {
      this.selectedId = this.getById(options.selectedId)?.id || null;
    } else if (this.events[0]) {
      this.selectedId = this.events[0].id;
    }
  }

  on(type, handler) {
    return this.emitter.on(type, handler);
  }

  emit(type, payload) {
    this.emitter.emit(type, payload);
  }

  replace(events = [], options = {}) {
    this.events = events.map(normalizeEvent).sort(compareEventsDesc).slice(0, this.maxEvents);
    if (!this.selectedId || !this.getById(this.selectedId)) {
      this.selectedId = this.events[0]?.id || null;
    }
    if (!options.silent) this.emit("change", this.getState());
    return this.getState();
  }

  add(event, options = {}) {
    const normalized = normalizeEvent(event, this.events.length);
    this.events = [normalized, ...this.events].sort(compareEventsDesc).slice(0, this.maxEvents);
    if (options.select !== false) this.selectedId = normalized.id;
    this.emit("add", normalized);
    this.emit("change", this.getState());
    return normalized;
  }

  upsert(event, options = {}) {
    const normalized = normalizeEvent(event);
    const index = this.events.findIndex((item) => item.id === normalized.id);

    if (index === -1) {
      return this.add(normalized, options);
    }

    this.events[index] = { ...this.events[index], ...normalized };
    this.events.sort(compareEventsDesc);
    if (options.select) this.selectedId = normalized.id;
    this.emit("update", this.events[index]);
    this.emit("change", this.getState());
    return this.events[index];
  }

  remove(id) {
    const index = this.events.findIndex((event) => event.id === id);
    if (index === -1) return false;
    const [removed] = this.events.splice(index, 1);
    if (this.selectedId === id) this.selectedId = this.events[0]?.id || null;
    this.emit("remove", removed);
    this.emit("change", this.getState());
    return true;
  }

  clear(options = {}) {
    this.events = [];
    this.selectedId = null;
    if (!options.silent) this.emit("change", this.getState());
  }

  getById(id) {
    return this.events.find((event) => event.id === id) || null;
  }

  select(id) {
    const event = this.getById(id);
    if (!event) return null;
    this.selectedId = event.id;
    this.emit("select", event);
    this.emit("change", this.getState());
    return event;
  }

  setQuery(query = "") {
    this.filters.query = String(query);
    this.emit("filter", this.getFilters());
    this.emit("change", this.getState());
  }

  setEntity(entityId = null) {
    this.filters.entityId = entityId || null;
    this.emit("filter", this.getFilters());
    this.emit("change", this.getState());
  }

  setMinImportance(value = 0) {
    this.filters.minImportance = Math.max(0, Math.min(1, Number(value) || 0));
    this.emit("filter", this.getFilters());
    this.emit("change", this.getState());
  }

  toggleFilter(group, value) {
    if (!["types", "statuses", "sources"].includes(group)) return this.getFilters();
    const set = this.filters[group];
    if (set.has(value)) set.delete(value);
    else set.add(value);
    this.emit("filter", this.getFilters());
    this.emit("change", this.getState());
    return this.getFilters();
  }

  resetFilters() {
    this.filters.query = "";
    this.filters.types.clear();
    this.filters.statuses.clear();
    this.filters.sources.clear();
    this.filters.entityId = null;
    this.filters.minImportance = 0;
    this.emit("filter", this.getFilters());
    this.emit("change", this.getState());
  }

  getFilters() {
    return {
      query: this.filters.query,
      types: new Set(this.filters.types),
      statuses: new Set(this.filters.statuses),
      sources: new Set(this.filters.sources),
      entityId: this.filters.entityId,
      minImportance: this.filters.minImportance
    };
  }

  getVisibleEvents() {
    return this.events.filter((event) => eventMatchesFilters(event, this.filters));
  }

  getSelected() {
    return this.getById(this.selectedId);
  }

  getState() {
    const visible = this.getVisibleEvents();
    return {
      events: [...this.events],
      visible,
      selected: this.getSelected(),
      selectedId: this.selectedId,
      filters: this.getFilters(),
      summary: summarize(visible),
      totalSummary: summarize(this.events)
    };
  }

  toJSON() {
    return {
      events: this.events.map((event) => ({ ...event })),
      selectedId: this.selectedId,
      filters: {
        query: this.filters.query,
        types: [...this.filters.types],
        statuses: [...this.filters.statuses],
        sources: [...this.filters.sources],
        entityId: this.filters.entityId,
        minImportance: this.filters.minImportance
      }
    };
  }

  hydrate(snapshot = {}) {
    this.replace(snapshot.events || [], { silent: true });
    this.selectedId = snapshot.selectedId || this.events[0]?.id || null;
    this.filters.query = snapshot.filters?.query || "";
    this.filters.types = new Set(snapshot.filters?.types || []);
    this.filters.statuses = new Set(snapshot.filters?.statuses || []);
    this.filters.sources = new Set(snapshot.filters?.sources || []);
    this.filters.entityId = snapshot.filters?.entityId || null;
    this.filters.minImportance = Number(snapshot.filters?.minImportance) || 0;
    this.emit("change", this.getState());
    return this.getState();
  }
}

export function createTimeline(options = {}) {
  return new InvestigationTimeline(options);
}

export function renderTimelineList(events = [], options = {}) {
  const locale = options.locale;
  const selectedId = options.selectedId || null;
  const now = options.now || Date.now();

  return events
    .map((event) => {
      const selected = event.id === selectedId;
      const typeLabel = TYPE_LABELS[event.type] || event.type;
      const importancePct = Math.round((event.importance || 0) * 100);
      const tags = event.tags?.length
        ? `<div class="timeline-item__tags">${event.tags
            .map((tag) => `<span class="timeline-tag">${escapeHtml(tag)}</span>`)
            .join("")}</div>`
        : "";

      return `
        <article class="timeline-item${selected ? " is-selected" : ""}" data-timeline-item data-event-id="${escapeHtml(event.id)}" tabindex="0" role="button" aria-pressed="${selected ? "true" : "false"}">
          <div class="timeline-item__rail">
            <span class="timeline-item__dot timeline-item__dot--${escapeHtml(event.status)}"></span>
          </div>
          <div class="timeline-item__body">
            <header class="timeline-item__header">
              <div class="timeline-item__eyebrow">
                <span class="timeline-item__type">${escapeHtml(typeLabel)}</span>
                <span class="timeline-item__source">${escapeHtml(event.source)}</span>
              </div>
              <time class="timeline-item__time" datetime="${escapeHtml(event.ts)}" title="${escapeHtml(new Date(event.ts).toLocaleString(locale))}">
                ${escapeHtml(formatTime(event.ts, locale))} · ${escapeHtml(formatRelativeTime(event.ts, now, locale))}
              </time>
            </header>
            <h4 class="timeline-item__title">${escapeHtml(event.title)}</h4>
            ${event.summary ? `<p class="timeline-item__summary">${escapeHtml(event.summary)}</p>` : ""}
            <footer class="timeline-item__footer">
              <span class="timeline-item__importance">Signal ${importancePct}%</span>
              ${event.location?.label ? `<span class="timeline-item__location">${escapeHtml(event.location.label)}</span>` : ""}
            </footer>
            ${tags}
          </div>
        </article>
      `;
    })
    .join("");
}

export function renderTimelineDetail(event, options = {}) {
  if (!event) {
    return `
      <section class="timeline-detail timeline-detail--empty" data-timeline-detail-empty>
        <div class="timeline-detail__empty">
          <h3>No event selected</h3>
          <p>Select an investigation step to inspect source metadata, linked entities, and analyst context.</p>
        </div>
      </section>
    `;
  }

  const locale = options.locale;
  const typeLabel = TYPE_LABELS[event.type] || event.type;
  const metaEntries = Object.entries(event.meta || {});
  const entityMarkup = event.entityIds?.length
    ? event.entityIds.map((id) => `<li class="timeline-detail__