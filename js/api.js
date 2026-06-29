const DEFAULT_TIMEOUT = 12000;
const DEFAULT_HEADERS = {
  Accept: 'application/json',
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toQueryString(params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== '') {
          search.append(key, String(item));
        }
      });
      return;
    }

    search.set(key, String(value));
  });

  return search.toString();
}

function withQuery(path, params) {
  const query = toQueryString(params);
  return query ? `${path}?${query}` : path;
}

function normalizeError(error, context = {}) {
  if (error?.name === 'AbortError') {
    return {
      name: 'AbortError',
      message: 'Request timed out',
      status: 408,
      context,
      cause: error,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Request failed',
      status: error.status || 500,
      context,
      cause: error,
    };
  }

  return {
    name: 'Error',
    message: 'Unknown request failure',
    status: 500,
    context,
    cause: error,
  };
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = DEFAULT_TIMEOUT,
    signal,
    credentials = 'same-origin',
  } = options;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);

  const signals = [controller.signal, signal].filter(Boolean);
  let activeSignal = controller.signal;

  if (signals.length > 1 && typeof AbortSignal !== 'undefined' && AbortSignal.any) {
    activeSignal = AbortSignal.any(signals);
  } else if (signal) {
    if (signal.aborted) {
      window.clearTimeout(timer);
      throw normalizeError(new DOMException('Aborted', 'AbortError'), { url, method });
    }

    signal.addEventListener(
      'abort',
      () => {
        controller.abort();
      },
      { once: true },
    );
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...DEFAULT_HEADERS,
        ...headers,
      },
      body,
      credentials,
      signal: activeSignal,
    });

    const payload = await parseResponse(response);

    if (!response.ok) {
      const message =
        (isObject(payload) && (payload.detail || payload.error || payload.message)) ||
        response.statusText ||
        'Request failed';

      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      error.url = url;
      throw error;
    }

    return payload;
  } catch (error) {
    throw normalizeError(error, { url, method });
  } finally {
    window.clearTimeout(timer);
  }
}

