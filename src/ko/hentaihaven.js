const mangayomiSources = [
    {
        name: "HentaiHaven",
        lang: "en",
        baseUrl: "https://hentaihaven.xxx",
        apiUrl: "",
        iconUrl: "https://hentaihaven.xxx/favicon.ico",
        typeSource: "single",
        itemType: 1, // 비디오/애니메이션 타입
        isNsfw: true,
        version: "0.0.5",
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

    // API 응답 JSON을 망가요미 목록 포맷으로 변환하는 공통 메서드
    parseApiList(responseBody, page) {
        let json;
        try {
            json = JSON.parse(responseBody);
        } catch (error) {
            throw new Error("HentaiHaven API 응답을 파싱할 수 없습니다.");
        }

        const mangas = [];
        const seen = new Set();
        // 안드로이드/웹 API 구조 대응 (data 또는 items 배열 확인)
        const items = Array.isArray(json.data) ? json.data : (Array.isArray(json.items) ? json.items : []);

        items.forEach(item => {
            if (!item || !item.slug || !item.title) return;

            const url = this.absoluteUrl(`/watch/${item.slug}/`);

            if (seen.has(url)) return;
            seen.add(url);

            mangas.push({
                name: item.title,
                url: url,
                link: url,
                imageUrl: this.absoluteUrl(item.cover_url || item.thumbnail || "")
            });
        });

        const currentPage = Number(json.current_page || page);
        const totalPages = Number(json.total_pages || currentPage);

        return {
            list: mangas,
            hasNextPage: currentPage < totalPages && mangas.length > 0
        };
    }

    // 인기 목록 (API 기반)
    async getPopular(page) {
        const url = `${this.baseUrl}/api/manga/?per_page=24&live=1&locale=en&orderby=views&order=desc&page=${page}`;
        const response = await this.client.get(url, this.getHeaders(url));
        return this.parseApiList(response.body, page);
    }

    get supportsLatest() {
        return true;
    }

    // 최신 업데이트 목록 (API 기반)
    async getLatestUpdates(page) {
        const url = `${this.baseUrl}/api/manga/?per_page=24&live=1&locale=en&orderby=date&order=desc&page=${page}`;
        const response = await this.client.get(url, this.getHeaders(url));
        return this.parseApiList(response.body, page);
    }

    // 검색 (API 기반)
    async search(query, page, filters) {
        const url =
            `${this.baseUrl}/api/manga/` +
            `?per_page=24&live=1&locale=en` +
            `&orderby=date&order=desc&page=${page}` +
            (query ? `&search=${encodeURIComponent(query.trim())}` : "");

        const response = await this.client.get(url, this.getHeaders(url));
        return this.parseApiList(response.body, page);
    }

    // 상세 정보 및 에피소드 목록 파싱
    async getDetail(url) {
        const fullUrl = this.absoluteUrl(url);
        const response = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const document = new Document(response.body);

        const titleElement = document.selectFirst("div[data-watch-primary] h1") || document.selectFirst("h1");
        const imageElement = document.selectFirst("div[data-watch-primary] div[class*='aspect-'] img");
        const descriptionElement = document.selectFirst("div[data-watch-primary] p.line-clamp-2");

        const title = titleElement ? titleElement.text.trim() : "";
        const imageUrl = imageElement ? this.absoluteUrl(imageElement.attr("src") || imageElement.attr("data-src")) : "";
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

    // 비디오 스트리밍 주소 추출
    async getVideoList(url) {
        const fullUrl = this.absoluteUrl(url);
        const response = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const document = new Document(response.body);

        const videos = [];
        const seen = new Set();

        // 비디오 태그 및 HLS 소스 탐색
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

        // 정규식을 통한 m3u8 / mp4 스트림 백업 탐색
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
            throw new Error("이 회차의 비디오 재생 주소를 찾지 못했습니다.");
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
