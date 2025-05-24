console.log("Background script loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SAVE_PAGE") {
    console.log("SAVE_PAGE message received");
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs.length > 0) {
        const activeTab = tabs[0];
        if (activeTab && activeTab.id) {
          chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['contentScript.js']
          }, (injectionResults) => {
            if (chrome.runtime.lastError) {
              console.error("Error injecting script:", chrome.runtime.lastError.message);
              sendResponse({ status: "error", message: chrome.runtime.lastError.message });
              return;
            }
            if (injectionResults && injectionResults.length > 0 && injectionResults[0].result) {
              const pageData = injectionResults[0].result;
              console.log("Page data received:", pageData);

              const id = Date.now().toString();
              let bookmarkEntry = {
                id: id,
                url: pageData.url,
                title: pageData.title,
                htmlSnapshot: pageData.htmlSnapshot,
                originalFaviconUrl: pageData.faviconUrl,
                originalMainImageUrl: pageData.mainImageUrl,
                cachedFavicon: null,
                cachedMainImage: null,
                type: 'webpage',
                timestamp: Date.now()
              };

              async function processAndStoreBookmark() {
                if (pageData.faviconUrl) {
                  try {
                    const response = await fetch(pageData.faviconUrl);
                    if (response.ok) {
                      const blob = await response.blob();
                      bookmarkEntry.cachedFavicon = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                      });
                    } else {
                      console.warn("Failed to fetch favicon: Response not OK", response.status);
                    }
                  } catch (error) {
                    console.warn("Failed to fetch favicon:", error);
                  }
                }

                if (pageData.mainImageUrl) {
                  try {
                    const response = await fetch(pageData.mainImageUrl);
                    if (response.ok) {
                      const blob = await response.blob();
                      bookmarkEntry.cachedMainImage = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                      });
                    } else {
                       console.warn("Failed to fetch main image: Response not OK", response.status);
                    }
                  } catch (error) {
                    console.warn("Failed to fetch main image:", error);
                  }
                }

                chrome.storage.local.get({ bookmarks: [] }, function(data) {
                  if (chrome.runtime.lastError) {
                      console.error('Error retrieving bookmarks:', chrome.runtime.lastError.message);
                      sendResponse({ status: "error", message: 'Error retrieving bookmarks: ' + chrome.runtime.lastError.message });
                      return;
                  }
                  data.bookmarks.push(bookmarkEntry);
                  chrome.storage.local.set({ bookmarks: data.bookmarks }, function() {
                    if (chrome.runtime.lastError) {
                      console.error('Error saving bookmark:', chrome.runtime.lastError.message);
                      sendResponse({ status: "error", message: 'Error saving bookmark: ' + chrome.runtime.lastError.message });
                    } else {
                      console.log('Bookmark saved successfully with ID:', bookmarkEntry.id);
                      sendResponse({ status: "success", data: bookmarkEntry });
                    }
                  });
                });
              }

              processAndStoreBookmark();
            } else {
              console.error("Failed to get page data from content script.");
              sendResponse({ status: "error", message: "Failed to get page data." });
            }
          });
        } else {
          console.error("Active tab has no ID.");
          sendResponse({ status: "error", message: "Active tab has no ID." });
        }
      } else {
        console.error("No active tab found.");
        sendResponse({ status: "error", message: "No active tab found." });
      }
    });
    return true; // Required for async sendResponse
  }
});
