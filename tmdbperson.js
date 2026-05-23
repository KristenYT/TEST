const TMDB_BASE_URL = "https://www.themoviedb.org";
const DEFAULT_LANGUAGE = "zh-TW";

WidgetMetadata = {
  id: "AI.tmdbperson",
  title: "TMDB 演员片单",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "搜索 TMDB 演员，并获取演员参演过的电影和剧集片单",
  author: "AI",
  site: "https:",
  modules: [
    {
      id: "actorCredits",
      title: "演员片单",
      functionName: "actorCredits",
      cacheDuration: 3600,
      params: [
        {
          name: "keyword",
          title: "演员名 / TMDB 人物链接",
          type: "input",
          value: "赵丽颖",
          description: "输入演员中文名、英文名，或 TMDB 人物页链接",
          placeholders: [
            { title: "赵丽颖", value: "赵丽颖" },
            { title: "周星驰", value: "周星驰" },
            { title: "刘亦菲", value: "刘亦菲" },
            { title: "TMDB 人物链接", value: "https://www.themoviedb.org/person/1260868" },
          ],
        },
        {
          name: "mediaType",
          title: "类型",
          type: "enumeration",
          value: "all",
          enumOptions: [
            { title: "全部", value: "all" },
            { title: "电影", value: "movie" },
            { title: "电视剧", value: "tv" },
          ],
        },
        {
          name: "language",
          title: "语言",
          type: "language",
          value: DEFAULT_LANGUAGE,
        },
        {
          name: "limit",
          title: "返回数量",
          type: "count",
          value: 80,
        },
      ],
    },
  ],
  search: {
    title: "搜索演员片单",
    functionName: "actorCredits",
    params: [
      {
        name: "keyword",
        title: "演员名 / TMDB 人物链接",
        type: "input",
        description: "输入演员中文名、英文名，或 TMDB 人物页链接",
        placeholders: [
          { title: "赵丽颖", value: "赵丽颖" },
          { title: "周星驰", value: "周星驰" },
          { title: "刘亦菲", value: "刘亦菲" },
        ],
      },
      {
        name: "mediaType",
        title: "类型",
        type: "enumeration",
        value: "all",
        enumOptions: [
          { title: "全部", value: "all" },
          { title: "电影", value: "movie" },
          { title: "电视剧", value: "tv" },
        ],
      },
      {
        name: "language",
        title: "语言",
        type: "language",
        value: DEFAULT_LANGUAGE,
      },
    ],
  },
};

async function actorCredits(params = {}) {
  const keyword = String(params.keyword || params.query || "").trim();
  if (!keyword) {
    throw new Error("请输入演员名或 TMDB 人物链接");
  }

  const language = normalizeLanguage(params.language);
  const mediaType = normalizeMediaType(params.mediaType);
  const limit = normalizeLimit(params.limit || params.count || 80);
  const person = await resolvePerson(keyword, language);
  const credits = await fetchActingCredits(person, language, mediaType);

  return credits.slice(0, limit);
}

async function resolvePerson(keyword, language) {
  const directId = extractPersonId(keyword);
  if (directId) {
    const profile = await fetchPersonProfile(directId, language);
    return {
      id: directId,
      name: profile.name || "",
      url: `${TMDB_BASE_URL}/person/${directId}?language=${encodeURIComponent(language)}`,
    };
  }

  const searchUrl = buildTmdbUrl("/search/person", {
    query: keyword,
    language,
  });
  const html = await requestHtml(searchUrl);
  const redirectedPerson = parsePersonPage(html);

  if (redirectedPerson) {
    return redirectedPerson;
  }

  const people = parsePeopleSearchResults(html);
  if (people.length === 0) {
    throw new Error(`没有在 TMDB 找到演员：${keyword}`);
  }

  return chooseBestPerson(people, keyword);
}

async function fetchPersonProfile(personId, language) {
  try {
    const html = await requestHtml(buildTmdbUrl(`/person/${personId}`, { language }));
    return parsePersonPage(html) || {};
  } catch (error) {
    console.log("[TMDB演员片单] 获取人物资料失败:", error.message || error);
    return {};
  }
}

async function fetchActingCredits(person, language, mediaType) {
  const query = {
    credit_department: "Acting",
    language,
  };

  if (mediaType !== "all") {
    query.credit_media_type = mediaType;
  }

  const creditsUrl = buildTmdbUrl(`/person/${person.id}/remote/credits`, query);

  try {
    const html = await requestHtml(creditsUrl, person.url);
    const credits = parseCredits(html, person);

    if (credits.length > 0) {
      return credits;
    }
  } catch (error) {
    console.log("[TMDB演员片单] 获取 remote credits 失败，尝试解析人物页:", error.message || error);
  }

  const profileHtml = await requestHtml(buildTmdbUrl(`/person/${person.id}`, { language }));
  const credits = parseCredits(profileHtml, person);

  if (credits.length === 0) {
    throw new Error(`没有找到 ${person.name || person.id} 的参演片单`);
  }

  return credits;
}

function parsePersonPage(html) {
  const $ = loadHtml(html);
  const canonicalUrl = $("link[rel='canonical']").attr("href") || $("meta[property='og:url']").attr("content") || "";
  const id = extractPersonId(canonicalUrl);

  if (!id) {
    return null;
  }

  const name = cleanText($("meta[property='og:title']").attr("content") || $("h2.title a").first().text() || $("h2").first().text());
  const image = normalizeImageUrl($("meta[property='og:image']").attr("content") || "");

  return {
    id,
    name,
    profilePath: image,
    url: `${TMDB_BASE_URL}/person/${id}`,
  };
}

