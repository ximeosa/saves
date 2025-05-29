document.addEventListener('DOMContentLoaded', function() {
  const bookmarkPageBtn = document.getElementById('bookmarkPageBtn');
  const bookmarkVideoBtn = document.getElementById('bookmarkVideoBtn');
  const bookmarkChannelBtn = document.getElementById('bookmarkChannelBtn');
  const bookmarkWebsiteBtn = document.getElementById('bookmarkWebsiteBtn');
  const viewBookmarksLink = document.getElementById('viewBookmarksLink');
  const statusMessage = document.getElementById('statusMessage');

  let currentTabInfo = null; // Store current tab info
  let intendedBookmarkType = 'page'; // Default

  // Function to update button states based on URL
  function updateButtonStates(url) {
    const isYouTubeVideo = url.includes("youtube.com/watch");
    const isYouTubeChannel = url.includes("youtube.com/channel/") || url.includes("youtube.com/@");

    bookmarkVideoBtn.disabled = !isYouTubeVideo;
    bookmarkChannelBtn.disabled = !(isYouTubeChannel || isYouTubeVideo);
    
    // Optional: Add specific classes for different button types if using CSS for that.
    // e.g., bookmarkPageBtn.classList.add('action-page'); 
  }

  // Get current tab info when popup opens
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs[0]) {
      currentTabInfo = tabs[0];
      updateButtonStates(currentTabInfo.url);
    } else {
      statusMessage.textContent = 'Error: Could not get tab info.';
      [bookmarkPageBtn, bookmarkVideoBtn, bookmarkChannelBtn, bookmarkWebsiteBtn].forEach(b => b.disabled = true);
    }
  });

  viewBookmarksLink.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close(); // Close popup
  });

  function triggerBookmarkProcess(type) {
    if (!currentTabInfo) {
      statusMessage.textContent = 'Tab info not available.';
      return;
    }
    intendedBookmarkType = type; // Set the type for when content script returns
    statusMessage.textContent = `Processing: ${currentTabInfo.title.substring(0,40)}...`;
    
    chrome.scripting.executeScript(
      { target: { tabId: currentTabInfo.id }, files: ['content_script.js'] },
      (injectionResults) => {
        if (chrome.runtime.lastError || !injectionResults || !injectionResults.length) {
          console.error("Content script injection failed:", chrome.runtime.lastError);
          // Fallback: save with what we have, without content script info
          let urlToSave = currentTabInfo.url;
          if (intendedBookmarkType === 'website') {
              urlToSave = new URL(currentTabInfo.url).origin;
          }
          // Title might need adjustment for 'website' type too
          let titleToSave = intendedBookmarkType === 'website' ? new URL(currentTabInfo.url).hostname : currentTabInfo.title;

          saveBookmark(titleToSave, urlToSave, null, null, intendedBookmarkType);
        }
        // Success: wait for onMessage from content_script
      }
    );
  }

  bookmarkPageBtn.addEventListener('click', () => triggerBookmarkProcess('page'));
  bookmarkVideoBtn.addEventListener('click', () => triggerBookmarkProcess('youtube_video'));
  bookmarkChannelBtn.addEventListener('click', () => triggerBookmarkProcess('youtube_channel'));
  bookmarkWebsiteBtn.addEventListener('click', () => triggerBookmarkProcess('website'));

  // Existing onMessage listener for content script response
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "extractedPageInfo") {
      if (sender.tab && currentTabInfo && sender.tab.id === currentTabInfo.id) {
        let finalTitle = request.data.pageTitle || currentTabInfo.title;
        let finalUrl = currentTabInfo.url; // Use current tab URL, content script doesn't change it.
        let favicon = request.data.faviconUrl;
        let thumbnail = request.data.thumbnailUrl;

        if (intendedBookmarkType === 'website') {
          finalUrl = new URL(currentTabInfo.url).origin;
          finalTitle = new URL(currentTabInfo.url).hostname; // Use hostname for website title
          // Favicon from content script should ideally be for the domain.
          // Thumbnail might not be relevant or could be a site screenshot (advanced).
          thumbnail = null; // Typically no specific thumbnail for 'website' type from page content.
        } else if (intendedBookmarkType === 'youtube_channel') {
          if (request.data.extractedChannelUrl) {
            finalUrl = request.data.extractedChannelUrl; // Override URL to actual channel URL
            finalTitle = request.data.extractedChannelTitle || finalTitle; // Override title to actual channel title
            // Favicon should already be the channel icon from content script's logic
            // Thumbnail might be the video's thumbnail if on video page, or channel banner if on channel page.
            // For a channel bookmark, we might prefer the favicon (channel icon) as the thumbnail as well,
            // or let the content script's logic for channel pages (banner/icon) decide.
            // If we are on a video page, request.data.thumbnailUrl is the video thumbnail.
            // We should use faviconUrl (channel icon) as thumbnail for channel bookmark.
            if (currentTabInfo.url.includes("youtube.com/watch")) { // If originally on a video page
                 thumbnail = favicon; // Use channel icon (already in favicon) as thumbnail for channel bookmark
            }
          }
          // If not on video page or channel info not found, it defaults to current page's info,
          // which is fine if user is already on the channel page.
        }


        statusMessage.textContent = `Bookmarking: ${finalTitle.substring(0,40)}...`;
        saveBookmark(finalTitle, finalUrl, favicon, thumbnail, intendedBookmarkType);
      }
      return true; 
    }
  });

  // Updated saveBookmark function to accept type
  function saveBookmark(title, url, faviconUrl, thumbnailUrl, type) {
    console.log('Saving bookmark with details:', { title, url, faviconUrl, thumbnailUrl, type });
    const bookmark = {
      id: 'id_' + new Date().getTime(),
      type: type, // Use the passed type
      title: title,
      url: url,
      faviconUrl: faviconUrl || null,
      thumbnailUrl: thumbnailUrl || null,
      added_date: new Date().toISOString()
    };

    // No need for type detection here as it's passed in.

    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      let bookmarks = data.bookmarks;
      // Prevent exact duplicates (same URL and type)
      if (bookmarks.some(bm => bm.url === url && bm.type === type)) {
        statusMessage.textContent = 'Already bookmarked as this type!';
        setTimeout(() => { statusMessage.textContent = ''; }, 2000);
        return;
      }

      bookmarks.unshift(bookmark);
      chrome.storage.local.set({ bookmarks: bookmarks }, function() {
        if (chrome.runtime.lastError) {
          statusMessage.textContent = 'Error saving bookmark!';
        } else {
          statusMessage.textContent = 'Bookmarked!';
        }
        setTimeout(() => { statusMessage.textContent = ''; window.close(); }, 1500);
      });
    });
  }
});
