export default async (context, url) => {
  if (!url) {
    throw new Error('Please provide a URL to visit.');
  }

  let page;
  try {
    page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const content = await page.content();
    const title = await page.title();
    const finalUrl = page.url();
    const headers = response.headers();

    const { pageDate, metaTags, lang } = await page.evaluate(() => {
      // Function to find meta tag content
      const getMetaContent = (prop) => {
        const el = document.querySelector(`meta[name="${prop}"], meta[property="${prop}"]`);
        return el ? el.content : null;
      };

      // 1. Check for specific meta tags
      const metaDate = getMetaContent('article:modified_time') ||
                       getMetaContent('og:updated_time') ||
                       getMetaContent('dcterms.modified') ||
                       getMetaContent('article:published_time') ||
                       getMetaContent('date') ||
                       getMetaContent('pubdate');

      // 2. Check for <time> element
      const timeElement = document.querySelector('time[datetime]');
      const timeDate = timeElement ? timeElement.getAttribute('datetime') : null;

      // 3. Check for JSON-LD structured data
      let jsonLdDate = null;
      const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
      if (jsonLdScript) {
        try {
          const data = JSON.parse(jsonLdScript.textContent);
          const graph = data['@graph'] || (Array.isArray(data) ? data : [data]);
          const item = graph.find(it => it.dateModified || it.datePublished);
          if (item) {
            jsonLdDate = item.dateModified || item.datePublished;
          }
        } catch (e) { /* Ignore JSON parsing errors */ }
      }
      
      // Get all meta tags for the general meta object
      const allMeta = {};
      document.querySelectorAll('meta').forEach(tag => {
        const key = tag.getAttribute('name') || tag.getAttribute('property');
        if (key) {
          allMeta[key] = tag.getAttribute('content');
        }
      });

      const pageLang = document.documentElement.lang;

      return { 
        pageDate: jsonLdDate || metaDate || timeDate, 
        metaTags: allMeta,
        lang: pageLang 
      };
    });

    // Prioritize dates: 1. From page content, 2. From headers
    const finalDate = pageDate || headers['last-modified'];

    return {
      title,
      url: finalUrl,
      date: finalDate,
      lang,
      headers,
      meta: metaTags,
      content,
    };
  } catch (error) {
    // Add more context to the error message
    error.message = `Failed to visit ${url}: ${error.message}`;
    throw error;
  } finally {
    if (page) {
      await page.close();
    }
  }
};
