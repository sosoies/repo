class HentaiHavenManga extends DefaultExtension {
    baseUrl = "https://hentaihaven.xxx";

    // 인기 목록
    async getPopular(page) {
        const url = page > 1 ? `${this.baseUrl}/browse/trending/page/${page}/` : `${this.baseUrl}/browse/trending/`;
        const response = await Client.get(url, { "Accept-Language": "en-US,en;q=0.9", "Referer": `${this.baseUrl}/` });
        const document = loadHtml(response.body);
        
        const mangas = [];
        document.select("a[href^='/watch/']:has(img)").forEach(element => {
            const img = element.selectFirst("img");
            if (img) {
                const name = img.attr("alt");
                const href = element.attr("href");
                const thumb = img.attr("abs:src") || img.attr("src");
                if (name) {
                    mangas.push({
                        url: href,
                        name: name,
                        imageUrl: thumb ? thumb.replace(" ", "%20") : ""
                    });
                }
            }
        });

        const hasNextPage = document.selectFirst("nav[aria-label='Archive pages'] a[rel=next]:not([aria-disabled=true])") !== null;
        return { list: mangas, hasNextPage: hasNextPage };
    }

    // 최신 업데이트 목록
    async getLatestUpdates(page) {
        const url = page > 1 ? `${this.baseUrl}/watch/page/${page}/` : `${this.baseUrl}/watch/?sort=latest`;
        const response = await Client.get(url);
        const document = loadHtml(response.body);
        const mangas = [];
        
        document.select("a[href^='/watch/']:has(img)").forEach(element => {
            const img = element.selectFirst("img");
            if (img) {
                mangas.push({
                    url: element.attr("href"),
                    name: img.attr("alt"),
                    imageUrl: img.attr("abs:src") || img.attr("src")
                });
            }
        });
        
        return { list: mangas, hasNextPage: true };
    }

    // 검색 기능
    async search(query, page, filters) {
        let url = `${this.baseUrl}/api/manga/?per_page=24&live=1&locale=en&orderby=date&order=desc&page=${page}`;
        if (query) {
            url += `&search=${encodeURIComponent(query.trim())}`;
        }
        
        const response = await Client.get(url, { "Referer": `${this.baseUrl}/` });
        const json = JSON.parse(response.body);
        
        const mangas = [];
        if (json && json.data) {
            json.data.forEach(item => {
                mangas.push({
                    url: `/watch/${item.slug}/`,
                    name: item.title,
                    imageUrl: item.cover_url || ""
                });
            });
        }
        
        const hasNextPage = json && json.current_page < json.total_pages;
        return { list: mangas, hasNextPage: hasNextPage };
    }

    // 작품 상세 정보 및 챕터 목록 가져오기
    async getDetail(url) {
        const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
        const response = await Client.get(fullUrl, { "Referer": `${this.baseUrl}/` });
        const document = loadHtml(response.body);

        const title = document.selectFirst("div[data-watch-primary] h1")?.text || "";
        const imageUrl = document.selectFirst("div[data-watch-primary] div[class*=\"aspect-[2/3]\"] img")?.attr("abs:src") || "";
        const description = document.selectFirst("div[data-watch-primary] p.line-clamp-2")?.text || "";

        // 망가요미에서는 에피소드를 챕터(Chapters) 개념으로 매핑합니다.
        const chapters = [];
        document.select(`a[data-episode-preview-hover][href*='episode-']`).forEach((el, index) => {
            const epHref = el.attr("href");
            const epName = el.selectFirst("p.font-bold")?.text || `Chapter ${index + 1}`;
            const dateStr = el.selectFirst("p.text-zinc-400")?.text;
            
            chapters.push({
                url: epHref,
                name: epName,
                dateUpload: dateStr ? new Date(dateStr).getTime().toString() : "",
                chapterNumber: index + 1
            });
        });

        return {
            url: fullUrl,
            name: title,
            imageUrl: imageUrl,
            description: description,
            chapters: chapters.reverse()
        };
    }

    // 만화 뷰어 내부의 페이지(이미지) 목록 가져오기
    async getPageList(url) {
        const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
        const response = await Client.get(fullUrl, { "Referer": `${this.baseUrl}/` });
        const document = loadHtml(response.body);

        const pages = [];
        
        // 페이지 내 만화 이미지 요소 선택자 (사이트 구조에 맞게 조정 필요)
        document.select("div.reader-container img, div[class*='reader'] img, img[data-pages-image]").forEach((img, index) => {
            const imageUrl = img.attr("abs:src") || img.attr("src") || img.attr("data-src");
            if (imageUrl) {
                pages.push({
                    url: imageUrl,
                    headers: { "Referer": fullUrl }
                });
            }
        });

        return pages;
    }
}
