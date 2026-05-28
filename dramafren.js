const DRAMAFREN_SITES = [
  { title: "DramaBox", value: "https://dramabox.dramafren.org/", lang: "en" },
  { title: "GoodShort", value: "https://goodshort.dramafren.org/", lang: "en" },
  { title: "NetShort", value: "https://netshort.dramafren.org/", lang: "en" },
  { title: "FlickReels", value: "https://flickreels.dramafren.org/", lang: "en" },
  { title: "StarDustTV", value: "https://stardusttv.dramafren.org/", lang: "en" },
  { title: "DramaWave", value: "https://dramawave.dramafren.org/", lang: "en" },
  { title: "ShortMax", value: "https://shortmax.dramafren.org/", lang: "en" },
  { title: "ReelShort", value: "https://reelshort.dramafren.org/", lang: "en" },
  { title: "iDrama", value: "https://idrama.dramafren.org/", lang: "en" },
  { title: "FlexTV", value: "https://flextv.dramafren.org/", lang: "en" },
  { title: "StarShort", value: "https://starshort.dramafren.org/", lang: "3" },
  { title: "KalosTV", value: "https://kalostv.dramafren.org/", lang: "en" },
  { title: "DramaBite", value: "https://dramabite.dramafren.org/", lang: "en" },
  { title: "DramaPops", value: "https://dramapops.dramafren.org/", lang: "en" },
  { title: "MicroDrama", value: "https://microdrama.dramafren.org/", lang: "en" },
  { title: "ShortWave", value: "https://shortwave.dramafren.org/", lang: "en" },
  { title: "TvSeries", value: "https://tvseries.dramafren.org/", lang: "en" },
  { title: "MoboReels", value: "https://moboreels.dramafren.org/", lang: "en" },
];

WidgetMetadata = {
  id: "forward.dramafren.shortdrama",
  title: "DramaFren Short Dramas",
  description: "Browse, search, and play DramaFren short drama sites.",
  author: "Kristen / Codex",
  site: "https://dramabox.dramafren.org/",
  version: "1.0.3",
  requiredVersion: "0.0.1",
  detailCacheDuration: 300,
  modules: [
    {
      id: "dramafren_categories",
      title: "DramaFren Categories",
      functionName: "loadDramafrenCategory",
      cacheDuration: 1800,
      params: [
        {
          name: "site",
          title: "Category",
          type: "enumeration",
          value: "https://netshort.dramafren.org/",
          enumOptions: DRAMAFREN_SITES.map((site) => ({
            title: site.title,
            value: site.value,
          })),
        },
        {
          name: "lang",
          title: "Language",
          type: "input",
          value: "auto",
          description: "Use auto for each site's default language. StarShort English is 3.",
        },
        { name: "page", title: "Page", type: "page" },
      ],
    },
  ],
  search: {
    title: "DramaFren Search",
    functionName: "searchDramafren",
    params: [
      {
        name: "site",
        title: "Category",
        type: "enumeration",
        value: "https://netshort.dramafren.org/",
        enumOptions: DRAMAFREN_SITES.map((site) => ({
          title: site.title,
          value: site.value,
        })),
      },
      { name: "lang", title: "Language", type: "input", value: "auto" },
    ],
  },
};

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function getSite(value) {
  const normalized = String(value || "").replace(/\/+$/, "") + "/";
  return DRAMAFREN_SITES.find((site) => site.value === normalized) || DRAMAFREN_SITES[0];
}

function getLang(site, lang) {
  return lang && lang !== "auto" ? lang : site.lang;
}

