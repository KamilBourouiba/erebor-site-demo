import * as THREE from 'three';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });
  return node;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value));
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function truncate(text, length = 180) {
  if (!text) return '';
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  if (normalized.length <= length) return normalized;
  return `${normalized.slice(0, length - 1).trimEnd()}…`;
}

function initialsFromLabel(label = '') {
  const parts = String(label).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function hashString(input = '') {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function colorFromType(type = 'entity') {
  const palette = {
    person: '#8fd6e6',
    organization: '#7fd0a6',
    institution: '#7fd0a6',
    repository: '#e8be87',
    paper: '#c6b3ff',
    place: '#f0a7c1',
    location: '#f0a7c1',
    event: '#f08d8d',
    entity: '#9fb2c8',
  };
  return palette[String(type).toLowerCase()] || palette.entity;
}

function normalizeEntity(entity = {}) {
  const type = entity.type || entity.kind || entity.entity_type || 'entity';
  const label = entity.label || entity.name || entity.title || entity.login || 'Untitled entity';
  const id = entity.id || entity.key || entity.nodeId || entity.slug || `${type}:${label}`;
  const description = entity.description || entity.summary || entity.abstract || entity.bio || '';
  const source = entity.source || entity.provider || entity.origin || 'local';
  const score = entity.score ?? entity.rank ?? entity.relevance ?? null;
  const updatedAt = entity.updatedAt || entity.updated_at || entity.modified || entity.timestamp || null;
  const metrics = entity.metrics || {};
  const location = entity.location || entity.geo || null;

  return {
    ...entity,
    id,
    type,
    label,
    description,
    source,
    score,
    updatedAt,
    metrics,
    location,
  };
}

function normalizeSearchResult(result = {}) {
  const source = result.source || result.provider || 'unknown';
  const type = result.type || result.kind || 'result';
  const title = result.title || result.label || result.name || result.login || 'Untitled result';
  const subtitle = result.subtitle || result.full_name || result.display_name || result.host_venue || '';
  const description = result.description || result.abstract || result.bio || result.summary || '';
  const url = result.url || result.html_url || result.homepage || result.landing_page || result.id || '#';
  const id = result.id || result.key || `${source}:${title}:${hashString(url)}`;
  const meta = result.meta || {};

  return {
    ...result,
    id,
    source,
    type,
    title,
    subtitle,
    description,
    url,
    meta,
  };
}

function normalizeTimelineEvent(event = {}) {
  return {
    id: event.id || event.key || `${event.type || 'event'}:${event.timestamp || event.date || Math.random()}`,
    type: event.type || event.kind || 'event',
    title: event.title || event.label || 'Untitled event',
    description: event.description || event.summary || '',
    timestamp: event.timestamp || event.date || event.created_at || event.updated_at || null,
    actor: event.actor || event.source || null,
    status: event.status || null,
    meta: event.meta || {},
  };
}

function ensurePanelStyles() {
  if (document.getElementById('erebor-panels-styles')) return;

  const style = document.createElement('style');
  style.id = 'erebor-panels-styles';
  style.textContent = `
    .erebor-panel {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border: var(--canvas-panel-border, 1px solid rgba(170, 182, 200, 0.14));
      border-radius: var(--canvas-panel-radius, 1rem);
      background: var(--canvas-panel-bg, linear-gradient(180deg, rgba(22, 28, 36, 0.9) 0%, rgba(12, 16, 22, 0.94) 100%));
      box-shadow: var(--canvas-panel-shadow, 0 20px 48px rgba(0, 0, 0, 0.34));
      backdrop-filter: var(--canvas-panel-blur, blur(18px));
      overflow: hidden;
      color: var(--canvas-text, #eef3f8);
    }

    .erebor-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.9rem 1rem 0.8rem;
      border-bottom: 1px solid rgba(170, 182, 200, 0.1);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)),
        linear-gradient(180deg, rgba(18, 24, 31, 0.72), rgba(18, 24, 31, 0.3));
    }

    .erebor-panel__title-wrap {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .erebor-panel__title {
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--canvas-text, #eef3f8);
    }

    .erebor-panel__subtitle {
      font-size: 0.75rem;
      color: var(--canvas-muted, #8f9baa);
    }

    .erebor-panel__body {
      min-height: 0;
      overflow: auto;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .erebor-toolbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .erebor-input,
    .erebor-select,
    .erebor-button {
      border-radius: 0.8rem;
      border: 1px solid rgba(170, 182, 200, 0.14);
      background: rgba(10, 14, 19, 0.72);
      color: var(--canvas-text, #eef3f8);
      transition:
        border-color 160ms ease,
        background-color 160ms ease,
        transform 160ms ease,
        box-shadow 160ms ease;
    }

    .erebor-input,
    .erebor-select {
      min-height: 2.5rem;
      padding: 0.65rem 0.8rem;
      width: 100%;
      outline: none;
    }

    .erebor-input::placeholder {
      color: rgba(184, 195, 207, 0.55);
    }

    .erebor-input:focus,
    .erebor-select:focus {
      border-color: rgba(143, 214, 230, 0.42);
      box-shadow: 0 0 0 3px rgba(143, 214, 230, 0.12);
    }

    .erebor-button {
      min-height: 2.4rem;
      padding: 0.6rem 0.85rem;
      font-size: 0.82rem;
      font-weight: 500;
      letter-spacing: 0.01em;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      white-space: nowrap;
    }

    .erebor-button:hover {
      border-color: rgba(143, 214, 230, 0.28);
      background: rgba(16, 22, 29, 0.9);
    }

    .erebor-button:active {
      transform: translateY(1px);
    }

    .erebor-button--accent {
      border-color: rgba(143, 214, 230, 0.24);
      background:
        linear-gradient(180deg, rgba(143, 214, 230, 0.14), rgba(143, 214, 230, 0.06)),
        rgba(10, 14, 19, 0.82);
      color: var(--canvas-accent-strong, #b8edf6);
    }

    .erebor-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }

    .erebor-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 1.8rem;
      padding: 0.3rem 0.55rem;
      border-radius: 999px;
      border: 1px solid var(--canvas-chip-border, rgba(143, 214, 230, 0.16));
      background: var(--canvas-chip-bg, rgba(143, 214, 230, 0.08));
      color: var(--canvas-chip-text, #d5dee8);
      font-size: 0.72rem;
      line-height: 1;
      white-space: nowrap;
    }

    .erebor-chip__dot {
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 999px;
      flex: 0 0 auto;
      box-shadow: 0 0 12px currentColor;
    }

    .erebor-list {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      min-height: 0;
    }

    .erebor-card {
      position: relative;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 0.75rem;
      align-items: start;
      padding: 0.8rem;
      border-radius: 0.95rem;
      border: 1px solid rgba(170, 182, 200, 0.12);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)),
        rgba(11, 15, 20, 0.72);
      transition:
        border-color 180ms ease,
        background-color 180ms ease,
        transform 180ms ease,
        box-shadow 180ms ease;
      cursor: pointer;
      text-align: left;
      width: 100%;
    }

    .erebor-card:hover {
      border-color: rgba(143, 214, 230, 0.24);
      background: rgba(14, 19, 25, 0.9);
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
    }

    .erebor-card.is-active {
      border-color: rgba(143, 214, 230, 0.34);
      box-shadow:
        0 0 0 1px rgba(143, 214, 230, 0.18) inset,
        0 14px 28px rgba(0, 0, 0, 0.22);
      background:
        linear-gradient(180deg, rgba(143, 214, 230, 0.08), rgba(143, 214, 230, 0.02)),
        rgba(14, 19, 25, 0.94);
    }

    .erebor-card__avatar {
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 0.8rem;
      display: grid;
      place-items: center;
      font-size: 0.78rem;
      font-weight: 600;
      color: #f4fbfd;
      background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.08),
        0 8px 18px rgba(0,0,0,0.18);
    }

    .erebor-card__content {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .erebor-card__title-row {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      min-width: 0;
      flex-wrap: wrap;
    }

    .erebor-card__title {
      min-width: 0;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--canvas-text, #eef3f8);
    }

    .erebor-card__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      align-items: center;
      color: var(--canvas-muted, #8f9baa);
      font-size: 0.74rem;
    }

    .erebor-card__description {
      color: var(--canvas-subtle, #b8c3cf);
      font-size: 0.8rem;
      line-height: 1.45;
    }

    .erebor-card__aside {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.4rem;
      color: var(--canvas-muted, #8f9baa);
      font-size: 0.72rem;
    }

    .erebor-kpi {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.6rem;
    }

    .erebor-kpi__item {
      padding: 0.75rem;
      border-radius: 0.9rem;
      border: 1px solid rgba(170, 182, 200, 0.1);
      background: rgba(10, 14, 19, 0.56);
    }

    .erebor-kpi__label {
      font-size: 0.72rem;
      color: var(--canvas-muted, #8f9baa);
      margin-bottom: 0.3rem;
    }

    .erebor-kpi__value {
      font-size: 1rem;
      font-weight: 600;
      color: var(--canvas-text, #eef3f8);
    }

    .erebor-empty,
    .erebor-state {
      display: grid;
      place-items: center;
      min-height: 8rem;
      padding: 1rem;
      border: 1px dashed rgba(170, 182, 200, 0.14);
      border-radius: 1rem;
      color: var(--canvas-muted, #8f9baa);
      text-align: center;
      background: rgba(10, 14, 19, 0.36);
    }

    .erebor-state strong {
      color: var(--canvas-text, #eef3f8);
      display: block;
      margin-bottom: 0.25rem;
    }

    .erebor-inspector {
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
    }

    .erebor-inspector__hero {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.85rem;
      align-items: start;
      padding: 0.9rem;
      border-radius: 1rem;
      border: 1px solid rgba(170, 182, 200, 0.12);
      background:
        radial-gradient(circle at top right, rgba(143, 214, 230, 0.08), transparent 36%),
        rgba(11, 15, 20, 0.72);
    }

    .erebor-inspector__avatar {
      width: 3rem;
      height: 3rem;
      border-radius: 1rem;
      display: grid;
      place-items: center;
      font-weight: 700;
      color: #f4fbfd;
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.08),
        0 10px 24px rgba(0,0,0,0.22);
    }

    .erebor-inspector__title {
      font-size: