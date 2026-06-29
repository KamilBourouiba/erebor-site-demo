const DEFAULT_BASE_URL = (() => {
  if (typeof window === "undefined") return "";
  const explicit = window.EREBOR_API_BASE_URL;
  if (typeof explicit === "string") return explicit.replace(/\/+$/, "");
  const { origin, hostname, port } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${window.location.protocol}//${hostname}${port === "8000" ? "" : ":8000"}`;
  }
  return origin.replace(/\/+$/, "");
})();

const DEFAULT_TIMEOUT = 12000;
const SEARCH_LIMIT = 8;
const TIMELINE_LIMIT = 40;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function compact(parts, separator = " · ") {
  return parts.filter(Boolean).join(separator);
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function relativeTime(input) {
  const date = input ? new Date(input) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const delta = date.getTime() - Date.now();
  const abs = Math.abs(delta);
  const units = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["week", 1000 * 60 * 60 * 24 * 7],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
  ];
  for (const [unit, size] of units) {
    if (abs >= size) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        Math.round(delta / size),
        unit
      );
    }
  }
  return "just now";
}

function titleCase(value) {
  return safeString(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function hashString(input = "") {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function sourceColor(source) {
  switch (source) {
    case "github":
      return "#4fc0de";
    case "openalex":
      return "#c9871d";
    case "nominatim":
      return "#7dd3a7";
    default:
      return "#9aabc2";
  }
}

function sourceLabel(source) {
  switch (source) {
    case "github":
      return "GitHub";
    case "openalex":
      return "OpenAlex";
    case "nominatim":
      return "Nominatim";
    default:
      return titleCase(source);
  }
}

function makeId(source, type, rawId) {
  return `${source}:${type}:${String(rawId)}`;
}

function buildUrl(baseUrl, path, params) {
  const url = new URL(path, `${baseUrl || ""}/`);
  if (params && isObject(params)) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      if (Array.isArray(value)) {
        value.forEach((entry) => url.searchParams.append(key, String(entry)));
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "api_error";
    this.details = options.details ?? null;
    this.url = options.url ?? "";
  }
}

export class EreborApiClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.headers = {
      Accept: "application/json",
      ...(options.headers || {}),
    };
    this.cache = new Map();
  }

  setBaseUrl(baseUrl) {
    this.baseUrl = safeString(baseUrl).replace(/\/+$/, "");
  }

  clearCache(prefix = "") {
    if (!prefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  async request(path, options = {}) {
    const {
      method = "GET",
      params,
      body,
      headers,
      timeout = this.timeout,
      cacheKey,
      cacheTtl = 0,
      signal,
    } = options;

    const url = buildUrl(this.baseUrl, path, params);

    if (cacheKey && cacheTtl > 0) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }
    }

    const controller = new AbortController();
    const timer = timeout
      ? setTimeout(() => controller.abort(new DOMException("Request timeout", "AbortError")), timeout)
      : null;

    const onAbort = () => controller.abort(new DOMException("Request aborted", "AbortError"));
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...this.headers,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(headers || {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const payload = await parseResponse(response);

      if (!response.ok) {
        throw new ApiError(
          payload?.detail || payload?.message || `Request failed with status ${response.status}`,
          {
            status: response.status,
            code: payload?.code || "http_error",
            details: payload,
            url,
          }
        );
      }

      if (cacheKey && cacheTtl > 0) {
        this.cache.set(cacheKey, {
          value: payload,
          expiresAt: Date.now() + cacheTtl,
        });
      }

      return payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error?.name === "AbortError") {
        throw new ApiError("Request aborted", {
          status: 0,
          code: "aborted",
          details: null,
          url,
        });
      }
      throw new ApiError(error?.message || "Network request failed", {
        status: 0,
        code: "network_error",
        details: error,
        url,
      });
    } finally {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  }

  async health(signal) {
    return this.request("api/health", {
      signal,
      cacheKey: "health",
      cacheTtl: 10_000,
    });
  }

  async search(query, options = {}) {
    const q = safeString(query).trim();
    if (!q) {
      return {
        query: "",
        total: 0,
        results: [],
        groups: [],
      };
    }

    const limit = clamp(safeNumber(options.limit, SEARCH_LIMIT), 1, 20);
    const payload = await this.request("api/search", {
      params: {
        q,
        limit,
      },
      signal: options.signal,
      cacheKey: `search:${q}:${limit}`,
      cacheTtl: 30_000,
    });

    return normalizeSearchPayload(payload, q, limit);
  }

  async entity(entityId, options = {}) {
    if (!entityId) {
      throw new ApiError("Entity id is required", {
        code: "invalid_entity_id",
      });
    }

    const payload = await this.request(`api/entity/${encodeURIComponent(entityId)}`, {
      signal: options.signal,
      cacheKey: `entity:${entityId}`,
      cacheTtl: 60_000,
    });

    return normalizeEntityPayload(payload, entityId);
  }

  async graph(seed, options = {}) {
    const entityId = typeof seed === "string" ? seed : seed?.id;
    if (!entityId) {
      throw new ApiError("Graph seed is required", {
        code: "invalid_graph_seed",
      });
    }

    const depth = clamp(safeNumber(options.depth, 1), 1, 3);
    const limit = clamp(safeNumber(options.limit, 24), 4, 80);

    const payload = await this.request("api/graph", {
      params: {
        seed: entityId,
        depth,
        limit,
      },
      signal: options.signal,
      cacheKey: `graph:${entityId}:${depth}:${limit}`,
      cacheTtl: 45_000,
    });

    return normalizeGraphPayload(payload, entityId);
  }

  async trail(seed, options = {}) {
    const entityId = typeof seed === "string" ? seed : seed?.id;
    if (!entityId) {
      throw new ApiError("Trail seed is required", {
        code: "invalid_trail_seed",
      });
    }

    const limit = clamp(safeNumber(options.limit, TIMELINE_LIMIT), 1, 100);

    const payload = await this.request("api/trail", {
      params: {
        seed: entityId,
        limit,
      },
      signal: options.signal,
      cacheKey: `trail:${entityId}:${limit}`,
      cacheTtl: 30_000,
    });

    return normalizeTrailPayload(payload, entityId);
  }

  async catalog(options = {}) {
    const payload = await this.request("api/catalog", {
      signal: options.signal,
      cacheKey: "catalog",
      cacheTtl: 300_000,
    });

    return normalizeCatalogPayload(payload);
  }

  async hydrateInvestigation(entityId, options = {}) {
    const [entity, graph, trail] = await Promise.all([
      this.entity(entityId, options),
      this.graph(entityId, options),
      this.trail(entityId, options),
    ]);

    return {
      entity,
      graph,
      trail,
    };
  }
}

export const api = new EreborApiClient();

export function createApiClient(options = {}) {
  return new EreborApiClient(options);
}

export function normalizeSearchPayload(payload, query = "", limit = SEARCH_LIMIT) {
  const rawResults = toArray(payload?.results);
  const results = rawResults
    .map((item) => normalizeSearchResult(item))
    .filter(Boolean)
    .slice(0, limit);

  const groupsMap = new Map();
  for (const result of results) {
    const key = result.source;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        key,
        label: sourceLabel(key),
        color: sourceColor(key),
        count: 0,
        results: [],
      });
    }
    const group = groupsMap.get(key);
    group.count += 1;
    group.results.push(result);
  }

  return {
    query,
    total: safeNumber(payload?.total, results.length),
    tookMs: safeNumber(payload?.took_ms, 0),
    results,
    groups: Array.from(groupsMap.values()),
    raw: payload,
  };
}

