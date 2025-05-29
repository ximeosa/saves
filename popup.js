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
          
          if (intendedBookmarkType === 'youtube_channel' && currentTabInfo.url.includes("youtube.com/watch")) {
            // Trying to bookmark a channel from a video page, but content script failed.
            statusMessage.textContent = 'Failed to get channel details (script error).';
            setTimeout(() => { statusMessage.textContent = ''; window.close(); }, 2500);
          } else if (intendedBookmarkType === 'youtube_channel' && !(currentTabInfo.url.includes("youtube.com/channel/") || currentTabInfo.url.includes("youtube.com/@"))) {
            // Trying to bookmark a channel, but not on a channel page and not on a video page (or script failed from video page)
            statusMessage.textContent = 'Cannot identify YouTube channel here.';
            setTimeout(() => { statusMessage.textContent = ''; window.close(); }, 2500);
          }
          else {
            // Fallback: save with what we have for 'page', 'website', or 'youtube_video',
            // or for 'youtube_channel' if already on a channel page.
            let urlToSave = currentTabInfo.url;
            let titleToSave = currentTabInfo.title;
            if (intendedBookmarkType === 'website') {
                urlToSave = new URL(currentTabInfo.url).origin;
                titleToSave = new URL(currentTabInfo.url).hostname;
            }
            // For youtube_channel type, if we are here, it means we are on a channel page itself,
            // so currentTabInfo.url is the channel URL.
            saveBookmark(titleToSave, urlToSave, null, null, intendedBookmarkType);
          }
          return; // Return after handling the error or fallback
        }
        // Success: wait for onMessage from content_script
        console.log("Content script injected successfully for popup action.");
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
        let finalTitle = request.data.pageTitle || currentTabInfo.title; // Prefer title from content script
        let finalUrl = currentTabInfo.url; // Initialized to currentTabInfo.url
        let favicon = request.data.faviconUrl;
        let thumbnail = request.data.thumbnailUrl;
        let proceedWithSave = true; // Flag to control if we should save

        if (intendedBookmarkType === 'website') {
          finalUrl = new URL(currentTabInfo.url).origin;
          finalTitle = new URL(currentTabInfo.url).hostname; 
          thumbnail = null; 
        } else if (intendedBookmarkType === 'youtube_channel') {
          if (request.data.extractedChannelUrl) { 
            finalUrl = request.data.extractedChannelUrl; 
            finalTitle = request.data.extractedChannelTitle || finalTitle; 
            if (currentTabInfo.url.includes("youtube.com/watch")) { // If bookmarking channel from a video page
                 thumbnail = favicon; // Use channel icon (in favicon) as thumbnail
            }
            // If on actual channel page, content script's favicon (channel icon) and thumbnail (banner/icon) are used.
          } else {
            // CONTENT SCRIPT FAILED TO EXTRACT CHANNEL URL
            // This happens if selectors failed or not on a recognizable video/channel page structure
            // for channel extraction.
            statusMessage.textContent = 'Could not extract channel details from this page.';
            console.warn("YouTube Channel bookmark: content script did not return extractedChannelUrl. Original tab URL:", currentTabInfo.url);
            proceedWithSave = false; // Do not save this bookmark
            setTimeout(() => { statusMessage.textContent = ''; window.close(); }, 2500); // Close popup after message
          }
        }
        
        if (proceedWithSave) {
          statusMessage.textContent = `Bookmarking: ${finalTitle.substring(0,40)}...`;
          saveBookmark(finalTitle, finalUrl, favicon, thumbnail, intendedBookmarkType);
        }
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
