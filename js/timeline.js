const DEFAULT_MAX_EVENTS = 200;
const STORAGE_KEY = "erebor:timeline:v1";

const EVENT_TYPE_META = {
  search: {
    label: "Search",
    tone: "cyan",
    icon: "⌕",
  },
  entity: {
    label: "Entity",
    tone: "amber",
    icon: "◎",
  },
  source: {
    label: "Source",
    tone: "slate",
    icon: "▣",
  },
  note: {
    label: "Note",
    tone: "violet",
    icon: "✎",
  },
  system: {
    label: "System",
    tone: "emerald",
    icon: "•",
  },
};

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = "evt") {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function clampEvents(events, maxEvents = DEFAULT_MAX_EVENTS) {
  if (!Array.isArray(events)) return [];
  if (events.length <= maxEvents) return events.slice();
  return events.slice(events.length - maxEvents);
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((tag) => String(tag || "").trim()).filter(Boolean))];
}

function normalizeRefs(refs) {
  if (!Array.isArray(refs)) return [];
  return refs
    .map((ref) => {
      if (!ref || typeof ref !== "object") return null;
      const id = ref.id ? String(ref.id) : uid("ref");
      const label = ref.label ? String(ref.label) : "Reference";
      const kind = ref.kind ? String(ref.kind) : "entity";
      const href = ref.href ? String(ref.href) : "";
      return { id, label, kind, href };
    })
    .filter(Boolean);
}

