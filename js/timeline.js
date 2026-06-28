const DEFAULT_MAX_EVENTS = 120;

const EVENT_KIND_META = {
  search: {
    label: "Search",
    tone: "accent",
    icon: "⌕",
  },
  entity: {
    label: "Entity",
    tone: "info",
    icon: "◉",
  },
  relation: {
    label: "Relation",
    tone: "accent",
    icon: "⇄",
  },
  note: {
    label: "Note",
    tone: "muted",
    icon: "✦",
  },
  alert: {
    label: "Alert",
    tone: "danger",
    icon: "!",
  },
  system: {
    label: "System",
    tone: "muted",
    icon: "•",
  },
};

function uid(prefix = "evt") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function clampMaxEvents(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 10) return DEFAULT_MAX_EVENTS;
  return Math.floor(parsed);
}

function toDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => `${tag}`.trim())
      .filter(Boolean)
      .slice(0, 8);
  }
  return `${tags}`
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeActors(actors) {
  if (!actors) return [];
  if (Array.isArray(actors)) {
    return actors
      .map((actor) => {
        if (typeof actor === "string") {
          return { label: actor.trim() };
        }
        if (actor && typeof actor === "object") {
          return {
            id: actor.id ?? null,
            label: `${actor.label ?? actor.name ?? actor.id ?? ""}`.trim(),
            type: actor.type ? `${actor.type}` : null,
          };
        }
        return null;
      })
      .filter((actor) => actor?.label)
      .slice(0, 6);
  }
  return [];
}

function normalizeEvent(input = {}) {
  const kind = EVENT_KIND_META[input.kind] ? input.kind : "note";
  const timestamp = toDate(input.timestamp ?? input.time ?? Date.now());
  const title = `${input.title ?? input.label ?? EVENT_KIND_META[kind].label}`.trim();
  const summary = input.summary ? `${input.summary}`.trim() : "";
  const source = input.source ? `${input.source}`.trim() : "";
  const status = input.status ? `${input.status}`.trim() : "logged";

  return {
    id: input.id ? `${input.id}` : uid("trail"),
    kind,
    title,
    summary,
    source,
    status,
    timestamp,
    tags: normalizeTags(input.tags),
    actors: normalizeActors(input.actors),
    entityId: input.entityId ? `${input.entityId}` : null,
    entityType: input.entityType ? `${input.entityType}` : null,
    payload: input.payload && typeof input.payload === "object" ? { ...input.payload } : {},
    pinned: Boolean(input.pinned),
  };
}

function compareEventsDesc(a, b) {
  const delta = b.timestamp.getTime() - a.timestamp.getTime();
  if (delta !== 0) return delta;
  return a.id.localeCompare(b.id);
}

function formatAbsoluteTime(date, locale) {
  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function formatRelativeTime(date, locale) {
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);

  const units = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1_000],
  ];

  const formatter = new Intl.RelativeTimeFormat(locale || undefined, { numeric: "auto" });

  for (const [unit, size] of units) {
    if (abs >= size || unit === "second") {
      return formatter.format(Math.round(diffMs / size), unit);
    }
  }

  return "now";
}

