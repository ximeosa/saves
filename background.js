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

// Function for Part 3: P2 - Process definitive channel data
function processDefinitiveChannelDataP2(dataP2, originalBookmarkBaseP2) {
  console.log("[BG_ChanFromLink_P2] Processing definitive channel data. DataP2:", dataP2, "OriginalBaseP2:", originalBookmarkBaseP2);
  
  const finalTitle = dataP2.pageTitle || originalBookmarkBaseP2.title; // Title from channel page or P1
  const finalFavicon = dataP2.faviconUrl || originalBookmarkBaseP2.iconFromVideo; // Icon from channel page or P1
  const finalThumbnail = dataP2.thumbnailUrl || finalFavicon; // Banner from channel page, or favicon, or icon from P1

  const finalChannelBookmark = {
    id: originalBookmarkBaseP2.id,
    type: 'youtube_channel',
    url: originalBookmarkBaseP2.url, // This is the definitive channel URL from P1
    title: finalTitle.trim(),
    faviconUrl: finalFavicon,
    thumbnailUrl: finalThumbnail,
    added_date: originalBookmarkBaseP2.added_date,
    sourceVideoUrl: originalBookmarkBaseP2.originalVideoUrl 
  };
  console.log("[BG_ChanFromLink_P2] Saving final definitive channel bookmark data:", JSON.stringify(finalChannelBookmark));
  saveBookmarkToStorage(finalChannelBookmark);
}


