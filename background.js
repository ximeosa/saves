// Listener for when the extension is installed or updated
chrome.runtime.onInstalled.addListener(function() {
  chrome.contextMenus.removeAll(function() {
    chrome.contextMenus.create({ id: "bookmarkPage", title: "Bookmark this page", contexts: ["page"] });
    chrome.contextMenus.create({ id: "bookmarkYouTubeVideo", title: "Bookmark this YouTube video", contexts: ["video"], targetUrlPatterns: ["*://*.youtube.com/watch*", "*://*.youtube.com/embed/*"] });
    chrome.contextMenus.create({ id: "bookmarkYouTubeChannel", title: "Bookmark this YouTube Channel/Link", contexts: ["link"], targetUrlPatterns: ["*://*.youtube.com/channel/*", "*://*.youtube.com/@*"] });
    chrome.contextMenus.create({ id: "bookmarkSelection", title: "Bookmark selection", contexts: ["selection"] });
  });
});

// Helper function to save bookmark data (centralized logic)
function saveBookmarkToStorage(bookmarkData) {
  console.log("Attempting to save from background:", bookmarkData);
  chrome.storage.local.get({ bookmarks: [] }, function(data) {
    let bookmarks = data.bookmarks;
    // More robust duplicate check: URL + Type. For selections, URL+Text might be better.
    let alreadyExists = false;
    if (bookmarkData.type === 'selection') {
        alreadyExists = bookmarks.some(bm => bm.url === bookmarkData.url && bm.text === bookmarkData.text);
    } else {
        alreadyExists = bookmarks.some(bm => bm.url === bookmarkData.url && bm.type === bookmarkData.type);
    }

    if (alreadyExists) {
      console.log('Background: Item already bookmarked.', bookmarkData.url, bookmarkData.title);
      // Optional: Send a desktop notification
      chrome.notifications.create({ type: 'basic', iconUrl: 'icons/48.png', title: 'Already Bookmarked', message: `"${bookmarkData.title.substring(0,30)}..." is already in your bookmarks.` });
      return;
    }
    bookmarks.unshift(bookmarkData); // Add to the beginning
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

// Listener for messages from content script
// This needs to handle multiple potential pending bookmark operations
let pendingBookmarks = {}; // Store callbacks for pending bookmark operations, keyed by tabId

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "extractedPageInfo" && sender.tab) {
    console.log("Background received page info from content script:", request.data, "for tab:", sender.tab.id);
    const tabId = sender.tab.id;
    if (pendingBookmarks[tabId]) {
      const { bookmarkBase, callback } = pendingBookmarks[tabId];
      // Update title from content script if available and seems more specific
      // For example, if original title was just the URL for a channel link
      let finalTitle = request.data.pageTitle || bookmarkBase.title;
      if (bookmarkBase.type === 'youtube_channel' && request.data.pageTitle && request.data.pageTitle !== bookmarkBase.url) {
          finalTitle = request.data.pageTitle;
      } else if (bookmarkBase.type === 'page' && request.data.pageTitle && request.data.pageTitle !== bookmarkBase.url) {
          finalTitle = request.data.pageTitle;
      }


      const fullBookmark = {
        ...bookmarkBase,
        title: finalTitle,
        faviconUrl: request.data.faviconUrl || null,
        thumbnailUrl: request.data.thumbnailUrl || null,
      };
      callback(fullBookmark); // Execute the original save function
      delete pendingBookmarks[tabId]; // Clean up
    }
    // sendResponse({}); // Acknowledge
    return true;
  }
});

