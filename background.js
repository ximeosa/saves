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

// New function to process data from content script for channel extraction from video page
function processChannelExtraction(dataFromMessageHandler) {
  const { extractedChannelUrl, extractedChannelTitle, faviconUrlFromVideoPage, originalVideoUrl, id: originalBookmarkId } = dataFromMessageHandler;

  if (extractedChannelUrl && typeof extractedChannelUrl === 'string' && extractedChannelUrl.trim() !== '') {
    const finalChannelBookmark = {
      id: originalBookmarkId, // Use original ID from pendingBookmark.bookmarkBase.id for consistency
      type: 'youtube_channel',
      url: extractedChannelUrl.trim(),
      title: (extractedChannelTitle || new URL(extractedChannelUrl).pathname.replace(/^@/, '').replace(/^\//, '')).trim(),
      faviconUrl: faviconUrlFromVideoPage, // This is the channel icon from video page
      thumbnailUrl: faviconUrlFromVideoPage, // Use same for channel thumbnail
      added_date: new Date().toISOString(),
      sourceVideoUrl: originalVideoUrl // Optional: for context
    };
    console.log("[BG_ChanFromLink] Saving final channel bookmark:", JSON.stringify(finalChannelBookmark));
    saveBookmarkToStorage(finalChannelBookmark);
  } else {
    console.warn("[BG_ChanFromLink] Content script did not find extractedChannelUrl from video page %s.", originalVideoUrl);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/48.png',
      title: 'Channel Not Found',
      message: 'Could not extract channel link from the video page. No bookmark saved.'
    });
  }
}