function parsePeopleSearchResults(html) {
  const $ = loadHtml(html);
  const people = [];

  $(".search_results.person .item.profile.list_item").each((index, element) => {
    const $item = $(element);
    const $nameLink = $item.find("p.name a.result").first();
    const $link = $nameLink.length > 0 ? $nameLink : $item.find("a.result[data-media-type='person']").first();
    const href = $link.attr("href") || "";
    const id = extractPersonId(href);

    if (!id) {
      return;
    }

    const name = cleanText($link.text() || $link.attr("title") || $link.attr("alt"));
    const knownFor = cleanText($item.find("p.sub").text());
    const profilePath = normalizeImageUrl($item.find("img.profile").attr("src") || "");

    people.push({
      id,
      name,
      knownFor,
      profilePath,
      url: absoluteTmdbUrl(href),
      index,
    });
  });

  return people;
}

function chooseBestPerson(people, keyword) {
  const normalizedKeyword = normalizeForMatch(keyword);

  return people
    .map((person) => {
      const normalizedName = normalizeForMatch(person.name);
      let score = 1000 - person.index;

      if (normalizedName === normalizedKeyword) {
        score += 10000;
      } else if (normalizedName.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedName)) {
        score += 5000;
      }

      if (normalizeForMatch(person.knownFor).includes(normalizedKeyword)) {
        score += 500;
      }

      return { ...person, score };
    })
    .sort((a, b) => b.score - a.score)[0];
}

function parseCredits(html, person) {
  const $ = loadHtml(html);
  const credits = [];
  const seen = {};

  $("table.credit_group tr").each((index, row) => {
    const $row = $(row);
    const $marker = $row.find("td.seperator span[data-type][data-slug]").first();
    const mediaType = normalizeMediaType($marker.attr("data-type"));

    if (mediaType !== "movie" && mediaType !== "tv") {
      return;
    }

    const href = $row.find("td.role a.tooltip").first().attr("href") || $marker.attr("data-url") || "";
    const tmdbId = extractMediaId(href) || extractMediaId($marker.attr("data-url")) || $marker.attr("data-slug");
    const title = cleanText($row.find("td.role a.tooltip bdi").first().text() || $row.find("td.role a.tooltip").first().text());

    if (!tmdbId || !title) {
      return;
    }

    const uniqueKey = `${mediaType}.${tmdbId}`;
    if (seen[uniqueKey]) {
      return;
    }
    seen[uniqueKey] = true;

    const year = normalizeYear($row.find("td.year").first().text());
    const character = cleanText($row.find("span.character").map((_, element) => $(element).text()).get().join(" / "));
    const episodeText = cleanText($row.find("span.group a.tv").first().text());
    const description = buildCreditDescription(person.name, character, episodeText);
    const itemLink = absoluteTmdbUrl(href || `/${mediaType}/${tmdbId}`);

    credits.push({
      id: uniqueKey,
      type: "tmdb",
      title,
      originalTitle: title,
      description,
      releaseDate: year,
      year,
      mediaType,
      link: itemLink,
      tmdbId,
      rating: 0,
      genreTitle: mediaType === "movie" ? "电影" : "电视剧",
      tmdbInfo: {
        id: tmdbId,
        mediaType,
        title,
        releaseDate: year,
      },
      actor: person.name || "",
      character,
      episodeCount: episodeText,
      sortIndex: index,
    });
  });

  return credits;
}

function buildCreditDescription(actorName, character, episodeText) {
  const parts = [];

  if (actorName) {
    parts.push(actorName);
  }
  if (character) {
    parts.push(`饰演 ${character}`);
  }
  if (episodeText) {
    parts.push(episodeText);
  }

  return parts.length > 0 ? parts.join(" · ") : "TMDB 演员作品";
}

async function requestHtml(url, referer) {
  console.log("[TMDB演员片单] 请求:", url);
  const response = await Widget.http.get(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Referer: referer || TMDB_BASE_URL,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    },
  });

  return String((response && response.data) || "");
}

function buildTmdbUrl(path, params = {}) {
  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");

  return `${TMDB_BASE_URL}${path}${query ? `?${query}` : ""}`;
}

function absoluteTmdbUrl(value) {
  if (!value) {
    return "";
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `${TMDB_BASE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

function extractPersonId(value) {
  const text = String(value || "");
  const match = text.match(/(?:\/person\/|^)(\d+)/);
  return match ? match[1] : "";
}

function extractMediaId(value) {
  const text = String(value || "");
  const match = text.match(/\/(?:movie|tv)\/(\d+)/);
  return match ? match[1] : "";
}

function normalizeImageUrl(value) {
  const url = String(value || "").trim();
  return url ? absoluteTmdbUrl(url) : "";
}

function normalizeLanguage(language) {
  return String(language || DEFAULT_LANGUAGE).trim() || DEFAULT_LANGUAGE;
}

function normalizeMediaType(mediaType) {
  const value = String(mediaType || "all").toLowerCase();
  return value === "movie" || value === "tv" ? value : "all";
}

function normalizeLimit(value) {
  const limit = parseInt(value, 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    return 80;
  }
  return Math.min(limit, 200);
}

function normalizeYear(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? match[0] : "";
}

function normalizeForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[·・.'’_-]/g, "");
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function loadHtml(html) {
  if (typeof Widget === "undefined" || !Widget.html || !Widget.html.load) {
    throw new Error("当前环境不支持 Widget.html.load");
  }
  return Widget.html.load(html || "");
}
