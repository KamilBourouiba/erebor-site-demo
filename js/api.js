const DEFAULT_TIMEOUT = 12000;
const DEFAULT_LIMIT = 8;

const API_BASE = (() => {
  if (typeof window === "undefined") return "";
  const configured = window.EREBOR_API_BASE;
  if (typeof configured === "string" && configured.trim()) {
    return configured.replace(/\/+$/, "");
  }
  return "";
})();

const SOURCE_META = {
  github: {
    key: "github",
    label: "GitHub",
    accent: "#7db9ff",
    icon: "GH",
    entityType: "repository",
  },
  openalex: {
    key: "openalex",
    label: "OpenAlex",
    accent: "#8fd3a7",
    icon: "OA",
    entityType: "work",
  },
  nominatim: {
    key: "nominatim",
    label: "Nominatim",
    accent: "#f2c879",
    icon: "NM",
    entityType: "place",
  },
};

function buildUrl(path, params = {}) {
  const base = API_BASE || "";
  const url = new URL(`${base}${path}`, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  if (!API_BASE && typeof window !== "undefined") {
    return `${url.pathname}${url.search}`;
  }
  return url.toString();
}

async function request(path, { params, method = "GET", headers, signal, body, timeout = DEFAULT_TIMEOUT } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new DOMException("Request timed out", "AbortError")), timeout);
  const compositeSignal = mergeAbortSignals(signal, controller.signal);

  try {
    const response = await fetch(buildUrl(path, params), {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: compositeSignal,
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      const message =
        (payload && typeof payload === "object" && (payload.detail || payload.error || payload.message)) ||
        response.statusText ||
        "Request failed";
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

function mergeAbortSignals(...signals) {
  const validSignals = signals.filter(Boolean);
  if (!validSignals.length) return undefined;
  if (validSignals.length === 1) return validSignals[0];

  const controller = new AbortController();
  const onAbort = (event) => {
    const source = event?.target;
    controller.abort(source?.reason);
    validSignals.forEach((sig) => sig.removeEventListener("abort", onAbort));
  };

  validSignals.forEach((sig) => {
    if (sig.aborted) {
      controller.abort(sig.reason);
      return;
    }
    sig.addEventListener("abort", onAbort, { once: true });
  });

  return controller.signal;
}

function clampLimit(limit, fallback = DEFAULT_LIMIT) {
  const value = Number(limit);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.max(Math.round(value), 1), 25);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function hashString(input) {
  const text = String(input || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededUnit(seed, offset = 0) {
  const x = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function seededLatLon(seedText) {
  const seed = hashString(seedText);
  const lat = seededUnit(seed, 1) * 140 - 70;
  const lon = seededUnit(seed, 2) * 360 - 180;
  return { lat, lon };
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatRelativeBucket(dateValue) {
  const date = dateValue ? new Date(dateValue) : null;
  if (!date || Number.isNaN(date.getTime())) return "Undated";
  return date.toISOString().slice(0, 10);
}

function compactNumber(value) {
  if (!Number.isFinite(Number(value))) return null;
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceMeta(key) {
  return SOURCE_META[key] || {
    key,
    label: key,
    accent: "#7db9ff",
    icon: key.slice(0, 2).toUpperCase(),
    entityType: "entity",
  };
}

function normalizeGitHubRepo(repo) {
  const coords = seededLatLon(repo.full_name || repo.name);
  return {
    id: `github:${repo.id || repo.full_name || slugify(repo.name)}`,
    source: "github",
    type: "repository",
    title: repo.full_name || repo.name || "Untitled repository",
    subtitle: repo.description || repo.language || "GitHub repository",
    summary: repo.description || "No description provided.",
    url: repo.html_url,
    externalUrl: repo.html_url,
    score: repo.stargazers_count || 0,
    stats: {
      stars: repo.stargazers_count ?? 0,
      forks: repo.forks_count ?? 0,
      watchers: repo.watchers_count ?? 0,
      issues: repo.open_issues_count ?? 0,
      language: repo.language || null,
    },
    owner: repo.owner
      ? {
          login: repo.owner.login,
          avatarUrl: repo.owner.avatar_url,
          url: repo.owner.html_url,
        }
      : null,
    tags: [repo.language, ...(repo.topics || [])].filter(Boolean),
    timestamps: {
      createdAt: normalizeDate(repo.created_at),
      updatedAt: normalizeDate(repo.updated_at),
      pushedAt: normalizeDate(repo.pushed_at),
    },
    geo: coords,
    raw: repo,
  };
}

function normalizeOpenAlexWork(work) {
  const title = work.display_name || work.title || "Untitled work";
  const authors = toArray(work.authorships)
    .map((entry) => entry?.author?.display_name)
    .filter(Boolean);
  const institution = toArray(work.authorships)
    .flatMap((entry) => toArray(entry.institutions))
    .find((inst) => inst?.display_name);

  const coords = institution?.geo
    ? {
        lat: Number(institution.geo.latitude),
        lon: Number(institution.geo.longitude),
      }
    : seededLatLon(work.id || title);

  return {
    id: `openalex:${work.id || slugify(title)}`,
    source: "openalex",
    type: "work",
    title,
    subtitle: authors.slice(0, 3).join(", ") || work.primary_location?.source?.display_name || "Research work",
    summary: work.abstract_inverted_index
      ? reconstructAbstract(work.abstract_inverted_index)
      : work.primary_location?.source?.display_name || "OpenAlex indexed work",
    url: work.id,
    externalUrl: work.primary_location?.landing_page_url || work.doi || work.id,
    score: work.cited_by_count || 0,
    stats: {
      citations: work.cited_by_count ?? 0,
      year: work.publication_year ?? null,
      type: work.type || null,
      openAccess: work.open_access?.is_oa ?? null,
      authors: authors.length,
    },
    authors,
    institution: institution
      ? {
          name: institution.display_name,
          country: institution.country_code || null,
        }
      : null,
    tags: [work.type, work.primary_topic?.display_name, ...(work.concepts || []).slice(0, 4).map((c) => c.display_name)].filter(Boolean),
    timestamps: {
      publishedAt: normalizeDate(work.publication_date || `${work.publication_year || ""}-01-01`),
      updatedAt: normalizeDate(work.updated_date),
    },
    geo: coords,
    raw: work,
  };
}

function reconstructAbstract(index) {
  const positions = [];
  Object.entries(index || {}).forEach(([word, slots]) => {
    toArray(slots).forEach((slot) => {
      positions[slot] = word;
    });
  });
  return positions.filter(Boolean).slice(0, 48).join(" ");
}

function normalizeNominatimPlace(place) {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  const title = place.display_name?.split(",")[0] || place.name || "Unknown place";
  return {
    id: `nominatim:${place.place_id || slugify(place.display_name || title)}`,
    source: "nominatim",
    type: "place",
    title,
    subtitle: place.display_name || place.type || "Geocoded place",
    summary: place.display_name || "OpenStreetMap place result",
    url: place.osm_type && place.osm_id ? `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}` : null,
    externalUrl: place.osm_type && place.osm_id ? `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}` : null,
    score: Number(place.importance) || 0,
    stats: {
      category: place.category || null,
      type: place.type || null,
      importance: place.importance ?? null,
    },
    address: place.address || null,
    tags: [place.type, place.category, place.addresstype].filter(Boolean),
    timestamps: {
      indexedAt: null,
    },
    geo: {
      lat: Number.isFinite(lat) ? lat : 0,
      lon: Number.isFinite(lon) ? lon : 0,
    },
    raw: place,
  };
}

function normalizeSearchEnvelope(source, items, query) {
  const meta = sourceMeta(source);
  return {
    source,
    meta,
    query,
    count: items.length,
    items,
  };
}

export async function searchCatalog(query, options = {}) {
  const q = String(query || "").trim();
  if (!q) {
    return {
      query: "",
      total: 0,
      groups: [],
      items: [],
    };
  }

  const limit = clampLimit(options.limit);
  const sources = toArray(options.sources).length ? options.sources : ["github", "openalex", "nominatim"];
  const signal = options.signal;

  const tasks = sources.map(async (source) => {
    try {
      if (source === "github") {
        const payload = await request("/api/search/github", {
          params: { q, limit },
          signal,
          timeout: options.timeout,
        });
        const items = uniqueBy(toArray(payload.items).map(normalizeGitHubRepo), (item) => item.id);
        return normalizeSearchEnvelope(source, items, q);
      }

      if (source === "openalex") {
        const payload = await request("/api/search/openalex", {
          params: { q, limit },
          signal,
          timeout: options.timeout,
        });
        const items = uniqueBy(toArray(payload.results || payload.items).map(normalizeOpenAlexWork), (item) => item.id);
        return normalizeSearchEnvelope(source, items, q);
      }

      if (source === "nominatim") {
        const payload = await request("/api/search/nominatim", {
          params: { q, limit },
          signal,
          timeout: options.timeout,
        });
        const items = uniqueBy(toArray(payload.items || payload).map(normalizeNominatimPlace), (item) => item.id);
        return normalizeSearchEnvelope(source, items, q);
      }

      return normalizeSearchEnvelope(source, [], q);
    } catch (error) {
      return {
        source,
        meta: sourceMeta(source),
        query: q,
        count: 0,
        items: [],
        error,
      };
    }
  });

  const groups = await Promise.all(tasks);
  const items = groups.flatMap((group) => group.items);
  const ranked = rankUnifiedResults(items, q);

  return {
    query: q,
    total: ranked.length,
    groups,
    items: ranked,
  };
}

function rankUnifiedResults(items, query) {
  const q = query.toLowerCase();
  return [...items]
    .map((item) => {
      const title = item.title?.toLowerCase() || "";
      const subtitle = item.subtitle?.toLowerCase() || "";
      const summary = item.summary?.toLowerCase() || "";
      let relevance = Number(item.score) || 0;

      if (title.includes(q)) relevance += 100;
      if (subtitle.includes(q)) relevance += 40;
      if (summary.includes(q)) relevance += 20;
      if (title.startsWith(q)) relevance += 30;

      return { ...item, relevance };
    })
    .sort((a, b) => b.relevance - a.relevance);
}

export async function fetchEntityInspector(entity, options = {}) {
  if (!entity) return null;

  const source = entity.source || inferSourceFromId(entity.id);
  if (source === "github") {
    return fetchGitHubInspector(entity, options);
  }
  if (source === "openalex") {
    return fetchOpenAlexInspector(entity, options);
  }
  if (source === "nominatim") {
    return fetchNominatimInspector(entity, options);
  }

  return {
    entity,
    sections: [],
    links: [],
    timeline: buildInvestigationTimeline(entity),
  };
}

async function fetchGitHubInspector(entity, options) {
  const signal = options.signal;
  const fullName = entity.raw?.full_name || entity.title;
  const [readme, contributors, activity] = await Promise.allSettled([
    request("/api/github/readme", {
      params: { repo: fullName },
      signal,
      timeout: options.timeout,
    }),
    request("/api/github/contributors", {
      params: { repo: fullName, limit: 6 },
      signal,
      timeout: options.timeout,
    }),
    request("/api/github/activity", {
      params: { repo: fullName, limit: 12 },
      signal,
      timeout: options.timeout,
    }),
  ]);

  const sections = [
    {
      id: "overview",
      title: "Repository",
      kind: "facts",
      items: [
        fact("Owner", entity.owner?.login),
        fact("Language", entity.stats?.language),
        fact("Stars", compactNumber(entity.stats?.stars)),
        fact("Forks", compactNumber(entity.stats?.forks)),
        fact("Open issues", compactNumber(entity.stats?.issues)),
        fact("Updated", entity.timestamps?.updatedAt ? new Date(entity.timestamps.updatedAt).toLocaleString() : null),
      ].filter(Boolean),
    },
  ];

  if (readme.status === "fulfilled" && readme.value?.content) {
    sections.push({
      id: "readme",
      title: "README",
      kind: "markdown",
      content: readme.value.content,
    });
  }

  if (contributors.status === "fulfilled") {
    sections.push({
      id: "contributors",
      title: "Contributors",
      kind: "list",
      items: toArray(contributors.value.items || contributors.value).map((person) => ({
        label: person.login,
        value: compactNumber(person.contributions),
        href: person.html_url,
        avatarUrl: person.avatar_url,
      })),
    });
  }

  const timeline = buildInvestigationTimeline(entity, activity.status === "fulfilled" ? activity.value.items || activity.value : []);
  const links = buildGitHubGraph(entity, contributors.status === "fulfilled" ? contributors.value.items || contributors.value : []);

  return { entity, sections, links, timeline };
}

async function fetchOpenAlexInspector(entity, options) {
  const signal = options.signal;
  const workId = entity.raw?.id || entity.url;
  const related = await Promise.allSettled([
    request("/api/openalex/related", {
      params: { id: workId, limit: 8 },
      signal,
      timeout: options.timeout,
    }),
  ]);

  const sections = [
    {
      id: "overview",
      title: "Publication",
      kind: "facts",
      items: [
        fact("Type", entity.stats?.type),
        fact("Year", entity.stats?.year),
        fact("Citations", compactNumber(entity.stats?.citations)),
        fact("Authors", compactNumber(entity.stats?.authors)),
        fact("Institution", entity.institution?.name),
      ].filter(Boolean),
    },
    entity.authors?.length
      ? {
          id: "authors",
          title: "Authors",
          kind: "list",
          items: entity.authors.map((author) => ({ label: author })),
        }
      : null,
  ].filter(Boolean);

  const relatedItems =
    related[0]?.status === "fulfilled"
      ? toArray(related[0].value.results || related[0].value.items).map(normalizeOpenAlexWork)
      : [];

  const links = buildOpenAlexGraph(entity, relatedItems);
  const timeline = buildInvestigationTimeline(entity, relatedItems);

  return { entity, sections, links, timeline };
}

async function fetchNominatimInspector(entity) {
  const sections = [
    {
      id: "overview",
      title: "Location",
      kind: "facts",
      items: [
        fact("Category", entity.stats?.category),
        fact("Type", entity.stats?.type),
        fact("Latitude", entity.geo?.lat?.toFixed?.(4)),
        fact("Longitude", entity.geo?.lon?.toFixed?.(4)),
      ].filter(Boolean