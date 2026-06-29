import * as THREE from 'three';

const MOBILE_BREAKPOINT = 768;
const DEFAULT_EMPTY_TITLE = 'No entity selected';
const DEFAULT_EMPTY_BODY = 'Select a node on the globe or open a search result to inspect linked metadata, relationships, and timeline activity.';

function qs(root, selector) {
  return root ? root.querySelector(selector) : null;
}

function qsa(root, selector) {
  return root ? Array.from(root.querySelectorAll(selector)) : [];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return 'Unknown';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function truncate(value, max = 180) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function initialsFromName(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return '—';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function hashString(value) {
  const text = String(value ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function sourceTone(source) {
  const normalized = String(source ?? '').toLowerCase();
  if (normalized.includes('github')) return 'cyan';
  if (normalized.includes('openalex')) return 'amber';
  if (normalized.includes('nominatim') || normalized.includes('osm')) return 'slate';
  return ['cyan', 'amber', 'slate'][hashString(normalized) % 3];
}

function entityTypeTone(type) {
  const normalized = String(type ?? '').toLowerCase();
  if (normalized.includes('repo') || normalized.includes('code')) return 'cyan';
  if (normalized.includes('author') || normalized.includes('person')) return 'amber';
  if (normalized.includes('place') || normalized.includes('geo') || normalized.includes('location')) return 'slate';
  if (normalized.includes('paper') || normalized.includes('work')) return 'amber';
  return ['cyan', 'amber', 'slate'][hashString(normalized) % 3];
}

function normalizeSourceLabel(source) {
  const normalized = String(source ?? '').toLowerCase();
  if (normalized === 'github') return 'GitHub';
  if (normalized === 'openalex') return 'OpenAlex';
  if (normalized === 'nominatim') return 'Nominatim';
  return source || 'Unknown';
}

function normalizeEntity(raw = {}) {
  const source = raw.source || raw.provider || raw.origin || 'Unknown';
  const type = raw.type || raw.entityType || raw.kind || 'Entity';
  const id =
    raw.id ||
    raw.entityId ||
    raw.key ||
    raw.nodeId ||
    raw.url ||
    `${source}:${type}:${raw.name || raw.title || raw.label || Math.random().toString(36).slice(2)}`;

  const title =
    raw.title ||
    raw.name ||
    raw.label ||
    raw.login ||
    raw.display_name ||
    raw.full_name ||
    raw.primary_name ||
    'Untitled entity';

  const subtitle =
    raw.subtitle ||
    raw.full_name ||
    raw.login ||
    raw.host ||
    raw.country ||
    raw.typeLabel ||
    '';

  const description =
    raw.description ||
    raw.summary ||
    raw.abstract ||
    raw.bio ||
    raw.display_name ||
    raw.snippet ||
    '';

  const score =
    typeof raw.score === 'number'
      ? raw.score
      : typeof raw.relevance === 'number'
        ? raw.relevance
        : typeof raw.stars === 'number'
          ? raw.stars
          : null;

  const coordinates =
    raw.coordinates ||
    (typeof raw.lat === 'number' && typeof raw.lon === 'number'
      ? { lat: raw.lat, lon: raw.lon }
      : typeof raw.latitude === 'number' && typeof raw.longitude === 'number'
        ? { lat: raw.latitude, lon: raw.longitude }
        : null);

  const links = uniqueBy(
    [
      ...(Array.isArray(raw.links) ? raw.links : []),
      raw.html_url ? { label: 'Open source', href: raw.html_url } : null,
      raw.url && /^https?:\/\//.test(raw.url) ? { label: 'Source record', href: raw.url } : null,
      raw.homepage ? { label: 'Homepage', href: raw.homepage } : null,
      raw.orcid ? { label: 'ORCID', href: raw.orcid } : null,
    ].filter(Boolean),
    (item) => item.href || item.label,
  );

  const metrics = raw.metrics || {};
  const tags = uniqueBy(
    [
      ...(Array.isArray(raw.tags) ? raw.tags : []),
      ...(Array.isArray(raw.topics) ? raw.topics : []),
      ...(Array.isArray(raw.keywords) ? raw.keywords : []),
      raw.language || null,
      raw.country_code || null,
    ]
      .filter(Boolean)
      .map((item) => (typeof item === 'string' ? item : item.name || item.label || '')),
    (item) => item.toLowerCase(),
  ).slice(0, 12);

  const timeline = toArray(raw.timeline || raw.events).map((event, index) => ({
    id: event.id || `${id}:event:${index}`,
    title: event.title || event.label || event.type || 'Activity',
    detail: event.detail || event.description || event.summary || '',
    date: event.date || event.timestamp || event.created_at || event.updated_at || null,
    tone: event.tone || event.severity || 'neutral',
    source: event.source || source,
  }));

  const relationships = toArray(raw.relationships || raw.linksTo || raw.edges).map((rel, index) => ({
    id: rel.id || `${id}:rel:${index}`,
    label: rel.label || rel.type || rel.relation || 'Linked',
    target: rel.target || rel.name || rel.title || rel.id || 'Unknown',
    source: rel.source || source,
    weight: rel.weight ?? rel.score ?? null,
  }));

  return {
    id,
    source: normalizeSourceLabel(source),
    type,
    title,
    subtitle,
    description,
    score,
    coordinates,
    links,
    tags,
    metrics: {
      stars: raw.stargazers_count ?? raw.stars ?? metrics.stars ?? null,
      forks: raw.forks_count ?? raw.forks ?? metrics.forks ?? null,
      watchers: raw.watchers_count ?? raw.watchers ?? metrics.watchers ?? null,
      citations: raw.cited_by_count ?? raw.citations ?? metrics.citations ?? null,
      works: raw.works_count ?? metrics.works ?? null,
      followers: raw.followers ?? metrics.followers ?? null,
    },
    updatedAt: raw.updated_at || raw.updatedAt || raw.modified || raw.timestamp || null,
    createdAt: raw.created_at || raw.createdAt || null,
    location:
      raw.location ||
      raw.display_name ||
      (coordinates ? `${formatNumber(coordinates.lat)}, ${formatNumber(coordinates.lon)}` : ''),
    raw,
    timeline,
    relationships,
  };
}

function ensurePanelStyles() {
  if (document.getElementById('erebor-panels-inline-styles')) return;

  const style = document.createElement('style');
  style.id = 'erebor-panels-inline-styles';
  style.textContent = `
    .panel-shell {
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 0;
      background: linear-gradient(180deg, rgba(18,25,34,0.82), rgba(10,14,20,0.92));
      border: 1px solid rgba(111,130,157,0.18);
      border-radius: 1rem;
      box-shadow: 0 18px 40px rgba(0,0,0,0.28);
      overflow: hidden;
      backdrop-filter: blur(18px);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.9rem 1rem;
      border-bottom: 1px solid rgba(111,130,157,0.14);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.02), transparent),
        linear-gradient(180deg, rgba(20,28,38,0.96), rgba(12,17,24,0.96));
    }

    .panel-header__meta {
      min-width: 0;
    }

    .panel-kicker {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.7rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-muted, #6f829d);
      margin-bottom: 0.2rem;
    }

    .panel-title {
      margin: 0;
      font-size: 0.98rem;
      font-weight: 600;
      color: var(--text-primary, #e5ebf3);
    }

    .panel-subtitle {
      margin: 0.15rem 0 0;
      font-size: 0.8rem;
      color: var(--text-secondary, #9aabc2);
    }

    .panel-body {
      min-height: 0;
      overflow: auto;
      padding: 0.9rem;
    }

    .panel-toolbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .panel-button {
      appearance: none;
      border: 1px solid rgba(111,130,157,0.18);
      background: rgba(255,255,255,0.02);
      color: var(--text-secondary, #9aabc2);
      border-radius: 999px;
      min-height: 2.25rem;
      padding: 0 0.8rem;
      font: inherit;
      font-size: 0.8rem;
      cursor: pointer;
      transition: background 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease;
    }

    .panel-button:hover,
    .panel-button:focus-visible {
      outline: none;
      color: var(--text-primary, #e5ebf3);
      border-color: rgba(79,192,222,0.38);
      background: rgba(79,192,222,0.08);
    }

    .panel-button.is-active {
      color: #dff7ff;
      border-color: rgba(79,192,222,0.42);
      background: rgba(79,192,222,0.14);
      box-shadow: inset 0 0 0 1px rgba(79,192,222,0.12);
    }

    .panel-search {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      flex: 1 1 12rem;
    }

    .panel-search input {
      width: 100%;
      min-height: 2.5rem;
      border-radius: 0.8rem;
      border: 1px solid rgba(111,130,157,0.18);
      background: rgba(8,11,16,0.72);
      color: var(--text-primary, #e5ebf3);
      padding: 0 0.9rem;
      font: inherit;
    }

    .panel-search input::placeholder {
      color: var(--text-muted, #6f829d);
    }

    .panel-search input:focus-visible {
      outline: none;
      box-shadow: 0 0 0 1px rgba(79,192,222,0.55), 0 0 0 4px rgba(79,192,222,0.14);
      border-color: rgba(79,192,222,0.38);
    }

    .entity-list,
    .results-list,
    .timeline-list,
    .relationship-list {
      display: grid;
      gap: 0.7rem;
    }

    .entity-card,
    .result-card,
    .timeline-card,
    .relationship-card {
      position: relative;
      display: grid;
      gap: 0.65rem;
      padding: 0.9rem;
      border-radius: 0.95rem;
      border: 1px solid rgba(111,130,157,0.16);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.02), transparent),
        rgba(11,15,20,0.72);
      transition: transform 140ms ease, border-color 140ms ease, background 140ms ease, box-shadow 140ms ease;
    }

    .entity-card[role="button"],
    .result-card[role="button"] {
      cursor: pointer;
    }

    .entity-card:hover,
    .entity-card:focus-visible,
    .result-card:hover,
    .result-card:focus-visible {
      outline: none;
      transform: translateY(-1px);
      border-color: rgba(79,192,222,0.28);
      box-shadow: 0 12px 28px rgba(0,0,0,0.22);
      background:
        linear-gradient(180deg, rgba(79,192,222,0.05), transparent),
        rgba(14,19,26,0.88);
    }

    .entity-card.is-active,
    .result-card.is-active {
      border-color: rgba(79,192,222,0.42);
      box-shadow: 0 0 0 1px rgba(79,192,222,0.12), 0 16px 36px rgba(0,0,0,0.24);
      background:
        linear-gradient(180deg, rgba(79,192,222,0.08), transparent),
        rgba(14,19,26,0.92);
    }

    .entity-card__top,
    .result-card__top,
    .inspector-hero {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 0.75rem;
      align-items: start;
      min-width: 0;
    }

    .entity-avatar,
    .result-avatar,
    .inspector-avatar {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.8rem;
      display: grid;
      place-items: center;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #eff8fb;
      background:
        radial-gradient(circle at 30% 30%, rgba(255,255,255,0.16), transparent 42%),
        linear-gradient(135deg, rgba(79,192,222,0.32), rgba(79,192,222,0.08));
      border: 1px solid rgba(79,192,222,0.22);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    }

    .tone-amber {
      background:
        radial-gradient(circle at 30% 30%, rgba(255,255,255,0.14), transparent 42%),
        linear-gradient(135deg, rgba(201,135,29,0.34), rgba(201,135,29,0.08));
      border-color: rgba(201,135,29,0.24);
    }

    .tone-slate {
      background:
        radial-gradient(circle at 30% 30%, rgba(255,255,255,0.12), transparent 42%),
        linear-gradient(135deg, rgba(111,130,157,0.28), rgba(111,130,157,0.08));
      border-color: rgba(111,130,157,0.24);
    }

    .entity-card__meta,
    .result-card__meta,
    .inspector-hero__meta {
      min-width: 0;
    }

    .entity-card__title,
    .result-card__title,
    .inspector-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary, #e5ebf3);
      overflow-wrap: anywhere;
    }

    .entity-card__subtitle,
    .result-card__subtitle,
    .inspector-subtitle {
      margin: 0.2rem 0 0;
      font-size: 0.8rem;