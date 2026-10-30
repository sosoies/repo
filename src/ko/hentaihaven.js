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
        hasCloudflare: true,
        version: "1.0.1",
        dateFormat: "",
        dateFormatLocale: "",
        pkgName: "anime/src/en/hentaihaven.js"
    }
];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.baseUrl = this.source.baseUrl;
        this.client = new Client();
    }

    getHeaders(url) {
        return {
            "Referer": this.baseUrl + "/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
        };
    }

    absoluteUrl(url) {
        if (!url) return "";
        if (/^https?:\/\//i.test(url)) return url;
        return this.baseUrl + (url.startsWith("/") ? url : "/" + url);
    }

    getImageUrl(img) {
        if (!img) return "";
        return (
            img.attr("data-src") ||
            img.attr("data-lazy-src") ||
            img.attr("data-original") ||
            img.attr("abs:src") ||
            img.attr("src") ||
            ""
        );
    }

    getTitle(element) {
        const img = element.selectFirst("img");
        return (
            element.attr("title") ||
            (img ? img.attr("alt") : "") ||
            element.text ||
            ""
        ).trim();
    }

    // HTML 문서에서 애니메이션 목록을 안전하게 추출
    extractList(document) {
        const animes = [];
        const seen = new Set();

        document.select("a[href*='/watch/']:has(img)").forEach(element => {
            const href = element.attr("href");
            const img = element.selectFirst("img");
            const name = this.getTitle(element);

            if (!href || !name || !img) return;

            const url = this.absoluteUrl(href);
            if (seen.has(url)) return;
            seen.add(url);

            animes.push({
                name: name,
                url: url,
                link: url,
                imageUrl: this.absoluteUrl(this.getImageUrl(img))
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
        const url = page > 1
            ? `${this.baseUrl}/watch/page/${page}/`
            : `${this.baseUrl}/watch/?sort=latest`;

        const response = await this.client.get(url, this.getHeaders(url));
        const document = new Document(response.body);
        const animes = this.extractList(document);

        const next = document.selectFirst(
            "a[rel='next']:not([aria-disabled='true'])"
        );

        return {
            list: animes,
            hasNextPage: next !== null && animes.length > 0
        };
    }

    async search(query, page, filters) {
        const url = page > 1
            ? `${this.baseUrl}/watch/page/${page}/?search=${encodeURIComponent(query)}`
            : `${this.baseUrl}/watch/?search=${encodeURIComponent(query)}`;

        const response = await this.client.get(url, this.getHeaders(url));
        const document = new Document(response.body);
        const animes = this.extractList(document);

        return {
            list: animes,
            hasNextPage: animes.length > 0
        };
    }

    async getDetail(url) {
        const fullUrl = this.absoluteUrl(url);
        const response = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const document = new Document(response.body);

        const titleElement = document.selectFirst("div[data-watch-primary] h1") || document.selectFirst("h1");
        const imageElement = document.selectFirst("div[data-watch-primary] div[class*='aspect-'] img");
        const descriptionElement = document.selectFirst("div[data-watch-primary] p.line-clamp-2");

        const title = titleElement ? titleElement.text.trim() : "";
        const imageUrl = imageElement ? this.absoluteUrl(this.getImageUrl(imageElement)) : "";
        const description = descriptionElement ? descriptionElement.text.trim() : "";

        const episodes = [];
        const seen = new Set();

        document.select("a[data-episode-preview-hover], a[href*='episode-']").forEach((element, index) => {
            const href = element.attr("href");
            if (!href) return;

            const episodeUrl = this.absoluteUrl(href);
            if (seen.has(episodeUrl)) return;
            seen.add(episodeUrl);

            const nameElement = element.selectFirst("p.font-bold");
            const name = nameElement ? nameElement.text.trim() : `Episode ${index + 1}`;

            episodes.push({
                name: name,
                url: episodeUrl,
                dateUpload: "",
                episodeNumber: index + 1
            });
        });

        if (episodes.length === 0) {
            episodes.push({
                name: "Episode 1",
                url: fullUrl,
                dateUpload: "",
                episodeNumber: 1
            });
        }

        return {
            name: title,
            url: fullUrl,
            imageUrl: imageUrl,
            description: description,
            episodes: episodes,
            chapters: episodes
        };
    }

    async getVideoList(url) {
        const fullUrl = this.absoluteUrl(url);
        const response = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const document = new Document(response.body);

        const videos = [];
        const seen = new Set();

        document.select("video source, source[type='application/vnd.apple.mpegurl'], iframe").forEach(element => {
            const src = element.attr("src") || element.attr("data-src");
            if (!src) return;

            const videoUrl = this.absoluteUrl(src);
            if (seen.has(videoUrl)) return;
            seen.add(videoUrl);

            videos.push({
                url: videoUrl,
                originalUrl: videoUrl,
                quality: "Default",
                headers: this.getHeaders(fullUrl)
            });
        });

        if (videos.length === 0) {
            const match = response.body.match(/https?:\/\/[^"'\s]+\.(m3u8|mp4)/i);
            if (match) {
                videos.push({
                    url: match[0],
                    originalUrl: match[0],
                    quality: "Default",
                    headers: this.getHeaders(fullUrl)
                });
            }
        }

        if (videos.length === 0) {
            throw new Error("비디오 재생 주소를 찾지 못했습니다.");
        }

        return videos;
    }

    async getPageList() {
        return [];
    }

    getFilterList() {
        return [];
    }
}
