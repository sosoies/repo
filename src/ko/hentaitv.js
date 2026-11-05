
const mangayomiSources = [
    {
        name: "Hentai.tv",
        lang: "ko",
        baseUrl: "https://hentai.tv",
        apiUrl: "https://hentai.tv/api",
        iconUrl: "https://www.google.com/s2/favicons?sz=256&domain=https://hentai.tv",
        typeSource: "single",
        itemType: 1,
        isNsfw: true,
        version: "1.0.0",
        dateFormat: "",
        dateFormatLocale: "",
        pkgName: "anime/src/en/hentaitv.js"
    }
];

const USER_AGENT =
    "Mozilla/5.0 (Linux aarch64; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.baseUrl = this.source.baseUrl.replace(/\/+$/, "");
        this.apiUrl = this.source.apiUrl;
        this.client = new Client();
    }

    getHeaders(url, referer = this.baseUrl + "/") {
        return {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": referer,
            "Origin": this.baseUrl
        };
    }

    // =========================================================
    // URL
    // =========================================================

    absoluteUrl(url, pageUrl = this.baseUrl + "/") {
        if (!url) return "";

        let value = String(url).trim();

        if (!value || /^(javascript:|data:|blob:|mailto:|#)/i.test(value)) {
            return "";
        }

        value = value.replace(/&amp;/g, "&");

        if (/^https?:\/\//i.test(value)) return value;

        if (value.startsWith("//")) return "https:" + value;

        if (value.startsWith("/")) return this.baseUrl + value;

        return pageUrl.substring(0, pageUrl.lastIndexOf("/") + 1) + value;
    }

    getSeriesUrl(value) {
        if (typeof value === "string") {
            return value;
        }

        if (value && typeof value === "object") {
            return value.url || value.link || "";
        }

        return "";
    }

    isInternalUrl(url) {
        try {
            const host = url.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
            const base = this.baseUrl.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();

            return host === base ||
                host === base.replace(/^www\./, "") ||
                host === "www." + base.replace(/^www\./, "");
        } catch (_) {
            return false;
        }
    }

    async fetchPage(url) {
        const response = await this.client.get(
            url,
            this.getHeaders(url)
        );

        if (!response || !response.body) {
            throw new Error("Empty response: " + url);
        }

        return response;
    }

    // =========================================================
    // JSON API
    // =========================================================

    async fetchJson(url) {
        const response = await this.client.get(
            url,
            this.getHeaders(url)
        );

        if (!response || !response.body) {
            throw new Error("Empty API response");
        }

        let data;

        try {
            data = JSON.parse(response.body);
        } catch (e) {
            throw new Error("Invalid HentaiTV API response: " + e.message);
        }

        if (!data || !Array.isArray(data.videos)) {
            throw new Error("Unexpected HentaiTV API response");
        }

        return data;
    }

    // =========================================================
    // VIDEO DTO
    // =========================================================

    normalizeVideo(video) {
        if (!video || !video.slug || !video.titleSlug) {
            return null;
        }

        return {
            id: video.id || "",
            slug: String(video.slug),
            title: video.title || "",
            titleSlug: String(video.titleSlug),
            ep: video.ep == null ? null : Number(video.ep),
            views: video.views || 0,
            rating: video.rating || 0,
            censored: video.censored == null ? null : video.censored,
            brand: video.brand || "",
            quality: video.quality || "",
            year: video.year || null,
            language: video.language || "",
            duration: video.duration || "",
            tags: Array.isArray(video.tags) ? video.tags : [],
            cover: video.cover || "",
            thumb: video.thumb || "",
            backdrop: video.backdrop || "",
            featureImage: video.featureImage || "",
            embedUrl: video.embedUrl || "",
            description: video.description || "",
            releasedAt: video.releasedAt || ""
        };
    }

    // =========================================================
    // GROUP EPISODES INTO SERIES
    // =========================================================

    videosToSeries(videos) {
        const groups = new Map();

        for (const item of videos) {
            const video = this.normalizeVideo(item);

            if (!video) continue;

            if (!groups.has(video.titleSlug)) {
                groups.set(video.titleSlug, []);
            }

            const group = groups.get(video.titleSlug);

            if (!group.some(v => v.slug === video.slug)) {
                group.push(video);
            }
        }

        const result = [];

        for (const [slug, episodes] of groups) {
            episodes.sort((a, b) => {
                return (a.ep ?? Number.MAX_SAFE_INTEGER) -
                    (b.ep ?? Number.MAX_SAFE_INTEGER);
            });

            const first = episodes[0];

            const image =
                first.cover ||
                first.thumb ||
                first.featureImage;

            result.push({
                name: first.title || slug,
                url: this.baseUrl + "/series/" + slug,
                link: this.baseUrl + "/series/" + slug,
                imageUrl: this.absoluteUrl(image),
                description: first.description || ""
            });
        }

        return result;
    }

    // =========================================================
    // PAGINATION
    // =========================================================

    getPageNumber(document) {
        const links = document.select("a[href]");

        let maxPage = 1;

        links.forEach(el => {
            const href = el.attr("href") || "";
            const match = href.match(/[?&]page=(\d+)/);

            if (match) {
                maxPage = Math.max(maxPage, Number(match[1]));
            }
        });

        return maxPage;
    }

    hasNextPage(document, page) {
        const next = document.selectFirst(
            'a[rel="next"], a.next, .pagination a.next'
        );

        if (next) return true;

        return this.getPageNumber(document) > page;
    }

    // =========================================================
    // SERIES LISTING
    // =========================================================

    async getSeriesListing(sort, page) {
        const url =
            this.baseUrl +
            "/series/?sort=" +
            encodeURIComponent(sort) +
            "&page=" +
            page;

        const response = await this.fetchPage(url);
        const document = new Document(response.body);

        const result = [];
        const seen = new Set();

        document.select("a[href*='/series/']").forEach(el => {
            const href = el.attr("href") || "";
            const match = href.match(/\/series\/([^/?#]+)/);

            if (!match) return;

            const slug = match[1];

            if (seen.has(slug)) return;

            seen.add(slug);

            const container = el.parent || el;

            const image =
                el.selectFirst("img") ||
                container.selectFirst("img");

            const title =
                el.attr("title") ||
                image?.attr("alt") ||
                el.text.trim() ||
                slug.replace(/-/g, " ");

            result.push({
                name: title,
                url: this.baseUrl + "/series/" + slug,
                link: this.baseUrl + "/series/" + slug,
                imageUrl: this.absoluteUrl(
                    image?.attr("data-src") ||
                    image?.attr("src") ||
                    ""
                ),
                description: ""
            });
        });

        return {
            list: result,
            hasNextPage: result.length > 0 &&
                this.hasNextPage(document, page)
        };
    }

    // =========================================================
    // POPULAR
    // =========================================================

    async getPopular(page) {
        return this.getSeriesListing("views", page);
    }

    // =========================================================
    // LATEST
    // =========================================================

    get supportsLatest() {
        return true;
    }

    async getLatestUpdates(page) {
        return this.getSeriesListing("recent", page);
    }

    // =========================================================
    // SEARCH
    // =========================================================

    async search(query, page, filters) {
        const text = query.trim();

        if (!text) {
            return this.getSeriesListing("recent", page);
        }

        const url =
            this.apiUrl +
            "/search?q=" +
            encodeURIComponent(text) +
            "&limit=100";

        const data = await this.fetchJson(url);

        const list = this.videosToSeries(data.videos);

        return {
            list: list,
            hasNextPage: false
        };
    }

    // =========================================================
    // NEXT.JS FLIGHT PAYLOAD
    // =========================================================

    matchingBracket(text, start, openChar, closeChar) {
        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let i = start; i < text.length; i++) {
            const c = text[i];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (inString && c === "\\") {
                escaped = true;
                continue;
            }

            if (c === '"') {
                inString = !inString;
                continue;
            }

            if (inString) continue;

            if (c === openChar) {
                depth++;
            } else if (c === closeChar) {
                depth--;

                if (depth === 0) return i;
            }
        }

        return -1;
    }

    extractFlightPayload(html) {
        let payload = "";
        const marker = "self.__next_f.push(";

        let position = 0;

        while (true) {
            const start = html.indexOf(marker, position);

            if (start < 0) break;

            const arrayStart = html.indexOf("[", start + marker.length);

            if (arrayStart < 0) break;

            const arrayEnd = this.matchingBracket(
                html,
                arrayStart,
                "[",
                "]"
            );

            if (arrayEnd < 0) {
                position = arrayStart + 1;
                continue;
            }

            const raw = html.substring(arrayStart, arrayEnd + 1);

            try {
                const chunk = JSON.parse(raw);

                if (
                    Array.isArray(chunk) &&
                    chunk[0] === 1 &&
                    typeof chunk[1] === "string"
                ) {
                    payload += chunk[1];
                }
            } catch (_) {
                // Ignore malformed unrelated chunks.
            }

            position = arrayEnd + 1;
        }

        return payload;
    }

    // =========================================================
    // EXTRACT VIDEO OBJECTS FROM RSC PAYLOAD
    // =========================================================

    matchingBrace(text, start) {
        return this.matchingBracket(text, start, "{", "}");
    }

    extractPayloadVideos(payload) {
        const videos = [];
        const seen = new Set();

        const regex = /\{\s*"id"\s*:/g;

        let match;

        while ((match = regex.exec(payload)) !== null) {
            const start = match.index;
            const end = this.matchingBrace(payload, start);

            if (end < 0) continue;

            const candidate = payload.substring(start, end + 1);

            if (!candidate.includes('"titleSlug"')) continue;

            try {
                const video = this.normalizeVideo(
                    JSON.parse(candidate)
                );

                if (!video || seen.has(video.slug)) continue;

                seen.add(video.slug);
                videos.push(video);
            } catch (_) {
                // Ignore non-video JSON objects.
            }
        }

        return videos;
    }

    // =========================================================
    // SERIES PAGE
    // =========================================================

    async getSeriesPage(slug) {
        const url = this.baseUrl + "/series/" + encodeURIComponent(slug);

        const response = await this.fetchPage(url);
        const document = new Document(response.body);

        const payload = this.extractFlightPayload(response.body);
        const payloadVideos = this.extractPayloadVideos(payload);

        const title =
            document.selectFirst("h1.genre-name")?.text.trim() || "";

        const diagnostics = {
            requestedSlug: slug,
            httpStatus: response.statusCode ?? "unknown",
            htmlLength: String(response.body || "").length,
            flightPayloadLength: payload.length,
            payloadVideoCount: payloadVideos.length,
            payloadTitleSlugs: [...new Set(
                payloadVideos.map(video => video.titleSlug).filter(Boolean)
            )].slice(0, 20),
            apiAttempted: false,
            apiVideoCount: 0,
            apiTitleSlugs: [],
            apiError: ""
        };

        let episodes = payloadVideos.filter(video =>
            String(video.titleSlug).toLowerCase() === String(slug).toLowerCase()
        );

        if (episodes.length === 0) {
            const searchTitle = title || slug.replace(/-/g, " ");

            const searchUrl =
                this.apiUrl +
                "/search?q=" +
                encodeURIComponent(searchTitle) +
                "&limit=100";

            diagnostics.apiAttempted = true;

            try {
                const data = await this.fetchJson(searchUrl);

                const apiVideos = data.videos
                    .map(video => this.normalizeVideo(video))
                    .filter(Boolean);

                diagnostics.apiVideoCount = apiVideos.length;

                diagnostics.apiTitleSlugs = [...new Set(
                    apiVideos.map(video => video.titleSlug).filter(Boolean)
                )].slice(0, 20);

                episodes = apiVideos.filter(video =>
                    String(video.titleSlug).toLowerCase() === String(slug).toLowerCase()
                );
            } catch (error) {
                diagnostics.apiError = String(error?.message || error);
            }
        }

        const unique = new Map();

        for (const episode of episodes) {
            if (!unique.has(episode.slug)) {
                unique.set(episode.slug, episode);
            }
        }

        diagnostics.matchedEpisodeCount = unique.size;

        return {
            slug: slug,
            title: title,
            image:
                document.selectFirst('meta[property="og:image"]')
                    ?.attr("content") || "",
            payload: payload,
            episodes: Array.from(unique.values()),
            diagnostics: diagnostics
        };
    }

    // =========================================================
    // DETAIL
    // =========================================================

    getSlug(url) {
        const match = String(url).match(/\/series\/([^/?#]+)/);

        return match ? match[1] : "";
    }

    async getDetail(value) {
        const seriesUrl = this.getSeriesUrl(value);
        const fullUrl = this.absoluteUrl(seriesUrl);
        const slug = this.getSlug(fullUrl);

        if (!slug) {
            throw new Error(
                "Invalid series URL: " + String(seriesUrl)
            );
        }

        const page = await this.getSeriesPage(slug);

        const episodes = page.episodes.slice().sort((a, b) =>
            (a.ep ?? Number.MAX_SAFE_INTEGER) -
            (b.ep ?? Number.MAX_SAFE_INTEGER)
        );

        const first = episodes[0];

        const image =
            first?.cover ||
            first?.thumb ||
            first?.featureImage ||
            page.image;

        const brands = [
            ...new Set(
                episodes.map(v => v.brand).filter(Boolean)
            )
        ];

        const tags = [
            ...new Set(
                episodes.flatMap(v => v.tags || [])
            )
        ];

        const diagnosticLines = episodes.length === 0 && page.diagnostics
            ? [
                "[Hentai.tv diagnostic]",
                "Requested slug: " + page.diagnostics.requestedSlug,
                "HTTP status: " + page.diagnostics.httpStatus,
                "HTML length: " + page.diagnostics.htmlLength,
                "Flight payload length: " + page.diagnostics.flightPayloadLength,
                "Payload video count: " + page.diagnostics.payloadVideoCount,
                "Payload titleSlug values: " +
                    (page.diagnostics.payloadTitleSlugs.join(", ") || "(none)"),
                "API attempted: " + page.diagnostics.apiAttempted,
                "API video count: " + page.diagnostics.apiVideoCount,
                "API titleSlug values: " +
                    (page.diagnostics.apiTitleSlugs.join(", ") || "(none)"),
                "API error: " + (page.diagnostics.apiError || "(none)"),
                "Matched episodes: " + page.diagnostics.matchedEpisodeCount
            ]
            : [];

        const description = [
            first?.description || "",
            "Episodes: " + episodes.length,
            brands.length ? "Studio: " + brands.join(", ") : "",
            tags.length ? "Genres: " + tags.join(", ") : "",
            ...diagnosticLines
        ].filter(Boolean).join("\n\n");

        const chapters = episodes.slice().reverse().map((video, index) => {
            const number = video.ep ?? (episodes.length - index);

            const metadata = [
                video.quality,
                video.language,
                video.duration,
                video.censored === true ? "Censored" :
                    video.censored === false ? "Uncensored" : ""
            ].filter(Boolean).join(" • ");

           return {
    name: video.title || "Episode " + number,
    url: this.baseUrl + "/hentai/" + video.slug,
    dateUpload: "0",
    scanlator: metadata,
    description: video.description || "",
    thumbnailUrl: this.absoluteUrl(
        video.thumb || video.cover
    )
};        });

return {
    name: page.title || first?.title || slug,
    url: fullUrl,
    link: fullUrl,
    imageUrl: this.absoluteUrl(image),
    description: description,
    episodes: chapters
};    }

    // =========================================================
    // EPISODE LIST
    // =========================================================

    async getEpisodeList(value) {
        const seriesUrl = this.getSeriesUrl(value);
        const fullUrl = this.absoluteUrl(seriesUrl);
        const slug = this.getSlug(fullUrl);

        if (!slug) {
            throw new Error(
                "Invalid series URL: " + String(seriesUrl)
            );
        }

        const page = await this.getSeriesPage(slug);

        if (page.episodes.length === 0) {
            throw new Error(
                "No episodes found for series: " + slug
            );
        }

        const episodes = page.episodes.slice().sort((a, b) => {
            const numberA = a.ep ?? Number.MAX_SAFE_INTEGER;
            const numberB = b.ep ?? Number.MAX_SAFE_INTEGER;

            if (numberA !== numberB) return numberA - numberB;

            return a.slug.localeCompare(b.slug);
        });

        const result = episodes.map((video, index) => {
            const number = video.ep ?? index + 1;

            const label = String(number);

            const metadata = [
                video.quality,
                video.language,
                video.duration,
                video.censored === true ? "Censored" :
                    video.censored === false ? "Uncensored" : ""
            ].filter(Boolean).join(" • ");

            return {
                name: video.title || "Episode " + label,
                url: this.baseUrl + "/hentai/" + video.slug,
                dateUpload: "0",
                episodeNumber: number,
                scanlator: metadata,
                description: video.description || "",
                thumbnailUrl: this.absoluteUrl(
                    video.thumb || video.cover
                )
            };
        });

        return result.reverse();
    }

    // =========================================================
    // VIDEO LIST
    // =========================================================

    async getVideoList(url) {
        const fullUrl = this.absoluteUrl(url);

        const response = await this.fetchPage(fullUrl);
        const document = new Document(response.body);

        const videos = [];
        const seen = new Set();

        const addVideo = (src) => {
            if (!src) return;

            const videoUrl = this.absoluteUrl(src, fullUrl);

            if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) {
                return;
            }

            if (/disqus|doubleclick|googlesyndication|googleads/i.test(videoUrl)) {
                return;
            }

            if (seen.has(videoUrl)) return;

            seen.add(videoUrl);
            videos.push(videoUrl);
        };

        document.select(
            "iframe[src], iframe[data-src], video[src], video[data-src], source[src]"
        ).forEach(el => {
            addVideo(
                el.attr("src") ||
                el.attr("data-src")
            );
        });

        const body = response.body.replace(/\\\//g, "/");

        const regex =
            /https?:\/\/[^\s"'<>]+?\.(?:mp4|m3u8|webm)(?:\?[^\s"'<>]*)?/gi;

        let match;

        while ((match = regex.exec(body)) !== null) {
            addVideo(match[0].replace(/[),;\]}]+$/g, ""));
        }

        if (videos.length === 0) {
            throw new Error(
                "No video URL found on episode page"
            );
        }

        return videos.map(videoUrl => ({
            url: videoUrl,
            originalUrl: videoUrl,
            quality: /\.m3u8(\?|$)/i.test(videoUrl)
                ? "HLS"
                : "Default",
            headers: this.getHeaders(fullUrl, fullUrl)
        }));
    }

    // =========================================================
    // FILTERS
    // =========================================================

    async getPageList() {
        return [];
    }

    async getFilterList() {
        return [];
    }
}
