const mangayomiSources = [
    {
        name: "HentaiHaven",
        lang: "ko",
        baseUrl: "https://hentaihaven.xxx",
        apiUrl: "",
        iconUrl: "https://hentaihaven.xxx/favicon.ico",
        typeSource: "single",
        itemType: 1,
        isNsfw: true,
        version: "1.0.0",
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
        const t = url ? url.match(/^https?:\/\/[^\/?#]+/) : null;
        const r = t ? t[0] : this.baseUrl;

        return {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
            "Referer": url || (r + "/"),
            "Origin": r
        };
    }

    absoluteUrl(url) {
        if (!url) return "";

        const strUrl = typeof url === "string"
            ? url
            : String(url.url || url.path || url.src || "");

        if (!strUrl) return "";

        if (/^https?:\/\//i.test(strUrl)) return strUrl;

        if (strUrl.startsWith("//")) {
            return "https:" + strUrl;
        }

        if (strUrl.startsWith("/")) {
            return this.baseUrl + strUrl;
        }

        return this.baseUrl + "/" + strUrl;
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

getItemImage(item) {
    if (!item) return "";

    const meta = item.meta || {};
    const metaValues = Object.values(meta);

    const thumbnail = metaValues.find(value =>
        typeof value === "string" &&
        /^images\//i.test(value.trim())
    );

    if (thumbnail) {
        return "https://img.hentaihaven.xxx/" +
            thumbnail.trim().replace(/^\/+/, "");
    }

    const fields = [
        item.cover_url,
        item.cover,
        item.poster,
        item.image,
        item.thumbnail,
        item.thumb,
        item.featured_image,
        item.featuredImage,
        item.cover_image,
        item.banner
    ];

    for (let i = 0; i < fields.length; i++) {
        let value = fields[i];

        if (!value) continue;

        if (typeof value === "object") {
            value =
                value.url ||
                value.src ||
                value.path ||
                value.original ||
                value.large ||
                value.medium ||
                "";
        }

        if (typeof value === "string" && value.trim()) {
            return this.absoluteUrl(value.trim());
        }
    }

    return "";
}
    extractList(document) {
        const animes = [];
        const seen = new Set();

        document.select("a[href*='/watch/']").forEach(element => {
            const href = element.attr("href");

            if (!href) return;

            const img = element.selectFirst("img");
            const name =
                element.attr("title") ||
                (img ? img.attr("alt") : "") ||
                element.text ||
                "";

            if (!name) return;

            const url = this.absoluteUrl(href);

            if (seen.has(url)) return;
            seen.add(url);

            let imageUrl = "";

            if (img) {
                imageUrl = this.absoluteUrl(this.getImageUrl(img));
            }

            animes.push({
                name: String(name).trim(),
                url: String(url),
                link: String(url),
                imageUrl: String(imageUrl)
            });
        });

        return animes;
    }

    async getPopular(page) {
        const url = page > 1
            ? `${this.baseUrl}/browse/trending/page/${page}/`
            : `${this.baseUrl}/browse/trending/`;

        const response = await this.client.get(
            url,
            this.getHeaders(url)
        );

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
        const url =
            `${this.baseUrl}/api/manga/?per_page=24&live=1&locale=en` +
            `&orderby=date&order=desc&page=${page}`;

        const response = await this.client.get(
            url,
            this.getHeaders(url)
        );

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

            const rawTitle = item.title || item.name || item.slug;
            let title = "";

            if (typeof rawTitle === "object" && rawTitle !== null) {
                title =
                    rawTitle.en ||
                    rawTitle.default ||
                    Object.values(rawTitle)[0] ||
                    "";
            } else {
                title = String(rawTitle || "");
            }

            const slug = item.slug || item.id;

            if (!title || !slug) return;

            const watchUrl = this.absoluteUrl(`/watch/${slug}/`);

            if (seen.has(watchUrl)) return;
            seen.add(watchUrl);

const imageUrl = this.getItemImage(item);

            animes.push({
                name: String(title),
                url: String(watchUrl),
                link: String(watchUrl),
                imageUrl: String(imageUrl)
            });
        });

        const currentPage = Number(
            json.current_page ||
            (json.data && json.current_page) ||
            page
        );

        const totalPages = Number(
            json.total_pages ||
            json.last_page ||
            (json.data && json.last_page) ||
            0
        );

        const hasNext = totalPages > 0
            ? currentPage < totalPages
            : items.length > 0;

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
            (query
                ? `&search=${encodeURIComponent(query.trim())}`
                : "");

        const response = await this.client.get(
            url,
            this.getHeaders(url)
        );

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

            const rawTitle = item.title || item.name || item.slug;
            let title = "";

            if (typeof rawTitle === "object" && rawTitle !== null) {
                title =
                    rawTitle.en ||
                    rawTitle.default ||
                    Object.values(rawTitle)[0] ||
                    "";
            } else {
                title = String(rawTitle || "");
            }

            const slug = item.slug || item.id;

            if (!title || !slug) return;

            const watchUrl = this.absoluteUrl(`/watch/${slug}/`);

            if (seen.has(watchUrl)) return;
            seen.add(watchUrl);

            const imageUrl = this.getItemImage(item);

            animes.push({
                name: String(title),
                url: String(watchUrl),
                link: String(watchUrl),
                imageUrl: String(imageUrl)
            });
        });

        const currentPage = Number(
            json.current_page ||
            (json.data && json.current_page) ||
            page
        );

        const totalPages = Number(
            json.total_pages ||
            json.last_page ||
            (json.data && json.data.last_page) ||
            0
        );

        const hasNext = totalPages > 0
            ? currentPage < totalPages
            : items.length > 0;

        return {
            list: animes,
            hasNextPage: hasNext
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
            "div[data-watch-primary] h1, h1"
        );

        const imageElement = document.selectFirst(
            "div[data-watch-primary] div[class*='aspect-'] img, img"
        );

        const descriptionElement = document.selectFirst(
            "div[data-watch-primary] p, .description"
        );

        const title = titleElement
            ? titleElement.text.trim()
            : "";

        const imageUrl = imageElement
            ? this.absoluteUrl(this.getImageUrl(imageElement))
            : "";

        const description = descriptionElement
            ? descriptionElement.text.trim()
            : "";

        const episodes = [];
        const seenUrls = new Set();

        const matchSlug = fullUrl.match(/\/watch\/([^\/]+)/);
        const currentSlug = matchSlug ? matchSlug[1] : "";

        document.select("a[href*='episode-']").forEach(element => {
            const href = element.attr("href");

            if (!href) return;

            const episodeUrl = this.absoluteUrl(href);

            if (
                currentSlug &&
                !episodeUrl.includes(`/watch/${currentSlug}/`)
            ) {
                return;
            }

            if (seenUrls.has(episodeUrl)) return;
            seenUrls.add(episodeUrl);

            const nameElement =
                element.selectFirst("p.font-bold, span, div") ||
                element;

            let name = nameElement
                ? nameElement.text.trim()
                : "";

            if (
                !name ||
                name.includes("object Object") ||
                name.length === 0
            ) {
                const epMatch = episodeUrl.match(/episode-([0-9]+)/i);

                name = epMatch
                    ? `Episode ${epMatch[1]}`
                    : `Episode ${episodes.length + 1}`;
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

    const response = await this.client.get(
        fullUrl,
        this.getHeaders(fullUrl)
    );

    const body = response.body.replace(/\\\//g, "/");

    const videoUrls = [];
    const seen = new Set();

    // 기존에 정상적으로 찾던 playlist.m3u8 주소 추출
    const urlRegex = /https?:\/\/[^\s"'<>\\]+/g;
    let match;

    while ((match = urlRegex.exec(body)) !== null) {
        const candidate = match[0]
            .replace(/[),;]+$/g, "")
            .replace(/&amp;/g, "&");

        if (
            /^https:\/\/octopusmanifest\.org\/[^/]+\/playlist(?:_vp9)?\.m3u8(?:\?.*)?$/i.test(candidate)
        ) {
            const vp9Url = candidate.replace(
                /\/playlist(?:_vp9)?\.m3u8(?=\?|$)/i,
                "/playlist_vp9.m3u8"
            );

            if (!seen.has(vp9Url)) {
                seen.add(vp9Url);
                videoUrls.push(vp9Url);
            }
        }
    }

    if (videoUrls.length === 0) {
        throw new Error("HLS 마스터 플레이리스트 주소를 찾지 못했습니다.");
    }

    const finalVideos = [];

    for (const vUrl of videoUrls) {
        const hlsList = await this.hlsVideos(
            vUrl,
            q => `HentaiHaven - ${q}`
        );

        if (hlsList && hlsList.length > 0) {
            finalVideos.push(...hlsList);
        }
    }

    return finalVideos;
}

 async hlsVideos(url, qualityName) {
        const originMatch = url.match(/^(https?:\/\/[^\/]+)/);

        if (!originMatch) {
            throw new Error("잘못된 HLS 주소입니다.");
        }

        const origin = originMatch[1];

        const headers = {
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
            "Referer": `${origin}/`,
            "Origin": origin
        };

        const response = await this.client.get(url, headers);
        const playlist = response.body;

        if (!playlist.includes("#EXT-X-STREAM-INF:")) {
            return [{
                url: String(url),
                originalUrl: String(url),
                quality: qualityName("Video"),
                headers: headers
            }];
        }

        const subtitles = [];
        const audios = [];
        const videos = [];

        const lines = playlist.split(/\r?\n/);

        // AUDIO 및 SUBTITLES 트랙 추출
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (!line.startsWith("#EXT-X-MEDIA:")) {
                continue;
            }

            const attributes = parseHlsAttributes(
                line.substring("#EXT-X-MEDIA:".length)
            );

            const type = attributes.TYPE || "";
            const name = attributes.NAME || "";
            const uri = attributes.URI || "";
            const groupId = attributes["GROUP-ID"] || "";

            if (!uri) continue;

const rendition = {
    file: resolve(uri, url),
    label: name,
    language: attributes.LANGUAGE || "",
    groupId: groupId
};
            if (type === "AUDIO") {
                audios.push(rendition);
            } else if (type === "SUBTITLES") {
                subtitles.push(rendition);
            }
        }

        // 영상 화질별 variant 추출
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (!line.startsWith("#EXT-X-STREAM-INF:")) {
                continue;
            }

            const attributes = parseHlsAttributes(
                line.substring("#EXT-X-STREAM-INF:".length)
            );

            const resolution = attributes.RESOLUTION || "";
            const resolutionMatch = resolution.match(/(\d+)[xX](\d+)/);

            const height = resolutionMatch
                ? parseInt(resolutionMatch[2], 10)
                : 0;

            const bandwidth = parseInt(
                attributes.BANDWIDTH || "0",
                10
            );

            const audioGroup = attributes.AUDIO || "";
            const subtitleGroup = attributes.SUBTITLES || "";

            let next = i + 1;

            while (
                next < lines.length &&
                (!lines[next].trim() || lines[next].trim().startsWith("#"))
            ) {
                next++;
            }

            if (next >= lines.length) continue;

            const streamUrl = resolve(lines[next].trim(), url);

            if (!streamUrl) continue;

const quality = height
    ? `${nearestQuality(height)} (${resolution})`
    : "Video";

            let selectedAudios = audios;
            let selectedSubtitles = subtitles;

            if (audioGroup) {
                selectedAudios = audios.filter(
                    item => item.groupId === audioGroup
                );
            }

            if (subtitleGroup) {
                selectedSubtitles = subtitles.filter(
                    item => item.groupId === subtitleGroup
                );
            }

            // 플레이어에 전달하는 트랙 객체는 기존 형식 유지
            const audioList = selectedAudios.map(item => ({
                file: item.file,
                label: item.label
            }));

const subtitleList = selectedSubtitles.map(item => ({
    file: item.file,
    label: item.label,
    language: item.language
}));
            videos.push({
                bandwidth: bandwidth,
                video: {
                    url: String(streamUrl),
                    originalUrl: String(streamUrl),
                    quality: qualityName(quality),
                    headers: headers,
                    subtitles: subtitleList,
                    audios: audioList
                }
            });
        }

        return videos
            .sort((a, b) => b.bandwidth - a.bandwidth)
            .map(item => item.video);
    }

    async getPageList() {
        return [];
    }

getFilterList() {
    return [
        {
            type_name: "HeaderFilter",
            name: "HentaiHaven Filter"
        }
    ];
}

} // DefaultExtension 클래스 종료

function parseHlsAttributes(text) {
    const result = {};
    const regex = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;

    let match;

    while ((match = regex.exec(text)) !== null) {
        let value = match[2];

        if (
            value.length >= 2 &&
            value.startsWith('"') &&
            value.endsWith('"')
        ) {
            value = value.substring(1, value.length - 1);
        }

        result[match[1]] = value;
    }

    return result;
}

function resolve(path, base) {
    path = String(path || "").trim();

    if (!path) return "";

    if (/^https?:\/\//i.test(path)) return path;

    if (path.startsWith("//")) {
        return "https:" + path;
    }

    const match = base.match(/^(https?:\/\/[^\/]+)/);

    if (!match) return "";

    const origin = match[1];

    if (path.startsWith("/")) {
        return origin + path;
    }

    const basePath = base.split(/[?#]/)[0];
    const directory = basePath.substring(
        0,
        basePath.lastIndexOf("/") + 1
    );

    return directory + path;
}

function nearestQuality(height) {
    return `${QUALITIES.reduce(
        (best, value) =>
            Math.abs(value - height) < Math.abs(best - height)
                ? value
                : best
    )}p`;
}

function formatSize(size) {
    return size >= 1e9
        ? `${(size / 1e9).toFixed(2)} GB`
        : size >= 1e6
            ? `${(size / 1e6).toFixed(2)} MB`
            : size >= 1e3
                ? `${(size / 1e3).toFixed(2)} KB`
                : size > 1
                    ? `${size} bytes`
                    : size === 1
                        ? "1 byte"
                        : "";
}