function getHtml(response) {
  return typeof response?.data === "string"
    ? response.data
    : JSON.stringify(response?.data || "");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(baseUrl, path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function extractAttr(html, name) {
  const match = String(html || "").match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function getUrlFromValue(value) {
  const raw = typeof value === "string"
    ? value
    : value?.link || value?.url || value?.videoUrl || value?.id || "";
  const text = decodeHtml(String(raw || "").trim());
  const direct = text.match(/https?:\/\/.+/i);
  return direct ? direct[0] : "";
}

async function requestHtml(url, referer) {
  const response = await Widget.http.get(url, {
    headers: { ...DEFAULT_HEADERS, Referer: referer || url },
    timeout: 15000,
  });
  return getHtml(response);
}

function createLinkItem(site, link, title, posterPath, description, extra = {}) {
  return {
    id: link,
    type: "link",
    title,
    posterPath,
    coverUrl: posterPath,
    backdropPath: posterPath,
    mediaType: "tv",
    genreTitle: site.title,
    description: description || site.title,
    link,
    ...extra,
  };
}

function parseCards(html, site) {
  const items = [];
  const seen = new Set();
  const cardRegex = /<a\b[^>]*href=["']([^"']*index\.php\?[^"']*page=detail[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const link = absoluteUrl(site.value, decodeHtml(match[1]));
    if (!link || seen.has(link)) continue;
    seen.add(link);

    const body = match[2];
    const title =
      stripHtml((body.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i) || [])[1]) ||
      decodeHtml(extractAttr(body, "alt")) ||
      (new URL(link).searchParams.get("slug") || "").replace(/-/g, " ");
    const posterPath = absoluteUrl(site.value, decodeHtml(extractAttr(body, "src")));

    if (title) {
      items.push(createLinkItem(site, link, title, posterPath, site.title));
    }
  }

  return items;
}

async function loadDramafrenCategory(params = {}) {
  const site = getSite(params.site);
  const page = parseInt(params.page || 1, 10);
  const url = page > 1
    ? `${site.value}index.php?page=home&p_hist=${page}`
    : site.value;
  const html = await requestHtml(url, site.value);
  return parseCards(html, site);
}

async function searchDramafren(params = {}) {
  const keyword = params.keyword || params.q || params.title || params.search || "";
  if (!String(keyword).trim()) return [];

  const site = getSite(params.site);
  const lang = getLang(site, params.lang);
  const url = `${site.value}index.php?page=search_result&q=${encodeURIComponent(keyword)}&lang=${encodeURIComponent(lang)}`;
  const html = await requestHtml(url, site.value);
  return hydratePlayableItems(parseCards(html, site), 6);
}

async function hydratePlayableItems(items, limit = 6) {
  const hydrated = [];

  for (const item of items.slice(0, limit)) {
    try {
      hydrated.push(await loadDetail(item.link || item));
    } catch (error) {
      console.error("Unable to hydrate playable item", error);
      hydrated.push(item);
    }
  }

  return hydrated.concat(items.slice(limit));
}

function parseDetail(html, link) {
  const url = new URL(link);
  const site = getSite(url.origin + "/");
  const title =
    stripHtml((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) ||
    stripHtml((html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i) || [])[1]);
  const posterPath =
    decodeHtml((html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i) || [])[1]) ||
    decodeHtml(extractAttr((html.match(/<img\b[^>]*Poster[^>]*>/i) || [])[0], "src"));
  const description =
    decodeHtml((html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)/i) || [])[1]) ||
    stripHtml((html.match(/<p\b[^>]*class=["'][^"']*leading-relaxed[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1]);

  const episodes = parseEpisodes(html, link, title, posterPath);
  const detailItem = createLinkItem(site, link, title, posterPath, description, {
    childItems: episodes,
    episodeItems: episodes,
    playerType: "system",
  });

  return detailItem;
}

function parseEpisodes(html, detailLink, seriesTitle, posterPath) {
  const url = new URL(detailLink);
  const site = getSite(url.origin + "/");
  const episodes = [];
  const seen = new Set();
  const episodeRegex = /<a\b[^>]*href=["']([^"']*index\.php\?[^"']*page=watch[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = episodeRegex.exec(html)) !== null) {
    const link = absoluteUrl(site.value, decodeHtml(match[1]));
    if (!link || seen.has(link)) continue;
    seen.add(link);

    const episode = parseInt(
      new URL(link).searchParams.get("ep") ||
        new URL(link).searchParams.get("episode") ||
        (stripHtml(match[2]).match(/\d+/) || [])[0] ||
        "0",
      10
    );
    const title = episode ? `Ep ${episode}` : stripHtml(match[2]);

    episodes.push(createLinkItem(site, link, title, posterPath, `${seriesTitle} - ${title}`, {
      episode: episode || undefined,
      playerType: "system",
    }));
  }

  return episodes.sort((a, b) => (a.episode || 0) - (b.episode || 0));
}

function parseWatch(html, link) {
  const pageUrl = new URL(link);
  const site = getSite(pageUrl.origin + "/");
  const sourceUrl = absoluteUrl(site.value, extractSourceUrl(html));
  const episode = parseInt(
    pageUrl.searchParams.get("ep") || pageUrl.searchParams.get("episode") || "0",
    10
  );
  const title =
    stripHtml((html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i) || [])[1]) ||
    stripHtml((html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i) || [])[1]) ||
    site.title;
  const posterPath =
    decodeHtml((html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i) || [])[1]) ||
    decodeHtml(extractAttr((html.match(/<video\b[^>]*>/i) || [])[0], "poster"));

  if (!sourceUrl) {
    return {
      id: link,
      type: "link",
      title: "No playable source found",
      description: "The watch page did not expose a sourceUrl.",
      link,
    };
  }

  return {
    id: sourceUrl,
    type: "url",
    title: episode ? `${title} - Ep ${episode}` : title,
    description: site.title,
    posterPath,
    backdropPath: posterPath,
    mediaType: "tv",
    genreTitle: site.title,
    episode: episode || undefined,
    videoUrl: sourceUrl,
    url: sourceUrl,
    link,
    playerType: "system",
    headers: {
      Referer: link,
      "User-Agent": DEFAULT_HEADERS["User-Agent"],
    },
  };
}