function normalizeEvent(input = {}) {
  const type = EVENT_TYPE_META[input.type] ? input.type : "system";
  const timestamp = input.timestamp ? new Date(input.timestamp).toISOString() : nowIso();
  const title = String(input.title || EVENT_TYPE_META[type].label);
  const summary = String(input.summary || "");
  const id = input.id ? String(input.id) : uid(type);
  const actor = input.actor ? String(input.actor) : "";
  const source = input.source ? String(input.source) : "";
  const status = input.status ? String(input.status) : "";
  const importance = Number.isFinite(input.importance) ? Number(input.importance) : 0;
  const tags = normalizeTags(input.tags);
  const refs = normalizeRefs(input.refs);
  const payload = input.payload && typeof input.payload === "object" ? input.payload : {};

  return {
    id,
    type,
    title,
    summary,
    timestamp,
    actor,
    source,
    status,
    importance,
    tags,
    refs,
    payload,
  };
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return tb - ta;
  });
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  const now = Date.now();
  const delta = now - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (delta < minute) return "Just now";
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ensureTimelineStyles() {
  if (document.getElementById("erebor-timeline-styles")) return;

  const style = document.createElement("style");
  style.id = "erebor-timeline-styles";
  style.textContent = `
    .timeline {
      display: grid;
      gap: 0.875rem;
      min-height: 0;
      color: var(--canvas-text, #eef3f8);
    }

    .timeline__toolbar {
      display: grid;
      gap: 0.75rem;
      padding: 0.875rem;
      border: var(--canvas-panel-border, 1px solid rgba(170, 182, 200, 0.14));
      border-radius: 1rem;
      background: linear-gradient(180deg, rgba(24, 31, 40, 0.92), rgba(14, 18, 24, 0.96));
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(18px);
    }

    .timeline__toolbar-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .timeline__title {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      min-width: 0;
    }

    .timeline__title h3 {
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .timeline__count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.75rem;
      height: 1.75rem;
      padding: 0 0.5rem;
      border-radius: 999px;
      background: rgba(143, 214, 230, 0.1);
      border: 1px solid rgba(143, 214, 230, 0.18);
      color: var(--canvas-accent, #8fd6e6);
      font-size: 0.75rem;
      font-weight: 600;
    }

    .timeline__controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .timeline__search {
      width: 100%;
      min-width: 0;
      border-radius: 0.875rem;
      border: 1px solid rgba(170, 182, 200, 0.14);
      background: rgba(8, 12, 18, 0.72);
      color: var(--canvas-text, #eef3f8);
      padding: 0.75rem 0.875rem;
      outline: none;
      transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
    }

    .timeline__search::placeholder {
      color: rgba(184, 195, 207, 0.62);
    }

    .timeline__search:focus {
      border-color: rgba(143, 214, 230, 0.4);
      box-shadow: 0 0 0 3px rgba(143, 214, 230, 0.12);
      background: rgba(10, 15, 22, 0.88);
    }

    .timeline__chips {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .timeline__chip,
    .timeline__button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      min-height: 2rem;
      padding: 0.45rem 0.75rem;
      border-radius: 999px;
      border: 1px solid rgba(170, 182, 200, 0.14);
      background: rgba(255, 255, 255, 0.02);
      color: var(--canvas-subtle, #b8c3cf);
      font-size: 0.75rem;
      font-weight: 500;
      line-height: 1;
      transition:
        border-color 160ms ease,
        background 160ms ease,
        color 160ms ease,
        transform 160ms ease;
    }

    .timeline__chip:hover,
    .timeline__button:hover {
      border-color: rgba(143, 214, 230, 0.22);
      color: var(--canvas-text, #eef3f8);
      transform: translateY(-1px);
    }

    .timeline__chip.is-active {
      background: rgba(143, 214, 230, 0.12);
      border-color: rgba(143, 214, 230, 0.28);
      color: var(--canvas-accent-strong, #b8edf6);
    }

    .timeline__button--danger:hover {
      border-color: rgba(240, 141, 141, 0.28);
      color: #ffd1d1;
    }

    .timeline__list {
      position: relative;
      display: grid;
      gap: 0.75rem;
      min-height: 0;
      overflow: auto;
      padding-right: 0.125rem;
    }

    .timeline__list::-webkit-scrollbar {
      width: 10px;
    }

    .timeline__list::-webkit-scrollbar-thumb {
      background: rgba(170, 182, 200, 0.14);
      border: 2px solid transparent;
      border-radius: 999px;
      background-clip: padding-box;
    }

    .timeline__empty {
      display: grid;
      place-items: center;
      min-height: 12rem;
      padding: 1rem;
      border: 1px dashed rgba(170, 182, 200, 0.16);
      border-radius: 1rem;
      color: var(--canvas-muted, #8f9baa);
      background: rgba(255, 255, 255, 0.015);
      text-align: center;
    }

    .timeline__event {
      position: relative;
      display: grid;
      gap: 0.625rem;
      padding: 0.875rem 0.875rem 0.875rem 1rem;
      border-radius: 1rem;
      border: 1px solid rgba(170, 182, 200, 0.14);
      background:
        linear-gradient(180deg, rgba(24, 31, 40, 0.88), rgba(13, 17, 23, 0.94));
      box-shadow:
        0 16px 36px rgba(0, 0, 0, 0.24),
        inset 0 1px 0 rgba(255, 255, 255, 0.03);
      overflow: hidden;
    }

    .timeline__event::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 3px;
      background: var(--timeline-tone, rgba(143, 214, 230, 0.8));
      opacity: 0.9;
    }

    .timeline__event-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .timeline__event-main {
      display: grid;
      gap: 0.35rem;
      min-width: 0;
    }

    .timeline__event-kicker {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      color: var(--canvas-muted, #8f9baa);
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .timeline__event-title {
      font-size: 0.95rem;
      font-weight: 600;
      line-height: 1.35;
      color: var(--canvas-text, #eef3f8);
      word-break: break-word;
    }

    .timeline__event-summary {
      color: var(--canvas-subtle, #b8c3cf);
      font-size: 0.84rem;
      line-height: 1.5;
      word-break: break-word;
    }

    .timeline__event-time {
      flex: 0 0 auto;
      color: var(--canvas-muted, #8f9baa);
      font-size: 0.72rem;
      white-space: nowrap;
    }

    .timeline__meta,
    .timeline__refs,
    .timeline__tags {
      display: flex;
      gap: 0.45rem;
      flex-wrap: wrap;
    }

    .timeline__pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 1.75rem;
      padding: 0.35rem 0.6rem;
      border-radius: 999px;
      border: 1px solid rgba(170, 182, 200, 0.12);
      background: rgba(255, 255, 255, 0.03);
      color: var(--canvas-subtle, #b8c3cf);
      font-size: 0.72rem;
      line-height: 1;
    }

    .timeline__pill--type {
      color: var(--timeline-tone, #8fd6e6);
      border-color: color-mix(in srgb, var(--timeline-tone, #8fd6e6) 28%, rgba(170, 182, 200, 0.12));
      background: color-mix(in srgb, var(--timeline-tone, #8fd6e6) 10%, rgba(255, 255, 255, 0.02));
    }

    .timeline__ref {
      color: var(--canvas-accent, #8fd6e6);
    }

    .timeline__ref:hover {
      color: var(--canvas-accent-strong, #b8edf6);
    }

    .timeline__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
      color: var(--canvas-muted, #8f9baa);
      font-size: 0.72rem;
    }

    @media (max-width: 767px) {
      .timeline__toolbar {
        padding: 0.75rem;
      }

      .timeline__event {
        padding: 0.8rem 0.8rem 0.8rem 0.95rem;
      }

      .timeline__event-head {
        flex-direction: column;
      }

      .timeline__event-time {
        white-space: normal;
      }
    }
  `;
  document.head.appendChild(style);
}

