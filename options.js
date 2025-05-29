document.addEventListener('DOMContentLoaded', function() {
  const websitesList = document.getElementById('websitesList');
  // const youtubeList = document.getElementById('youtubeList'); // Remove this
  const youtubeVideosList = document.getElementById('youtubeVideosList');
  const youtubeChannelsList = document.getElementById('youtubeChannelsList');
  const selectionsList = document.getElementById('selectionsList');
  const dragDropToggle = document.getElementById('dragDropToggle'); // Added
  let dragDropEnabled = false; // Added
  let draggedItem = null; // Added
  let originalBookmarksOrder = []; // Added

  // Function to update draggable attributes and visual cues (Added)
  function updateDraggableState(enabled) {
    const lists = [websitesList, youtubeVideosList, youtubeChannelsList, selectionsList]; // Updated lists
    lists.forEach(list => {
      if (enabled) {
        list.classList.add('dnd-enabled');
      } else {
        list.classList.remove('dnd-enabled');
      }
      Array.from(list.children).forEach(item => {
        if (item.classList.contains('bookmark-item')) { // Ensure it's a bookmark item
          item.setAttribute('draggable', enabled ? 'true' : 'false');
        }
      });
    });
  }

  // --- DRAG AND DROP HANDLERS --- (Added)
  function handleDragStart(e) {
    if (!dragDropEnabled || !e.target.classList.contains('bookmark-item')) return;
    draggedItem = e.target;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.target.dataset.id); // Store ID
    // Timeout to allow browser to render drag image before style change
    setTimeout(() => {
      if (draggedItem) draggedItem.classList.add('dragging');
    }, 0);
    
    // Store current order of all bookmarks
    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      originalBookmarksOrder = data.bookmarks.map(bm => bm.id);
    });
  }

  function handleDragOver(e) {
    if (!dragDropEnabled || !draggedItem) return;
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';

    const targetItem = e.target.closest('.bookmark-item');
    if (targetItem && targetItem !== draggedItem && targetItem.parentElement === draggedItem.parentElement) {
      Array.from(draggedItem.parentElement.children).forEach(child => {
        if (child.classList.contains('bookmark-item')) child.classList.remove('drag-over');
      });
      targetItem.classList.add('drag-over');
    }
  }

  function handleDragLeave(e) {
      const targetItem = e.target.closest('.bookmark-item');
      if (targetItem) {
          targetItem.classList.remove('drag-over');
      }
  }

  function handleDrop(e) {
    if (!dragDropEnabled || !draggedItem) return;
    e.preventDefault();
    const targetItem = e.target.closest('.bookmark-item');
    const droppedOnList = e.target.closest('.bookmark-list');

    if (draggedItem.parentElement) { // Check if draggedItem still has a parent
        Array.from(draggedItem.parentElement.children).forEach(child => {
            if (child.classList.contains('bookmark-item')) child.classList.remove('drag-over');
        });
    }


    if (!targetItem && !droppedOnList) { // Dropped outside a valid target or list
      return;
    }
    
    const draggedItemId = e.dataTransfer.getData('text/plain');
    
    // Ensure drop is within the same list type
    if (targetItem && targetItem.parentElement !== draggedItem.parentElement) {
      console.warn("Cannot move bookmarks between different lists.");
      return; 
    }
    
    if (!targetItem && droppedOnList && droppedOnList === draggedItem.parentElement) {
       const list = draggedItem.parentElement;
       list.appendChild(draggedItem); 
       updateStoredOrder(list);
       return;
    }
    
    if (targetItem && targetItem !== draggedItem) {
      const list = targetItem.parentElement;
      const children = Array.from(list.children).filter(child => child.classList.contains('bookmark-item'));
      const draggedIndex = children.indexOf(draggedItem);
      const targetIndex = children.indexOf(targetItem);

      if (draggedIndex < targetIndex) {
        list.insertBefore(draggedItem, targetItem.nextSibling);
      } else {
        list.insertBefore(draggedItem, targetItem);
      }
      updateStoredOrder(list);
    }
  }

  function handleDragEnd(e) {
    if (!draggedItem) return;
    draggedItem.classList.remove('dragging');
    if (draggedItem.parentElement) { // Check if draggedItem still has a parent
        Array.from(draggedItem.parentElement.children).forEach(child => {
            if (child.classList.contains('bookmark-item')) child.classList.remove('drag-over');
        });
    }
    draggedItem = null;
    originalBookmarksOrder = []; 
  }

  // Function to update chrome.storage.local with new order from a list (Added)
  function updateStoredOrder(listElement) {
    const newOrderedIdsInList = Array.from(listElement.children)
                                .map(item => item.dataset.id)
                                .filter(id => id); 

    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      let allBookmarks = data.bookmarks;
      const bookmarkMap = new Map(allBookmarks.map(bm => [bm.id, bm]));
      let updatedBookmarks = [];
      let usedIds = new Set();

      // Add reordered items from the current list first
      newOrderedIdsInList.forEach(id => {
          if (bookmarkMap.has(id)) {
              updatedBookmarks.push(bookmarkMap.get(id));
              usedIds.add(id);
          }
      });
      
      // Add items from other lists or not in this list, maintaining original overall order as much as possible
      originalBookmarksOrder.forEach(id => {
          if (!usedIds.has(id) && bookmarkMap.has(id)) {
              updatedBookmarks.push(bookmarkMap.get(id));
              usedIds.add(id);
          }
      });

      // Add any truly new bookmarks not captured (should be rare here)
      allBookmarks.forEach(bm => {
          if(!usedIds.has(bm.id)) {
              updatedBookmarks.push(bm);
          }
      });

      chrome.storage.local.set({ bookmarks: updatedBookmarks }, function() {
        if (chrome.runtime.lastError) {
          console.error("Error updating bookmark order:", chrome.runtime.lastError);
        } else {
          console.log("Bookmark order updated successfully.");
        }
      });
    });
  }

  // Function to create a bookmark list item element
  function createBookmarkElement(bookmark) {
    const item = document.createElement('li');
    item.classList.add('bookmark-item');
    item.setAttribute('data-id', bookmark.id);

    let imageAreaContent = '';
    let displayImageUrl = bookmark.thumbnailUrl || bookmark.faviconUrl;
    let imageSpecificClass = bookmark.thumbnailUrl ? 'bookmark-thumbnail' : (bookmark.faviconUrl ? 'bookmark-favicon' : '');

    if (displayImageUrl) {
      try {
        new URL(displayImageUrl); // Validate URL (basic check)
        imageAreaContent = `
          <div class="bookmark-image-container">
            <img src="${escapeHTML(displayImageUrl)}" alt="${escapeHTML(bookmark.title)}" class="bookmark-image ${imageSpecificClass}">
          </div>`;
      } catch (e) {
        console.warn("Invalid image URL for bookmark:", bookmark.title, displayImageUrl, e);
        imageAreaContent = '<div class="bookmark-image-placeholder"></div>'; // Placeholder for invalid URL
      }
    } else {
      imageAreaContent = '<div class="bookmark-image-placeholder"></div>'; // Placeholder for no image
    }

    let textContent = `
      <div class="bookmark-info">
        <span class="bookmark-title">${escapeHTML(bookmark.title)}</span>
        <a href="${escapeHTML(bookmark.url)}" target="_blank" class="bookmark-url" title="${escapeHTML(bookmark.url)}">${escapeHTML(bookmark.url.length > 60 ? bookmark.url.substring(0,57) + '...' : bookmark.url)}</a>`;

    if (bookmark.type === 'selection' && bookmark.text) {
        textContent += `<p class="bookmark-selection-text"><em>"${escapeHTML(bookmark.text)}"</em></p>`;
    }
    
    textContent += `
        <small class="bookmark-date">Added: ${new Date(bookmark.added_date).toLocaleString()}</small>
      </div>
    `;

    item.innerHTML = `
      ${imageAreaContent}
      ${textContent}
      <div class="bookmark-actions">
        <button class="deleteBtn" data-id="${bookmark.id}" title="Delete bookmark">Delete</button>
      </div>
    `;
    return item;
  }

  // Function to render bookmarks to their respective lists
  function renderBookmarks(bookmarks) {
    // Clear existing placeholder or old bookmarks
    websitesList.innerHTML = '';
    youtubeVideosList.innerHTML = ''; // New list
    youtubeChannelsList.innerHTML = ''; // New list
    selectionsList.innerHTML = '';

    if (bookmarks.length === 0) {
        websitesList.innerHTML = '<li class="empty-list-placeholder">No website bookmarks yet.</li>';
        youtubeVideosList.innerHTML = '<li class="empty-list-placeholder">No YouTube video bookmarks yet.</li>'; // New list
        youtubeChannelsList.innerHTML = '<li class="empty-list-placeholder">No YouTube channel bookmarks yet.</li>'; // New list
        selectionsList.innerHTML = '<li class="empty-list-placeholder">No selections bookmarked yet.</li>';
        // Still call addListEventListeners to ensure D&D listeners are on the empty lists
        // if one list becomes empty after a delete.
        // updateDraggableState and addListEventListeners are called after this block regardless
    }

    bookmarks.forEach(bookmark => {
      const bookmarkElement = createBookmarkElement(bookmark);
      if (bookmark.type === 'youtube_video') {
        youtubeVideosList.appendChild(bookmarkElement); // Changed
      } else if (bookmark.type === 'youtube_channel') {
        youtubeChannelsList.appendChild(bookmarkElement); // Changed
      } else if (bookmark.type === 'selection') {
        selectionsList.appendChild(bookmarkElement);
      } else { // 'page' and 'website' types
        websitesList.appendChild(bookmarkElement);
      }
    });
    
    updateDraggableState(dragDropEnabled); 
    addListEventListeners(); 
  }

  // Load bookmarks from storage and render them
  function loadAndRenderBookmarks() {
    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      // D&D relies on the order from storage. If we sort here for display only,
      // the D&D logic might get confused. For D&D, it's best to render
      // in the order they are stored, or ensure D&D updates the sorted source.
      // For now, removing the sort for D&D to work correctly with array indices.
      // Sorting will be handled by how items are added/moved.
      // renderBookmarks(data.bookmarks.sort((a,b) => new Date(b.added_date) - new Date(a.added_date)));
      renderBookmarks(data.bookmarks); 
    });
  }
  
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>"']/g, function (match) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match];
    });
  }

  function handleDeleteBookmark(event) {
    if (event.target.classList.contains('deleteBtn')) {
      const bookmarkId = event.target.getAttribute('data-id');
      if (confirm('Are you sure you want to delete this bookmark?')) {
        chrome.storage.local.get({ bookmarks: [] }, function(data) {
          let bookmarks = data.bookmarks.filter(bm => bm.id !== bookmarkId);
          chrome.storage.local.set({ bookmarks: bookmarks }, function() {
            if (chrome.runtime.lastError) {
              console.error("Error deleting bookmark:", chrome.runtime.lastError);
            } else {
              console.log("Bookmark deleted:", bookmarkId);
              // loadAndRenderBookmarks(); // Re-render will be handled by storage.onChanged
            }
          });
        });
      }
    }
  }
  
  // Renamed and expanded function (Modified)
  function addListEventListeners() {
    const lists = [websitesList, youtubeVideosList, youtubeChannelsList, selectionsList]; // Updated lists
    lists.forEach(list => {
      // Delete listener (event delegation)
      // Remove first to prevent duplicates if this function is ever called multiple times on the same list
      list.removeEventListener('click', handleDeleteBookmark); 
      list.addEventListener('click', handleDeleteBookmark);

      // D&D Listeners
      // Remove first to prevent duplicates
      list.removeEventListener('dragstart', handleDragStart);
      list.removeEventListener('dragover', handleDragOver);
      list.removeEventListener('dragleave', handleDragLeave);
      list.removeEventListener('drop', handleDrop);
      list.removeEventListener('dragend', handleDragEnd);
      
      list.addEventListener('dragstart', handleDragStart);
      list.addEventListener('dragover', handleDragOver);
      list.addEventListener('dragleave', handleDragLeave);
      list.addEventListener('drop', handleDrop);
      list.addEventListener('dragend', handleDragEnd);
    });
  }

  // Drag and Drop Toggle Functionality (Added)
  dragDropToggle.addEventListener('change', function() {
    dragDropEnabled = this.checked;
    updateDraggableState(dragDropEnabled);
    chrome.storage.local.set({ dragDropEnabledSetting: dragDropEnabled });
  });

  // Load D&D enabled state from storage (Added)
  chrome.storage.local.get({ dragDropEnabledSetting: false }, function(data) {
    dragDropEnabled = data.dragDropEnabledSetting;
    dragDropToggle.checked = dragDropEnabled;
    updateDraggableState(dragDropEnabled); 
  });

  // Initial load
  loadAndRenderBookmarks();

  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local' && changes.bookmarks) {
      console.log('Bookmarks changed in storage, reloading options page list.');
      // The renderBookmarks function is called, which will reapply D&D attributes
      loadAndRenderBookmarks();
    }
    // If only D&D setting changes, no need to reload all bookmarks,
    // but updateDraggableState has already handled it.
  });

  const exportBtn = document.getElementById('exportBtn');
  const importFile = document.getElementById('importFile');
  const importStatus = document.getElementById('importStatus');

  exportBtn.addEventListener('click', function() {
    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      const bookmarksToExport = data.bookmarks;
      if (bookmarksToExport.length === 0) {
        alert('No bookmarks to export.');
        return;
      }

      // Convert bookmarks to JSON string
      const jsonString = JSON.stringify(bookmarksToExport, null, 2); // null, 2 for pretty printing

      // Create a Blob from the JSON string
      const blob = new Blob([jsonString], { type: 'application/json' });

      // Create a URL for the Blob
      const url = URL.createObjectURL(blob);

      // Create a temporary anchor element to trigger the download
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-'); // YYYY-MM-DDTHH-MM-SS
      a.download = `advanced_bookmarker_export_${timestamp}.json`; // Filename for the export
      document.body.appendChild(a); // Append to body to make it clickable
      a.click(); // Programmatically click the anchor to trigger download

      // Clean up: remove anchor and revoke the object URL
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('Bookmarks exported successfully.');
      // Optionally, provide user feedback on the options page itself, though alert/download is primary.
    });
  });

  importFile.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) {
      importStatus.textContent = 'No file selected.';
      return;
    }

    if (file.type !== 'application/json') {
      importStatus.textContent = 'Error: Please select a valid JSON file.';
      alert('Error: Please select a valid JSON file (.json).');
      event.target.value = ''; // Reset file input
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const importedBookmarks = JSON.parse(e.target.result);

        if (!Array.isArray(importedBookmarks)) {
          throw new Error("Imported data is not an array.");
        }

        // Basic validation of imported bookmark structure (first item is enough for a quick check)
        if (importedBookmarks.length > 0) {
          const firstBookmark = importedBookmarks[0];
          if (typeof firstBookmark.title === 'undefined' || 
              typeof firstBookmark.url === 'undefined' ||
              typeof firstBookmark.id === 'undefined' || // ID should ideally be present or regenerated
              typeof firstBookmark.added_date === 'undefined' // Date should be present
              // type is also important
             ) {
            throw new Error("Imported bookmarks have an invalid structure.");
          }
        }
        
        importStatus.textContent = `Found ${importedBookmarks.length} bookmarks to import. Processing...`;

        chrome.storage.local.get({ bookmarks: [] }, function(data) {
          let existingBookmarks = data.bookmarks;
          let newBookmarksCount = 0;
          let skippedDuplicatesCount = 0;
          
          // Create a Set of existing URLs for efficient duplicate checking
          const existingUrls = new Set(existingBookmarks.map(bm => bm.url));

          importedBookmarks.forEach(importedBm => {
            // Ensure imported bookmarks have unique IDs if they clash, or regenerate them
            // For simplicity, we'll assume IDs are unique or regenerate if necessary.
            // A more robust approach would check ID clashes with existing ones.
            // For now, prioritize existing if URL matches.
            if (!existingUrls.has(importedBm.url)) {
              // Ensure essential fields exist, provide defaults if missing and acceptable
              const newBm = {
                id: importedBm.id || 'id_' + new Date().getTime() + Math.random().toString(36).substr(2, 9), // Regenerate ID if missing
                title: importedBm.title || 'Untitled',
                url: importedBm.url,
                type: importedBm.type || 'page',
                added_date: importedBm.added_date || new Date().toISOString(),
                faviconUrl: importedBm.faviconUrl || null,
                thumbnailUrl: importedBm.thumbnailUrl || null,
                text: importedBm.text || null // For selections
              };
              existingBookmarks.unshift(newBm); // Add to beginning
              existingUrls.add(newBm.url); // Add to set to prevent duplicates from within the import file itself
              newBookmarksCount++;
            } else {
              skippedDuplicatesCount++;
            }
          });

          chrome.storage.local.set({ bookmarks: existingBookmarks }, function() {
            if (chrome.runtime.lastError) {
              importStatus.textContent = 'Error saving imported bookmarks.';
              console.error('Error saving imported bookmarks:', chrome.runtime.lastError);
              alert('An error occurred while saving imported bookmarks.');
            } else {
              const message = `Import successful! Added ${newBookmarksCount} new bookmarks. Skipped ${skippedDuplicatesCount} duplicates.`;
              importStatus.textContent = message;
              console.log(message);
              alert(message);
              loadAndRenderBookmarks(); // Refresh the displayed list
            }
            event.target.value = ''; // Reset file input
          });
        });

      } catch (error) {
        importStatus.textContent = `Error: ${error.message}`;
        console.error('Error importing bookmarks:', error);
        alert(`Error importing file: ${error.message}`);
        event.target.value = ''; // Reset file input
      }
    };

    reader.onerror = function() {
      importStatus.textContent = 'Error reading file.';
      alert('An error occurred while reading the file.');
      event.target.value = ''; // Reset file input
    };

    reader.readAsText(file);
  });

  // --- THEME SWITCHER ---
  const themeSelect = document.getElementById('themeSelect');

  function applyTheme(themeName) {
    let effectiveTheme = themeName;
    if (themeName === 'system_default') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      effectiveTheme = prefersDark ? 'dark_mode' : 'light_pastel'; // Default to light_pastel if no system preference
    }
    document.body.setAttribute('data-theme', effectiveTheme);
    
    // Update the select dropdown to reflect the actual choice
    // If 'system_default' was chosen, keep it selected, otherwise select the directly chosen theme.
    themeSelect.value = themeName; 

    chrome.storage.local.set({ selectedTheme: themeName }); // Persist the user's *choice*
    console.log("Applied theme:", themeName, "Effective theme:", effectiveTheme);
  }

  themeSelect.addEventListener('change', function() {
    applyTheme(this.value);
  });

  // Load and apply saved theme on startup
  chrome.storage.local.get({ selectedTheme: 'light_pastel' }, function(data) { // Default to light_pastel
    applyTheme(data.selectedTheme);
  });
  
  // Optional: Listen for system theme changes to dynamically update if "System Default" is selected
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      // Only re-apply if 'system_default' is the *selected* option in the dropdown.
      if (themeSelect.value === 'system_default') {
          console.log("System theme changed, re-applying system_default.");
          applyTheme('system_default'); // Re-apply to pick up new system theme
      }
  });
});
