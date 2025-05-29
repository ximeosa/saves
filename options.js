document.addEventListener('DOMContentLoaded', function() {
  const websitesList = document.getElementById('websitesList');
  const youtubeList = document.getElementById('youtubeList');
  const selectionsList = document.getElementById('selectionsList');
  const dragDropToggle = document.getElementById('dragDropToggle'); // Added
  let dragDropEnabled = false; // Added
  let draggedItem = null; // Added
  let originalBookmarksOrder = []; // Added

  // Function to update draggable attributes and visual cues (Added)
  function updateDraggableState(enabled) {
    const lists = [websitesList, youtubeList, selectionsList];
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

    let imageContent = '';
    let displayImageUrl = bookmark.thumbnailUrl || bookmark.faviconUrl;
    let imageTypeClass = '';

    if (bookmark.thumbnailUrl) {
        imageTypeClass = 'bookmark-thumbnail';
    } else if (bookmark.faviconUrl) {
        imageTypeClass = 'bookmark-favicon';
    }

    if (displayImageUrl) {
      try {
        new URL(displayImageUrl); 
        imageContent = `<img src="${escapeHTML(displayImageUrl)}" alt="Image for ${escapeHTML(bookmark.title)}" class="bookmark-image ${imageTypeClass}">`;
      } catch (e) {
        console.warn("Invalid image URL for bookmark:", bookmark.title, displayImageUrl, e);
      }
    }

    let textContent = `
      <div class="bookmark-info">
        <span class="bookmark-title">${escapeHTML(bookmark.title)}</span>
        <a href="${escapeHTML(bookmark.url)}" target="_blank" class="bookmark-url">${escapeHTML(bookmark.url)}</a>
    `;

    if (bookmark.type === 'selection' && bookmark.text) {
        textContent += `<p class="bookmark-selection-text"><em>"${escapeHTML(bookmark.text)}"</em></p>`;
    }
    
    textContent += `
        <small class="bookmark-date">Added: ${new Date(bookmark.added_date).toLocaleString()}</small>
      </div>
    `;

    item.innerHTML = `
      ${imageContent}
      ${textContent}
      <div class="bookmark-actions">
        <button class="deleteBtn" data-id="${bookmark.id}" title="Delete bookmark">Delete</button>
      </div>
    `;
    return item;
  }

  // Function to render bookmarks to their respective lists
  function renderBookmarks(bookmarks) {
    websitesList.innerHTML = '';
    youtubeList.innerHTML = '';
    selectionsList.innerHTML = '';

    if (bookmarks.length === 0) {
        websitesList.innerHTML = '<li>No website bookmarks yet.</li>';
        youtubeList.innerHTML = '<li>No YouTube bookmarks yet.</li>';
        selectionsList.innerHTML = '<li>No selections bookmarked yet.</li>';
        // Still call addListEventListeners to ensure D&D listeners are on the empty lists
        // if one list becomes empty after a delete.
    }

    bookmarks.forEach(bookmark => {
      const bookmarkElement = createBookmarkElement(bookmark);
      if (bookmark.type === 'youtube_video' || bookmark.type === 'youtube_channel') {
        youtubeList.appendChild(bookmarkElement);
      } else if (bookmark.type === 'selection') {
        selectionsList.appendChild(bookmarkElement);
      } else { 
        websitesList.appendChild(bookmarkElement);
      }
    });
    
    updateDraggableState(dragDropEnabled); // Modified: Apply draggable attributes if D&D is on
    addListEventListeners(); // Modified: Renamed and will add D&D listeners
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
    const lists = [websitesList, youtubeList, selectionsList];
    lists.forEach(list => {
      list.removeEventListener('click', handleDeleteBookmark); // Remove old before adding
      list.addEventListener('click', handleDeleteBookmark);

      // Remove old D&D listeners before adding new ones to prevent duplicates
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
    console.log('Export button clicked - functionality pending.');
    alert('Export functionality will be implemented in a future step.');
  });

  importFile.addEventListener('change', function(event) {
    console.log('Import file selected - functionality pending.');
    alert('Import functionality will be implemented in a future step.');
    importStatus.textContent = 'Import processing will be implemented later.';
  });
});