// Function for Part 3: P1 - Callback for "Bookmark Channel (from link)"
function processChannelUrlFromVideoP1(dataP1, pendingDataP1) { 
  console.log("[BG_ChanFromLink_P1] Processing channel URL from video page. DataP1:", dataP1, "PendingDataP1:", pendingDataP1);
  const originalVideoUrl = pendingDataP1.videoUrl; 

  if (dataP1.extractedChannelUrl && typeof dataP1.extractedChannelUrl === 'string' && dataP1.extractedChannelUrl.trim() !== '') {
    const channelUrl = dataP1.extractedChannelUrl.trim();
    console.log("[BG_ChanFromLink_P1] Extracted Channel URL:", channelUrl, "Proceeding to Phase 2.");

    const bookmarkBaseP2 = {
      id: pendingDataP1.bookmarkBase.id, 
      type: 'youtube_channel',
      url: channelUrl, 
      title: (dataP1.extractedChannelTitle || "Fetching channel: " + new URL(channelUrl).pathname.replace(/^@/, '').replace(/^\//, '')).trim(),
      faviconUrl: dataP1.faviconUrl, 
      thumbnailUrl: dataP1.faviconUrl, 
      added_date: pendingDataP1.bookmarkBase.added_date,
      originalVideoUrl: originalVideoUrl, 
      iconFromVideo: dataP1.faviconUrl 
    };

    console.log("[BG_ChanFromLink_P2] Creating temp tab for channel URL:", channelUrl);
    chrome.tabs.create({ url: channelUrl, active: false }, function(newTabP2) {
      if (chrome.runtime.lastError || !newTabP2 || !newTabP2.id) {
        console.error("[BG_ChanFromLink_P2] Failed to create temporary channel tab for %s. Error: %s", channelUrl, chrome.runtime.lastError?.message);
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error (P2)', message: `Could not open channel page for ${channelUrl.substring(0, 50)}...` });
        const fallbackChannelBookmark = {
            id: bookmarkBaseP2.id, type: 'youtube_channel', url: channelUrl, 
            title: bookmarkBaseP2.title, 
            faviconUrl: bookmarkBaseP2.iconFromVideo, thumbnailUrl: bookmarkBaseP2.iconFromVideo,
            added_date: bookmarkBaseP2.added_date, sourceVideoUrl: bookmarkBaseP2.originalVideoUrl,
            isFallbackSave: true 
        };
        saveBookmarkToStorage(fallbackChannelBookmark);
        return;
      }
      const tempTabIdP2 = newTabP2.id;
      console.log("[BG_ChanFromLink_P2] Temp channel tab created with ID:", tempTabIdP2);

      pendingBookmarks[tempTabIdP2] = {
        bookmarkBase: bookmarkBaseP2,
        callback: processDefinitiveChannelDataP2, 
        isTempTab: true,
        operation: 'getDefinitiveChannelInfoP2'
      };

      function tempTabUpdateListenerForChannelP2(updatedTabId, changeInfo, updatedTab) {
        if (updatedTabId === tempTabIdP2 && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(tempTabUpdateListenerForChannelP2);
          console.log("[BG_ChanFromLink_P2] Temp channel tab %s status complete. Injecting script.", tempTabIdP2);
          chrome.scripting.executeScript(
            { target: { tabId: tempTabIdP2 }, files: ['content_script.js'] },
            (injectionResults) => {
              if (chrome.runtime.lastError || !injectionResults || injectionResults.length === 0) {
                console.error("[BG_ChanFromLink_P2] Failed to inject script into temp channel tab %s. Error: %s", tempTabIdP2, chrome.runtime.lastError?.message);
                chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error Fetching Channel (P2)', message: `Could not analyze channel page for ${channelUrl.substring(0,50)}... (script injection failed).` });
                chrome.tabs.remove(tempTabIdP2, () => { if (chrome.runtime.lastError) console.error("[BG_ChanFromLink_P2] Error removing failed temp channel tab %s: %s", tempTabIdP2, chrome.runtime.lastError.message); });
                const p2FallbackBookmark = { ...pendingBookmarks[tempTabIdP2].bookmarkBase, isFallbackSave: true };
                saveBookmarkToStorage(p2FallbackBookmark); 
                delete pendingBookmarks[tempTabIdP2];
              } else {
                console.log("[BG_ChanFromLink_P2] Script injected successfully into temp channel tab %s.", tempTabIdP2);
              }
            }
          );
        }
      }
      chrome.tabs.onUpdated.addListener(tempTabUpdateListenerForChannelP2);

      setTimeout(() => {
        if (pendingBookmarks[tempTabIdP2]) {
          console.warn("[BG_ChanFromLink_P2] Timeout for temp channel tab %s.", tempTabIdP2);
          chrome.tabs.onUpdated.removeListener(tempTabUpdateListenerForChannelP2);
          chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Timeout (P2)', message: `Timed out trying to fetch definitive channel info from ${channelUrl.substring(0,50)}...` });
          chrome.tabs.remove(tempTabIdP2, () => { if (chrome.runtime.lastError) console.error("[BG_ChanFromLink_P2] Error removing timed-out temp channel tab %s: %s", tempTabIdP2, chrome.runtime.lastError.message); });
          const p2TimeoutFallbackBookmark = { ...pendingBookmarks[tempTabIdP2].bookmarkBase, isFallbackSave: true };
          saveBookmarkToStorage(p2TimeoutFallbackBookmark);
          delete pendingBookmarks[tempTabIdP2];
        }
      }, 20000); 
    });

  } else {
    console.warn("[BG_ChanFromLink_P1] Content script did not find extractedChannelUrl from video page %s.", originalVideoUrl);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/48.png',
      title: 'Channel URL Not Found',
      message: 'Could not find the channel URL on the video page. No bookmark saved.'
    });
  }
}


// Function for Part 2: Refactor bookmarkVideoFromLink
function processVideoBookmarkData(data, originalBookmarkBase) { // Renamed from processChannelExtraction
  console.log("[BG_VideoLink] Processing video data from temp tab:", data, "Original base:", originalBookmarkBase);
  let finalTitle = data.pageTitle || originalBookmarkBase.title;
  // Ensure title is a string and not empty
  if (typeof finalTitle !== 'string' || finalTitle.trim() === '') {
      finalTitle = "YouTube Video"; // Fallback title
      console.warn("[BG_VideoLink] Video title was empty or invalid, using default.");
  }

  let videoId = null;
  try {
    videoId = new URL(originalBookmarkBase.url).searchParams.get('v');
  } catch (e) {
    console.error("[BG_VideoLink] Error parsing video ID from URL:", originalBookmarkBase.url, e);
  }

  let finalThumbnail = data.thumbnailUrl;
  if (!finalThumbnail && videoId) {
    finalThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    console.log("[BG_VideoLink] Used hqdefault.jpg fallback for video thumbnail:", finalThumbnail);
  } else if (!finalThumbnail) {
    console.warn("[BG_VideoLink] No thumbnail could be determined for video.");
  }
  
  const finalFavicon = data.faviconUrl; // This is the channel avatar from the video page

  const videoBookmarkData = {
    ...originalBookmarkBase,
    title: finalTitle.trim(),
    thumbnailUrl: finalThumbnail,
    faviconUrl: finalFavicon, // Channel avatar from video page, stored as favicon for the video bookmark
    // Ensure 'url' and 'type' are correctly from originalBookmarkBase
  };
  console.log("[BG_VideoLink] Saving final video bookmark data:", JSON.stringify(videoBookmarkData));
  saveBookmarkToStorage(videoBookmarkData);
}


