(function() {
  const pageData = {
    title: document.title,
    url: window.location.href,
    htmlSnapshot: document.body.outerHTML,
    faviconUrl: document.querySelector("link[rel~='icon']")?.href,
    mainImageUrl: document.querySelector("meta[property='og:image']")?.content
  };
  return pageData;
})();