function createApiClient({ baseUrl = '/api' } = {}) {
  const root = baseUrl.replace(/\/+$/, '');

  const get = (path, params, options = {}) => request(`${root}${withQuery(path, params)}`, options);

  const post = (path, data, options = {}) =>
    request(`${root}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: JSON.stringify(data ?? {}),
      ...options,
    });

  return {
    async health(options = {}) {
      return get('/health', undefined, options);
    },

    catalog: {
      async list(params = {}, options = {}) {
        return get('/catalog', params, options);
      },

      async sources(options = {}) {
        return get('/catalog/sources', undefined, options);
      },

      async entity(entityId, options = {}) {
        return get(`/catalog/entity/${encodeURIComponent(entityId)}`, undefined, options);
      },
    },

    search: {
      async omnibar(query, options = {}) {
        const q = typeof query === 'string' ? query.trim() : '';
        return get('/search', { q }, options);
      },

      async github(query, options = {}) {
        return get('/search/github', { q: query }, options);
      },

      async openalex(query, options = {}) {
        return get('/search/openalex', { q: query }, options);
      },

      async nominatim(query, options = {}) {
        return get('/search/nominatim', { q: query }, options);
      },

      async suggest(query, options = {}) {
        return get('/search/suggest', { q: query }, options);
      },
    },

    graph: {
      async related(params = {}, options = {}) {
        return get('/graph/related', params, options);
      },

      async expand(seed, options = {}) {
        return post('/graph/expand', seed, options);
      },

      async neighborhood(entityId, params = {}, options = {}) {
        return get(`/graph/entity/${encodeURIComponent(entityId)}`, params, options);
      },

      async globe(params = {}, options = {}) {
        return get('/graph/globe', params, options);
      },
    },

    trail: {
      async list(params = {}, options = {}) {
        return get('/trail', params, options);
      },

      async append(entry, options = {}) {
        return post('/trail', entry, options);
      },

      async clear(options = {}) {
        return post('/trail/clear', {}, options);
      },
    },
  };
}

export const api = createApiClient();

function normalizeGitHubItem(item) {
  const owner = item?.owner?.login || item?.owner || null;
  const repoName = item?.full_name || item?.name || null;
  const stars = item?.stargazers_count ?? item?.watchers_count ?? null;
  const updatedAt = item?.updated_at || item?.pushed_at || item?.created_at || null;

  return {
    id: item?.node_id || item?.id || repoName,
    source: 'github',
    kind: item?.kind || 'repository',
    title: repoName || item?.name || 'Untitled repository',
    subtitle: owner ? `GitHub · ${owner}` : 'GitHub',
    description: item?.description || '',
    url: item?.html_url || item?.url || '',
    score: item?.score ?? stars ?? 0,
    meta: {
      owner,
      language: item?.language || null,
      stars,
      forks: item?.forks_count ?? null,
      openIssues: item?.open_issues_count ?? null,
      license: item?.license?.spdx_id || item?.license?.name || null,
      updatedAt,
      topics: Array.isArray(item?.topics) ? item.topics : [],
    },
    raw: item,
  };
}

function normalizeOpenAlexItem(item) {
  const authors = Array.isArray(item?.authorships)
    ? item.authorships
        .map((entry) => entry?.author?.display_name)
        .filter(Boolean)
        .slice(0, 4)
    : [];

  const concepts = Array.isArray(item?.concepts)
    ? item.concepts
        .map((concept) => concept?.display_name)
        .filter(Boolean)
        .slice(0, 5)
    : [];

  return {
    id: item?.id || item?.ids?.openalex || item?.doi || item?.display_name,
    source: 'openalex',
    kind: item?.type || 'work',
    title: item?.display_name || item?.title || 'Untitled work',
    subtitle: authors.length ? `OpenAlex · ${authors.join(', ')}` : 'OpenAlex',
    description: item?.abstract || '',
    url: item?.primary_location?.landing_page_url || item?.id || '',
    score: item?.cited_by_count ?? item?.relevance_score ?? 0,
    meta: {
      publicationYear: item?.publication_year ?? null,
      citedBy: item?.cited_by_count ?? null,
      type: item?.type || null,
      doi: item?.doi || item?.ids?.doi || null,
      venue:
        item?.primary_location?.source?.display_name ||
        item?.host_venue?.display_name ||
        null,
      authors,
      concepts,
    },
    raw: item,
  };
}

function normalizeNominatimItem(item) {
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);

  return {
    id: item?.place_id || item?.osm_id || item?.display_name,
    source: 'nominatim',
    kind: item?.type || 'place',
    title: item?.name || item?.display_name?.split(',')[0] || 'Unnamed place',
    subtitle: item?.display_name || 'Nominatim',
    description: item?.class ? `${item.class} · ${item.type || 'location'}` : '',
    url: item?.licence ? 'https://nominatim.openstreetmap.org/' : '',
    score: item?.importance ?? 0,
    meta: {
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      category: item?.class || null,
      type: item?.type || null,
      addressType: item?.addresstype || null,
      country: item?.address?.country || null,
      countryCode: item?.address?.country_code || null,
    },
    raw: item,
  };
}

export function normalizeOmnibarResults(payload) {
  if (!payload) {
    return {
      query: '',
      total: 0,
      groups: [],
      items: [],
    };
  }

  const query = payload.query || payload.q || '';
  const githubItems = Array.isArray(payload.github?.items)
    ? payload.github.items.map(normalizeGitHubItem)
    : Array.isArray(payload.github)
      ? payload.github.map(normalizeGitHubItem)
      : [];

  const openAlexItems = Array.isArray(payload.openalex?.results)
    ? payload.openalex.results.map(normalizeOpenAlexItem)
    : Array.isArray(payload.openalex)
      ? payload.openalex.map(normalizeOpenAlexItem)
      : [];

  const nominatimItems = Array.isArray(payload.nominatim)
    ? payload.nominatim.map(normalizeNominatimItem)
    : Array.isArray(payload.nominatim?.results)
      ? payload.nominatim.results.map(normalizeNominatimItem)
      : [];

  const groups = [
    {
      key: 'github',
      label: 'GitHub',
      items: githubItems,
    },
    {
      key: 'openalex',
      label: 'OpenAlex',
      items: openAlexItems,
    },
    {
      key: 'nominatim',
      label: 'Places',
      items: nominatimItems,
    },
  ].filter((group) => group.items.length > 0);

  const items = groups.flatMap((group) => group.items);

  return {
    query,
    total: items.length,
    groups,
    items,
  };
}

export function normalizeGraphPayload(payload) {
  const nodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
  const links = Array.isArray(payload?.links) ? payload.links : [];

  return {
    nodes: nodes.map((node, index) => ({
      id: node.id ?? `node-${index}`,
      label: node.label || node.name || node.title || `Entity ${index + 1}`,
      kind: node.kind || node.type || 'entity',
      source: node.source || 'derived',
      lat: Number.isFinite(Number(node.lat)) ? Number(node.lat) : null,
      lon: Number.isFinite(Number(node.lon)) ? Number(node.lon) : null,
      size: Number.isFinite(Number(node.size)) ? Number(node.size) : 1,
      intensity: Number.isFinite(Number(node.intensity)) ? Number(node.intensity) : 0.7,
      color: node.color || null,
      meta: isObject(node.meta) ? node.meta : {},
      raw: node,
    })),
    links: links.map((link, index) => ({
      id: link.id ?? `link-${index}`,
      source: link.source,
      target: link.target,
      weight: Number.isFinite(Number(link.weight)) ? Number(link.weight) : 1,
      kind: link.kind || link.type || 'related',
      color: link.color || null,
      raw: link,
    })),
  };
}

export function normalizeTrailPayload(payload) {
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload)
      ? payload
      : [];

  return items.map((entry, index) => ({
    id: entry.id ?? `trail-${index}`,
    type: entry.type || 'event',
    title: entry.title || entry.label || 'Untitled event',
    description: entry.description || '',
    timestamp: entry.timestamp || entry.created_at || entry.time || null,
    entityId: entry.entityId || entry.entity_id || null,
    source: entry.source || null,
    meta: isObject(entry.meta) ? entry.meta : {},
    raw: entry,
  }));
}

export function createSearchSession(client = api) {
  let controller = null;
  let sequence = 0;

  return {
    cancel() {
      if (controller) {
        controller.abort();
        controller = null;
      }
    },

    async run(query, options = {}) {
      const current = ++sequence;

      if (controller) {
        controller.abort();
      }

      controller = new AbortController();

      try {
        const payload = await client.search.omnibar(query, {
          ...options,
          signal: controller.signal,
        });

        if (current !== sequence) {
          return null;
        }

        return normalizeOmnibarResults(payload);
      } finally {
        if (current === sequence) {
          controller = null;
        }
      }
    },
  };
}

export default api;