// Modified handleScriptInjectionResult signature and body
function handleScriptInjectionResult(tabId, injectionResults, bookmarkBaseForThisOperation) {
    // This function is primarily for the 'bookmarkYouTubeChannel' (direct channel link) temp tab.
    // For 'bookmarkChannelFromLink' or 'bookmarkVideoFromLink', injection failure is handled in their specific callbacks.
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
      if (pending.operation === 'getChannelUrlFromVideoP1') { // Renamed from 'extractChannelFromVideo'
        console.log("[BG_ChanFromLink_P1] Received extractedPageInfo from temp video tab %s for P1 channel URL extraction.", tabId);

        // Debug logging for P1
        console.log("--------------------------------------------------------------------");
        console.log("[BG_CS_DEBUG_ChanP1] Debug Info from Content Script (P1 for Channel from Video):");
        console.log("[BG_CS_DEBUG_ChanP1] Target Video URL (from pending bookmark):", pending.videoUrl); // Use pending.videoUrl
        console.log("[BG_CS_DEBUG_ChanP1] Page was identified as watch page by CS:", request.data.debug_cs_isWatchPage);
        console.log("[BG_CS_DEBUG_ChanP1] CS: Channel Img Found:", request.data.debug_cs_channelImgFound, "- CS Src:", request.data.debug_cs_channelImgSrc);
        console.log("[BG_CS_DEBUG_ChanP1] CS: Channel Link Element Found:", request.data.debug_cs_channelLinkElementFound, "- CS Href:", request.data.debug_cs_channelLinkElementHref);
        console.log("[BG_CS_DEBUG_ChanP1] CS: Channel Name Element Found:", request.data.debug_cs_channelNameElementFound, "- CS Text:", request.data.debug_cs_channelNameContent);
        console.log("[BG_CS_DEBUG_ChanP1] CS: Used Fallback Channel Title:", request.data.debug_cs_usedFallbackChannelTitle, "- CS Fallback Title:", request.data.debug_cs_fallbackChannelTitle);
        console.log("[BG_CS_DEBUG_ChanP1] CS Final Extracted Channel URL:", request.data.extractedChannelUrl);
        console.log("[BG_CS_DEBUG_ChanP1] CS Final Extracted Channel Title:", request.data.extractedChannelTitle);
        console.log("[BG_CS_DEBUG_ChanP1] CS Final Favicon URL (channel avatar from video page):", request.data.faviconUrl);
        console.log("--------------------------------------------------------------------");

        const dataForP1Callback = { 
            extractedChannelUrl: request.data.extractedChannelUrl,
            extractedChannelTitle: request.data.extractedChannelTitle,
            faviconUrl: request.data.faviconUrl, // Note: renamed from faviconUrlFromVideoPage for clarity in P1 context
            // originalVideoUrl is already in pending.videoUrl
            // id is already in pending.bookmarkBase.id
        };
        pending.callback(dataForP1Callback, pending); // Calls processChannelUrlFromVideoP1, passes full pending
        
        console.log("[BG_ChanFromLink_P1] Attempting to remove temp video tab (P1) after callback:", tabId);
        chrome.tabs.remove(tabId, () => { 
            if (chrome.runtime.lastError) {
                console.error("[BG_ChanFromLink_P1] Error removing temp video tab (P1) %s after callback: %s", tabId, chrome.runtime.lastError.message);
            } else {
                console.log("[BG_ChanFromLink_P1] Temp video tab (P1) %s removed successfully after callback.", tabId);
            }
        });
        delete pendingBookmarks[tabId]; 
        return true; 
      
      } else if (pending.operation === 'getDefinitiveChannelInfoP2') { // For P2 of "Bookmark Channel (from link)"
        console.log("[BG_ChanFromLink_P2] Received extractedPageInfo from temp channel tab %s for definitive channel data.", tabId);
        
        // Debug logging for P2 (definitive channel info)
        console.log("--------------------------------------------------------------------");
        console.log("[BG_CS_DEBUG_ChanP2] Debug Info from Content Script (Definitive Channel Info - P2):");
        console.log("[BG_CS_DEBUG_ChanP2] Target Channel URL (from P1):", pending.bookmarkBase.url);
        console.log("[BG_CS_DEBUG_ChanP2] Page was identified as channel page by CS:", !request.data.debug_cs_isWatchPage); // isWatchPage should be false
        console.log("[BG_CS_DEBUG_ChanP2] CS Page Title (Channel Name):", request.data.pageTitle);
        console.log("[BG_CS_DEBUG_ChanP2] CS Favicon URL (Channel Avatar):", request.data.faviconUrl);
        console.log("[BG_CS_DEBUG_ChanP2] CS Thumbnail URL (Channel Banner):", request.data.thumbnailUrl);
        console.log("--------------------------------------------------------------------");

        pending.callback(request.data, pending.bookmarkBase); // Calls processDefinitiveChannelDataP2

        console.log("[BG_ChanFromLink_P2] Attempting to remove temp channel tab (P2):", tabId);
        chrome.tabs.remove(tabId, () => { 
            if (chrome.runtime.lastError) {
                console.error("[BG_ChanFromLink_P2] Error removing temp channel tab (P2) %s: %s", tabId, chrome.runtime.lastError.message);
            } else {
                console.log("[BG_ChanFromLink_P2] Temp channel tab (P2) %s removed successfully.", tabId);
            }
        });
        delete pendingBookmarks[tabId];
        return true;

      } else if (pending.operation === 'extractVideoInfo') { // For "Bookmark YouTube Video (from link)"
        console.log("[BG_VideoLink] Received extractedPageInfo from temp video tab %s for video bookmarking.", tabId);
        
        // Debug logging for video info extraction
        console.log("--------------------------------------------------------------------");
        console.log("[BG_CS_DEBUG_Video] Debug Info from Content Script (for video page processing - Video Bookmark):");
        console.log("[BG_CS_DEBUG_Video] Target Video URL (from pending bookmark):", pending.bookmarkBase.url);
        console.log("[BG_CS_DEBUG_Video] Page was identified as watch page by CS:", request.data.debug_cs_isWatchPage);
        // Add any other relevant debug_cs_* fields you want to log for video type here
        console.log("[BG_CS_DEBUG_Video] CS Page Title:", request.data.pageTitle);
        console.log("[BG_CS_DEBUG_Video] CS Thumbnail URL:", request.data.thumbnailUrl);
        console.log("[BG_CS_DEBUG_Video] CS Favicon URL (Channel Avatar):", request.data.faviconUrl);
        console.log("--------------------------------------------------------------------");

        pending.callback(request.data, pending.bookmarkBase); // Calls processVideoBookmarkData

        console.log("[BG_VideoLink] Attempting to remove temp video tab:", tabId);
        chrome.tabs.remove(tabId, () => { 
            if (chrome.runtime.lastError) {
                console.error("[BG_VideoLink] Error removing temp video tab %s: %s", tabId, chrome.runtime.lastError.message);
            } else {
                console.log("[BG_VideoLink] Temp video tab %s removed successfully after video info extraction.", tabId);
            }
        });
        delete pendingBookmarks[tabId];
        return true;

      } else if (pending.isTempTab) { // Original temp tab logic for direct channel links (bookmarkYouTubeChannel)
        console.log("[CHAN_CTX_DEBUG] Received extractedPageInfo from temp tab (direct channel link):", tabId, "Data:", request.data);
        const { bookmarkBase, callback } = pending; // operation will not be extractChannelFromVideo or extractVideoInfo
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
    // --- Refactored bookmarkVideoFromLink ---
    if (!tab || !tab.id) { 
        console.error("[BG_VideoLink] Tab ID missing for 'bookmarkVideoFromLink'."); 
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error', message: 'Cannot initiate action: Tab context is missing.' });
        return; 
    }
    const videoUrlToBookmark = info.linkUrl;
    shouldInjectContentScript = false; 

    if (!videoUrlToBookmark || !videoUrlToBookmark.includes("youtube.com/watch")) {
       console.log("[BG_VideoLink] Clicked link is not a YouTube video URL:", videoUrlToBookmark);
       chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Invalid Link', message: 'This link does not appear to be a YouTube video.' });
       return;
    }
    
    let tempVideoId = 'video'; try { tempVideoId = new URL(videoUrlToBookmark).searchParams.get('v') || tempVideoId; } catch(e){}
    bookmarkBase = { 
        id: 'id_' + new Date().getTime(), 
        type: 'youtube_video', 
        url: videoUrlToBookmark, 
        title: "Fetching video: " + tempVideoId, // Placeholder using video ID
        added_date: new Date().toISOString(),
        faviconUrl: null,
        thumbnailUrl: null
    };

    console.log("[BG_VideoLink] Creating temp tab for video URL to extract video info:", videoUrlToBookmark);
    chrome.tabs.create({ url: videoUrlToBookmark, active: false }, function(newTab) {
        if (chrome.runtime.lastError || !newTab || !newTab.id) {
            console.error("[BG_VideoLink] Failed to create temporary tab for video %s. Error: %s", videoUrlToBookmark, chrome.runtime.lastError?.message);
            chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error', message: 'Failed to create temporary tab to analyze video page.' });
            saveBookmarkToStorage(bookmarkBase); // Save with basic info as fallback
            return;
        }
        const tempTabId = newTab.id;
        console.log("[BG_VideoLink] Temp video tab created with ID:", tempTabId);

        pendingBookmarks[tempTabId] = { 
            bookmarkBase, 
            callback: processVideoBookmarkData, 
            isTempTab: true, 
            operation: 'extractVideoInfo' 
        };

        function tempTabUpdateListenerForVideoBookmark(updatedTabId, changeInfo, updatedTab) {
            if (updatedTabId === tempTabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(tempTabUpdateListenerForVideoBookmark);
                console.log("[BG_VideoLink] Temp video tab %s status complete. Injecting script.", tempTabId);
                
                chrome.scripting.executeScript(
                    { target: { tabId: tempTabId }, files: ['content_script.js'] },
                    (injectionResults) => {
                        if (chrome.runtime.lastError || !injectionResults || injectionResults.length === 0) {
                            console.error("[BG_VideoLink] Failed to inject script into temp video tab %s. Error: %s", tempTabId, chrome.runtime.lastError?.message);
                            chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error Fetching Video Info', message: 'Could not analyze video page (script injection failed).' });
                            chrome.tabs.remove(tempTabId, () => { if (chrome.runtime.lastError) console.error("[BG_VideoLink] Error removing failed temp video tab %s: %s", tempTabId, chrome.runtime.lastError.message); });
                            pendingBookmarks[tempTabId].bookmarkBase.isFallbackSave = true; // Mark for specific notification
                            saveBookmarkToStorage(pendingBookmarks[tempTabId].bookmarkBase); // Save with basic info
                            delete pendingBookmarks[tempTabId];
                        } else {
                            console.log("[BG_VideoLink] Script injected successfully into temp video tab %s.", tempTabId);
                        }
                    }
                );
            }
        }
        chrome.tabs.onUpdated.addListener(tempTabUpdateListenerForVideoBookmark);

        setTimeout(() => {
            if (pendingBookmarks[tempTabId]) { 
                console.warn("[BG_VideoLink] Timeout for temp video tab %s.", tempTabId);
                chrome.tabs.onUpdated.removeListener(tempTabUpdateListenerForVideoBookmark);
                chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Timeout', message: 'Timed out trying to fetch video info from page.' });
                chrome.tabs.remove(tempTabId, () => { if (chrome.runtime.lastError) console.error("[BG_VideoLink] Error removing timed-out temp video tab %s: %s", tempTabId, chrome.runtime.lastError.message); });
                pendingBookmarks[tempTabId].bookmarkBase.isFallbackSave = true; // Mark for specific notification
                saveBookmarkToStorage(pendingBookmarks[tempTabId].bookmarkBase); // Save with basic info
                delete pendingBookmarks[tempTabId];
            }
        }, 20000); 
    });
    return;

  } else if (info.menuItemId === "bookmarkChannelFromLink") {
    // --- Refactored bookmarkChannelFromLink (Two-Temp-Tab Workflow) ---
    if (!tab || !tab.id) { 
        console.error("[BG_ChanFromLink_P1] Tab ID missing for 'bookmarkChannelFromLink'."); 
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error (P1)', message: 'Cannot initiate action: Tab context is missing.' });
        return; 
    }
    const videoUrlForChannelExtraction = info.linkUrl; 
    shouldInjectContentScript = false; 

    if (!videoUrlForChannelExtraction || !videoUrlForChannelExtraction.includes("youtube.com/watch")) {
        console.log("[BG_ChanFromLink_P1] Clicked link is not a YouTube video URL:", videoUrlForChannelExtraction);
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Invalid Link (P1)', message: 'This link does not appear to be a YouTube video.' });
        return;
    }

    const bookmarkBaseP1 = { 
        id: 'id_' + new Date().getTime(), 
        type: 'youtube_channel', 
        title: "Phase1: Get channel from " + new URL(videoUrlForChannelExtraction).pathname, 
        added_date: new Date().toISOString()
        // URL will be the video URL initially, then channel URL in P2 base
        // Favicon/thumbnail also set progressively
    };
    
    console.log("[BG_ChanFromLink_P1] Creating temp tab for video URL to extract channel URL:", videoUrlForChannelExtraction);
    chrome.tabs.create({ url: videoUrlForChannelExtraction, active: false }, function(newTabP1) {
        if (chrome.runtime.lastError || !newTabP1 || !newTabP1.id) {
            console.error("[BG_ChanFromLink_P1] Failed to create temporary tab for video %s. Error: %s", videoUrlForChannelExtraction, chrome.runtime.lastError?.message);
            chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error (P1)', message: 'Failed to create temporary tab to analyze video page.' });
            return;
        }
        const tempTabId1 = newTabP1.id;
        console.log("[BG_ChanFromLink_P1] Temp video tab created with ID:", tempTabId1);

        pendingBookmarks[tempTabId1] = { 
            bookmarkBase: bookmarkBaseP1,
            callback: processChannelUrlFromVideoP1, // New P1 callback
            isTempTab: true, 
            operation: 'getChannelUrlFromVideoP1', // Specific operation for P1
            videoUrl: videoUrlForChannelExtraction 
        };

        function tempTabUpdateListenerForVideoP1(updatedTabId, changeInfo, updatedTab) {
            if (updatedTabId === tempTabId1 && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(tempTabUpdateListenerForVideoP1); 
                console.log("[BG_ChanFromLink_P1] Temp video tab %s status complete. Injecting script.", tempTabId1);
                
                chrome.scripting.executeScript(
                    { target: { tabId: tempTabId1 }, files: ['content_script.js'] },
                    (injectionResults) => {
                        if (chrome.runtime.lastError || !injectionResults || injectionResults.length === 0) {
                            console.error("[BG_ChanFromLink_P1] Failed to inject script into temp video tab %s. Error: %s", tempTabId1, chrome.runtime.lastError?.message);
                            chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Error Fetching Channel (P1)', message: 'Could not analyze video page for channel info (script injection failed).' });
                            chrome.tabs.remove(tempTabId1, () => { if (chrome.runtime.lastError) console.error("[BG_ChanFromLink_P1] Error removing failed temp video tab %s: %s", tempTabId1, chrome.runtime.lastError.message); });
                            delete pendingBookmarks[tempTabId1];
                        } else {
                            console.log("[BG_ChanFromLink_P1] Script injected successfully into temp video tab %s.", tempTabId1);
                        }
                    }
                );
            }
        }
        chrome.tabs.onUpdated.addListener(tempTabUpdateListenerForVideoP1);

        setTimeout(() => {
            if (pendingBookmarks[tempTabId1]) { 
                console.warn("[BG_ChanFromLink_P1] Timeout for temp video tab %s.", tempTabId1);
                chrome.tabs.onUpdated.removeListener(tempTabUpdateListenerForVideoP1); 
                chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Timeout (P1)', message: 'Timed out trying to get channel URL from video page.' });
                chrome.tabs.remove(tempTabId1, () => { if (chrome.runtime.lastError) console.error("[BG_ChanFromLink_P1] Error removing timed-out temp video tab %s: %s", tempTabId1, chrome.runtime.lastError.message); });
                delete pendingBookmarks[tempTabId1];
            }
        }, 20000); 
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
