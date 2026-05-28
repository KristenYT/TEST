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
  description: "Browse, search, and play DramaFren short drama sites such as NetShort and StarShort.",
  author: "Kristen / Codex",
  site: "https://dramabox.dramafren.org/",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  detailCacheDuration: 300,
  modules: [
    {
      id: "dramafren_categories",
      title: "DramaFren 分类",
      functionName: "loadDramafrenCategory",
      cacheDuration: 1800,
      params: [
        {
          name: "site",
          title: "分类",
          type: "enumeration",
          value: "https://netshort.dramafren.org/",
          enumOptions: DRAMAFREN_SITES.map(site => ({ title: site.title, value: site.value }))
        },
        {
          name: "lang",
          title: "语言",
          type: "input",
          value: "auto",
          description: "auto 使用各站默认语言；DramaBox/NetShort 可用 en、zh、zh_TW 等，StarShort 英文为 3、中文为 1/2。"
        },
        { name: "page", title: "页码", type: "page" }
      ]
    }
  ],
  search: {
    title: "DramaFren 搜索",
    functionName: "searchDramafren",
    params: [
      {
        name: "site",
        title: "分类",
        type: "enumeration",
        value: "https://netshort.dramafren.org/",
        enumOptions: DRAMAFREN_SITES.map(site => ({ title: site.title, value: site.value }))
      },
      {
        name: "lang",
        title: "语言",
        type: "input",
        value: "auto"
      }
    ]
  }
};

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

function getSite(value) {
  const normalized = `${value || ""}`.replace(/\/+$/, "") + "/";
  return DRAMAFREN_SITES.find(site => site.value === normalized) || DRAMAFREN_SITES[0];
}

function getLang(site, lang) {
  return lang && lang !== "auto" ? lang : site.lang;
}

function getHtml(response) {
  return typeof response?.data === "string" ? response.data : JSON.stringify(response?.data || "");
}