// Modified handleScriptInjectionResult signature and body
function handleScriptInjectionResult(tabId, injectionResults, bookmarkBaseForThisOperation) {
    // This function is primarily for the 'bookmarkYouTubeChannel' (direct channel link) temp tab.
    // For 'bookmarkChannelFromLink' (video link to channel), injection failure is handled in its specific callback.
    if (chrome.runtime.lastError || !injectionResults || !injectionResults.length === 0) {
        const errorMessage = chrome.runtime.lastError?.message || "No injection results returned.";
        console.error(`[INJ_FAIL] Content script injection failed for tab ${tabId}:`, errorMessage); 
        
        if (pendingBookmarks[tabId]) {
            const { callback, isTempTab, operation } = pendingBookmarks[tabId]; 
            if (isTempTab && operation !== 'extractChannelFromVideo') { // Ensure it's for the original temp tab channel use case
                console.log("[CHAN_CTX_DEBUG] Script injection failed for temp tab %s (direct channel link). Calling callback with basic info. Error: %s", tabId, errorMessage);
                bookmarkBaseForThisOperation.isFallbackSave = true; 
            }
            // For 'extractChannelFromVideo', this path shouldn't ideally be hit due to specific error handling,
            // but if it is, we let the generic path proceed, though it might lead to a less specific outcome.
            console.log(`[INJ_FAIL] Invoking callback for tab ${tabId} with original bookmarkBase due to injection failure. Operation: ${operation}`); 
            callback(bookmarkBaseForThisOperation); 
            delete pendingBookmarks[tabId];
        }
    } else {
        console.log(`[INJ_SUCCESS] Content script injected successfully for tab ${tabId}. Waiting for onMessage response. Operation: ${pendingBookmarks[tabId]?.operation}`); 
    }
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "extractedPageInfo" && sender.tab && sender.tab.id) {
    const tabId = sender.tab.id;
    const pending = pendingBookmarks[tabId];

    if (pending) {
      if (pending.operation === 'extractChannelFromVideo') {
        console.log("[BG_ChanFromLink] Received extractedPageInfo from temp video tab %s for channel extraction.", tabId);

        // --- Start of new debug logging ---
        console.log("--------------------------------------------------------------------");
        console.log("[BG_CS_DEBUG] Debug Info from Content Script (for video page processing):");
        console.log("[BG_CS_DEBUG] Target Video URL (from pending bookmark):", pending.bookmarkBase.originalVideoUrl);
        console.log("[BG_CS_DEBUG] Page was identified as watch page by CS:", request.data.debug_cs_isWatchPage);
        console.log("[BG_CS_DEBUG] CS: Channel Img Found:", request.data.debug_cs_channelImgFound, "- CS Src:", request.data.debug_cs_channelImgSrc);
        console.log("[BG_CS_DEBUG] CS: Channel Link Element Found:", request.data.debug_cs_channelLinkElementFound, "- CS Href:", request.data.debug_cs_channelLinkElementHref);
        console.log("[BG_CS_DEBUG] CS: Channel Name Element Found:", request.data.debug_cs_channelNameElementFound, "- CS Text:", request.data.debug_cs_channelNameContent);
        console.log("[BG_CS_DEBUG] CS: Used Fallback Channel Title:", request.data.debug_cs_usedFallbackChannelTitle, "- CS Fallback Title:", request.data.debug_cs_fallbackChannelTitle);
        console.log("[BG_CS_DEBUG] CS Final Extracted Channel URL for bookmark:", request.data.extractedChannelUrl);
        console.log("[BG_CS_DEBUG] CS Final Extracted Channel Title for bookmark:", request.data.extractedChannelTitle);
        console.log("[BG_CS_DEBUG] CS Final Favicon URL (channel avatar from video page):", request.data.faviconUrl);
        console.log("--------------------------------------------------------------------");
        // --- End of new debug logging ---

        const dataForCallback = {
            extractedChannelUrl: request.data.extractedChannelUrl,
            extractedChannelTitle: request.data.extractedChannelTitle,
            faviconUrlFromVideoPage: request.data.faviconUrl, // Channel icon from video page
            originalVideoUrl: pending.bookmarkBase.originalVideoUrl,
            id: pending.bookmarkBase.id // Keep original ID
        };
        pending.callback(dataForCallback); // Calls processChannelExtraction
        
        console.log("[BG_ChanFromLink] Attempting to remove temp video tab:", tabId);
        chrome.tabs.remove(tabId, () => { 
            if (chrome.runtime.lastError) {
                console.error("[BG_ChanFromLink] Error removing temp video tab %s: %s", tabId, chrome.runtime.lastError.message);
            } else {
                console.log("[BG_ChanFromLink] Temp video tab %s removed successfully after channel extraction.", tabId);
            }
        });
        delete pendingBookmarks[tabId];
        return true; // Indicate response will be sent asynchronously (though we don't send one here)

      } else if (pending.isTempTab) { // Original temp tab logic for direct channel links
        console.log("[CHAN_CTX_DEBUG] Received extractedPageInfo from temp tab (direct channel link):", tabId, "Data:", request.data);
        const { bookmarkBase, callback } = pending;
        let updatedTitle = request.data.pageTitle || bookmarkBase.title;
        let updatedFaviconUrl = request.data.faviconUrl || null;
        let updatedThumbnailUrl = request.data.thumbnailUrl || null;

        if (bookmarkBase.type === 'youtube_channel') { // This should be the case for this path
            updatedTitle = request.data.pageTitle || bookmarkBase.title; 
            updatedFaviconUrl = request.data.faviconUrl || bookmarkBase.faviconUrl; 
            updatedThumbnailUrl = request.data.thumbnailUrl || bookmarkBase.thumbnailUrl;
        }
        
        const fullBookmark = {
            ...bookmarkBase,
            title: updatedTitle,
            url: bookmarkBase.url, // Keep original URL for direct channel links
            faviconUrl: updatedFaviconUrl,
            thumbnailUrl: updatedThumbnailUrl,
        };
        console.log("[CHAN_CTX_DEBUG] Pending bookmark data for temp tab %s (direct channel link) before calling save:", tabId, JSON.stringify(fullBookmark));
        callback(fullBookmark); 
        delete pendingBookmarks[tabId];
        return true;

      } else { // For non-temp tabs (e.g., popup initiated, page context)
        console.log("Background received page info from content script (non-temp tab):", request.data, "for tab:", tabId);
        const { bookmarkBase, callback } = pending;
        let updatedTitle = request.data.pageTitle || bookmarkBase.title;
        let updatedFaviconUrl = request.data.faviconUrl || null;
        let updatedThumbnailUrl = request.data.thumbnailUrl || null;

        if (bookmarkBase.type === 'website') {
            updatedTitle = bookmarkBase.title; 
            updatedThumbnailUrl = null;      
        }
        // Potentially other types could be handled here if needed for non-temp tabs
        
        const fullBookmark = {
            ...bookmarkBase,
            title: updatedTitle,
            url: request.data.pageUrl || bookmarkBase.url, // Use pageUrl from content script if available
            faviconUrl: updatedFaviconUrl,
            thumbnailUrl: updatedThumbnailUrl,
        };
        callback(fullBookmark); 
        delete pendingBookmarks[tabId];
        return true;
      }
    } else {
      console.warn("Received extractedPageInfo but no matching pendingBookmark for tabId:", tabId);
    }
    return true; 
  } else if (request.action === "parsedYouTubeLinkPreviewResults" && sender.tab && sender.tab.id) {
    // This block is for the old "bookmarkVideoFromLink" and the now-removed part of "bookmarkChannelFromLink"
    // It might still be used by "bookmarkVideoFromLink".
    console.log("Background received parsedYouTubeLinkPreviewResults:", request.data, "for tab:", sender.tab.id);
    const tabId = sender.tab.id; 
    const pending = pendingBookmarks[tabId];
    if (pending && pending.isLinkParsing) { // Check if it's the correct type of pending operation
        const { bookmarkBase, callback } = pending;
        if (request.error) {
            console.error("Error from content script parsing link preview:", request.error);
            callback(bookmarkBase); // Send original base data on error
            delete pendingBookmarks[tabId];
            return true;
        }
        const details = request.data;
        let finalBookmarkData = { ...bookmarkBase }; 

        if (bookmarkBase.type === 'youtube_video') {
            finalBookmarkData.title = details.videoTitle || bookmarkBase.title;
            finalBookmarkData.thumbnailUrl = details.videoThumbnailUrl || null;
            finalBookmarkData.faviconUrl = details.channelIconUrl || null; 
        } 
        // No 'youtube_channel' case here anymore as that's handled by the temp tab flow or new video-to-channel flow
        
        callback(finalBookmarkData);
        delete pendingBookmarks[tabId];
    } else {
      console.warn("Received parsedYouTubeLinkPreviewResults but no matching or valid pendingBookmark for tab:", tabId);
    }
    return true;
  }
  // Important: Return true for onMessage listeners that use sendResponse asynchronously.
  // However, for listeners that don't call sendResponse, it's better to return false or undefined
  // if no other listener will handle the message. Here, we return true for simplicity as most paths might.
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
    // --- Refactored bookmarkChannelFromLink ---
    if (!tab || !tab.id) { 
        console.error("[BG_ChanFromLink] Tab ID missing for 'bookmarkChannelFromLink'. This should not happen if context is a link on a page."); 
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error', message: 'Cannot initiate action: Tab context is missing.' });
        return; 
    }
    const videoUrl = info.linkUrl; 
    shouldInjectContentScript = false; // We are using a temp tab, not injecting into the current tab.

    // Input Validation: Check if it's a YouTube video URL
    if (!videoUrl || !videoUrl.includes("youtube.com/watch")) {
        console.log("[BG_ChanFromLink] Clicked link is not a YouTube video URL:", videoUrl);
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Invalid Link', message: 'This link does not appear to be a YouTube video. Please click on a direct video link.' });
        return;
    }

    // Initial bookmarkBase
    bookmarkBase = { 
        id: 'id_' + new Date().getTime(), 
        type: 'youtube_channel', // The final type will be youtube_channel
        url: videoUrl, // Store video URL temporarily, will be replaced by channel URL
        title: "Fetching channel info for video...", // Placeholder title
        added_date: new Date().toISOString(),
        faviconUrl: null, 
        thumbnailUrl: null,
        originalVideoUrl: videoUrl // Store for reference
    };
    
    console.log("[BG_ChanFromLink] Creating temp tab for video URL to extract channel info:", videoUrl);
    chrome.tabs.create({ url: videoUrl, active: false }, function(newTab) {
        if (chrome.runtime.lastError || !newTab || !newTab.id) {
            console.error("[BG_ChanFromLink] Failed to create temporary tab for video %s. Error: %s", videoUrl, chrome.runtime.lastError?.message);
            chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error', message: 'Failed to create temporary tab to analyze video page.' });
            // No pendingBookmark to clean up here yet.
            return;
        }
        const tempTabId = newTab.id;
        console.log("[BG_ChanFromLink] Temp video tab created with ID:", tempTabId);

        pendingBookmarks[tempTabId] = { 
            bookmarkBase, // The initial base object
            callback: processChannelExtraction, // The new function to handle the extracted data
            isTempTab: true, // Still a temp tab
            operation: 'extractChannelFromVideo' // Differentiator for onMessage
        };

        // Listener for when the temporary tab is fully loaded
        function tempTabUpdateListenerForVideo(updatedTabId, changeInfo, updatedTab) {
            if (updatedTabId === tempTabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(tempTabUpdateListenerForVideo); // Clean up listener
                console.log("[BG_ChanFromLink] Temp video tab %s status complete. Injecting script.", tempTabId);
                
                chrome.scripting.executeScript(
                    { target: { tabId: tempTabId }, files: ['content_script.js'] },
                    (injectionResults) => {
                        if (chrome.runtime.lastError || !injectionResults || injectionResults.length === 0) {
                            console.error("[BG_ChanFromLink] Failed to inject script into temp video tab %s. Error: %s", tempTabId, chrome.runtime.lastError?.message);
                            chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error Fetching Channel', message: 'Could not analyze video page for channel info (script injection failed).' });
                            chrome.tabs.remove(tempTabId, () => { if (chrome.runtime.lastError) console.error("[BG_ChanFromLink] Error removing failed temp video tab %s: %s", tempTabId, chrome.runtime.lastError.message); });
                            delete pendingBookmarks[tempTabId];
                        } else {
                            console.log("[BG_ChanFromLink] Script injected successfully into temp video tab %s.", tempTabId);
                            // Now we wait for onMessage from the content script's extractInitialPageInfo
                        }
                    }
                );
            }
        }
        chrome.tabs.onUpdated.addListener(tempTabUpdateListenerForVideo);

        // Timeout for the temporary video tab
        setTimeout(() => {
            if (pendingBookmarks[tempTabId]) { // If it hasn't been processed and deleted by onMessage
                console.warn("[BG_ChanFromLink] Timeout for temp video tab %s.", tempTabId);
                chrome.tabs.onUpdated.removeListener(tempTabUpdateListenerForVideo); // Clean up listener
                chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Timeout', message: 'Timed out trying to fetch channel info from video page.' });
                chrome.tabs.remove(tempTabId, () => { 
                    if (chrome.runtime.lastError) {
                        console.error("[BG_ChanFromLink] Error removing timed-out temp video tab %s: %s", tempTabId, chrome.runtime.lastError.message);
                    }
                });
                delete pendingBookmarks[tempTabId];
            }
        }, 20000); // 20 seconds timeout
    });
    return; // End of refactored bookmarkChannelFromLink

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
