// Listener for when the extension is installed or updated
chrome.runtime.onInstalled.addListener(function() {
  // Remove any existing context menus to avoid duplicates, then recreate
  chrome.contextMenus.removeAll(function() {
    if (chrome.runtime.lastError) {
        console.error("Error removing all context menus:", chrome.runtime.lastError);
    }
    // Context menu for general pages
    chrome.contextMenus.create({
      id: "bookmarkPage",
      title: "Bookmark this page",
      contexts: ["page"]
    });

    // Context menu for YouTube videos
    chrome.contextMenus.create({
      id: "bookmarkYouTubeVideo",
      title: "Bookmark this YouTube video",
      contexts: ["video"],
      targetUrlPatterns: ["*://*.youtube.com/watch*", "*://*.youtube.com/embed/*"]
    });

    // Context menu for YouTube channels (on links that are channel URLs)
    chrome.contextMenus.create({
      id: "bookmarkYouTubeChannel",
      title: "Bookmark YouTube Channel", // Updated title
      contexts: ["link"],
      targetUrlPatterns: ["*://*.youtube.com/channel/*", "*://*.youtube.com/@*"]
    });

    // Context menu for any selected text
    chrome.contextMenus.create({
      id: "bookmarkSelection",
      title: "Bookmark selection",
      contexts: ["selection"]
    });

    // New context menu for bookmarking a YouTube video from a link/preview element
    chrome.contextMenus.create({
      id: "bookmarkVideoFromLink",
      title: "Bookmark YouTube Video (from link)",
      contexts: ["link"],
      documentUrlPatterns: ["*://*.youtube.com/*"] // Added
    });

    // New context menu for bookmarking a YouTube channel from a link/preview element
    chrome.contextMenus.create({
      id: "bookmarkChannelFromLink",
      title: "Bookmark Channel (from link)",
      contexts: ["link"],
      documentUrlPatterns: ["*://*.youtube.com/*"] // Added
    });

    // New context menu for bookmarking the current website (domain)
    chrome.contextMenus.create({
      id: "bookmarkWebsiteFromPage",
      title: "Bookmark this Website (Domain)",
      contexts: ["page"]
    });

    if (chrome.runtime.lastError) {
        console.error("Error creating context menus:", chrome.runtime.lastError.message);
    } else {
        console.log("All context menus created successfully.");
    }
  });
});

// Helper function to save bookmark data (centralized logic)
function saveBookmarkToStorage(bookmarkData) {
  console.log("Attempting to save from background:", bookmarkData);
  chrome.storage.local.get({ bookmarks: [] }, function(data) {
    let bookmarks = data.bookmarks;
    let alreadyExists = false;
    if (bookmarkData.type === 'selection') {
        alreadyExists = bookmarks.some(bm => bm.url === bookmarkData.url && bm.text === bookmarkData.text);
    } else {
        alreadyExists = bookmarks.some(bm => bm.url === bookmarkData.url && bm.type === bookmarkData.type);
    }

    if (alreadyExists) {
      console.log('Background: Item already bookmarked.', bookmarkData.url, bookmarkData.title);
      chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Already Bookmarked', message: `"${bookmarkData.title.substring(0,30)}..." is already in your bookmarks.` });
      return;
    }
    bookmarks.unshift(bookmarkData);
    chrome.storage.local.set({ bookmarks: bookmarks }, function() {
      if (chrome.runtime.lastError) {
        console.error('Background: Error saving bookmark:', chrome.runtime.lastError);
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error', message: `Failed to save bookmark: ${bookmarkData.title.substring(0,30)}...` });
      } else {
        console.log('Background: Bookmark saved successfully!', bookmarkData);
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Bookmarked!', message: `"${bookmarkData.title.substring(0,30)}..." saved.` });
      }
    });
  });
}

let pendingBookmarks = {}; // Store callbacks for pending bookmark operations

