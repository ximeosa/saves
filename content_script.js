// Function to extract initial page info (favicon, main thumbnail, etc.)
function extractInitialPageInfo() {
  let result = {
    faviconUrl: null,
    thumbnailUrl: null,
    pageTitle: document.title,
    extractedChannelUrl: null, // For channel info from video page
    extractedChannelTitle: null // For channel info from video page
  };

  // 1. Try to get favicon
  const faviconSelectors = [
    "link[rel='icon']",
    "link[rel='shortcut icon']",
    "link[rel='apple-touch-icon']",
    "link[rel='apple-touch-icon-precomposed']"
  ];
  for (let selector of faviconSelectors) {
    const iconLink = document.querySelector(selector);
    if (iconLink && iconLink.href) {
      result.faviconUrl = iconLink.href;
      break;
    }
  }
  if (!result.faviconUrl && window.location.origin) { // Ensure origin exists before creating URL
    try { result.faviconUrl = new URL('/favicon.ico', window.location.origin).href; } catch(e) { console.warn("Error creating favicon URL:", e); }
  }

  // 2. Try to get a representative thumbnail (Open Graph, Twitter Card)
  const ogImage = document.querySelector("meta[property='og:image']");
  if (ogImage && ogImage.content) {
    result.thumbnailUrl = ogImage.content;
  } else {
    const twitterImage = document.querySelector("meta[name='twitter:image']");
    if (twitterImage && twitterImage.content) {
      result.thumbnailUrl = twitterImage.content;
    }
  }

  // 3. Special handling for YouTube video page specifics
  if (window.location.hostname.includes("youtube.com") && window.location.pathname.includes("/watch")) {
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (videoId) {
      result.thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`; // Standard high-quality thumbnail
      const channelImg = document.querySelector('ytd-video-owner-renderer #avatar img, ytd-channel-name #avatar img, #meta-contents #avatar img, #meta #avatar img.yt-img-shadow');
      if (channelImg && channelImg.src) { result.faviconUrl = channelImg.src; } // Channel icon as favicon
      
      const channelLinkElement = document.querySelector('ytd-video-owner-renderer .ytd-channel-name a, ytd-channel-name a.yt-simple-endpoint');
      if (channelLinkElement && channelLinkElement.href) {
        result.extractedChannelUrl = channelLinkElement.href;
        const channelNameElement = channelLinkElement.querySelector('yt-formatted-string#text, #channel-title');
        if (channelNameElement && channelNameElement.textContent) {
          result.extractedChannelTitle = channelNameElement.textContent.trim();
        } else {
          try {
            let pathName = new URL(channelLinkElement.href).pathname.split('/').pop();
            result.extractedChannelTitle = pathName.startsWith('@') ? pathName.substring(1) : pathName;
          } catch(e) { console.warn("Error parsing channel link for title fallback", e); }
        }
      }
    }
  }
  // 4. Special handling for YouTube channel page specifics
  else if (window.location.hostname.includes("youtube.com") && (window.location.pathname.startsWith("/channel/") || window.location.pathname.startsWith("/@"))) {
    const channelIcon = document.querySelector('#avatar img.yt-img-shadow, yt-img-shadow#avatar img.yt-img-shadow, #channel-header #avatar img'); // Added #channel-header selector
    if (channelIcon && channelIcon.src) {
      result.faviconUrl = channelIcon.src; // Use channel icon as favicon
      result.thumbnailUrl = channelIcon.src; // And also as thumbnail for consistency if no banner exists
      
      const channelBanner = document.querySelector('#contentContainer #header #banner img, tp-yt-profile-header-renderer #banner img');
      if(channelBanner && channelBanner.src && channelBanner.src.startsWith('http')){
        result.thumbnailUrl = channelBanner.src;
      }
    }
  }

  // 5. Ensure URLs are absolute
  try {
    if (result.faviconUrl && !result.faviconUrl.startsWith('http') && !result.faviconUrl.startsWith('data:') && window.location.origin) { result.faviconUrl = new URL(result.faviconUrl, window.location.origin).href; }
    if (result.thumbnailUrl && !result.thumbnailUrl.startsWith('http') && !result.thumbnailUrl.startsWith('data:') && window.location.origin) { result.thumbnailUrl = new URL(result.thumbnailUrl, window.location.origin).href; }
    if (result.extractedChannelUrl && !result.extractedChannelUrl.startsWith('http') && !result.extractedChannelUrl.startsWith('data:') && window.location.origin) { result.extractedChannelUrl = new URL(result.extractedChannelUrl, window.location.origin).href; }
  } catch (e) {
    console.warn("Error constructing absolute URL:", e);
  }

  return result;
}

// Function to parse YouTube video preview element
function parseYouTubeLinkPreview(linkUrl) {
    const details = {
        videoUrl: null,
        videoTitle: null,
        videoThumbnailUrl: null,
        channelUrl: null,
        channelTitle: null,
        channelIconUrl: null 
    };

    if (!linkUrl || !linkUrl.includes("youtube.com/watch")) {
        console.warn("parseYouTubeLinkPreview: linkUrl is not a direct YouTube video link or is missing.", linkUrl);
        return details; 
    }
    details.videoUrl = linkUrl;

    const videoLinkElements = Array.from(document.querySelectorAll(`a[href="${details.videoUrl}"], a[href^="${details.videoUrl.split('&')[0]}"]`)); 
    
    let videoLinkElement = videoLinkElements.find(a => 
        a.id === 'video-title' || 
        a.matches('h3.title-and-badge a.yt-simple-endpoint') || 
        a.closest('ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-video-renderer, ytd-playlist-panel-video-renderer') 
    );
     if (!videoLinkElement && videoLinkElements.length > 0) videoLinkElement = videoLinkElements[0]; 

    if (!videoLinkElement) {
        console.warn("parseYouTubeLinkPreview: Could not find a suitable DOM element for video link:", details.videoUrl);
        if (details.videoUrl) {
            try {
                const url = new URL(details.videoUrl);
                const videoId = url.searchParams.get('v');
                if (videoId) {
                    details.videoThumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                }
                details.videoTitle = document.title; 
            } catch (e) { console.error("Error parsing video URL for fallback details", e); }
        }
        console.log("[CS_ParseLink] Function was called with linkUrl:", linkUrl);
        console.log("[CS_ParseLink] Identified videoUrl for this context:", details.videoUrl);
        console.log("[CS_ParseLink] FINAL details object (no videoLinkElement):", JSON.parse(JSON.stringify(details)));
        return details;
    }

    const previewContainer = videoLinkElement.closest('ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-video-renderer, ytd-playlist-panel-video-renderer, div#dismissible');

    if (previewContainer) {
        const titleElement = previewContainer.querySelector('#video-title, .title-and-badge a h3 .yt-core-attributed-string, #video-title-link yt-formatted-string, #meta h3 yt-formatted-string');
        if (titleElement) details.videoTitle = titleElement.textContent.trim();
        else details.videoTitle = videoLinkElement.getAttribute('title') || videoLinkElement.textContent.trim() || "YouTube Video";
        console.log("[CS_ParseLink] Extracted videoTitle:", details.videoTitle); 

        const imgElement = previewContainer.querySelector('yt-image img[src*="ytimg.com/vi/"], img.yt-core-image--loaded[src*="ytimg.com/vi/"]');
        if (imgElement && imgElement.src) {
            details.videoThumbnailUrl = imgElement.src.split('?')[0]; 
        } else { 
             try {
                const url = new URL(details.videoUrl);
                const videoId = url.searchParams.get('v');
                if (videoId) details.videoThumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
             } catch(e) { console.warn("Error parsing videoId for thumbnail fallback", e); }
        }
        console.log("[CS_ParseLink] Extracted videoThumbnailUrl:", details.videoThumbnailUrl); 
        
        // --- START New Channel Info Extraction Logic ---
        details.channelTitle = null; // Reset before trying
        details.channelUrl = null;   // Reset before trying

        console.log("[CS_ParseLink_Chan] Attempting to find channel information within previewContainer:", previewContainer);

        // Attempt 1: Look for common channel name text elements
        const channelNameSelectors = [
            // New selectors for sidebar/compact renderers (prioritized)
            '#byline-container yt-formatted-string.ytd-channel-name', 
            '.ytd-video-meta-block #byline-container yt-formatted-string.ytd-channel-name',
            '#channel-name .ytd-channel-name', // General if yt-formatted-string is nested

            // Existing selectors
            '#channel-name yt-formatted-string.ytd-channel-name', 
            'yt-formatted-string.ytd-channel-name',                 
            '.ytd-video-meta-block #channel-name yt-formatted-string',
            '#byline.ytd-video-meta-block yt-formatted-string',       
            '.ytd-channel-name#text.yt-formatted-string'              
        ];
        for (const selector of channelNameSelectors) {
            const nameEl = previewContainer.querySelector(selector);
            if (nameEl && nameEl.textContent) {
                details.channelTitle = nameEl.textContent.trim();
                console.log(`[CS_ParseLink_Chan] Found channelTitle using selector '${selector}':`, details.channelTitle);
                break;
            }
        }
        if (!details.channelTitle) {
            console.warn("[CS_ParseLink_Chan] Channel title not found using primary selectors.");
        }

        // Attempt 2: Look for common channel link elements
        const channelLinkSelectors = [
            // New selectors for sidebar/compact renderers (prioritized)
            '#byline-container a.yt-simple-endpoint.ytd-video-meta-block[href*="/@"]',
            '#byline-container a.yt-simple-endpoint.ytd-video-meta-block[href*="/channel/"]',
            '.ytd-channel-name a.yt-simple-endpoint[href*="/@"]', 
            '.ytd-channel-name a.yt-simple-endpoint[href*="/channel/"]',

            // Existing selectors
            '#channel-name a.yt-simple-endpoint',                                  
            'ytd-channel-name a.yt-simple-endpoint',                               
            '#avatar-link.yt-simple-endpoint[href*="/@"], #avatar-link.yt-simple-endpoint[href*="/channel/"]', 
            'a.yt-simple-endpoint.ytd-video-meta-block[href*="/@"]',             
            'a.yt-simple-endpoint.ytd-video-meta-block[href*="/channel/"]',      
            '.metadata a.yt-simple-endpoint[href*="/@"]',                         
            '.metadata a.yt-simple-endpoint[href*="/channel/"]'
        ];
        let channelLinkElement = null;
        for (const selector of channelLinkSelectors) {
            const linkEl = previewContainer.querySelector(selector);
            if (linkEl && linkEl.href) {
                details.channelUrl = linkEl.href;
                channelLinkElement = linkEl; // Save for potential title fallback
                console.log(`[CS_ParseLink_Chan] Found channelUrl using selector '${selector}':`, details.channelUrl);
                break;
            }
        }
        
        if (details.channelUrl) {
            // If we found a URL but not a title yet, try to get title from the link's text content or attributes
            if (!details.channelTitle && channelLinkElement) {
                details.channelTitle = channelLinkElement.title || channelLinkElement.textContent.trim().split('\n').find(s => s.trim()) || '';
                console.log("[CS_ParseLink_Chan] Fallback channelTitle from found channelLinkElement text/title:", details.channelTitle);
                if (!details.channelTitle) { // Final fallback from URL if text is empty
                    try {
                        details.channelTitle = new URL(details.channelUrl).pathname.split('/').pop().replace(/^@/, '');
                        console.log("[CS_ParseLink_Chan] Fallback channelTitle from channelUrl pathname:", details.channelTitle);
                    } catch (e) { console.warn("[CS_ParseLink_Chan] Could not parse channelUrl for fallback title", e); }
                }
            }
            // Ensure Channel URL is absolute
            if (details.channelUrl && !details.channelUrl.startsWith('http') && window.location.origin) {
                try {
                    details.channelUrl = new URL(details.channelUrl, window.location.origin).href;
                } catch (e) { console.warn("[CS_ParseLink_Chan] Failed to make channelUrl absolute:", e); details.channelUrl = null; }
            }
        } else {
            console.warn("[CS_ParseLink_Chan] Channel URL not found using any selectors.");
        }
        
        // If title was found but URL wasn't, this is less useful, but log it.
        if (details.channelTitle && !details.channelUrl) {
            console.warn("[CS_ParseLink_Chan] Found channelTitle but NO channelUrl:", details.channelTitle);
        }
        // --- End of new Channel Info Extraction Logic ---
        
        // Attempt to find channel icon within the preview container
        const channelAvatarInPreview = previewContainer.querySelector(
            '#avatar-link yt-img-shadow img, a.yt-simple-endpoint yt-img-shadow#avatar img, .ytd-channel-name yt-img-shadow img'
        );
        if (channelAvatarInPreview && channelAvatarInPreview.src) {
            details.channelIconUrl = channelAvatarInPreview.src;
            console.log("[CS_ParseLink_Chan] Extracted channelIconUrl from preview:", details.channelIconUrl); 
        } else {
            console.warn("[CS_ParseLink_Chan] Could not find channelIconUrl in preview."); 
        }
        // Ensure channelIconUrl is absolute (though src from img tags usually are)
        if (details.channelIconUrl && !details.channelIconUrl.startsWith('http') && !details.channelIconUrl.startsWith('data:') && window.location.origin) {
             try { details.channelIconUrl = new URL(details.channelIconUrl, window.location.origin).href; } catch (e) { console.warn("[CS_ParseLink_Chan] Failed to make channelIconUrl absolute:", e); details.channelIconUrl = null; }
        }

    } else {
        console.warn("[CS_ParseLink] No previewContainer found for linkUrl:", linkUrl);
        details.videoTitle = videoLinkElement.getAttribute('aria-label') || videoLinkElement.getAttribute('title') || document.title;
        if (details.videoUrl) {
            try {
                const url = new URL(details.videoUrl);
                const videoId = url.searchParams.get('v');
                if (videoId) details.videoThumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            } catch(e) { console.warn("Error parsing videoId for thumbnail fallback (no container)", e); }
        }
    }
    
    try {
      if (details.videoThumbnailUrl && !details.videoThumbnailUrl.startsWith('http') && !details.videoThumbnailUrl.startsWith('data:') && window.location.origin) { details.videoThumbnailUrl = new URL(details.videoThumbnailUrl, window.location.origin).href; }
    } catch (e) {
      console.warn("Error constructing absolute URL for preview details (thumbnail):", e);
    }
    
    console.log("[CS_ParseLink] Function was called with linkUrl:", linkUrl);
    console.log("[CS_ParseLink] Identified videoUrl for this context:", details.videoUrl);
    console.log("[CS_ParseLink] FINAL details object:", JSON.parse(JSON.stringify(details))); 
    return details;
}


// Main execution logic for content script
(function() {
  if (chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const initialInfo = extractInitialPageInfo();
        chrome.runtime.sendMessage({ action: "extractedPageInfo", data: initialInfo });
        console.log("Content script: Sent initial extractedPageInfo.", initialInfo);
      } catch (e) {
        console.error("Content script: Error sending initial extractedPageInfo:", e);
      }
  }

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log("Content script received message:", request);
      if (request.action === "parseYouTubeLinkPreview" && request.linkUrl) {
        try {
            const parsedDetails = parseYouTubeLinkPreview(request.linkUrl);
            sendResponse({ action: "parsedYouTubeLinkPreviewResults", data: parsedDetails });
        } catch (e) {
            console.error("Error parsing YouTube link preview:", e);
            sendResponse({ action: "parsedYouTubeLinkPreviewResults", error: e.message, data: {} });
        }
        return true; 
      } else if (request.action === "getFaviconForWebsite") { 
        try {
            let faviconResult = { faviconUrl: null };
            const faviconSelectors = [
                "link[rel='icon']", "link[rel='shortcut icon']", 
                "link[rel='apple-touch-icon']", "link[rel='apple-touch-icon-precomposed']"
            ];
            for (let selector of faviconSelectors) { 
                const iconLink = document.querySelector(selector);
                if (iconLink && iconLink.href) { faviconResult.faviconUrl = iconLink.href; break; } 
            }
            if (!faviconResult.faviconUrl && window.location.origin) { 
                try { faviconResult.faviconUrl = new URL('/favicon.ico', window.location.origin).href; } catch(e) { console.warn("Error creating favicon URL:", e); }
            }
            if (faviconResult.faviconUrl && !faviconResult.faviconUrl.startsWith('http') && !faviconResult.faviconUrl.startsWith('data:') && window.location.origin) { 
                try { faviconResult.faviconUrl = new URL(faviconResult.faviconUrl, window.location.origin).href; } catch(e) { console.warn("Error constructing absolute favicon URL:", e); }
            }
            sendResponse({ action: "faviconForWebsiteResults", data: faviconResult });
        } catch (e) {
            console.error("Error getting favicon for website:", e);
            sendResponse({ action: "faviconForWebsiteResults", error: e.message, data: { faviconUrl: null } });
        }
        return true;
      }
      return false; 
    });
    console.log("Content script: Message listener for background requests is active.");
  }
})();
