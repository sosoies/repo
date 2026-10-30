const mangayomiSources = [
    {
        name: "HentaiHaven",
        lang: "en",
        baseUrl: "https://hentaihaven.xxx",
        apiUrl: "",
        iconUrl: "https://hentaihaven.xxx/favicon.ico",
        typeSource: "single",
        itemType: 1,
        isNsfw: true,
        version: "2.1.2",
        dateFormat: "",
        dateFormatLocale: "",
        pkgName: "anime/src/en/hentaihaven.js"
    }
];

const USER_AGENT = "Mozilla/5.0 (Linux aarch64; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const QUALITIES = [144, 240, 360, 480, 720, 1080, 1440, 2160];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.baseUrl = this.source.baseUrl;
        this.client = new Client();
    }

    getHeaders(url) {
        const t = url ? url.match(/^https?:\/\/[^\/?#]+/): null;
        const r = t ? t[0] : this.baseUrl;
        return {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
            "Referer": url || `${r}/`,
            "Origin": r
        };
    }

    absoluteUrl(url) {
        if (!url) return "";
        const strUrl = typeof url === "string" ? url : String(url.url || url.path || "");
        if (/^https?:\/\//i.test(strUrl)) return strUrl;
        return this.baseUrl + (strUrl.startsWith("/") ? strUrl : "/" + strUrl);
    }

    getImageUrl(img) {
        if (!img) return "";
        const src = (
            img.attr("data-src") ||
            img.attr("data-lazy-src") ||
            img.attr("data-original") ||
            img.attr("abs:src") ||
            img.attr("src") ||
            ""
        );
        return typeof src === "string" ? src : String(src);
    }

    getTitle(element) {
        const img = element.selectFirst("img");
        const t = (
            element.attr("title") ||
            (img ? img.attr("alt") : "") ||
            element.text ||
            ""
        );
        return (typeof t === "string" ? t : String(t)).trim();
    }

    extractList(document) {
        const animes = [];
        const seen = new Set();

        document.select("a[href*='/watch/']:has(img), a[href*='/watch/']").forEach(element => {
            const href = element.attr("href");
            const img = element.selectFirst("img") || element.parent().selectFirst("img");
            const name = this.getTitle(element);

            if (!href || !name) return;
            const url = this.absoluteUrl(href);

            if (seen.has(url)) return;
            seen.add(url);

            animes.push({
                name: String(name),
                url: String(url),
                link: String(url),
                imageUrl: img ? String(this.absoluteUrl(this.getImageUrl(img))) : ""
            });
        });

        return animes;
    }

    async getPopular(page) {
        const url = page > 1
            ? `${this.baseUrl}/browse/trending/page/${page}/`
            : `${this.baseUrl}/browse/trending/`;

        const response = await this.client.get(url, this.getHeaders(url));
        const document = new Document(response.body);
        const animes = this.extractList(document);

        const next = document.selectFirst(
            "nav[aria-label='Archive pages'] a[rel='next']:not([aria-disabled='true'])"
        );

        return {
            list: animes,
            hasNextPage: next !== null && animes.length > 0
        };
    }

    get supportsLatest() {
        return true;
    }

    async getLatestUpdates(page) {
        const url = `${this.baseUrl}/api/manga/?per_page=24&live=1&locale=en&orderby=date&order=desc&page=${page}`;
        const response = await this.client.get(url, this.getHeaders(url));

        let json;
        try {
            json = JSON.parse(response.body);
        } catch (error) {
            throw new Error("최신 목록 데이터를 불러오지 못했습니다.");
        }

        const animes = [];
        const seen = new Set();
        
        let items = [];
        if (Array.isArray(json)) {
            items = json;
        } else if (Array.isArray(json.data)) {
            items = json.data;
        } else if (json.data && Array.isArray(json.data.data)) {
            items = json.data.data;
        }

        items.forEach(item => {
            if (!item) return;

            let rawTitle = item.title || item.name || item.slug;
            let title = "";
            if (typeof rawTitle === "object" && rawTitle !== null) {
                title = rawTitle.en || rawTitle.default || Object.values(rawTitle)[0] || "";
            } else {
                title = String(rawTitle || "");
            }

            const slug = item.slug || item.id;
            if (!title || !slug) return;

            const watchUrl = this.absoluteUrl(`/watch/${slug}/`);
            if (seen.has(watchUrl)) return;
            seen.add(watchUrl);

            const img = item.cover_url || item.poster || item.image || item.thumbnail || `${this.baseUrl}/storage/galleries/${slug}/cover.jpg`;

            animes.push({
                name: String(title),
                url: String(watchUrl),
                link: String(watchUrl),
                imageUrl: String(this.absoluteUrl(typeof img === "object" ? (img.url || img.path || "") : img))
            });
        });

        const currentPage = Number(json.current_page || (json.data && json.current_page) || page);
        const totalPages = Number(json.total_pages || json.last_page || (json.data && json.last_page) || 0);
        const hasNext = totalPages > 0 ? currentPage < totalPages : items.length > 0;

        return {
            list: animes,
            hasNextPage: hasNext
        };
    }

    async search(query, page, filters) {
        const url =
            `${this.baseUrl}/api/manga/` +
            `?per_page=24&live=1&locale=en` +
            `&orderby=date&order=desc&page=${page}` +
            (query ? `&search=${encodeURIComponent(query.trim())}` : "");

        const response = await this.client.get(url, this.getHeaders(url));

        let json;
        try {
            json = JSON.parse(response.body);
        } catch (error) {
            throw new Error("검색 결과 데이터를 불러오지 못했습니다.");
        }

        const animes = [];
        const seen = new Set();

        let items = [];
        if (Array.isArray(json)) {
            items = json;
        } else if (Array.isArray(json.data)) {
            items = json.data;
        } else if (json.data && Array.isArray(json.data.data)) {
            items = json.data.data;
        }

        items.forEach(item => {
            if (!item) return;

            let rawTitle = item.title || item.name || item.slug;
            let title = "";
            if (typeof rawTitle === "object" && rawTitle !== null) {
                title = rawTitle.en || rawTitle.default || Object.values(rawTitle)[0] || "";
            } else {
                title = String(rawTitle || "");
            }

            const slug = item.slug || item.id;
            if (!title || !slug) return;

            const watchUrl = this.absoluteUrl(`/watch/${slug}/`);
            if (seen.has(watchUrl)) return;
            seen.add(watchUrl);

            const img = item.cover_url || item.poster || item.image || item.thumbnail || `${this.baseUrl}/storage/galleries/${slug}/cover.jpg`;

            animes.push({
                name: String(title),
                url: String(watchUrl),
                link: String(watchUrl),
                imageUrl: String(this.absoluteUrl(typeof img === "object" ? (img.url || img.path || "") : img))
            });
        });

        const currentPage = Number(json.current_page || (json.data && json.current_page) || page);
        const totalPages = Number(json.total_pages || json.last_page || (json.data && json.last_page) || 0);
        const hasNext = totalPages > 0 ? currentPage < totalPages : items.length > 0;

        return {
            list: animes,
            hasNextPage: hasNext
        };
    }

    async getDetail(url) {
        const fullUrl = this.absoluteUrl(url);
        const response = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const document = new Document(response.body);

        const titleElement = document.selectFirst("div[data-watch-primary] h1, h1");
        const imageElement = document.selectFirst("div[data-watch-primary] div[class*='aspect-'] img, img");
        const descriptionElement = document.selectFirst("div[data-watch-primary] p, .description");

        const title = titleElement ? titleElement.text.trim() : "";
        const imageUrl = imageElement ? this.absoluteUrl(this.getImageUrl(imageElement)) : "";
        const description = descriptionElement ? descriptionElement.text.trim() : "";

        const episodes = [];
        const seenUrls = new Set();

        const matchSlug = fullUrl.match(/\/watch\/([^\/]+)/);
        const currentSlug = matchSlug ? matchSlug[1] : "";

        document.select("a[href*='episode-']").forEach((element) => {
            const href = element.attr("href");
            if (!href) return;

            const episodeUrl = this.absoluteUrl(href);

            if (currentSlug && !episodeUrl.includes(`/watch/${currentSlug}/`)) {
                return;
            }

            if (seenUrls.has(episodeUrl)) return;
            seenUrls.add(episodeUrl);

            const nameElement = element.selectFirst("p.font-bold, span, div") || element;
            let name = nameElement ? nameElement.text.trim() : "";

            if (!name || name.includes("object Object") || name.length === 0) {
                const epMatch = episodeUrl.match(/episode-([0-9]+)/i);
                name = epMatch ? `Episode ${epMatch[1]}` : `Episode ${episodes.length + 1}`;
            }

            episodes.push({
                name: String(name),
                url: String(episodeUrl),
                dateUpload: "",
                episodeNumber: episodes.length + 1
            });
        });

        if (episodes.length === 0) {
            episodes.push({
                name: title ? String(title) : "Episode 1",
                url: String(fullUrl),
                dateUpload: "",
                episodeNumber: 1
            });
        }

        return {
            name: title ? String(title) : "",
            url: String(fullUrl),
            imageUrl: imageUrl ? String(imageUrl) : "",
            description: description ? String(description) : "",
            episodes: episodes,
            chapters: episodes
        };
    }

    async getVideoList(url) {
        const fullUrl = this.absoluteUrl(url);
        const response = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const body = response.body;
        const document = new Document(body);

        const videoUrls = [];
        const seen = new Set();

        // 회차 페이지 내에서 고유한 플레이어 iframe이나 비디오 소스를 먼저 탐색
        document.select("iframe[src], source, video").forEach(el => {
            const src = el.attr("src") || el.attr("data-src");
            if (src) {
                const videoUrl = this.absoluteUrl(src);
                if (!seen.has(videoUrl) && !videoUrl.includes("disqus") && !videoUrl.includes("ads")) {
                    seen.add(videoUrl);
                    videoUrls.push(String(videoUrl));
                }
            }
        });

        // 스크립트나 플레이어 설정 내에 숨겨진 개별 에피소드 스트림 주소 정밀 추출
        const videoRegex = /https?:\/\/[^\s"'<>\\?\b]+?\.(mp4|m3u8|webm)(\?[^\s"'<>\\?\b]+)?/g;
        let match;
        while ((match = videoRegex.exec(body)) !== null) {
            let videoUrl = match[0].replace(/\\/g, "");
            if (!seen.has(videoUrl) && !videoUrl.includes("favicon") && !videoUrl.includes("logo")) {
                seen.add(videoUrl);
                videoUrls.push(String(videoUrl));
            }
        }

        if (videoUrls.length === 0) {
            document.select("script").forEach(script => {
                const scriptText = script.text;
                const fileMatch = scriptText.match(/["'](?:file|src|url|videoUrl|source)["']\s*:\s*["'](https?:\/\/[^"']+\.(mp4|m3u8)[^"']*)["']/i);
                if (fileMatch && fileMatch[1]) {
                    const streamUrl = fileMatch[1].replace(/\\/g, "");
                    if (!seen.has(streamUrl)) {
                        seen.add(streamUrl);
                        videoUrls.push(String(streamUrl));
                    }
                }
            });
        }

        if (videoUrls.length === 0) {
            throw new Error("이 회차의 고유 비디오 주소를 찾지 못했습니다.");
        }

        let finalVideos = [];
        for (const vUrl of videoUrls) {
            if (vUrl.includes(".m3u8")) {
                try {
                    const hlsList = await this.hlsVideos(vUrl, q => `HentaiHaven - ${q}`);
                    if (hlsList && hlsList.length > 0) {
                        finalVideos.push(...hlsList);
                    }
                } catch (e) {}
            }
            finalVideos.push({
                url: String(vUrl),
                originalUrl: String(vUrl),
                quality: vUrl.includes(".m3u8") ? "HLS Master" : "Default Video",
                headers: this.getHeaders(fullUrl)
            });
        }

        return finalVideos;
    }

    async hlsVideos(e, t) {
        const r = e.match(/^(https?:\/\/[^\/]+)/)[1];
        const i = {"User-Agent": USER_AGENT, Accept: "*/*", Referer: `${r}/`, Origin: r};
        const s = (await this.client.get(e, i)).body;
        if (!s.includes("#EXT-X-STREAM-INF:")) return [{url: String(e), originalUrl: String(e), quality: t("Video"), headers: i}];
        
        const n = t => [...s.matchAll(new RegExp(`#EXT-X-MEDIA:TYPE=${t}.*?NAME="(.*?)".*?URI="(.*?)"`, "g"))].map(t => ({file: resolve(t[2], e), label: t[1]})).filter(e => e.file);
        const a = n("SUBTITLES"), o = n("AUDIO"), l = [], h = s.split(/\r?\n/);
        
        for (let r = 0; r < h.length; r++) {
            if (!h[r].startsWith("#EXT-X-STREAM-INF:")) continue;
            const s = h[r];
            let c = r + 1;
            for (; c < h.length && (!h[c].trim() || h[c].startsWith("#"));) c++;
            const u = resolve((h[c] || "").trim(), e);
            if (!u) continue;
            const g = s.match(/RESOLUTION=([xX\d]+)/)?.[1], p = g ? parseInt(g.match(/[xX](\d+)/)?.[1] || "0", 10) : 0, m = parseInt(s.match(/BANDWIDTH=(\d+)/)?.[1] || "0", 10);
            const d = [g ? p ? `${nearestQuality(p)} (${g})` : g : "", formatSize(m)].filter(Boolean).join(" - ") || "Video";
            l.push({bandwidth: m, video: {url: String(u), originalUrl: String(u), quality: t(d), headers: i, subtitles: a, audios: o}});
        }
        return l.sort((e, t) => t.bandwidth - e.bandwidth).map(e => e.video);
    }

    async getPageList() {
        return [];
    }

    getFilterList() {
        return [];
    }
}

function resolve(e, t) {
    if (!(e = String(e || "").trim())) return "";
    if (/^https?:\/\//.test(e)) return e;
    const r = t.match(/^(https?:\/\/[^\/]+)/)[1];
    return e.startsWith("//") ? r.split("//")[0] + e : e.startsWith("/") ? r + e : t.split(/[?#]/)[0].replace(/[^\/]*$/, "") + e;
}

function nearestQuality(e) {
    return `${QUALITIES.reduce((t, r) => Math.abs(r - e) < Math.abs(t - e) ? r : t)}p`;
}

formatSize = function(e) {
    return e >= 1e9 ? `${(e / 1e9).toFixed(2)} GB` : e >= 1e6 ? `${(e / 1e6).toFixed(2)} MB` : e >= 1e3 ? `${(e / 1e3).toFixed(2)} KB` : e > 1 ? `${e} bytes` : 1 === e ? "1 byte" : "";
}