function decodeHtml(value) {
  return `${value || ""}`
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(value) {
  return decodeHtml(`${value || ""}`.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(baseUrl, path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function extractAttr(html, name) {
  const match = `${html || ""}`.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function slugFromLink(link) {
  return new URL(link).searchParams.get("slug") || "";
}

function makeId(siteTitle, link) {
  return `${siteTitle}:${link}`;
}

function parseCards(html, site) {
  const items = [];
  const seen = new Set();
  const cardRegex = /<a\b[^>]*href=["']([^"']*index\.php\?[^"']*page=detail[^"']*)["'][^>]*>([\s\S]*?)<\/a>/ig;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const link = absoluteUrl(site.value, decodeHtml(match[1]));
    if (seen.has(link)) continue;
    seen.add(link);

    const body = match[2];
    const title = stripHtml((body.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i) || [])[1]) ||
      decodeHtml(extractAttr(body, "alt")) ||
      slugFromLink(link).replace(/-/g, " ");
    const posterPath = decodeHtml(extractAttr(body, "src"));

    if (!title || !link) continue;
    items.push({
      id: makeId(site.title, link),
      type: "link",
      title,
      posterPath,
      mediaType: "tv",
      genreTitle: site.title,
      link,
      description: site.title
    });
  }

  return items;
}

async function requestHtml(url, referer) {
  const response = await Widget.http.get(url, {
    headers: { ...DEFAULT_HEADERS, Referer: referer || url },
    timeout: 15000
  });
  return getHtml(response);
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
  if (!`${keyword}`.trim()) return [];

  const site = getSite(params.site);
  const lang = getLang(site, params.lang);
  const url = `${site.value}index.php?page=search_result&q=${encodeURIComponent(keyword)}&lang=${encodeURIComponent(lang)}`;
  const html = await requestHtml(url, site.value);
  return parseCards(html, site);
}

function parseDetail(html, link) {
  const url = new URL(link);
  const site = getSite(url.origin + "/");
  const title = stripHtml((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) ||
    stripHtml((html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i) || [])[1]);
  const posterPath = decodeHtml((html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i) || [])[1]) ||
    decodeHtml(extractAttr(html.match(/<img\b[^>]*Poster[^>]*>/i)?.[0] || "", "src"));
  const description = decodeHtml((html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)/i) || [])[1]) ||
    stripHtml((html.match(/<p\b[^>]*class=["'][^"']*leading-relaxed[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1]);
  const childItems = parseEpisodes(html, link, title, posterPath);

  return {
    id: makeId(site.title, link),
    type: "link",
    title,
    posterPath,
    backdropPath: posterPath,
    mediaType: "tv",
    genreTitle: site.title,
    description,
    link,
    childItems
  };
}

function parseEpisodes(html, detailLink, seriesTitle, posterPath) {
  const url = new URL(detailLink);
  const site = getSite(url.origin + "/");
  const episodes = [];
  const seen = new Set();
  const episodeRegex = /<a\b[^>]*href=["']([^"']*index\.php\?[^"']*page=watch[^"']*)["'][^>]*>([\s\S]*?)<\/a>/ig;
  let match;

  while ((match = episodeRegex.exec(html)) !== null) {
    const link = absoluteUrl(site.value, decodeHtml(match[1]));
    if (seen.has(link)) continue;
    seen.add(link);

    const epFromUrl = new URL(link).searchParams.get("ep") ||
      new URL(link).searchParams.get("episode");
    const episode = parseInt(epFromUrl || stripHtml(match[2]).match(/\d+/)?.[0] || "0", 10);
    const title = episode ? `Ep ${episode}` : stripHtml(match[2]);

    episodes.push({
      id: makeId(site.title, link),
      type: "link",
      title,
      description: seriesTitle ? `${seriesTitle} - ${title}` : title,
      posterPath,
      mediaType: "tv",
      episode,
      link
    });
  }

  return episodes.sort((a, b) => (a.episode || 0) - (b.episode || 0));
}

function parseWatch(html, link) {
  const url = new URL(link);
  const site = getSite(url.origin + "/");
  const sourceUrl = extractSourceUrl(html);
  const title = stripHtml((html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i) || [])[1]) ||
    stripHtml((html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i) || [])[1]);
  const posterPath = decodeHtml((html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i) || [])[1]) ||
    decodeHtml(extractAttr(html.match(/<video\b[^>]*>/i)?.[0] || "", "poster"));
  const ep = parseInt(url.searchParams.get("ep") || url.searchParams.get("episode") || "0", 10);

  if (!sourceUrl) {
    return {
      id: makeId(site.title, link),
      type: "error",
      title: "未找到播放地址",
      description: "播放页没有解析到 sourceUrl。"
    };
  }

  return {
    id: makeId(site.title, link),
    type: "url",
    title: ep ? `${title} - Ep ${ep}` : title,
    description: site.title,
    posterPath,
    mediaType: "tv",
    episode: ep || undefined,
    videoUrl: sourceUrl,
    link,
    playerType: "system"
  };
}

function extractSourceUrl(html) {
  const sourceMatch = html.match(/sourceUrl\s*=\s*["']([^"']+)["']/i);
  if (sourceMatch) return decodeHtml(sourceMatch[1]);

  const videoSrc = html.match(/<source\b[^>]*src=["']([^"']+)["']/i) ||
    html.match(/<video\b[^>]*src=["']([^"']+)["']/i);
  if (videoSrc) return decodeHtml(videoSrc[1]);

  const mediaMatch = html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/i);
  return mediaMatch ? decodeHtml(mediaMatch[1]) : "";
}

async function loadDetail(link) {
  const target = typeof link === "string" ? link : link?.link || link?.id || "";
  if (!target) return {};

  const html = await requestHtml(target, target);
  return /page=watch/i.test(target) ? parseWatch(html, target) : parseDetail(html, target);
}
