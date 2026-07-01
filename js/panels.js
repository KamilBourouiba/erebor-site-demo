import * as THREE from 'three';

const SOURCE_META = {
  github: {
    label: 'GitHub',
    tone: 'source-github',
    icon: 'GH',
  },
  openalex: {
    label: 'OpenAlex',
    tone: 'source-openalex',
    icon: 'OA',
  },
  nominatim: {
    label: 'Nominatim',
    tone: 'source-nominatim',
    icon: 'NM',
  },
  system: {
    label: 'System',
    tone: 'source-system',
    icon: 'SY',
  },
};

const ENTITY_TYPE_META = {
  repository: { label: 'Repository', icon: '◫' },
  user: { label: 'User', icon: '◌' },
  author: { label: 'Author', icon: '◎' },
  paper: { label: 'Paper', icon: '▣' },
  place: { label: 'Place', icon: '◇' },
  location: { label: 'Location', icon: '◇' },
  organization: { label: 'Organization', icon: '▤' },
  topic: { label: 'Topic', icon: '△' },
  entity: { label: 'Entity', icon: '•' },
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value));
}

function formatInteger(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('en').format(Number(value));
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

function formatRelativeTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units = [
    ['year', 1000 * 60 * 60 * 24 * 365],
    ['month', 1000 * 60 * 60 * 24 * 30],
    ['day', 1000 * 60 * 60 * 24],
    ['hour', 1000 * 60 * 60],
    ['minute', 1000 * 60],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'minute') {
      const valueForUnit = Math.round(diff / ms);
      return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(valueForUnit, unit);
    }
  }
  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(input = '') {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function sourceMeta(source) {
  return SOURCE_META[source] || {
    label: source ? String(source) : 'Unknown',
    tone: 'source-system',
    icon: '·',
  };
}

function entityTypeMeta(type) {
  return ENTITY_TYPE_META[type] || {
    label: type ? String(type) : 'Entity',
    icon: '•',
  };
}

function normalizeLatLng(entity) {
  const lat = entity?.lat ?? entity?.latitude ?? entity?.geo?.lat ?? entity?.coordinates?.lat;
  const lng = entity?.lng ?? entity?.lon ?? entity?.longitude ?? entity?.geo?.lng ?? entity?.coordinates?.lng;
  if (lat === undefined || lng === undefined) return null;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return null;
  return { lat: latNum, lng: lngNum };
}

function latLngToVector3(lat, lng, radius = 1) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function initialsFromName(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '•';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function inferEntityTitle(entity) {
  return entity?.title
    || entity?.name
    || entity?.display_name
    || entity?.full_name
    || entity?.login
    || entity?.label
    || 'Untitled entity';
}

function inferEntitySubtitle(entity) {
  return entity?.subtitle
    || entity?.description
    || entity?.headline
    || entity?.typeLabel
    || entity?.sourceLabel
    || null;
}

function inferEntityId(entity) {
  return entity?.id
    || entity?.key
    || entity?.slug
    || entity?.url
    || `${entity?.source || 'entity'}:${inferEntityTitle(entity)}`;
}

function inferEntityType(entity) {
  return entity?.entityType
    || entity?.type
    || entity?.kind
    || 'entity';
}

function inferEntitySource(entity) {
  return entity?.source || entity?.provider || 'system';
}

function inferEntityUrl(entity) {
  return entity?.url || entity?.html_url || entity?.external_url || entity?.canonical_url || null;
}

function inferEntityDescription(entity) {
  return entity?.description
    || entity?.summary
    || entity?.abstract
    || entity?.bio
    || entity?.display_name
    || null;
}

function inferEntityStats(entity) {
  const stats = [];
  if (entity?.stargazers_count !== undefined) stats.push({ label: 'Stars', value: formatNumber(entity.stargazers_count) });
  if (entity?.forks_count !== undefined) stats.push({ label: 'Forks', value: formatNumber(entity.forks_count) });
  if (entity?.watchers_count !== undefined) stats.push({ label: 'Watchers', value: formatNumber(entity.watchers_count) });
  if (entity?.open_issues_count !== undefined) stats.push({ label: 'Open issues', value: formatNumber(entity.open_issues_count) });
  if (entity?.cited_by_count !== undefined) stats.push({ label: 'Citations', value: formatNumber(entity.cited_by_count) });
  if (entity?.works_count !== undefined) stats.push({ label: 'Works', value: formatNumber(entity.works_count) });
  if (entity?.relevance_score !== undefined) stats.push({ label: 'Relevance', value: Number(entity.relevance_score).toFixed(2) });
  if (entity?.importance !== undefined) stats.push({ label: 'Importance', value: Number(entity.importance).toFixed(2) });
  if (entity?.population !== undefined) stats.push({ label: 'Population', value: formatInteger(entity.population) });
  return stats.slice(0, 6);
}

function inferEntityFacts(entity) {
  const facts = [];
  if (entity?.language) facts.push({ label: 'Language', value: entity.language });
  if (entity?.license?.spdx_id || entity?.license?.name) facts.push({ label: 'License', value: entity.license?.spdx_id || entity.license?.name });
  if (entity?.host_venue?.display_name) facts.push({ label: 'Venue', value: entity.host_venue.display_name });
  if (entity?.country_code) facts.push({ label: 'Country', value: String(entity.country_code).toUpperCase() });
  if (entity?.type) facts.push({ label: 'Type', value: entity.type });
  if (entity?.visibility) facts.push({ label: 'Visibility', value: entity.visibility });
  if (entity?.affiliation) facts.push({ label: 'Affiliation', value: entity.affiliation });
  if (entity?.location_name) facts.push({ label: 'Location', value: entity.location_name });
  return facts.slice(0, 8);
}

function inferEntityTags(entity) {
  const tags = [];
  if (Array.isArray(entity?.topics)) {
    entity.topics.slice(0, 6).forEach((topic) => {
      if (typeof topic === 'string') tags.push(topic);
      else if (topic?.display_name) tags.push(topic.display_name);
      else if (topic?.name) tags.push(topic.name);
    });
  }
  if (Array.isArray(entity?.keywords)) {
    entity.keywords.slice(0, 6).forEach((keyword) => {
      if (typeof keyword === 'string') tags.push(keyword);
      else if (keyword?.display_name) tags.push(keyword.display_name);
    });
  }
  if (Array.isArray(entity?.fields_of_study)) {
    entity.fields_of_study.slice(0, 4).forEach((field) => tags.push(field));
  }
  if (entity?.language) tags.push(entity.language);
  return [...new Set(tags)].slice(0, 8);
}

function inferTimelineEvents(entity) {
  if (Array.isArray(entity?.timeline) && entity.timeline.length) return entity.timeline;
  const events = [];
  if (entity?.created_at) {
    events.push({
      type: 'created',
      title: 'Entity created',
      timestamp: entity.created_at,
      detail: entity?.source === 'github' ? 'Repository or account creation recorded.' : 'First observed in source dataset.',
    });
  }
  if (entity?.updated_at) {
    events.push({
      type: 'updated',
      title: 'Last updated',
      timestamp: entity.updated_at,
      detail: 'Most recent upstream metadata update.',
    });
  }
  if (entity?.published_date || entity?.publication_date) {
    events.push({
      type: 'published',
      title: 'Published',
      timestamp: entity.published_date || entity.publication_date,
      detail: entity?.host_venue?.display_name ? `Published via ${entity.host_venue.display_name}.` : 'Publication event.',
    });
  }
  if (entity?.last_known_event) {
    events.push(entity.last_known_event);
  }
  return events.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
}

function createEmptyState(title, body) {
  const wrap = el('div', 'panel-empty');
  wrap.append(
    el('h3', 'panel-empty-title', title),
    el('p', 'panel-empty-body', body),
  );
  return wrap;
}

function createSourceBadge(source) {
  const meta = sourceMeta(source);
  const badge = el('span', `source-badge ${meta.tone}`);
  badge.innerHTML = `<span class="source-badge__icon">${meta.icon}</span><span class="source-badge__label">${meta.label}</span>`;
  return badge;
}

function createEntityChip(entity) {
  const type = entityTypeMeta(inferEntityType(entity));
  const chip = el('span', 'entity-chip');
  chip.innerHTML = `<span class="entity-chip__icon">${type.icon}</span><span class="entity-chip__label">${type.label}</span>`;
  return chip;
}

function createMetric(label, value) {
  const item = el('div', 'metric');
  item.append(
    el('div', 'metric__label', label),
    el('div', 'metric__value', value),
  );
  return item;
}

function createFactRow(label, value) {
  const row = el('div', 'fact-row');
  row.append(
    el('div', 'fact-row__label', label),
    el('div', 'fact-row__value', value),
  );
  return row;
}

function createTag(text) {
  return el('span', 'tag', text);
}

function createTimelineItem(event) {
  const item = el('article', 'timeline-item');
  const header = el('div', 'timeline-item__header');
  const title = el('div', 'timeline-item__title', event.title || 'Event');
  const time = el('time', 'timeline-item__time', formatDate(event.timestamp));
  if (event.timestamp) time.dateTime = new Date(event.timestamp).toISOString();
  header.append(title, time);

  item.append(
    el('div', `timeline-item__dot timeline-item__dot--${event.type || 'default'}`),
    header,
  );

  if (event.detail) {
    item.append(el('p', 'timeline-item__detail', event.detail));
  }

  return item;
}

function createResultCard(result, options = {}) {
  const {
    onSelect,
    activeId,
  } = options;

  const source = inferEntitySource(result);
  const title = inferEntityTitle(result);
  const subtitle = inferEntitySubtitle(result);
  const id = inferEntityId(result);
  const description = inferEntityDescription(result);
  const stats = inferEntityStats(result);
  const card = el('button', 'result-card');
  card.type = 'button';
  card.dataset.entityId = id;
  card.dataset.source = source;
  if (activeId && activeId === id) card.classList.add('is-active');

  const top = el('div', 'result-card__top');
  const titleWrap = el('div', 'result-card__title-wrap');
  titleWrap.append(
    el('div', 'result-card__eyebrow', subtitle || entityTypeMeta(inferEntityType(result)).label),
    el('div', 'result-card__title', title),
  );
  top.append(titleWrap, createSourceBadge(source));

  card.append(top);

  const meta = el('div', 'result-card__meta');
  meta.append(createEntityChip(result));

  const relative = formatRelativeTime(result?.updated_at || result?.created_at || result?.published_date);
  if (relative) meta.append(el('span', 'result-card__meta-pill', relative));

  const coords = normalizeLatLng(result);
  if (coords) meta.append(el('span', 'result-card__meta-pill', `${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}`));

  card.append(meta);

  if (description) {
    card.append(el('p', 'result-card__description', description));
  }

  if (stats.length) {
    const metrics = el('div', 'result-card__metrics');
    stats.slice(0, 3).forEach((stat) => metrics.append(createMetric(stat.label, stat.value)));
    card.append(metrics);
  }

  card.addEventListener('click', () => {
    if (typeof onSelect === 'function') onSelect(result);
  });

  return card;
}

function createEntityListItem(entity, options = {}) {
  const {
    onSelect,
    activeId,
  } = options;

  const id = inferEntityId(entity);
  const title = inferEntityTitle(entity);
  const subtitle = inferEntitySubtitle(entity);
  const source = inferEntitySource(entity);
  const type = entityTypeMeta(inferEntityType(entity));
  const item = el('button', 'entity-list-item');
  item.type = 'button';
  item.dataset.entityId = id;
  if (activeId && activeId === id) item.classList.add('is-active');

  const avatar = el('div', 'entity-list-item__avatar', initialsFromName(title));
  avatar.style.setProperty('--entity-hue', String(hashString(id) % 360));

  const body = el('div', 'entity-list-item__body');
  const row = el('div', 'entity-list-item__row');
  row.append(
    el('div', 'entity-list-item__title', title),
    createSourceBadge(source),
  );

  const meta = el('div', 'entity-list-item__meta');
  meta.append(
    el('span', 'entity-list-item__type', `${type.icon} ${type.label}`),
  );
  if (subtitle) meta.append(el('span', 'entity-list-item__subtitle', subtitle));

  body.append(row, meta);

  item.append(avatar, body);

  item.addEventListener('click', () => {
    if (typeof onSelect === 'function') onSelect(entity);
  });

  return item;
}

export class SearchResultsRenderer {
  constructor(root, options = {}) {
    this.root = typeof root === 'string' ? document.querySelector(root) : root;
    this.onSelect = options.onSelect || null;
    this.activeId = null;
    this.results = [];
    this.query = '';
    this.loading = false;
    this.error = null;
    this.summary = null;

    if (!this.root) {
      throw new Error('SearchResultsRenderer root element not found.');
    }

    this.root.classList.add('search-results-panel');
    this.header = el('div', 'panel-section__header');
    this.title = el('div', 'panel-section__title', 'Search results');
    this.meta = el('div', 'panel-section__meta', 'Awaiting query');
    this.header.append(this.title, this.meta);

    this.body = el('div', 'search-results-panel__body');
    this.root.append(this.header, this.body);

    this.render();
  }

  setLoading(query = '') {
    this.loading = true;
    this.error = null;
    this.query = query;
    this.summary = null;
    this.render();
  }

  setError(message, query = this.query) {
    this.loading = false;
    this.error = message || 'Search failed.';
    this.query = query;
    this.render();
  }

  setResults(results = [], options = {}) {
    this.loading = false;
    this.error = null;
    this.results = Array.isArray(results) ? results : [];
    this.query = options.query ?? this.query;
    this.summary = options.summary ?? null;
    if (options.activeId !== undefined) this.activeId = options.activeId;