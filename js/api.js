const DEFAULT_TIMEOUT = 12000;
const DEFAULT_LIMIT = 8;

const SOURCE_META = {
  github: {
    id: "github",
    label: "GitHub",
    color: "#63d6ff",
    accent: "rgba(99, 214, 255, 0.18)",
    type: "code"
  },
  openalex: {
    id: "openalex",
    label: "OpenAlex",
    color: "#8ef0c9",
    accent: "rgba(142, 240, 201, 0.18)",
    type: "research"
  },
  nominatim: {
    id: "nominatim",
    label: "Nominatim",
    color: "#f7c66b",
    accent: "rgba(247, 198, 107, 0.18)",
    type: "geo"
  }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, max = 220) {
  const text = normalizeText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(value) {
  const date = parseDate(value);
  return date ? date.toISOString() : null;
}

function scoreText(query, text) {
  const q = normalizeText(query).toLowerCase();
  const t = normalizeText(text).toLowerCase();
  if (!q || !t) return 0;
  if (t === q) return 1;
  if (t.startsWith(q)) return 0.92;
  if (t.includes(q)) return 0.78;
  const qTokens = q.split(" ").filter(Boolean);
  if (!qTokens.length) return 0;
  const hits = qTokens.reduce((acc, token) => acc + (t.includes(token) ? 1 : 0), 0);
  return hits / qTokens.length * 0.62;
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined && entry !== null && entry !== "") {
          search.append(key, String(entry));
        }
      });
      return;
    }
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

function withTimeout(signal, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "AbortError")), timeout);

  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else {
      signal.addEventListener(
        "abort",
        () => controller.abort(signal.reason),
        { once: true }
      );
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
    }
  };
}

async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function createError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

