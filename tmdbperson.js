// =============UserScript=============
// @name         TMDB 演員片單搜索
// @version      1.0.1
// @description  搜索 TMDB 演員，獲取演員參演過的電影與劇集片單
// @author       Kristen
// =============UserScript=============

WidgetMetadata = {
  id: "forward.tmdb.person.credits",
  title: "TMDB 演員片單",
  description: "搜索 TMDB 演員，獲取演員參演過的電影與劇集片單",
  author: "Kristen",
  version: "1.0.1",
  requiredVersion: "0.0.1",
  detailCacheDuration: 60,
  modules: [
    {
      id: "tmdb_person_credits",
      title: "TMDB 演員作品搜索",
      functionName: "tmdbPersonCredits",
      cacheDuration: 3600,
      params: [
        {
          name: "keyword",
          title: "演員名稱或TMDB人物鏈接",
          type: "input",
          value: "赵丽颖",
          description: "輸入演員名稱，或直接貼上 TMDB 人物頁鏈接",
          placeholder: "例：赵丽颖 / https://www.themoviedb.org/person/1260868"
        },
        {
          name: "media_type",
          title: "作品類型",
          type: "enumeration",
          value: "all",
          description: "選擇要顯示的作品類型",
          enumOptions: [
            { title: "全部", value: "all" },
            { title: "電影", value: "movie" },
            { title: "劇集", value: "tv" }
          ]
        },
        {
          name: "sort_by",
          title: "排序方式",
          type: "enumeration",
          value: "date.desc",
          description: "選擇片單排序方式",
          enumOptions: [
            { title: "日期降序", value: "date.desc" },
            { title: "日期升序", value: "date.asc" },
            { title: "熱門降序", value: "popularity.desc" },
            { title: "評分降序", value: "vote_average.desc" }
          ]
        },
        {
          name: "language",
          title: "語言",
          type: "language",
          value: "zh-TW"
        }
      ]
    }
  ]
};

// ======主查詢函數======
async function tmdbPersonCredits(params = {}) {
    try {
        const keyword = String(params.keyword || params.query || "").trim();
        if (!keyword) return [createErrorItem("empty-keyword", "請輸入演員名稱", "例如：赵丽颖")];

        const language = params.language || "zh-TW";
        const mediaType = params.media_type || "all";
        const person = await findTmdbPerson(keyword, language);
        if (!person || !person.id) return [createErrorItem("person-not-found", "找不到演員", keyword)];

        const creditsResponse = await Widget.tmdb.get(`person/${person.id}/combined_credits`, {
            params: { language: language }
        });
        if (!creditsResponse || !Array.isArray(creditsResponse.cast)) {
            return [createErrorItem("credits-not-found", "找不到演員作品", person.name || keyword)];
        }

        let list = creditsResponse.cast
            .filter(item => {
                const type = item.media_type || (item.title ? "movie" : "tv");
                const hasValidType = type === "movie" || type === "tv";
                const matchType = mediaType === "all" || type === mediaType;
                const hasTitle = item.title || item.name;
                const hasValidId = Number.isInteger(item.id);
                return hasValidType && matchType && hasTitle && hasValidId;
            })
            .map(item => formatCreditItem(item, person));

        list = removeDuplicateCredits(list);
        return sortCredits(list, params.sort_by || "date.desc");
    } catch (error) {
        console.error("TMDB 演員片單調用失敗:", error);
        return [createErrorItem("tmdb-person-credits", "演員片單載入失敗", error)];
    }
}

// ======查找TMDB人物======
async function findTmdbPerson(keyword, language) {
    const directId = extractPersonId(keyword);
    if (directId) {
        const person = await Widget.tmdb.get(`person/${directId}`, {
            params: { language: language }
        });
        if (person && person.id) return person;
        return { id: Number(directId), name: keyword };
    }

    const response = await Widget.tmdb.get("search/person", {
        params: {
            query: keyword,
            language: language,
            page: 1,
            include_adult: false
        }
    });
    const results = response && Array.isArray(response.results) ? response.results : [];
    if (results.length === 0) return null;

    return chooseBestPerson(results, keyword);
}

// ======匹配最接近的演員======
function chooseBestPerson(results, keyword) {
    const target = normalizeName(keyword);
    return results
        .map((person, index) => {
            const name = normalizeName(person.name);
            const originalName = normalizeName(person.original_name);
            let score = 1000 - index;

            if (name === target || originalName === target) score += 10000;
            else if (name.includes(target) || originalName.includes(target)) score += 5000;
            if (person.known_for_department === "Acting") score += 500;
            if (Number.isFinite(person.popularity)) score += person.popularity;

            return Object.assign({}, person, { _score: score });
        })
        .sort((a, b) => b._score - a._score)[0];
}

// ======格式化作品======
function formatCreditItem(item, person) {
    let mediaType = item.media_type;
    if (!mediaType) {
        if (item.title) mediaType = "movie";
        else if (item.name) mediaType = "tv";
    }

    const title = item.title || item.name;
    const releaseDate = item.release_date || item.first_air_date || "";
    const character = item.character || "";
    const descriptionParts = [];

    if (person.name) descriptionParts.push(`演員：${person.name}`);
    if (character) descriptionParts.push(`飾演：${character}`);
    if (item.episode_count) descriptionParts.push(`集數：${item.episode_count}`);
    if (item.overview) descriptionParts.push(item.overview);

    return {
        id: item.id,
        type: "tmdb",
        title: title,
        description: descriptionParts.join("\n"),
        releaseDate: releaseDate,
        backdropPath: item.backdrop_path,
        posterPath: item.poster_path,
        rating: item.vote_average,
        mediaType: mediaType || "unknown",
        popularity: item.popularity || 0,
        voteCount: item.vote_count || 0,
        character: character,
        episodeCount: item.episode_count || "",
        actorName: person.name || ""
    };
}

// ======去重，同一作品保留第一條角色資料======
function removeDuplicateCredits(list) {
    const seen = {};
    return list.filter(item => {
        const key = `${item.mediaType}-${item.id}`;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
}

// ======排序======
function sortCredits(list, sortBy) {
    const dateValue = item => {
        const date = item.releaseDate || "";
        const time = Date.parse(date);
        return Number.isNaN(time) ? 0 : time;
    };

    return list.sort((a, b) => {
        if (sortBy === "date.asc") return dateValue(a) - dateValue(b);
        if (sortBy === "popularity.desc") return (b.popularity || 0) - (a.popularity || 0);
        if (sortBy === "vote_average.desc") return (b.rating || 0) - (a.rating || 0);
        return dateValue(b) - dateValue(a);
    });
}

function extractPersonId(value) {
    const text = String(value || "");
    const match = text.match(/(?:\/person\/|^)(\d+)/);
    return match ? match[1] : "";
}

function normalizeName(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[·・.'’_\-]/g, "");
}

function createErrorItem(id, title, error) {
    const errorMessage = String(error && error.message ? error.message : error || "未知錯誤");
    const uniqueId = `error-${id.replace(/[^a-zA-Z0-9]/g, "-")}-${Date.now()}`;
    return {
        id: uniqueId,
        type: "error",
        title: title || "載入失敗",
        description: `錯誤詳情：${errorMessage}`
    };
}
