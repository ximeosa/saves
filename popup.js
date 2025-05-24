console.log("Popup script loaded");

document.addEventListener('DOMContentLoaded', function() {
  const savePageBtn = document.getElementById('savePageBtn');
  const bookmarksListDiv = document.getElementById('bookmarksList');
  const themeToggleBtn = document.getElementById('themeToggleBtn');

  // Apply Saved Theme on Load
  chrome.storage.local.get('theme', function(data) {
    if (data.theme) {
      document.body.setAttribute('data-theme', data.theme);
    }
  });

  // Theme Toggle Button Logic
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', function() {
      const currentTheme = document.body.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', newTheme);
      chrome.storage.local.set({ theme: newTheme }, function() {
        if (chrome.runtime.lastError) {
          console.error("Error saving theme:", chrome.runtime.lastError.message);
        }
      });
    });
  } else {
    console.error("Theme toggle button not found");
  }

  function renderBookmarks() {
    // Clear existing bookmarks
    bookmarksListDiv.innerHTML = '';

    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      if (chrome.runtime.lastError) {
        console.error("Error fetching bookmarks:", chrome.runtime.lastError.message);
        return;
      }

      data.bookmarks.forEach(function(bookmark) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'bookmark-item';

        // Favicon
        if (bookmark.cachedFavicon) {
          const faviconImg = document.createElement('img');
          faviconImg.src = bookmark.cachedFavicon;
          faviconImg.className = 'favicon-img';
          itemDiv.appendChild(faviconImg);
        }

        // Title & Link
        const titleLink = document.createElement('a');
        titleLink.textContent = bookmark.title || bookmark.url; // Fallback to URL if title is empty
        titleLink.href = bookmark.url;
        titleLink.target = '_blank'; // Open in new tab
        itemDiv.appendChild(titleLink);
        
        // Alternatively, to open via chrome.tabs.create:
        // const titleSpan = document.createElement('span');
        // titleSpan.textContent = bookmark.title || bookmark.url;
        // titleSpan.style.cursor = 'pointer';
        // titleSpan.addEventListener('click', function() {
        //   chrome.tabs.create({ url: bookmark.url });
        // });
        // itemDiv.appendChild(titleSpan);


        // Delete Button
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'delete-btn';
        deleteBtn.setAttribute('data-id', bookmark.id);

        deleteBtn.addEventListener('click', function() {
          const bookmarkIdToDelete = this.getAttribute('data-id');
          chrome.storage.local.get({ bookmarks: [] }, function(data) {
            if (chrome.runtime.lastError) {
              console.error("Error fetching bookmarks for deletion:", chrome.runtime.lastError.message);
              return;
            }
            const updatedBookmarks = data.bookmarks.filter(bm => bm.id !== bookmarkIdToDelete);
            chrome.storage.local.set({ bookmarks: updatedBookmarks }, function() {
              if (chrome.runtime.lastError) {
                console.error("Error deleting bookmark:", chrome.runtime.lastError.message);
              } else {
                console.log("Bookmark deleted:", bookmarkIdToDelete);
                renderBookmarks(); // Refresh the list
              }
            });
          });
        });
        itemDiv.appendChild(deleteBtn);

        bookmarksListDiv.appendChild(itemDiv);
      });
    });
  }

  if (savePageBtn) {
    savePageBtn.addEventListener('click', function() {
      chrome.runtime.sendMessage({ type: "SAVE_PAGE" }, function(response) {
        if (chrome.runtime.lastError) {
          console.error("Error sending message:", chrome.runtime.lastError.message);
          // Potentially update UI to show error
        } else {
          console.log("Message sent, response:", response);
          if (response && response.status === "success") {
            // Optionally, you could try to renderBookmarks() here,
            // but popup might close before storage update is fully reflected.
            // For now, relies on popup reopen to refresh.
          }
        }
      });
    });
  } else {
    console.error("Save button not found");
  }

  // Initial render of bookmarks
  renderBookmarks();
});