export class EreborApiClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ?? "/api";
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.headers = {
      Accept: "application/json",
      ...(options.headers || {})
    };
  }

  async request(path, options = {}) {
    const {
      method = "GET",
      params,
      body,
      headers,
      signal,
      timeout = this.timeout
    } = options;

    const url = `${this.baseUrl}${path}${buildQuery(params)}`;
    const timeoutHandle = withTimeout(signal, timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...this.headers,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(headers || {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: timeoutHandle.signal
      });

      const payload = await parseJsonSafe(response);

      if (!response.ok) {
        throw createError(
          payload?.detail || payload?.message || `Request failed with ${response.status}`,
          {
            status: response.status,
            payload,
            url
          }
        );
      }

      return payload;
    } finally {
      timeoutHandle.cleanup();
    }
  }

  async health(options = {}) {
    return this.request("/health", options);
  }

  async searchCatalog(query, options = {}) {
    const q = normalizeText(query);
    if (!q) {
      return {
        query: "",
        took: 0,
        total: 0,
        results: [],
        sources: []
      };
    }

    const limit = clamp(Number(options.limit ?? DEFAULT_LIMIT), 1, 24);
    const started = performance.now();

    const tasks = [
      this.searchGitHub(q, { ...options, limit }),
      this.searchOpenAlex(q, { ...options, limit }),
      this.searchNominatim(q, { ...options, limit: clamp(Math.ceil(limit / 2), 1, 10) })
    ];

    const settled = await Promise.allSettled(tasks);
    const sourcePayloads = settled.map((entry, index) => {
      const sourceId = ["github", "openalex", "nominatim"][index];
      if (entry.status === "fulfilled") {
        return {
          source: sourceId,
          ok: true,
          total: entry.value.total ?? entry.value.results?.length ?? 0,
          error: null
        };
      }
      return {
        source: sourceId,
        ok: false,
        total: 0,
        error: entry.reason?.message || "Source unavailable"
      };
    });

    const results = settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value.results : []));
    const ranked = uniqueBy(
      results
        .map((item) => ({
          ...item,
          score: item.score ?? this.rankEntity(q, item)
        }))
        .sort((a, b) => b.score - a.score || (b.updatedAt ? Date.parse(b.updatedAt) || 0 : 0) - (a.updatedAt ? Date.parse(a.updatedAt) || 0 : 0)),
      (item) => item.id
    ).slice(0, limit * 3);

    return {
      query: q,
      took: Math.round(performance.now() - started),
      total: ranked.length,
      results: ranked,
      sources: sourcePayloads
    };
  }

  rankEntity(query, entity) {
    const titleScore = scoreText(query, entity.title);
    const subtitleScore = scoreText(query, entity.subtitle);
    const summaryScore = scoreText(query, entity.summary);
    const tagScore = toArray(entity.tags).reduce((acc, tag) => Math.max(acc, scoreText(query, tag)), 0);
    return titleScore * 0.5 + subtitleScore * 0.2 + summaryScore * 0.2 + tagScore * 0.1;
  }

  async searchGitHub(query, options = {}) {
    const limit = clamp(Number(options.limit ?? DEFAULT_LIMIT), 1, 24);
    const payload = await this.request("/search/github", {
      params: {
        q: query,
        per_page: limit
      },
      signal: options.signal,
      timeout: options.timeout
    });

    const items = toArray(payload?.items);
    const results = items.map((repo) => normalizeGitHubRepo(repo, query));
    return {
      source: "github",
      total: payload?.total_count ?? results.length,
      results
    };
  }

  async searchOpenAlex(query, options = {}) {
    const limit = clamp(Number(options.limit ?? DEFAULT_LIMIT), 1, 24);
    const payload = await this.request("/search/openalex", {
      params: {
        search: query,
        per_page: limit
      },
      signal: options.signal,
      timeout: options.timeout
    });

    const items = toArray(payload?.results);
    const results = items.map((work) => normalizeOpenAlexWork(work, query));
    return {
      source: "openalex",
      total: payload?.meta?.count ?? results.length,
      results
    };
  }

  async searchNominatim(query, options = {}) {
    const limit = clamp(Number(options.limit ?? 5), 1, 12);
    const payload = await this.request("/search/nominatim", {
      params: {
        q: query,
        limit
      },
      signal: options.signal,
      timeout: options.timeout
    });

    const items = Array.isArray(payload) ? payload : toArray(payload?.results);
    const results = items.map((place) => normalizeNominatimPlace(place, query));
    return {
      source: "nominatim",
      total: results.length,
      results
    };
  }

  async getEntity(entityRef, options = {}) {
    const ref = parseEntityRef(entityRef);
    if (!ref) throw createError("Invalid entity reference");

    switch (ref.source) {
      case "github":
        return this.getGitHubEntity(ref, options);
      case "openalex":
        return this.getOpenAlexEntity(ref, options);
      case "nominatim":
        return this.getNominatimEntity(ref, options);
      default:
        throw createError(`Unsupported source: ${ref.source}`);
    }
  }

  async getGitHubEntity(ref, options = {}) {
    const repoPath = ref.remoteId || ref.slug;
    if (!repoPath) throw createError("Missing GitHub repository identifier");

    const [repo, contributors, commits, readme] = await Promise.allSettled([
      this.request(`/entity/github/${encodeURIComponent(repoPath)}`, options),
      this.request(`/entity/github/${encodeURIComponent(repoPath)}/contributors`, {
        params: { per_page: 8 },
        signal: options.signal,
        timeout: options.timeout
      }),
      this.request(`/entity/github/${encodeURIComponent(repoPath)}/commits`, {
        params: { per_page: 8 },
        signal: options.signal,
        timeout: options.timeout
      }),
      this.request(`/entity/github/${encodeURIComponent(repoPath)}/readme`, options)
    ]);

    if (repo.status !== "fulfilled") throw repo.reason;

    return normalizeGitHubEntity({
      repo: repo.value,
      contributors: contributors.status === "fulfilled" ? contributors.value : [],
      commits: commits.status === "fulfilled" ? commits.value : [],
      readme: readme.status === "fulfilled" ? readme.value : null
    });
  }

  async getOpenAlexEntity(ref, options = {}) {
    const workId = ref.remoteId || ref.slug;
    if (!workId) throw createError("Missing OpenAlex work identifier");

    const payload = await this.request(`/entity/openalex/${encodeURIComponent(workId)}`, options);
    return normalizeOpenAlexEntity(payload);
  }

  async getNominatimEntity(ref, options = {}) {
    const placeId = ref.remoteId || ref.slug;
    if (!placeId) throw createError("Missing Nominatim place identifier");

    const payload = await this.request(`/entity/nominatim/${encodeURIComponent(placeId)}`, options);
    return normalizeNominatimEntity(payload);
  }

  async getGraph(seed, options = {}) {
    const ref = parseEntityRef(seed);
    const payload = await this.request("/graph", {
      params: {
        source: ref?.source,
        id: ref?.remoteId || ref?.slug || seed?.id || seed
      },
      signal: options.signal,
      timeout: options.timeout
    });

    return normalizeGraph(payload, seed);
  }

  async getTrail(seed, options = {}) {
    const ref = parseEntityRef(seed);
    const payload = await this.request("/trail", {
      params: {
        source: ref?.source,
        id: ref?.remoteId || ref?.slug || seed?.id || seed
      },
      signal: options.signal,
      timeout: options.timeout
    });

    return normalizeTrail(payload, seed);
  }

  async hydrateInvestigation(seed, options = {}) {
    const [entity, graph, trail] = await Promise.allSettled([
      this.getEntity(seed, options),
      this.getGraph(seed, options),
      this.getTrail(seed, options)
    ]);

    if (entity.status !== "fulfilled") throw entity.reason;

    return {
      entity: entity.value,
      graph: graph.status === "fulfilled" ? graph.value : fallbackGraphFromEntity(entity.value),
      trail: trail.status === "fulfilled" ? trail.value : fallbackTrailFromEntity(entity.value)
    };
  }
}

