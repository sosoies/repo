const mangayomiSources = [
    {
        name: "HentaiHaven",
        lang: "en",
        baseUrl: "https://hentaihaven.xxx",
        apiUrl: "",
        iconUrl: "https://hentaihaven.xxx/favicon.ico",
        typeSource: "single",
        itemType: 0,
        isNsfw: true,
        version: "0.0.3",
        dateFormat: "",
        dateFormatLocale: "",
        pkgName: "manga/src/en/hentaihaven.js"
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

    extractList(document) {
        const mangas = [];
        const seen = new Set();

        document.select("a[href*='/watch/']:has(img)").forEach(element => {
            const href = element.attr("href");
            const img = element.selectFirst("img");
            const name = this.getTitle(element);

            if (!href || !name || !img) return;

            const url = this.absoluteUrl(href);

            if (seen.has(url)) return;
            seen.add(url);

            mangas.push({
                name: name,
                url: url,
                link: url,
                imageUrl: this.absoluteUrl(this.getImageUrl(img))
            });
        });

        return mangas;
    }

    async getPopular(page) {
        const url = page > 1
            ? `${this.baseUrl}/browse/trending/page/${page}/`
            : `${this.baseUrl}/browse/trending/`;

        const response = await this.client.get(url, this.getHeaders(url));
        const document = new Document(response.body);
        const mangas = this.extractList(document);

        const next = document.selectFirst(
            "nav[aria-label='Archive pages'] a[rel='next']:not([aria-disabled='true'])"
        );

        return {
            list: mangas,
            hasNextPage: next !== null && mangas.length > 0
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
        const mangas = this.extractList(document);

        const next = document.selectFirst(
            "a[rel='next']:not([aria-disabled='true'])"
        );

        return {
            list: mangas,
            hasNextPage: next !== null && mangas.length > 0
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
            throw new Error("HentaiHaven 검색 API가 JSON을 반환하지 않았습니다.");
        }

        const mangas = [];
        const seen = new Set();
        const items = Array.isArray(json.data) ? json.data : [];

        items.forEach(item => {
            if (!item || !item.slug || !item.title) return;

            const url = this.absoluteUrl(`/watch/${item.slug}/`);

            if (seen.has(url)) return;
            seen.add(url);

            mangas.push({
                name: item.title,
                url: url,
                link: url,
                imageUrl: this.absoluteUrl(item.cover_url || "")
            });
        });

        const currentPage = Number(json.current_page || page);
        const totalPages = Number(json.total_pages || currentPage);

        return {
            list: mangas,
            hasNextPage: currentPage < totalPages && mangas.length > 0
        };
    }

    async getDetail(url) {
        const fullUrl = this.absoluteUrl(url);

        const response = await this.client.get(
            fullUrl,
            this.getHeaders(fullUrl)
        );

        const document = new Document(response.body);

        const titleElement = document.selectFirst(
            "div[data-watch-primary] h1"
        );

        const imageElement = document.selectFirst(
            "div[data-watch-primary] div[class*='aspect-'] img"
        );

        const descriptionElement = document.selectFirst(
            "div[data-watch-primary] p.line-clamp-2"
        );

        const title = titleElement ? titleElement.text.trim() : "";

        const imageUrl = imageElement
            ? this.absoluteUrl(this.getImageUrl(imageElement))
            : "";

        const description = descriptionElement
            ? descriptionElement.text.trim()
            : "";

        const chapters = [];
        const seen = new Set();

        document.select(
            "a[data-episode-preview-hover][href*='episode-']"
        ).forEach((element, index) => {
            const href = element.attr("href");
            if (!href) return;

            const chapterUrl = this.absoluteUrl(href);

            if (seen.has(chapterUrl)) return;
            seen.add(chapterUrl);

            const nameElement = element.selectFirst("p.font-bold");
            const dateElement = element.selectFirst("p.text-zinc-400");

            const name = nameElement
                ? nameElement.text.trim()
                : `Episode ${index + 1}`;

            const dateText = dateElement
                ? dateElement.text.trim()
                : "";

            let dateUpload = "";

            if (dateText) {
                const timestamp = Date.parse(dateText);

                if (!Number.isNaN(timestamp)) {
                    dateUpload = String(timestamp);
                }
            }

            chapters.push({
                name: name,
                url: chapterUrl,
                dateUpload: dateUpload,
                chapterNumber: index + 1
            });
        });

        chapters.reverse();

        return {
            name: title,
            url: fullUrl,
            imageUrl: imageUrl,
            description: description,
            chapters: chapters
        };
    }

    async getPageList(url) {
        const fullUrl = this.absoluteUrl(url);

        const response = await this.client.get(
            fullUrl,
            this.getHeaders(fullUrl)
        );

        const document = new Document(response.body);
        const pages = [];
        const seen = new Set();

        document.select(
            "div.reader-container img, " +
            "div[class*='reader'] img, " +
            "img[data-pages-image]"
        ).forEach(img => {
            const imageUrl = this.getImageUrl(img);
            if (!imageUrl) return;

            const absoluteImageUrl = this.absoluteUrl(imageUrl);

            if (seen.has(absoluteImageUrl)) return;
            seen.add(absoluteImageUrl);

            pages.push({
                url: absoluteImageUrl,
                headers: {
                    "Referer": fullUrl
                }
            });
        });

        return pages;
    }

    // Mangayomi의 동영상 메서드 호출 오류 방지
    async getVideoList(url) {
        return [];
    }

    // 검색 필터를 사용하지 않음
    getFilterList() {
        return [];
    }
}
