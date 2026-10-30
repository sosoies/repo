const mangayomiSources = [
    {
        name: "Hentai.tv",
        lang: "en",
        baseUrl: "https://hentai.tv",
        apiUrl: "",
        iconUrl: "https://hentai.tv/wp-content/uploads/2020/10/cropped-favicon-32x32.png",
        typeSource: "single",
        itemType: 1,
        isNsfw: true,
        version: "1.0.0",
        dateFormat: "",
        dateFormatLocale: "",
        pkgName: "anime/src/en/hentaitv.js"
    }
];

const USER_AGENT = "Mozilla/5.0 (Linux aarch64; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

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
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": `${r}/`,
            "Origin": r
        };
    }

    absoluteUrl(url) {
        if (!url) return "";
        const strUrl = typeof url === "string" ? url : String(url.url || url.path || "");
        if (/^https?:\/\//i.test(strUrl)) return strUrl;
        return this.baseUrl + (strUrl.startsWith("/") ? strUrl : "/" + strUrl);
    }

    // ============================== Popular ===============================

    async getPopular(page) {
        const url = page > 1 ? `${this.baseUrl}/page/${page}/?orderby=views` : `${this.baseUrl}/?orderby=views`;
        const response = await this.client.get(url, this.getHeaders(url));
        const document = new Document(response.body);

        const animes = [];
        const seen = new Set();

        document.select("article, div.item, div.post").forEach(element => {
            const aEl = element.selectFirst("a[href]");
            if (!aEl) return;
            const href = aEl.attr("href");
            if (!href || href.includes("/category/") || href.includes("/tag/")) return;

            const imgEl = element.selectFirst("img");
            const titleEl = element.selectFirst("h3, h2, .title");
            const name = titleEl ? titleEl.text.trim() : (imgEl ? imgEl.attr("alt") : "");
            if (!name) return;

            const url = this.absoluteUrl(href);
            if (seen.has(url)) return;
            seen.add(url);

            const imageUrl = imgEl ? (imgEl.attr("data-src") || imgEl.attr("src") || "") : "";

            animes.push({
                name: String(name),
                url: String(url),
                link: String(url),
                imageUrl: String(imageUrl).replace(" ", "%20")
            });
        });

        const hasNext = document.selectFirst("a.next, .nav-previous a, link[rel='next']") !== null;
        return { list: animes, hasNextPage: hasNext };
    }

    // =============================== Latest ===============================

    get supportsLatest() {
        return true;
    }

    async getLatestUpdates(page) {
        const url = page > 1 ? `${this.baseUrl}/page/${page}/` : this.baseUrl;
        const response = await this.client.get(url, this.getHeaders(url));
        const document = new Document(response.body);

        const animes = [];
        const seen = new Set();

        document.select("article, div.item, div.post").forEach(element => {
            const aEl = element.selectFirst("a[href]");
            if (!aEl) return;
            const href = aEl.attr("href");
            if (!href || href.includes("/category/") || href.includes("/tag/")) return;

            const imgEl = element.selectFirst("img");
            const titleEl = element.selectFirst("h3, h2, .title");
            const name = titleEl ? titleEl.text.trim() : (imgEl ? imgEl.attr("alt") : "");
            if (!name) return;

            const url = this.absoluteUrl(href);
            if (seen.has(url)) return;
            seen.add(url);

            const imageUrl = imgEl ? (imgEl.attr("data-src") || imgEl.attr("src") || "") : "";

            animes.push({
                name: String(name),
                url: String(url),
                link: String(url),
                imageUrl: String(imageUrl).replace(" ", "%20")
            });
        });

        const hasNext = document.selectFirst("a.next, .nav-previous a, link[rel='next']") !== null;
        return { list: animes, hasNextPage: hasNext };
    }

    // =============================== Search ===============================

    async search(query, page, filters) {
        const url = `${this.baseUrl}/page/${page}/?s=${encodeURIComponent(query.trim())}`;
        const response = await this.client.get(url, this.getHeaders(url));
        const document = new Document(response.body);

        const animes = [];
        const seen = new Set();

        document.select("article, div.item, div.post").forEach(element => {
            const aEl = element.selectFirst("a[href]");
            if (!aEl) return;
            const href = aEl.attr("href");
            if (!href) return;

            const imgEl = element.selectFirst("img");
            const titleEl = element.selectFirst("h3, h2, .title");
            const name = titleEl ? titleEl.text.trim() : (imgEl ? imgEl.attr("alt") : "");
            if (!name) return;

            const url = this.absoluteUrl(href);
            if (seen.has(url)) return;
            seen.add(url);

            const imageUrl = imgEl ? (imgEl.attr("data-src") || imgEl.attr("src") || "") : "";

            animes.push({
                name: String(name),
                url: String(url),
                link: String(url),
                imageUrl: String(imageUrl).replace(" ", "%20")
            });
        });

        const hasNext = document.selectFirst("a.next, .nav-previous a, link[rel='next']") !== null;
        return { list: animes, hasNextPage: hasNext };
    }

    // ============================== Details ===============================

    async getDetail(url) {
        const fullUrl = this.absoluteUrl(url);
        const response = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const document = new Document(response.body);

        const titleEl = document.selectFirst("h1.title, h1");
        const title = titleEl ? titleEl.text.trim() : "";

        const imgEl = document.selectFirst(".poster img, .entry-content img, img");
        const imageUrl = imgEl ? this.absoluteUrl(imgEl.attr("data-src") || imgEl.attr("src") || "") : "";

        const descEl = document.selectFirst(".entry-content, .description, p");
        const description = descEl ? descEl.text.trim() : "";

        return {
            name: String(title),
            url: String(fullUrl),
            imageUrl: String(imageUrl),
            description: String(description),
            episodes: [],
            chapters: []
        };
    }

    // ============================== Episodes ==============================

    async getEpisodeList(url) {
        const fullUrl = this.absoluteUrl(url);
        const response = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const document = new Document(response.body);

        const episodes = [];
        const seen = new Set();

        // hentai.tv는 각 상세 페이지가 곧 비디오 페이지이거나 에피소드 목록을 가짐
        document.select(".episodelist a, .les-content a, a.episode-link").forEach((el, index) => {
            const href = el.attr("href");
            if (!href) return;
            const episodeUrl = this.absoluteUrl(href);

            if (seen.has(episodeUrl)) return;
            seen.add(episodeUrl);

            const name = el.text ? el.text.trim() : `Episode ${index + 1}`;

            episodes.push({
                name: String(name),
                url: String(episodeUrl),
                dateUpload: 0,
                episodeNumber: index + 1
            });
        });

        // 만약 별도의 에피소드 목록이 없고 상세 페이지 자체가 재생 페이지인 경우
        if (episodes.length === 0) {
            episodes.push({
                name: "Full Episode",
                url: fullUrl,
                dateUpload: 0,
                episodeNumber: 1
            });
        }

        return episodes;
    }

    // ============================ Videos =============================

    async getVideoList(url) {
        const fullUrl = this.absoluteUrl(url);
        const response = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const body = response.body;
        const document = new Document(body);

        const videoUrls = [];
        const seen = new Set();

        // iframe이나 비디오 소스 탐색
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

        // 본문 내 스트림 URL 직접 탐색
        const videoRegex = /https?:\/\/[^\s"'<>\\?\b]+?\.(mp4|m3u8|webm)(\?[^\s"'<>\\?\b]+)?/g;
        let match;
        while ((match = videoRegex.exec(body)) !== null) {
            let videoUrl = match[0].replace(/\\/g, "");
            if (!seen.has(videoUrl) && !videoUrl.includes("avatar") && !videoUrl.includes("logo")) {
                seen.add(videoUrl);
                videoUrls.push(String(videoUrl));
            }
        }

        if (videoUrls.length === 0) {
            throw new Error("비디오 재생 주소를 찾지 못했습니다.");
        }

        return videoUrls.map(vUrl => ({
            url: String(vUrl),
            originalUrl: String(vUrl),
            quality: vUrl.includes(".m3u8") ? "HLS Master" : "Default Video",
            headers: this.getHeaders(fullUrl)
        }));
    }

    async getPageList() { return []; }
    async getFilterList() { return []; }
}