export function normalizeSearchResult(item) {
  if (!item || !item.source) return null;

  const source = safeString(item.source).toLowerCase();
  if (source === "github") return normalizeGitHubSearchResult(item);
  if (source === "openalex") return normalizeOpenAlexSearchResult(item);
  if (source === "nominatim") return normalizeNominatimSearchResult(item);

  const id = safeString(item.id || item.key || item.url || cryptoRandomFallback());
  return {
    id: makeId(source, safeString(item.type, "entity"), id),
    source,
    sourceLabel: sourceLabel(source),
    type: safeString(item.type, "entity"),
    title: safeString(item.title || item.name || item.label, "Untitled"),
    subtitle: safeString(item.subtitle || item.description || ""),
    description: safeString(item.description || ""),
    url: safeString(item.url || item.html_url || ""),
    score: safeNumber(item.score, 0),
    badges: toArray(item.badges),
    meta: item,
    coordinates: normalizeCoordinates(item),
  };
}

function normalizeGitHubSearchResult(item) {
  const owner = safeString(item.owner?.login || item.owner || "");
  const repo = safeString(item.name || item.repo || item.full_name || "");
  const fullName = safeString(item.full_name || compact([owner, repo], "/"));
  const type = safeString(item.type || "repository").toLowerCase();
  const description = safeString(item.description || "");
  const stars = safeNumber(item.stargazers_count || item.stars, 0);
  const language = safeString(item.language || "");
  const updatedAt = normalizeDate(item.updated_at);
  const rawId = item.id || fullName || item.html_url;

  return {
    id: makeId("github", type, rawId),
    source: "github",
    sourceLabel: "GitHub",
    type,
    title: fullName || repo || owner || "GitHub Entity",
    subtitle: compact([
      language,
      stars ? `${stars.toLocaleString()}★` : "",
      updatedAt ? relativeTime(updatedAt) : "",
    ]),
    description,
    url: safeString(item.html_url || item.url || ""),
    score: safeNumber(item.score, 0),
    badges: [type, language].filter(Boolean),
    meta: {
      owner,
      repo,
      fullName,
      stars,
      language,
      updatedAt,
      topics: toArray(item.topics),
      license: item.license?.spdx_id || item.license?.name || "",
      visibility: item.visibility || "",
    },
    coordinates: normalizeCoordinates(item),
  };
}