function extractSourceUrl(html) {
  const sourceMatch = html.match(/sourceUrl\s*=\s*["']([^"']+)["']/i);
  if (sourceMatch) return decodeHtml(sourceMatch[1]);

  const scriptSrcMatch =
    html.match(/\b(?:var|let|const)\s+src\s*=\s*["']([^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/i) ||
    html.match(/\bproxyRescueSrc\s*=\s*["']([^"']+)["']/i);
  if (scriptSrcMatch) return decodeHtml(scriptSrcMatch[1]);

  const videoSrc =
    html.match(/<source\b[^>]*src=["']([^"']+)["']/i) ||
    html.match(/<video\b[^>]*src=["']([^"']+)["']/i);
  if (videoSrc) return decodeHtml(videoSrc[1]);

  const qualityMatch = html.match(/["']url["']\s*:\s*["']([^"']+)["']/i);
  if (qualityMatch) return decodeHtml(qualityMatch[1]).replace(/\\\//g, "/");

  const serverMatch = html.match(/\bserverUrl\d*\s*=\s*["']([^"']+)["']/i);
  if (serverMatch) return decodeHtml(serverMatch[1]).replace(/\\\//g, "/");

  const mediaMatch = html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/i);
  return mediaMatch ? decodeHtml(mediaMatch[1]) : "";
}

function applyPlayableEpisode(detail, playableEpisode) {
  if (!detail || !playableEpisode?.videoUrl) return detail;

  detail.videoUrl = playableEpisode.videoUrl;
  detail.url = playableEpisode.videoUrl;
  detail.headers = playableEpisode.headers;
  detail.playerType = "system";

  if (Array.isArray(detail.childItems) && detail.childItems.length) {
    detail.childItems[0] = {
      ...detail.childItems[0],
      ...playableEpisode,
      title: detail.childItems[0].title || playableEpisode.title,
      description: detail.childItems[0].description || playableEpisode.description,
    };
  }

  detail.episodeItems = detail.childItems;
  return detail;
}

async function loadDetail(link) {
  const target = getUrlFromValue(link);
  if (!target) {
    throw new Error("Missing detail link");
  }

  const html = await requestHtml(target, target);
  if (/[?&]page=watch/i.test(target)) {
    return parseWatch(html, target);
  }

  const detail = parseDetail(html, target);
  const firstEpisodeLink = detail.childItems?.[0]?.link;
  if (firstEpisodeLink && !detail.videoUrl) {
    try {
      const firstEpisodeHtml = await requestHtml(firstEpisodeLink, target);
      const firstEpisode = parseWatch(firstEpisodeHtml, firstEpisodeLink);
      if (firstEpisode?.videoUrl) {
        applyPlayableEpisode(detail, firstEpisode);
      }
    } catch (error) {
      console.error("Unable to preload first episode", error);
    }
  }

  return detail;
}
