class HentaiHaven extends DefaultExtension {
    baseUrl = "https://hentaihaven.xxx";

    async getPopular(page) {
        const url = page > 1 ? `${this.baseUrl}/browse/trending/page/${page}/` : `${this.baseUrl}/browse/trending/`;
        const response = await Client.get(url, { "Accept-Language": "en-US,en;q=0.9", "Referer": `${this.baseUrl}/` });
        const document = loadHtml(response.body);
        
        const animes = [];
        document.select("a[href^='/watch/']:has(img)").forEach(element => {
            const img = element.selectFirst("img");
            if (img) {
                const name = img.attr("alt");
                const href = element.attr("href");
                const thumb = img.attr("abs:src") || img.attr("src");
                if (name) {
                    animes.push({
                        url: href,
                        name: name,
                        imageUrl: thumb ? thumb.replace(" ", "%20") : ""
                    });
                }
            }
        });

        const hasNextPage = document.selectFirst("nav[aria-label='Archive pages'] a[rel=next]:not([aria-disabled=true])") !== null;
        return { list: animes, hasNextPage: hasNextPage };
    }

    async getLatestUpdates(page) {
        const url = page > 1 ? `${this.baseUrl}/watch/page/${page}/` : `${this.baseUrl}/watch/?sort=latest`;
        const response = await Client.get(url);
        const document = loadHtml(response.body);
        const animes = [];
        
        document.select("a[href^='/watch/']:has(img)").forEach(element => {
            const img = element.selectFirst("img");
            if (img) {
                animes.push({
                    url: element.attr("href"),
                    name: img.attr("alt"),
                    imageUrl: img.attr("abs:src") || img.attr("src")
                });
            }
        });
        
        return { list: animes, hasNextPage: true };
    }

    async search(query, page, filters) {
        let url = `${this.baseUrl}/api/manga/?per_page=24&live=1&locale=en&orderby=date&order=desc&page=${page}`;
        if (query) {
            url += `&search=${encodeURIComponent(query.trim())}`;
        }
        
        const response = await Client.get(url, { "Referer": `${this.baseUrl}/` });
        const json = JSON.parse(response.body);
        
        const animes = [];
        if (json && json.data) {
            json.data.forEach(item => {
                animes.push({
                    url: `/watch/${item.slug}/`,
                    name: item.title,
                    imageUrl: item.cover_url || ""
                });
            });
        }
        
        const hasNextPage = json && json.current_page < json.total_pages;
        return { list: animes, hasNextPage: hasNextPage };
    }

    async getDetail(url) {
        const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
        const response = await Client.get(fullUrl, { "Referer": `${this.baseUrl}/` });
        const document = loadHtml(response.body);

        const title = document.selectFirst("div[data-watch-primary] h1")?.text || "";
        const imageUrl = document.selectFirst("div[data-watch-primary] div[class*=\"aspect-[2/3]\"] img")?.attr("abs:src") || "";
        const description = document.selectFirst("div[data-watch-primary] p.line-clamp-2")?.text || "";

        const episodes = [];
        document.select(`a[data-episode-preview-hover][href*='episode-']`).forEach((el, index) => {
            const epHref = el.attr("href");
            const epName = el.selectFirst("p.font-bold")?.text || `Episode ${index + 1}`;
            const dateStr = el.selectFirst("p.text-zinc-400")?.text;
            
            episodes.push({
                url: epHref,
                name: epName,
                dateUpload: dateStr ? new Date(dateStr).getTime().toString() : "",
                episodeNumber: index + 1
            });
        });

        return {
            url: fullUrl,
            name: title,
            imageUrl: imageUrl,
            description: description,
            episodes: episodes.reverse()
        };
    }

    async getVideoList(url) {
        const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
        const response = await Client.get(fullUrl);
        const document = loadHtml(response.body);

        let playlistUrl = document.selectFirst("video source[type='application/vnd.apple.mpegurl']")?.attr("abs:src") 
            || document.selectFirst("source[data-hhaven-indexable-source]")?.attr("abs:src");

        if (!playlistUrl) {
            document.select("script[type='application/ld+json']").forEach(script => {
                try {
                    const json = JSON.parse(script.html());
                    if (json.video || json.contentUrl) {
                        playlistUrl = json.contentUrl || json.video;
                    }
                } catch (e) {}
            });
        }

        if (!playlistUrl) return [];

        return [{
            url: playlistUrl,
            quality: "HLS Stream",
            headers: { "Referer": fullUrl }
        }];
    }
}