chrome.contextMenus.onClicked.addListener(function(info, tab) {
  // Tab might not be available for all context types (e.g. some link clicks if not on a page)
  // However, for injecting a script, tab.id is crucial.
  if (!tab || !tab.id) {
    console.error("Tab information (with ID) is not available for this context menu action. Cannot inject script.", info);
    // For channel links, we might not have a tab if it's a bookmarklet or similar.
    // However, for typical browsing, tab should be present.
    if (info.menuItemId === "bookmarkYouTubeChannel" && info.linkUrl) {
        // Directly save channel link without attempting script injection if tab is missing
        const bookmarkBase = {
            id: 'id_' + new Date().getTime(),
            type: 'youtube_channel',
            title: "YouTube Channel: " + info.linkUrl.substring(info.linkUrl.lastIndexOf('/') + 1),
            url: info.linkUrl,
            added_date: new Date().toISOString(),
        };
        saveBookmarkToStorage(bookmarkBase); // Save directly
    }
    return;
  }

  const pageUrl = info.pageUrl;
  const linkUrl = info.linkUrl;
  const srcUrl = info.srcUrl;
  const selectionText = info.selectionText;
  const initialPageTitle = tab.title || (selectionText ? selectionText.substring(0, 50) + "..." : (linkUrl || pageUrl));


  let bookmarkBase = { // Renamed from newBookmark to bookmarkBase
    id: 'id_' + new Date().getTime(),
    title: initialPageTitle,
    url: pageUrl, // Default URL, will be overridden by specific types
    type: 'page', // Default type
    added_date: new Date().toISOString(),
  };

  let shouldInjectContentScript = true;

  switch (info.menuItemId) {
    case "bookmarkPage":
      bookmarkBase.url = pageUrl;
      bookmarkBase.title = tab.title || pageUrl;
      // Type will be refined by content script or later logic if it's a YT page
      break;
    case "bookmarkYouTubeVideo":
      if (pageUrl && pageUrl.includes("youtube.com/watch")) {
        bookmarkBase.url = pageUrl;
      } else if (srcUrl && (srcUrl.includes("youtube.com/embed/") || srcUrl.includes("youtube.com/v/"))) {
        bookmarkBase.url = srcUrl; // This might be an embed on a non-YT page
      } else {
        bookmarkBase.url = pageUrl; // Fallback
      }
      bookmarkBase.title = tab.title || "YouTube Video";
      bookmarkBase.type = 'youtube_video';
      // Content script will get specific thumbnail and channel icon
      break;
    case "bookmarkYouTubeChannel":
      if (linkUrl && (linkUrl.includes("youtube.com/channel/") || linkUrl.includes("youtube.com/@"))) {
        bookmarkBase.url = linkUrl;
        bookmarkBase.title = "YouTube Channel: " + linkUrl.substring(linkUrl.lastIndexOf('/') + 1); // Initial title
        bookmarkBase.type = 'youtube_channel';
        // Content script will run on the channel page (if that's the current tab)
        // or we might need to open the link in a new tab to scrape, which is more complex.
        // For now, if the current tab IS the channel page, script injection will work.
        // If it's just a link, we might not get a good icon/thumbnail without loading it.
        // The content_script is designed to work when on the actual channel page.
        // If tab.url is not linkUrl, we might not get accurate icons.
        if (tab.url !== linkUrl) {
            console.log("Bookmarking a YouTube channel link that is not the current tab. Icon/thumbnail extraction might be limited unless currently on that page.");
            // We could potentially skip injection or save a placeholder.
            // For now, we'll try to inject on current tab, content script will see current tab's content.
            // This means if you right click a YT channel link on google.com, it tries to get google.com's icons.
            // This needs refinement: ideally, for links, we'd fetch the link URL's content.
            // But that's much more complex (requires new tab, permissions, etc.)
            // A simpler approach for now: for channel *links*, don't inject, just save basic info.
            // Only inject if info.pageUrl matches a channel pattern.
             if (pageUrl.includes("youtube.com/channel/") || pageUrl.includes("youtube.com/@")) {
                // Current page is a channel page, proceed with injection
             } else {
                shouldInjectContentScript = false; // It's a link on another page
             }
        }

      } else {
        console.log("Context Menu: 'bookmarkYouTubeChannel' clicked, but not a valid channel URL:", linkUrl);
        return;
      }
      break;
    case "bookmarkSelection":
      bookmarkBase.url = pageUrl;
      bookmarkBase.title = selectionText; // Selected text as title
      bookmarkBase.type = 'selection';
      bookmarkBase.text = selectionText; // Store the actual text
      break;
    default:
      console.error("Unknown context menu item clicked:", info.menuItemId);
      return;
  }

  if (!bookmarkBase.url) {
    console.error("Could not determine URL for bookmarking via context menu.", info);
    return;
  }

  // If we shouldn't inject (e.g. channel link on a different page), save directly
  if (!shouldInjectContentScript) {
    saveBookmarkToStorage(bookmarkBase);
    return;
  }

  // Store the base bookmark data and the callback to save it later
  pendingBookmarks[tab.id] = { bookmarkBase, callback: saveBookmarkToStorage };

  console.log("Background: Attempting to inject content script into tab:", tab.id, "for URL:", bookmarkBase.url);
  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      files: ['content_script.js']
    },
    (injectionResults) => {
      if (chrome.runtime.lastError || !injectionResults || injectionResults.length === 0) {
        console.error("Background: Content script injection failed:", chrome.runtime.lastError);
        // If injection fails, save bookmark without image URLs
        saveBookmarkToStorage(pendingBookmarks[tab.id].bookmarkBase);
        delete pendingBookmarks[tab.id];
      } else {
        console.log("Background: Content script injected successfully for tab:", tab.id);
        // Now wait for onMessage handler to receive data from content script
      }
    }
  );
});

console.log("Background script loaded and context menu listeners should be active.");
