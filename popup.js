document.addEventListener('DOMContentLoaded', function() {
  const bookmarkBtn = document.getElementById('bookmarkBtn');
  const statusMessage = document.getElementById('statusMessage');

  bookmarkBtn.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        const tab = tabs[0];
        let pageTitle = tab.title; // Initial title
        const pageUrl = tab.url;

        statusMessage.textContent = `Processing: ${pageTitle.substring(0, 40)}...`;
        console.log('Attempting to bookmark tab:', pageTitle, pageUrl);

        // Inject content script to extract more info
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            files: ['content_script.js']
          },
          (injectionResults) => {
            // The content script sends a message, so we don't primarily use injectionResults here.
            // However, good to check if injection itself failed.
            if (chrome.runtime.lastError || !injectionResults || injectionResults.length === 0) {
              console.error("Content script injection failed:", chrome.runtime.lastError);
              // Proceed with basic bookmarking if injection fails
              saveBookmark(pageTitle, pageUrl, null, null);
              return;
            }
            console.log("Content script injected successfully.");
            // The actual data comes via chrome.runtime.onMessage in this flow.
            // We'll set up a temporary listener for the response from this specific tab.
          }
        );
      } else {
        statusMessage.textContent = 'Error: Could not get tab info.';
        console.error('Error: Could not get current tab information.');
        setTimeout(() => { statusMessage.textContent = ''; }, 2000);
      }
    });
  });

  // Listener for messages from content script
  // This needs to be outside the click handler to be persistent enough,
  // but we need to ensure we're acting on a message related to the current bookmarking action.
  // For popups, which are short-lived, this is simpler.
  // We'll refine if needed for background script.
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "extractedPageInfo") {
      console.log("Received page info from content script:", request.data);
      // Ensure the message is from the tab we're currently trying to bookmark.
      // This check is important if multiple bookmarking actions could happen quickly,
      // though less critical for a popup that closes.
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs[0] && sender.tab && sender.tab.id === tabs[0].id) {
          const currentTab = tabs[0]; // Get fresh tab info, url might have changed (e.g. redirects)
          const finalTitle = request.data.pageTitle || currentTab.title; // Prefer title from content script
          const finalUrl = currentTab.url; // Always use the current URL of the tab

          statusMessage.textContent = `Bookmarking: ${finalTitle.substring(0,40)}...`;
          saveBookmark(finalTitle, finalUrl, request.data.faviconUrl, request.data.thumbnailUrl);
        }
      });
      // sendResponse({}); // Acknowledge message (optional)
      return true; // Indicates you wish to send a response asynchronously (if you were to use sendResponse)
    }
  });

  function saveBookmark(title, url, faviconUrl, thumbnailUrl) {
    console.log('Saving bookmark with details:', { title, url, faviconUrl, thumbnailUrl });
    const bookmark = {
      id: 'id_' + new Date().getTime(),
      type: 'page', // Default type
      title: title,
      url: url,
      faviconUrl: faviconUrl || null, // Store extracted favicon
      thumbnailUrl: thumbnailUrl || null, // Store extracted thumbnail
      added_date: new Date().toISOString()
    };

    if (url.includes("youtube.com/watch")) {
      bookmark.type = 'youtube_video';
    } else if (url.includes("youtube.com/channel/") || url.includes("youtube.com/@")) {
      bookmark.type = 'youtube_channel';
    }
    // Add other type detections if necessary

    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      let bookmarks = data.bookmarks;
      if (bookmarks.some(bm => bm.url === url)) {
        statusMessage.textContent = 'Already bookmarked!';
        console.log('URL already bookmarked:', url);
        setTimeout(() => { statusMessage.textContent = ''; }, 2000);
        return;
      }

      bookmarks.unshift(bookmark);
      chrome.storage.local.set({ bookmarks: bookmarks }, function() {
        if (chrome.runtime.lastError) {
          statusMessage.textContent = 'Error saving bookmark!';
          console.error('Error saving bookmark:', chrome.runtime.lastError);
        } else {
          statusMessage.textContent = 'Page bookmarked!';
          console.log('Bookmark saved:', bookmark);
        }
        setTimeout(() => { statusMessage.textContent = ''; window.close(); }, 1500); // Clear message & close popup
      });
    });
  }
});