export function createApiClient(options = {}) {
  return new EreborApiClient(options);
}

export function getSourceMeta(source) {
  return SOURCE_META[source] || {
    id: source,
    label: source,
    color: "#8ea0b8",
    accent: "rgba(142, 160, 184, 0.18)",
    type: "unknown"
  };
}

export function parseEntityRef(input) {
  if (!input) return null;

  if (typeof input === "string") {
    const value = input.trim();
    if (!value) return null;

    if (value.includes(":")) {
      const [source, ...rest] = value.split(":");
      const remoteId = rest.join(":");
      return {
        source,
        remoteId,
        slug: remoteId,
        id: `${source}:${remoteId}`
      };
    }

    return {
      source: null,
      remoteId: value,
      slug: value,
      id: value
    };
  }

  if (isObject(input)) {
    const source = input.source || input.provider || null;
    const remoteId = input.remoteId || input.slug || input.key || input.externalId || input.id;
    return {
      ...input,
      source,
      remoteId,
      slug: input.slug || remoteId,
      id: input.id || (source && remoteId ? `${source}:${remoteId}` : remoteId)
    };
  }

  return null;
}

export function normalizeGraph(payload, seed = null) {
  const nodes = uniqueBy(
    toArray(payload?.nodes).map((node, index) => normalizeGraphNode(node, index)),
    (node) => node.id
  );

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const links = toArray(payload?.links)
    .map((link, index) => normalizeGraphLink(link, index))
    .filter((link) => nodeMap.has(link.source) && nodeMap.has(link.target));

  if (!nodes.length && seed) {
    return fallbackGraphFromEntity(seed);
  }

  return {
    nodes,
    links,
    stats: {
      nodeCount: nodes.length,
      linkCount: links.length
    }
  };
}

export function normalizeTrail(payload, seed = null) {
  const events = uniqueBy(
    toArray(payload?.events)
      .map((event, index) => normalizeTrailEvent(event, index))
      .sort((a, b) => {
        const aTime = a.timestamp ? Date.parse(a.timestamp) || 0 : 0;
        const bTime = b.timestamp ? Date.parse(b.timestamp) || 0 : 0;
        return bTime - aTime;
      }),
    (event) => event.id
  );

  if (!events.length && seed) {
    return fallbackTrailFromEntity(seed);
  }

  return {
    events,
    stats: {
      count: events.length
    }
  };
}

export function fallbackGraphFromEntity(entity) {
  const normalized = isObject(entity) && entity.kind === "entity" ? entity : normalizeLooseEntity(entity);
  const rootId = normalized.id || "seed";
  const nodes = [
    {
      id: rootId,
      label: normalized.title || "Entity",
      source: normalized.source || "unknown",
      type: normalized.type || "entity",
      size: 1.4,
      importance: 1,
      lat: normalized.geo?.lat ?? 0,
      lng: normalized.geo?.lng ?? 0,
      color: getSourceMeta(normalized.source).color,
      data: normalized
    }
  ];

  const links = [];
  const related = toArray(normalized.related).slice(0, 8);

  related.forEach((item, index) => {
    const id = item.id || `${rootId}:related:${index}`;
    nodes.push({
      id,
      label: item.title || item.label || `Related ${index + 1}`,
      source: item.source || normalized.source || "unknown",
      type: item.type || "related",
      size: 0.8,
      importance: 0.55,
      lat: item.geo?.lat ?? spreadLat(index),
      lng: item.geo?.lng ?? spreadLng(index),
      color: getSourceMeta(item.source || normalized.source).color,
      data: item
    });
    links.push({
      id: `${rootId}->${id}`,
      source: rootId,
      target: id,
      label: item.relationship || "related",
      weight: 0.5 + (related.length - index) / Math.max(related.length, 1) * 0.3,
      curvature: 0.18 + (index % 3) * 0.06,
      color: getSourceMeta(item.source || normalized.source).color
    });
  });

  return {
    nodes,
    links,
    stats: {
      nodeCount: nodes.length,
      linkCount: links.length
    }
  };
}

export function fallbackTrailFromEntity(entity) {
  const normalized = isObject(entity) && entity.kind === "entity" ? entity : normalizeLooseEntity(entity);
  const events = [];

  if (normalized.createdAt) {
    events.push({
      id: `${normalized.id}:created`,
      timestamp: normalized.createdAt,
      title: "Entity created",
      summary: normalized.title,
      category: "origin",
      source: normalized.source
    });