function escapeHtml(value) {
  return `${value ?? ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function injectStyles() {
  if (document.getElementById("erebor-timeline-styles")) return;

  const style = document.createElement("style");
  style.id = "erebor-timeline-styles";
  style.textContent = `
    .trail {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      min-height: 0;
      color: var(--color-text, #edf3fb);
      background: transparent;
    }

    .trail__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.875rem;
      padding: 0.125rem 0 0.875rem;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .trail__eyebrow {
      margin: 0 0 0.25rem;
      font: 600 0.68rem/1.2 "IBM Plex Sans", system-ui, sans-serif;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(214, 223, 235, 0.56);
    }

    .trail__title {
      margin: 0;
      font: 600 1rem/1.2 "IBM Plex Sans", system-ui, sans-serif;
      letter-spacing: -0.02em;
      color: var(--color-text, #edf3fb);
    }

    .trail__subtitle {
      margin: 0.35rem 0 0;
      font: 400 0.82rem/1.45 "IBM Plex Sans", system-ui, sans-serif;
      color: rgba(214, 223, 235, 0.68);
      max-width: 42ch;
    }

    .trail__meta {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .trail__count,
    .trail__live {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      min-height: 2rem;
      padding: 0 0.8rem;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.08);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)),
        rgba(10, 14, 20, 0.72);
      box-shadow:
        0 10px 24px rgba(0,0,0,0.18),
        inset 0 1px 0 rgba(255,255,255,0.03);
      font: 500 0.74rem/1 "IBM Plex Sans", system-ui, sans-serif;
      color: rgba(237, 243, 251, 0.84);
      white-space: nowrap;
    }

    .trail__live-dot {
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 999px;
      background: #4dd7a8;
      box-shadow: 0 0 0 0 rgba(77, 215, 168, 0.42);
      animation: trailPulse 1.8s ease infinite;
    }

    @keyframes trailPulse {
      0% { box-shadow: 0 0 0 0 rgba(77, 215, 168, 0.42); }
      70% { box-shadow: 0 0 0 0.5rem rgba(77, 215, 168, 0); }
      100% { box-shadow: 0 0 0 0 rgba(77, 215, 168, 0); }
    }

    .trail__toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.75rem;
      align-items: center;
      padding: 0.875rem 0 0.875rem;
    }

    .trail__filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      min-width: 0;
    }

    .trail__filter {
      appearance: none;
      border: 1px solid rgba(255,255,255,0.08);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)),
        rgba(10, 14, 20, 0.68);
      color: rgba(214, 223, 235, 0.72);
      border-radius: 999px;
      min-height: 2rem;
      padding: 0 0.8rem;
      font: 500 0.74rem/1 "IBM Plex Sans", system-ui, sans-serif;
      cursor: pointer;
      transition:
        color 160ms ease,
        border-color 160ms ease,
        background 160ms ease,
        transform 160ms ease;
    }

    .trail__filter:hover {
      color: rgba(237, 243, 251, 0.92);
      border-color: rgba(255,255,255,0.14);
      transform: translateY(-1px);
    }

    .trail__filter.is-active {
      color: #dff7ff;
      border-color: rgba(99, 214, 255, 0.28);
      background:
        linear-gradient(180deg, rgba(99, 214, 255, 0.12), rgba(99, 214, 255, 0.04)),
        rgba(10, 14, 20, 0.82);
      box-shadow: inset 0 0 0 1px rgba(99, 214, 255, 0.08);
    }

    .trail__actions {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      justify-self: end;
    }

    .trail__button {
      appearance: none;
      border: 1px solid rgba(255,255,255,0.08);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)),
        rgba(10, 14, 20, 0.68);
      color: rgba(237, 243, 251, 0.84);
      border-radius: 999px;
      min-height: 2rem;
      padding: 0 0.8rem;
      font: 500 0.74rem/1 "IBM Plex Sans", system-ui, sans-serif;
      cursor: pointer;
      transition:
        color 160ms ease,
        border-color 160ms ease,
        background 160ms ease,
        transform 160ms ease;
    }

    .trail__button:hover {
      border-color: rgba(255,255,255,0.14);
      transform: translateY(-1px);
    }

    .trail__button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none;
    }

    .trail__stream {
      position: relative;
      min-height: 0;
      overflow: auto;
      padding-right: 0.25rem;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.14) transparent;
    }

    .trail__stream::-webkit-scrollbar {
      width: 10px;
    }

    .trail__stream::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.12);
      border-radius: 999px;
      border: 3px solid transparent;
      background-clip: padding-box;
    }

    .trail__list {
      position: relative;
      display: grid;
      gap: 0.85rem;
      margin: 0;
      padding: 0 0 0 1.15rem;
      list-style: none;
    }

    .trail__list::before {
      content: "";
      position: absolute;
      top: 0.25rem;
      bottom: 0.25rem;
      left: 0.35rem;
      width: 1px;
      background:
        linear-gradient(180deg, rgba(99, 214, 255, 0.22), rgba(255,255,255,0.06));
    }

    .trail__item {
      position: relative;
      display: grid;
      gap: 0.5rem;
      padding: 0.95rem 1rem 0.95rem 1rem;
      border-radius: 1rem;
      border: 1px solid rgba(255,255,255,0.07);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012)),
        rgba(10, 14, 20, 0.62);
      box-shadow:
        0 12px 28px rgba(0,0,0,0.18),
        inset 0 1px 0 rgba(255,255,255,0.025);
      cursor: pointer;
      transition:
        border-color 180ms ease,
        background 180ms ease,
        transform 180ms ease,
        box-shadow 180ms ease;
    }

    .trail__item::before {
      content: "";
      position: absolute;
      top: 1.15rem;
      left: -0.98rem;
      width: 0.7rem;
      height: 0.7rem;
      border-radius: 999px;
      background: var(--trail-dot, rgba(99, 214, 255, 0.9));
      box-shadow:
        0 0 0 4px rgba(10, 14, 20, 0.92),
        0 0 18px color-mix(in srgb, var(--trail-dot, #63d6ff) 35%, transparent);
    }

    .trail__item:hover {
      transform: translateY(-1px);
      border-color: rgba(255,255,255,0.12);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.016)),
        rgba(10, 14, 20, 0.72);
    }

    .trail__item.is-selected {
      border-color: rgba(99, 214, 255, 0.24);
      background:
        linear-gradient(180deg, rgba(99, 214, 255, 0.08), rgba(255,255,255,0.018)),
        rgba(10, 14, 20, 0.82);
      box-shadow:
        0 16px 34px rgba(0,0,0,0.24),
        inset 0 0 0 1px rgba(99, 214, 255, 0.08);
    }

    .trail__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      min-width: 0;
    }

    .trail__kind {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      min-width: 0;
      font: 600 0.7rem/1 "IBM Plex Sans", system-ui, sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(214, 223, 235, 0.62);
    }

    .trail__kind-icon {
      display: inline-grid;
      place-items: center;
      width: 1.15rem;
      height: 1.15rem;
      border-radius: 999px;
      background: rgba(255,255,255,0.05);
      color: rgba(237, 243, 251, 0.9);
      font-size: 0.72rem;
      line-height: 1;
    }

    .trail__time {
      flex: 0 0 auto;
      text-align: right;
      font: 500 0.72rem/1.2 "IBM Plex Mono", ui-monospace, monospace;
      color: rgba(214, 223, 235, 0.56);
      white-space: nowrap;
    }

    .trail__titleline {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      min-width: 0;
    }

    .trail__item-title {
      margin: 0;
      min-width: 0;
      font: 600 0.92rem/1.3 "IBM Plex Sans", system-ui, sans-serif;
      letter-spacing: -0.01em;
      color: var(--color-text, #edf3fb);
    }

    .trail__status {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      min-height: 1.35rem;
      padding: 0 0.5rem;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
      font: 500 0.68rem/1 "IBM Plex Sans", system-ui, sans-serif;
      color: rgba(214, 223, 235,