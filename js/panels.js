const PANEL_DEFAULTS = {
  maxEntities: 120,
  maxTimelineItems: 80,
  maxSearchResultsPerSource: 8,
};

const SOURCE_META = {
  github: {
    label: 'GitHub',
    tone: 'code',
    icon: 'GH',
  },
  openalex: {
    label: 'OpenAlex',
    tone: 'research',
    icon: 'OA',
  },
  nominatim: {
    label: 'Nominatim',
    tone: 'geo',
    icon: 'NM',
  },
};

const ENTITY_TYPE_META = {
  repository: { label: 'Repository', icon: 'Repo' },
  user: { label: 'User', icon: 'User' },
  organization: { label: 'Organization', icon: 'Org' },
  paper: { label: 'Paper', icon: 'Paper' },
  author: { label: 'Author', icon: 'Author' },
  institution: { label: 'Institution', icon: 'Inst' },
  place: { label: 'Place', icon: 'Place' },
  location: { label: 'Location', icon: 'Place' },
  city: { label: 'City', icon: 'City' },
  country: { label: 'Country', icon: 'Country' },
  entity: { label: 'Entity', icon: 'Entity' },
};

function ensureStyles() {
  if (document.getElementById('erebor-panels-styles')) return;

  const style = document.createElement('style');
  style.id = 'erebor-panels-styles';
  style.textContent = `
    .panel-root,
    .erebor-panel {
      color: var(--color-text, #edf3fb);
      font-family: var(--font-sans, "IBM Plex Sans", system-ui, sans-serif);
      min-width: 0;
    }

    .erebor-panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-4, 1rem);
      min-height: 0;
    }

    .erebor-panel__section {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 0.75rem);
      min-height: 0;
      padding: var(--space-4, 1rem);
      border: 1px solid rgba(164, 175, 191, 0.14);
      border-radius: var(--radius-lg, 1rem);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)),
        rgba(10, 14, 20, 0.58);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.03),
        0 10px 30px rgba(0,0,0,0.18);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .erebor-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3, 0.75rem);
      min-width: 0;
    }

    .erebor-panel__title-wrap {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      min-width: 0;
    }

    .erebor-panel__eyebrow {
      font-size: var(--font-size-2xs, 0.6875rem);
      line-height: 1;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(214, 223, 235, 0.54);
    }

    .erebor-panel__title {
      margin: 0;
      font-size: var(--font-size-lg, 1.125rem);
      line-height: 1.15;
      letter-spacing: -0.02em;
      font-weight: 600;
      color: var(--color-text, #edf3fb);
    }

    .erebor-panel__meta {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.65rem;
      border-radius: 999px;
      border: 1px solid rgba(99, 214, 255, 0.18);
      background: rgba(99, 214, 255, 0.08);
      color: rgba(214, 239, 255, 0.92);
      font-size: var(--font-size-xs, 0.75rem);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .erebor-panel__toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      flex-wrap: wrap;
    }

    .erebor-input,
    .erebor-select,
    .erebor-button {
      appearance: none;
      border: 1px solid rgba(164, 175, 191, 0.16);
      background: rgba(255,255,255,0.03);
      color: var(--color-text, #edf3fb);
      border-radius: var(--radius-md, 0.75rem);
      font: inherit;
      transition:
        border-color var(--transition-fast, 140ms ease),
        background var(--transition-fast, 140ms ease),
        transform var(--transition-fast, 140ms ease),
        box-shadow var(--transition-fast, 140ms ease);
    }

    .erebor-input,
    .erebor-select {
      width: 100%;
      min-height: 2.5rem;
      padding: 0.65rem 0.85rem;
      outline: none;
    }

    .erebor-input::placeholder {
      color: rgba(214, 223, 235, 0.42);
    }

    .erebor-input:focus,
    .erebor-select:focus,
    .erebor-button:focus-visible,
    .erebor-list-item:focus-visible,
    .erebor-result-card:focus-visible,
    .erebor-timeline-item:focus-visible {
      border-color: rgba(99, 214, 255, 0.42);
      box-shadow:
        0 0 0 1px rgba(99, 214, 255, 0.18),
        0 0 0 4px rgba(99, 214, 255, 0.08);
      outline: none;
    }

    .erebor-button {
      min-height: 2.5rem;
      padding: 0.65rem 0.9rem;
      cursor: pointer;
      font-weight: 500;
    }

    .erebor-button:hover {
      background: rgba(255,255,255,0.06);
      border-color: rgba(164, 175, 191, 0.24);
    }

    .erebor-button:active {
      transform: translateY(1px);
    }

    .erebor-button--ghost {
      background: rgba(255,255,255,0.02);
    }

    .erebor-button--accent {
      background:
        linear-gradient(180deg, rgba(99,214,255,0.18), rgba(99,214,255,0.08)),
        rgba(99,214,255,0.08);
      border-color: rgba(99, 214, 255, 0.28);
      color: #f4fbff;
    }

    .erebor-button--accent:hover {
      background:
        linear-gradient(180deg, rgba(99,214,255,0.24), rgba(99,214,255,0.12)),
        rgba(99,214,255,0.12);
      border-color: rgba(99, 214, 255, 0.38);
    }

    .erebor-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 0.75rem);
      min-height: 0;
    }

    .erebor-scroll {
      min-height: 0;
      overflow: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(164,175,191,0.24) transparent;
    }

    .erebor-scroll::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    .erebor-scroll::-webkit-scrollbar-thumb {
      background: rgba(164,175,191,0.18);
      border: 2px solid transparent;
      background-clip: padding-box;
      border-radius: 999px;
    }

    .erebor-list {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      min-height: 0;
    }

    .erebor-list-item,
    .erebor-result-card,
    .erebor-timeline-item {
      width: 100%;
      border: 1px solid rgba(164, 175, 191, 0.12);
      border-radius: var(--radius-md, 0.75rem);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.008)),
        rgba(255,255,255,0.015);
      color: inherit;
      text-align: left;
      transition:
        border-color var(--transition-fast, 140ms ease),
        background var(--transition-fast, 140ms ease),
        transform var(--transition-fast, 140ms ease),
        box-shadow var(--transition-fast, 140ms ease);
    }

    button.erebor-list-item,
    button.erebor-result-card,
    button.erebor-timeline-item {
      cursor: pointer;
      font: inherit;
      padding: 0;
    }

    .erebor-list-item:hover,
    .erebor-result-card:hover,
    .erebor-timeline-item:hover {
      border-color: rgba(99, 214, 255, 0.24);
      background:
        linear-gradient(180deg, rgba(99,214,255,0.06), rgba(255,255,255,0.01)),
        rgba(255,255,255,0.02);
      transform: translateY(-1px);
    }

    .erebor-list-item.is-active,
    .erebor-result-card.is-active,
    .erebor-timeline-item.is-active {
      border-color: rgba(99, 214, 255, 0.34);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.04),
        0 0 0 1px rgba(99,214,255,0.08);
      background:
        linear-gradient(180deg, rgba(99,214,255,0.08), rgba(255,255,255,0.012)),
        rgba(255,255,255,0.025);
    }

    .erebor-list-item__inner,
    .erebor-result-card__inner,
    .erebor-timeline-item__inner {
      display: flex;
      gap: 0.85rem;
      align-items: flex-start;
      padding: 0.85rem 0.9rem;
      min-width: 0;
    }

    .erebor-avatar,
    .erebor-source-badge,
    .erebor-type-badge {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.8rem;
      border: 1px solid rgba(164, 175, 191, 0.14);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015)),
        rgba(255,255,255,0.02);
      color: rgba(237, 243, 251, 0.92);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    }

    .erebor-avatar {
      width: 2.4rem;
      height: 2.4rem;
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .erebor-source-badge,
    .erebor-type-badge {
      min-height: 1.5rem;
      padding: 0.2rem 0.45rem;
      border-radius: 999px;
      font-size: 0.68rem;
      white-space: nowrap;
    }

    .erebor-source-badge[data-tone="code"] {
      border-color: rgba(99, 214, 255, 0.18);
      color: rgba(194, 236, 255, 0.96);
      background: rgba(99, 214, 255, 0.08);
    }

    .erebor-source-badge[data-tone="research"] {
      border-color: rgba(125, 211, 252, 0.18);
      color: rgba(220, 240, 255, 0.96);
      background: rgba(125, 211, 252, 0.08);
    }

    .erebor-source-badge[data-tone="geo"] {
      border-color: rgba(77, 215, 168, 0.18);
      color: rgba(214, 255, 241, 0.96);
      background: rgba(77, 215, 168, 0.08);
    }

    .erebor-item-main {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      min-width: 0;
      flex: 1;
    }

    .erebor-item-topline {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      min-width: 0;
    }

    .erebor-item-title {
      margin: 0;
      font-size: var(--font-size-md, 0.9375rem);
      line-height: 1.25;
      font-weight: 600;
      color: var(--color-text, #edf3fb);
      overflow-wrap: anywhere;
    }

    .erebor-item-subtitle,
    .erebor-item-description,
    .erebor-empty,
    .erebor-kv__value,
    .erebor-inspector__body,
    .erebor-result-meta,
    .erebor-timeline-meta {
      color: rgba(214, 223, 235, 0.72);
    }

    .erebor-item-subtitle,
    .erebor-result-meta,
    .erebor-timeline-meta {
      font-size: var(--font-size-xs, 0.75rem);
      line-height: 1.35;
    }

    .erebor-item-description,
    .erebor-inspector__body {
      font-size: var(--font-size-sm, 0.8125rem);
      line-height: 1.5;
      overflow-wrap: anywhere;
    }

    .erebor-item-tags,
    .erebor-chip-row,
    .erebor-kv-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }

    .erebor-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 1.6rem;
      padding: 0.2rem 0.5rem;
      border-radius: 999px;
      border: 1px solid rgba(164, 175, 191, 0.12);
      background: rgba(255,255,255,0.03);
      color: rgba(214, 223, 235, 0.82);
      font-size: 0.7rem;
      white-space: nowrap;
    }

    .erebor-chip strong {
      color: rgba(237, 243, 251, 0.96);
      font-weight: 600;
    }

    .erebor-empty {
      display: grid;
      place-items: center;
      min-height: 7rem;
      padding: 1rem;
      border: 1px dashed rgba(164, 175, 191, 0.16);
      border-radius: var(--radius-md, 0.75rem);
      background: rgba(255,255,255,0.015);
      text-align: center;
      font-size: var(--font-size-sm, 0.8125rem);
    }

    .erebor-inspector {
      display: flex;
      flex-direction: column;
      gap: var(--space-4, 1rem);
      min-height: 0;
    }

    .erebor-inspector__hero {
      display: flex;
      gap: 0.9rem;
      align-items: flex-start;
      min-width: 0;
    }

    .erebor-inspector__avatar {
      width: 3rem;
      height: 3rem;
      border-radius: 1rem;
      font-size: 0.8rem;
    }

    .erebor-inspector__title {
      margin: 0;
      font-size: var(--font-size-xl, 1.375rem);
      line-height: 1.1;
      letter-spacing: -0.03em;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .erebor-inspector__subtitle {
      margin-top: 0.25rem;
      color: rgba(214, 223, 235, 0.68);
      font-size: var(--font-size-sm, 0.8125rem);
      overflow-wrap: anywhere;
    }

    .erebor-inspector__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
    }

    .erebor-kv-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.65rem;
    }

    .erebor-kv {
      padding: 0.75rem 0.8rem;
      border-radius: var(--radius-md, 0.75rem);
      border: 1px solid rgba(164, 175, 191, 0.12);
      background: rgba(255,255,255,0.02);
      min-width: 0;
    }

    .erebor-kv__label {
      display: block;
      margin-bottom: 0.25rem;
      font-size: 0.68rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(214, 223, 235, 0.5);
    }

    .erebor-kv__value {
      font-size: var(--font-size-sm,