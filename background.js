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
      title: "Bookmark YouTube Channel", 
      contexts: ["link"],
      targetUrlPatterns: ["*://*.youtube.com/channel/*", "*://*.youtube.com/@*"]
    });

    // Context menu for any selected text
    chrome.contextMenus.create({
      id: "bookmarkSelection",
      title: "Bookmark selection",
      contexts: ["selection"]
    });

    chrome.contextMenus.create({
      id: "bookmarkVideoFromLink",
      title: "Bookmark YouTube Video (from link)",
      contexts: ["link"],
      documentUrlPatterns: ["*://*.youtube.com/*"] 
    });

    chrome.contextMenus.create({
      id: "bookmarkChannelFromLink",
      title: "Bookmark Channel (from link)",
      contexts: ["link"],
      documentUrlPatterns: ["*://*.youtube.com/*"] 
    });

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

function saveBookmarkToStorage(bookmarkData) {
  console.log("[CHAN_CTX_DEBUG] saveBookmarkToStorage called with:", JSON.stringify(bookmarkData));
  const isFallback = bookmarkData.isFallbackSave === true;
  if (bookmarkData.hasOwnProperty('isFallbackSave')) {
    delete bookmarkData.isFallbackSave; // Clean the property before saving
  }
  // console.log("Attempting to save from background:", bookmarkData); // Original log
  chrome.storage.local.get({ bookmarks: [] }, function(data) {
    let bookmarks = data.bookmarks;
    let alreadyExists = false;
    if (bookmarkData.type === 'selection') {
        alreadyExists = bookmarks.some(bm => bm.url === bookmarkData.url && bm.text === bookmarkData.text);
    } else {
        alreadyExists = bookmarks.some(bm => bm.url === bookmarkData.url && bm.type === bookmarkData.type);
    }

    if (alreadyExists) {
      console.log("[CHAN_CTX_DEBUG] Bookmark already exists for URL:", bookmarkData.url, "Type:", bookmarkData.type);
      // console.log('Background: Item already bookmarked.', bookmarkData.url, bookmarkData.title); // Original log
      chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Already Bookmarked', message: `"${bookmarkData.title.substring(0,30)}..." is already in your bookmarks.` });
      return;
    }
    bookmarks.unshift(bookmarkData); // bookmarkData no longer has isFallbackSave here
    chrome.storage.local.set({ bookmarks: bookmarks }, function() {
      if (chrome.runtime.lastError) {
        console.error('Background: Error saving bookmark:', chrome.runtime.lastError);
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error', message: `Failed to save bookmark: ${bookmarkData.title.substring(0,30)}...` });
      } else {
        console.log('Background: Bookmark saved successfully!', bookmarkData);
        if (isFallback) {
          chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Bookmarked (Basic Info)', message: `"${bookmarkData.title.substring(0,30)}..." saved. Full details couldn't be fetched.` });
        } else {
          chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Bookmarked!', message: `"${bookmarkData.title.substring(0,30)}..." saved.` });
        }
      }
    });
  });
}

let pendingBookmarks = {}; 

// Modified handleScriptInjectionResult signature and body
function handleScriptInjectionResult(tabId, injectionResults, bookmarkBaseForThisOperation) {
    if (chrome.runtime.lastError || !injectionResults || !injectionResults.length === 0) {
        const errorMessage = chrome.runtime.lastError?.message || "No injection results returned.";
        console.error(`[INJ_FAIL] Content script injection failed for tab ${tabId}:`, errorMessage); // LOG A
        
        if (pendingBookmarks[tabId]) {
            const { callback, isTempTab } = pendingBookmarks[tabId]; 
            if (isTempTab) { // Check if this is related to a temp tab for channel bookmarking
                console.log("[CHAN_CTX_DEBUG] Script injection failed for temp tab %s. Calling callback with basic info. Error: %s", tabId, errorMessage);
                bookmarkBaseForThisOperation.isFallbackSave = true; // Mark as fallback
            }
            console.log(`[INJ_FAIL] Invoking callback for tab ${tabId} with original bookmarkBase due to injection failure.`); // LOG B
            callback(bookmarkBaseForThisOperation); 
            delete pendingBookmarks[tabId];
        }
    } else {
        console.log(`[INJ_SUCCESS] Content script injected successfully for tab ${tabId}. Waiting for onMessage response.`); // LOG C
    }
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "extractedPageInfo" && sender.tab && sender.tab.id) {
    // console.log("Background received page info from content script:", request.data, "for tab:", sender.tab.id); // Original log
    const tabId = sender.tab.id;
    if (pendingBookmarks[tabId]) {
      const { bookmarkBase, callback, isTempTab } = pendingBookmarks[tabId]; 
      if (isTempTab) {
        console.log("[CHAN_CTX_DEBUG] Received extractedPageInfo from temp tab:", sender.tab.id, "Data:", request.data);
      } else {
        console.log("Background received page info from content script:", request.data, "for tab:", sender.tab.id);
      }

      let updatedTitle = request.data.pageTitle || bookmarkBase.title;
      let updatedFaviconUrl = request.data.faviconUrl || null;
      let updatedThumbnailUrl = request.data.thumbnailUrl || null;

      if (bookmarkBase.type === 'website') {
        updatedTitle = bookmarkBase.title; 
        updatedThumbnailUrl = null;      
      } else if (bookmarkBase.type === 'youtube_channel') {
        updatedTitle = request.data.pageTitle || bookmarkBase.title; 
        updatedFaviconUrl = request.data.faviconUrl || bookmarkBase.faviconUrl; 
        updatedThumbnailUrl = request.data.thumbnailUrl || bookmarkBase.thumbnailUrl;
      }
      
      const fullBookmark = {
        ...bookmarkBase,
        title: updatedTitle,
        url: isTempTab ? bookmarkBase.url : (request.data.pageUrl || bookmarkBase.url),
        faviconUrl: updatedFaviconUrl,
        thumbnailUrl: updatedThumbnailUrl,
      };
      if (isTempTab) { 
          fullBookmark.url = bookmarkBase.url; // Ensure original URL for temp tab derived bookmarks
          console.log("[CHAN_CTX_DEBUG] Pending bookmark data for temp tab %s before calling save:", tabId, JSON.stringify(fullBookmark));
      }

      callback(fullBookmark); 
      delete pendingBookmarks[tabId]; 
    }
    return true; 
  } else if (request.action === "parsedYouTubeLinkPreviewResults" && sender.tab && sender.tab.id) {
    console.log("Background received parsedYouTubeLinkPreviewResults:", request.data, "for tab:", sender.tab.id);
    const tabId = sender.tab.id; 
    if (pendingBookmarks[tabId] && pendingBookmarks[tabId].isLinkParsing) {
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
  return true; 
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

  let shouldInjectContentScript = true;

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

    if (tab && tab.url === linkUrl) { 
        console.log("Bookmarking YouTube channel: User is already on the channel page.");
    } else if (tab && tab.id) { 
        // console.log("[CHAN_CTX] Starting temp tab process for URL:", linkUrl); // LOG 1 // Original log
        shouldInjectContentScript = false; 
        const tempTabTargetUrl = linkUrl;
        console.log("[CHAN_CTX_DEBUG] Creating temp tab for URL:", tempTabTargetUrl);
        const originalBookmarkBaseForTempTab = { ...bookmarkBase }; 

        chrome.tabs.create({ url: tempTabTargetUrl, active: false }, function(newTab) {
            const tempTabId = newTab ? newTab.id : null;
            console.log("[CHAN_CTX_DEBUG] Temp tab created with ID:", tempTabId, "Error:", chrome.runtime.lastError ? chrome.runtime.lastError.message : "None");
            if (chrome.runtime.lastError || !newTab || !tempTabId) {
                console.error("[CHAN_CTX] Error creating temp tab:", chrome.runtime.lastError?.message); // LOG 2
                chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error', message: 'Could not open temporary tab to fetch channel info.' });
                saveBookmarkToStorage(originalBookmarkBaseForTempTab); 
                return;
            }
            // const tempTabId = newTab.id; // Already assigned
            console.log(`[CHAN_CTX] Temp tab ${tempTabId} created for ${tempTabTargetUrl}. Active: ${newTab.active}`); // LOG 3

            pendingBookmarks[tempTabId] = {
                bookmarkBase: originalBookmarkBaseForTempTab, 
                callback: function(fullBookmarkData) {
                    console.log(`[CHAN_CTX] Temp tab callback invoked for tab ${tempTabId}. Saving bookmark, then removing tab.`); // LOG 7
                    saveBookmarkToStorage(fullBookmarkData);
                    console.log("[CHAN_CTX_DEBUG] Attempting to remove temp tab:", tempTabId);
                    chrome.tabs.remove(tempTabId, function() {
                        if (chrome.runtime.lastError) {
                            console.error(`[CHAN_CTX_DEBUG] Error removing temp tab ${tempTabId}:`, chrome.runtime.lastError.message); // LOG 8
                        } else {
                            console.log(`[CHAN_CTX] Temp tab ${tempTabId} removed successfully.`); // LOG 9
                        }
                    });
                },
                isTempTab: true 
            };

            function tempTabUpdateListener(updatedTabId, changeInfo, updatedTab) {
                if (updatedTabId === tempTabId && changeInfo.status === 'complete') {
                    console.log(`[CHAN_CTX] Temp tab ${tempTabId} status complete. Removing listener and injecting script.`); // LOG 4
                    chrome.tabs.onUpdated.removeListener(tempTabUpdateListener);
                    chrome.scripting.executeScript(
                        { target: { tabId: tempTabId }, files: ['content_script.js'] },
                        (injectionResults) => handleScriptInjectionResult(tempTabId, injectionResults, originalBookmarkBaseForTempTab)
                    );
                }
            }
            chrome.tabs.onUpdated.addListener(tempTabUpdateListener);

            setTimeout(() => {
                if (pendingBookmarks[tempTabId]) { 
                    console.warn(`[CHAN_CTX_DEBUG] Timeout for temp tab ${tempTabId}. Calling callback with basic info.`); // LOG 5 (adjusted prefix)
                    chrome.tabs.onUpdated.removeListener(tempTabUpdateListener);
                    
                    const timedOutBookmarkBase = pendingBookmarks[tempTabId].bookmarkBase;
                    timedOutBookmarkBase.isFallbackSave = true; // Mark as fallback before processing

                    chrome.tabs.get(tempTabId, (existingTab) => {
                        if (existingTab) {
                            console.log(`[CHAN_CTX] Temp tab ${tempTabId} still exists after timeout. Attempting injection (will also be fallback).`); // LOG 6
                            // Even if injection works now, it's still a fallback due to timeout path
                            chrome.scripting.executeScript(
                                { target: { tabId: tempTabId }, files: ['content_script.js'] },
                                (injectionResults) => handleScriptInjectionResult(tempTabId, injectionResults, timedOutBookmarkBase) // Pass timedOutBookmarkBase
                            );
                        } else {
                            console.error(`[CHAN_CTX] Temp tab ${tempTabId} not found after timeout. Cleaning up pending bookmark.`);
                            chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error', message: 'Failed to load channel page for info extraction (timeout).' });
                            if (pendingBookmarks[tempTabId]) { 
                                pendingBookmarks[tempTabId].callback(timedOutBookmarkBase); 
                                delete pendingBookmarks[tempTabId];
                            }
                        }
                    });
                }
            }, 15000); 
        });
        return; 
    } else { 
        console.warn("Cannot open temp tab for channel link, no source tab context (tab or tab.id missing).");
        console.log("[CHAN_CTX_DEBUG] Calling saveBookmarkToStorage directly (no temp tab created):", JSON.stringify(bookmarkBase));
        saveBookmarkToStorage(bookmarkBase); 
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
    shouldInjectContentScript = false; 
    
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

      const currentPending = pendingBookmarks[tab.id]; 
      delete pendingBookmarks[tab.id]; 

      if (chrome.runtime.lastError || !response || !response.action || response.action !== "parsedYouTubeLinkPreviewResults" || !response.data) {
        console.error("Error with parseYouTubeLinkPreview response for video:", chrome.runtime.lastError?.message, response);
        currentPending.bookmarkBase.thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`; 
        saveBookmarkToStorage(currentPending.bookmarkBase);
        return;
      }
      
      const details = response.data;
      const finalBookmark = {
        ...currentPending.bookmarkBase, 
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
        console.log("[BG_ChanLink] Stale or irrelevant parseYouTubeLinkPreview response, ignoring."); // LOG BG_STALE_RESP
        return;
      }
      
      const currentPending = pendingBookmarks[tab.id];
      delete pendingBookmarks[tab.id];

      if (chrome.runtime.lastError || !response || !response.action || response.action !== "parsedYouTubeLinkPreviewResults" || !response.data) {
        console.error("[BG_ChanLink] Error with parseYouTubeLinkPreview response:", chrome.runtime.lastError?.message, response); // LOG BG_RESP_ERR
        saveBookmarkToStorage(currentPending.bookmarkBase); // Fallback to basic info from the link itself
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error', message: 'Could not get channel details from page (script error).' });
        return;
      }
      const details = response.data;
      console.log("[BG_ChanLink] Received details from content script:", JSON.parse(JSON.stringify(details))); // LOG BG_DETAILS_RECV

      // Check if channelUrl and channelTitle are present and valid (not null, undefined, or empty strings)
      if (details.channelUrl && typeof details.channelUrl === 'string' && details.channelUrl.trim() !== '' &&
          details.channelTitle && typeof details.channelTitle === 'string' && details.channelTitle.trim() !== '') {
        const bookmarkData = {
          ...currentPending.bookmarkBase, // Keep original ID, type, added_date
          title: details.channelTitle.trim(), // Use parsed channel title
          url: details.channelUrl.trim(),     // Use parsed channel URL
          faviconUrl: details.channelIconUrl || null, 
          thumbnailUrl: details.channelIconUrl || null, // Use icon as thumbnail
        };
        console.log("[BG_ChanLink] Preparing to save bookmarkData:", JSON.parse(JSON.stringify(bookmarkData))); // LOG BG_BOOKMARK_DATA
        saveBookmarkToStorage(bookmarkData);
      } else {
        // If channelUrl or channelTitle is missing or invalid, show a notification and do not save.
        console.warn("[BG_ChanLink] Could not extract valid channel URL or title from details:", JSON.parse(JSON.stringify(details))); // LOG BG_FAIL_EXTRACT
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/48.png',
          title: 'Channel Info Not Found',
          message: 'Could not extract complete channel details from the link. No bookmark was saved for this item.'
        });
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
    } catch (e) { 
        console.error("Error parsing pageUrl for website bookmark:", e);
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error', message: 'Could not determine website domain from URL.'});
        return; 
    }
  
  } else { 
    console.error("Unknown context menu item clicked:", info.menuItemId);
    return;
  }

  if (shouldInjectContentScript && tab && tab.id) {
    // Pass the current bookmarkBase to handleScriptInjectionResult's closure
    pendingBookmarks[tab.id] = { bookmarkBase, callback: saveBookmarkToStorage };
    chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ['content_script.js'] },
        (injectionResults) => handleScriptInjectionResult(tab.id, injectionResults, bookmarkBase) // Pass bookmarkBase
    );
  } else if (!shouldInjectContentScript && bookmarkBase.url) {
    console.warn("Not injecting script and no other save path taken for:", bookmarkBase);
  } else if (!tab || !tab.id && shouldInjectContentScript) {
      console.error("Cannot inject script, tab ID not available for bookmark type:", bookmarkBase.type);
  }
});

console.log("Background script loaded and context menu listeners should be active.");