function handleScriptInjectionResult(tabId, injectionResults) {
    if (chrome.runtime.lastError || !injectionResults || !injectionResults.length === 0) {
        console.error(`Content script injection failed for tab ${tabId}:`, chrome.runtime.lastError?.message);
        if (pendingBookmarks[tabId]) {
            const { bookmarkBase, callback } = pendingBookmarks[tabId];
            callback(bookmarkBase); 
            delete pendingBookmarks[tabId];
        }
    } else {
        console.log(`Content script injected successfully for tab ${tabId}. Waiting for onMessage response.`);
    }
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "extractedPageInfo" && sender.tab && sender.tab.id) {
    console.log("Background received page info from content script:", request.data, "for tab:", sender.tab.id);
    const tabId = sender.tab.id;
    if (pendingBookmarks[tabId]) {
      const { bookmarkBase, callback, isTempTab } = pendingBookmarks[tabId]; 

      let updatedTitle = request.data.pageTitle || bookmarkBase.title;
      let updatedFaviconUrl = request.data.faviconUrl || null;
      let updatedThumbnailUrl = request.data.thumbnailUrl || null;

      if (bookmarkBase.type === 'website') {
        updatedTitle = bookmarkBase.title; 
        updatedThumbnailUrl = null;      
      } else if (bookmarkBase.type === 'youtube_channel') {
        // When content script runs on the actual channel page (e.g. via temp tab),
        // request.data.pageTitle is the actual channel title.
        // request.data.faviconUrl is channel icon.
        // request.data.thumbnailUrl is channel icon or banner.
        // These are correctly assigned by the general mapping above.
      }
      
      const fullBookmark = {
        ...bookmarkBase,
        title: updatedTitle,
        url: isTempTab ? bookmarkBase.url : (request.data.pageUrl || bookmarkBase.url), // Ensure original URL from bookmarkBase is used for temp tabs
        faviconUrl: updatedFaviconUrl,
        thumbnailUrl: updatedThumbnailUrl,
      };
      callback(fullBookmark); 
      delete pendingBookmarks[tabId]; 
    }
    return true; 
  } else if (request.action === "parsedYouTubeLinkPreviewResults" && sender.tab && sender.tab.id) {
    console.log("Background received parsedYouTubeLinkPreviewResults:", request.data, "for tab:", sender.tab.id);
    const tabId = sender.tab.id; 
    if (pendingBookmarks[tabId] && pendingBookmarks[tabId].isLinkParsing) { // Check for isLinkParsing flag
        const { bookmarkBase, callback } = pendingBookmarks[tabId];
        if (request.error) {
            console.error("Error from content script parsing link preview:", request.error);
            callback(bookmarkBase); 
            delete pendingBookmarks[tabId];
            return true;
        }
        const details = request.data;
        let finalBookmarkData = { ...bookmarkBase }; 

        if (bookmarkBase.type === 'youtube_video') {
            finalBookmarkData.title = details.videoTitle || bookmarkBase.title;
            finalBookmarkData.thumbnailUrl = details.videoThumbnailUrl || null;
            finalBookmarkData.faviconUrl = details.channelIconUrl || null; 
        } else if (bookmarkBase.type === 'youtube_channel') {
            finalBookmarkData.title = details.channelTitle || bookmarkBase.title;
            finalBookmarkData.url = details.channelUrl || bookmarkBase.url; 
            finalBookmarkData.faviconUrl = details.channelIconUrl || null; 
            finalBookmarkData.thumbnailUrl = details.channelIconUrl || null;
        }
        callback(finalBookmarkData);
        delete pendingBookmarks[tabId];
    } else {
      console.warn("Received parsedYouTubeLinkPreviewResults but no matching pendingBookmark or not a link parsing operation for tab:", tabId);
    }
    return true;
  }
  return true; // Keep true for async possibilities
});

chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (!tab && (info.menuItemId !== "bookmarkYouTubeChannel" && info.menuItemId !== "bookmarkVideoFromLink" && info.menuItemId !== "bookmarkChannelFromLink")) {
    console.error("Tab information is not available for this context menu action.");
    return;
  }

  const pageUrl = info.pageUrl || (tab ? tab.url : "");
  const linkUrl = info.linkUrl;
  const srcUrl = info.srcUrl;
  const selectionText = info.selectionText;
  const initialPageTitle = tab ? (tab.title || (selectionText ? selectionText.substring(0, 50) + "..." : (linkUrl || pageUrl))) : (selectionText ? selectionText.substring(0, 50) + "..." : (linkUrl || pageUrl));

  let bookmarkBase = {
    id: 'id_' + new Date().getTime(),
    title: initialPageTitle,
    url: pageUrl, 
    type: 'page', 
    added_date: new Date().toISOString(),
    text: null,
    faviconUrl: null,
    thumbnailUrl: null
  };

  let shouldInjectContentScript = true; // Default to injecting content script

  if (info.menuItemId === "bookmarkPage") {
    bookmarkBase.url = pageUrl;
    bookmarkBase.title = tab ? tab.title : "Bookmarked Page";
    if (pageUrl.includes("youtube.com/watch")) bookmarkBase.type = 'youtube_video';
    else if (pageUrl.includes("youtube.com/channel/") || pageUrl.includes("youtube.com/@")) bookmarkBase.type = 'youtube_channel';
    else bookmarkBase.type = 'page';
  
  } else if (info.menuItemId === "bookmarkYouTubeVideo") {
    if (pageUrl && pageUrl.includes("youtube.com/watch")) bookmarkBase.url = pageUrl;
    else if (srcUrl && (srcUrl.includes("youtube.com/embed/") || srcUrl.includes("youtube.com/v/"))) bookmarkBase.url = srcUrl;
    else bookmarkBase.url = pageUrl; 
    bookmarkBase.title = tab ? tab.title : "YouTube Video";
    bookmarkBase.type = 'youtube_video';

  } else if (info.menuItemId === "bookmarkYouTubeChannel") {
    if (!linkUrl || !(linkUrl.includes("youtube.com/channel/") || linkUrl.includes("youtube.com/@"))) {
        console.log("Context Menu: 'bookmarkYouTubeChannel' clicked, but not a valid channel URL:", linkUrl);
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Invalid Link', message: 'This does not appear to be a valid YouTube channel link.' });
        return; 
    }
    bookmarkBase.url = linkUrl;
    bookmarkBase.title = "YouTube Channel: " + linkUrl.substring(linkUrl.lastIndexOf('/') + 1).replace(/^@/, '');
    bookmarkBase.type = 'youtube_channel';

    if (tab && tab.url === linkUrl) { // Already on the channel page
        console.log("Bookmarking YouTube channel: User is already on the channel page.");
        // Let shouldInjectContentScript remain true
    } else if (tab && tab.id) { // Link on a different page, use temp tab
        console.log("Bookmarking YouTube channel: Link is on a different page. Opening temp tab for", linkUrl);
        shouldInjectContentScript = false; // Don't inject into current tab
        chrome.tabs.create({ url: linkUrl, active: false }, function(newTab) {
            if (chrome.runtime.lastError || !newTab || !newTab.id) {
                console.error("Error creating temp tab:", chrome.runtime.lastError);
                chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error', message: 'Could not open temporary tab to fetch channel info.' });
                saveBookmarkToStorage(bookmarkBase); // Fallback: save basic info
                return;
            }
            const tempTabId = newTab.id;
            pendingBookmarks[tempTabId] = {
                bookmarkBase, // Contains the correct channel URL and temporary title
                callback: function(fullBookmarkData) {
                    saveBookmarkToStorage(fullBookmarkData);
                    chrome.tabs.remove(tempTabId, () => console.log("Temp tab removed:", tempTabId, chrome.runtime.lastError?.message || "Success"));
                },
                isTempTab: true
            };
            function tempTabUpdateListener(updatedTabId, changeInfo, updatedTab) {
                if (updatedTabId === tempTabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(tempTabUpdateListener);
                    console.log("Temp tab", tempTabId, "loaded. Injecting content script.");
                    chrome.scripting.executeScript(
                        { target: { tabId: tempTabId }, files: ['content_script.js'] },
                        handleScriptInjectionResult.bind(null, tempTabId)
                    );
                }
            }
            chrome.tabs.onUpdated.addListener(tempTabUpdateListener);
            setTimeout(() => {
                if (pendingBookmarks[tempTabId]) { 
                    chrome.tabs.onUpdated.removeListener(tempTabUpdateListener);
                    console.warn("Timeout for temp tab", tempTabId);
                    chrome.tabs.get(tempTabId, (existingTab) => {
                        if (existingTab) {
                            chrome.scripting.executeScript(
                                { target: { tabId: tempTabId }, files: ['content_script.js'] },
                                handleScriptInjectionResult.bind(null, tempTabId)
                            );
                        } else {
                            console.error("Temp tab", tempTabId, "not found after timeout.");
                            if (pendingBookmarks[tempTabId]) { // Check again before calling
                                pendingBookmarks[tempTabId].callback(bookmarkBase);
                                delete pendingBookmarks[tempTabId];
                            }
                        }
                    });
                }
            }, 15000); 
        });
        return; // This path is fully handled.
    } else { // No source tab context for temp tab
        console.warn("Cannot open temp tab for channel link, no source tab context (tab or tab.id missing).");
        saveBookmarkToStorage(bookmarkBase); // Fallback: save basic info
        return;
    }

  } else if (info.menuItemId === "bookmarkSelection") {
    bookmarkBase.url = pageUrl;
    bookmarkBase.title = selectionText; 
    bookmarkBase.type = 'selection';
    bookmarkBase.text = selectionText;
  
  } else if (info.menuItemId === "bookmarkVideoFromLink") {
    if (!tab || !tab.id) { console.error("Tab ID missing for bookmarkVideoFromLink"); return; }
    if (!info.linkUrl || !info.linkUrl.includes("youtube.com/watch")) {
       chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Action Failed', message: 'This link does not seem to be a direct YouTube video.' });
       return;
    }
    const videoPageUrl = info.linkUrl;
    shouldInjectContentScript = false; // We use sendMessage directly for this one
    
    let videoId = 'video'; try { videoId = new URL(videoPageUrl).searchParams.get('v') || videoId; } catch(e){}
    bookmarkBase = { 
        id: 'id_' + new Date().getTime(), type: 'youtube_video', url: videoPageUrl, 
        title: "YT Video: " + videoId, 
        added_date: new Date().toISOString()
    };
    pendingBookmarks[tab.id] = { bookmarkBase, callback: saveBookmarkToStorage, isLinkParsing: true }; 
    
    chrome.tabs.sendMessage(tab.id, { action: "parseYouTubeLinkPreview", linkUrl: videoPageUrl }, function(response) {
      if (!(pendingBookmarks[tab.id] && pendingBookmarks[tab.id].isLinkParsing && pendingBookmarks[tab.id].bookmarkBase.url === videoPageUrl)) {
        console.log("Stale or irrelevant parseYouTubeLinkPreview response for video link, ignoring.");
        return;
      }

      const currentPending = pendingBookmarks[tab.id]; // Get current pending data
      delete pendingBookmarks[tab.id]; // Clean up immediately

      if (chrome.runtime.lastError || !response || !response.action || response.action !== "parsedYouTubeLinkPreviewResults" || !response.data) {
        console.error("Error with parseYouTubeLinkPreview response for video:", chrome.runtime.lastError?.message, response);
        currentPending.bookmarkBase.thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`; 
        saveBookmarkToStorage(currentPending.bookmarkBase);
        return;
      }
      
      const details = response.data;
      const finalBookmark = {
        ...currentPending.bookmarkBase, // Start with base (id, type, url, date, temp title)
        title: details.videoTitle || currentPending.bookmarkBase.title, 
        url: details.videoUrl || videoPageUrl, 
        faviconUrl: details.channelIconUrl || null, 
        thumbnailUrl: details.videoThumbnailUrl, 
      };
      saveBookmarkToStorage(finalBookmark);
    });
    return;

  } else if (info.menuItemId === "bookmarkChannelFromLink") {
    if (!tab || !tab.id) { console.error("Tab ID missing for bookmarkChannelFromLink"); return; }
    const sourceLinkUrl = info.linkUrl; 
    shouldInjectContentScript = false; 
    if (!sourceLinkUrl || !(sourceLinkUrl.includes("youtube.com/channel/") || sourceLinkUrl.includes("youtube.com/@") || sourceLinkUrl.includes("youtube.com/watch"))) {
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Invalid Link', message: 'This link is not a recognizable YouTube video or channel link.' });
        return;
    }
     bookmarkBase = { 
        id: 'id_' + new Date().getTime(), type: 'youtube_channel', url: sourceLinkUrl, 
        title: "YT Channel (from link)", added_date: new Date().toISOString()
    };
    pendingBookmarks[tab.id] = { bookmarkBase, callback: saveBookmarkToStorage, isLinkParsing: true };

    chrome.tabs.sendMessage(tab.id, { action: "parseYouTubeLinkPreview", linkUrl: sourceLinkUrl }, function(response) {
      if (!(pendingBookmarks[tab.id] && pendingBookmarks[tab.id].isLinkParsing && pendingBookmarks[tab.id].bookmarkBase.url === sourceLinkUrl)) {
        console.log("Stale or irrelevant parseYouTubeLinkPreview response for channel link, ignoring.");
        return;
      }
      
      const currentPending = pendingBookmarks[tab.id];
      delete pendingBookmarks[tab.id];

      if (chrome.runtime.lastError || !response || !response.action || response.action !== "parsedYouTubeLinkPreviewResults" || !response.data) {
        console.error("Error with parseYouTubeLinkPreview for channel:", chrome.runtime.lastError?.message, response);
        saveBookmarkToStorage(currentPending.bookmarkBase);
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error', message: 'Could not get channel details from page (script error).' });
        return;
      }
      const details = response.data;
      if (details.channelUrl && details.channelTitle) {
        const finalBookmark = {
          ...currentPending.bookmarkBase, 
          title: details.channelTitle,
          url: details.channelUrl, 
          faviconUrl: details.channelIconUrl || null, 
          thumbnailUrl: details.channelIconUrl || null, 
        };
        saveBookmarkToStorage(finalBookmark);
      } else {
        saveBookmarkToStorage(currentPending.bookmarkBase); 
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Action Failed', message: 'Could not identify channel from this link/preview.' });
      }
    });
    return;

  } else if (info.menuItemId === "bookmarkWebsiteFromPage") {
    if (!tab || !tab.id) { console.error("Tab ID missing for bookmarkWebsiteFromPage"); return; }
    try {
      const currentUrl = new URL(pageUrl);
      bookmarkBase.url = currentUrl.origin;
      bookmarkBase.title = currentUrl.hostname; 
      bookmarkBase.type = 'website';
      // Let shouldInjectContentScript remain true to get favicon
    } catch (e) { 
        console.error("Error parsing pageUrl for website bookmark:", e);
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error', message: 'Could not determine website domain from URL.'});
        return; 
    }
  
  } else { // Unknown menu item
    console.error("Unknown context menu item clicked:", info.menuItemId);
    return;
  }

  // Common script injection logic (if not returned already by a specific handler)
  if (shouldInjectContentScript && tab && tab.id) {
    pendingBookmarks[tab.id] = { bookmarkBase, callback: saveBookmarkToStorage };
    chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ['content_script.js'] },
        handleScriptInjectionResult.bind(null, tab.id)
    );
  } else if (!shouldInjectContentScript && bookmarkBase.url) {
    // This case should ideally not be hit if all specific handlers that set
    // shouldInjectContentScript=false also 'return' or have their own saving logic.
    // If it is hit, it means a direct save is needed without script injection.
    // console.warn("Executing direct save for a case where shouldInjectContentScript was false and handler did not return:", bookmarkBase);
    // saveBookmarkToStorage(bookmarkBase); // This line was commented out as per previous logic.
  } else if (!tab || !tab.id && shouldInjectContentScript) {
      console.error("Cannot inject script, tab ID not available for bookmark type:", bookmarkBase.type);
  }
});

console.log("Background script loaded and context menu listeners should be active.");