function toneColor(tone) {
  switch (tone) {
    case "amber":
      return "rgba(232, 190, 135, 0.92)";
    case "emerald":
      return "rgba(127, 208, 166, 0.92)";
    case "violet":
      return "rgba(173, 154, 255, 0.92)";
    case "slate":
      return "rgba(170, 182, 200, 0.82)";
    case "cyan":
    default:
      return "rgba(143, 214, 230, 0.92)";
  }
}

export class InvestigationTimeline extends EventTarget {
  constructor(options = {}) {
    super();

    this.maxEvents = Number.isFinite(options.maxEvents) ? options.maxEvents : DEFAULT_MAX_EVENTS;
    this.storageKey = options.storageKey || STORAGE_KEY;
    this.persist = options.persist !== false;
    this.events = [];
    this.filter = {
      query: "",
      type: "all",
    };
    this.selectedId = null;
    this.root = null;
    this.nodes = null;

    this.load();
  }

  load() {
    if (!this.persist || typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return;

    const parsed = safeJsonParse(raw, []);
    this.events = sortEvents(clampEvents(parsed.map(normalizeEvent), this.maxEvents));
  }

  save() {
    if (!this.persist || typeof localStorage === "undefined") return;
    localStorage.setItem(this.storageKey, JSON.stringify(this.events));
  }

  getAll() {
    return [...this.events];
  }

  getById(id) {
    return this.events.find((event) => event.id === id) || null;
  }

  add(eventInput) {
    const event = normalizeEvent(eventInput);
    this.events = sortEvents(clampEvents([...this.events, event], this.maxEvents));
    this.selectedId = event.id;
    this.save();
    this.emitChange("add", event);
    this.render();
    return event;
  }

  addSearch({ query, provider, resultCount = 0, summary = "" } = {}) {
    return this.add({
      type: "search",
      title: query ? `Queried "${query}"` : "Executed search",
      summary: summary || `${provider || "Unified"} search returned ${resultCount} result${resultCount === 1 ? "" : "s"}.`,
      source: provider || "omnibar",
      payload: { query: query || "", provider: provider || "omnibar", resultCount },
      tags: [provider || "omnibar"],
    });
  }

  addEntityFocus(entity = {}) {
    const label = entity.label || entity.name || entity.title || entity.id || "Entity";
    return this.add({
      type: "entity",
      title: `Inspected ${label}`,
      summary: entity.description || entity.summary || "",
      source: entity.source || "",
      refs: [
        {
          id: entity.id || uid("entity"),
          label,
          kind: entity.kind || "entity",
          href: entity.url || entity.href || "",
        },
      ],
      payload: entity,
      tags: [entity.kind || "entity", entity.source || ""].filter(Boolean),
    });
  }

  addSourceOpen(source = {}) {
    const label = source.label || source.title || source.url || "Source";
    return this.add({
      type: "source",
      title: `Opened source: ${label}`,
      summary: source.summary ||