function normalizeOpenAlexSearchResult(item) {
  const type = safeString(item.type || "work").toLowerCase();
  const title = safeString(item.display_name || item.title || "OpenAlex Work");
  const year = item.publication_year || item.from_publication_date?.slice?.(0, 4);
  const cited = safeNumber(item.cited_by_count, 0);
  const authors = toArray(item.authorships)
    .slice(0, 3)
    .map((entry) => safeString(entry.author?.display_name))
    .filter(Boolean);
  const venue =
    safeString(item.primary_location?.source?.display_name) ||
    safeString(item.host_venue?.display_name) ||
    "";
  const rawId = item.id || item.ids?.openalex || title;

  return {
    id: makeId("openalex", type, rawId),
    source: "openalex",
    sourceLabel: "OpenAlex",
    type,
    title,
    subtitle: compact([
      authors.length ? authors.join(", ") : "",
      venue,
      year ? String(year) : "",
    ]),
    description: compact([
      cited ? `${cited.toLocaleString()} citations` : "",
      safeString(item.abstract_inverted_index ? "Abstract indexed" : ""),
    ]),
    url: safeString(item.id || item.primary_location?.landing_page_url || ""),
    score: safeNumber(item.relevance_score || item.score, 0),
    badges: [type, year ? String(year) : ""].filter(Boolean),
    meta: {
      year: year ? Number(year) : null,
      citedByCount: cited,
      authors,
      venue,
      doi: item.ids?.doi || "",
      concepts: toArray(item.concepts)
        .slice(0, 5)
        .map((concept) => safeString(concept.display_name))
        .filter(Boolean),
    },
    coordinates: normalizeCoordinates(item),
  };
}

function normalizeNominatimSearchResult(item) {
  const type = safeString(item.type || item.addresstype || "place").toLowerCase();
  const title = safeString(item.display_name || item.name || "Place");
  const lat = safeNumber(item.lat, NaN);
  const lon = safeNumber(item.lon, NaN);
  const className = safeString(item.class || "");
  const importance = safeNumber(item.importance, 0);
  const rawId = item.place_id || item.osm_id || title;

  return {
    id: makeId("nominatim", type, rawId),
    source: "nominatim",
    sourceLabel: "Nominatim",
    type,
    title,
    subtitle: compact([
      safeString(item.address?.city || item.address?.town || item.address?.country || ""),
      className,
    ]),
    description: Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(4)}, ${lon.toFixed(4)}` : "",
    url: safeString(item.osm_url || item.licence || ""),
    score: importance,
    badges: [type, safeString(item.address?.country_code || "").toUpperCase()].filter(Boolean),
    meta: {
      placeId: item.place_id || null,
      osmId: item.osm_id || null,
      osmType: item.osm_type || "",
      className,
      importance,
      address: item.address || {},
      boundingBox: toArray(item.boundingbox),
    },
    coordinates: Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null,
  };
}

export function normalizeEntityPayload(payload, fallbackId = "") {
  const entity = payload?.entity || payload;
  const source = safeString(entity?.source || inferSourceFromId(fallbackId) || "unknown").toLowerCase();
  const type = safe