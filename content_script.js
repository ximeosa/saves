// Function to extract initial page info (favicon, main thumbnail, etc.)
function extractInitialPageInfo() {
  let result = {
    faviconUrl: null,
    thumbnailUrl: null,
    pageTitle: document.title,
    extractedChannelUrl: null, // For channel info from video page
    extractedChannelTitle: null, // For channel info from video page
    // Initialize debug fields
    debug_cs_isWatchPage: false,
    debug_cs_channelImgFound: false,
    debug_cs_channelImgSrc: null,
    debug_cs_channelLinkElementFound: false,
    debug_cs_channelLinkElementHref: null,
    debug_cs_channelNameElementFound: false,
    debug_cs_channelNameContent: null,
    debug_cs_usedFallbackChannelTitle: false,
    debug_cs_fallbackChannelTitle: null,
    // New debug fields for C part of subtask (video page title)
    debug_cs_videoPageSpecificTitleFound: false,
    debug_cs_videoPageSpecificTitleContent: null
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
    console.log('[CS_ExtractInfo_VideoPage] Processing as video page.');
    result.debug_cs_isWatchPage = true;
    const videoId = new URLSearchParams(window.location.search).get('v');
    console.log('[CS_ExtractInfo_VideoPage] videoId:', videoId);

    // Video Page Title Extraction (Part C)
    const specificVideoTitleSelectors = [
        'h1.ytd-watch-metadata yt-formatted-string.ytd-video-primary-info-renderer',
        'yt-formatted-string.title.ytd-video-primary-info-renderer',
        'ytd-watch-metadata .title yt-formatted-string', // Existing one from Turn 75
        'h1.ytd-watch-metadata yt-formatted-string'      // Existing one from Turn 75
    ];
    let videoPageTitleElement = null;
    for (const selector of specificVideoTitleSelectors) {
        videoPageTitleElement = document.querySelector(selector);
        if (videoPageTitleElement && videoPageTitleElement.textContent?.trim()) {
            result.pageTitle = videoPageTitleElement.textContent.trim();
            result.debug_cs_videoPageSpecificTitleFound = true;
            result.debug_cs_videoPageSpecificTitleContent = result.pageTitle;
            console.log('[CS_ExtractInfo_VideoPage] Used specific selector for video pageTitle:', result.pageTitle, `(selector: ${selector})`);
            break;
        }
    }
    if (!result.debug_cs_videoPageSpecificTitleFound) {
        result.pageTitle = document.title.replace(/ - YouTube$/, '').trim(); 
        console.log('[CS_ExtractInfo_VideoPage] Used document.title for video pageTitle:', result.pageTitle);
    }
    result.debug_cs_pageTitle = result.pageTitle; 

    if (videoId) {
      // Video Page Thumbnail Extraction (already updated in Turn 75, seems fine)
      const ogImage = document.querySelector("meta[property='og:image']");
      const imageSrcLink = document.querySelector("link[rel='image_src']");
      if (ogImage && ogImage.content) {
        result.thumbnailUrl = ogImage.content;
        console.log('[CS_ExtractInfo_VideoPage] Used og:image for video thumbnailUrl:', result.thumbnailUrl);
      } else if (imageSrcLink && imageSrcLink.href) {
        result.thumbnailUrl = imageSrcLink.href;
        console.log('[CS_ExtractInfo_VideoPage] Used link[rel="image_src"] for video thumbnailUrl:', result.thumbnailUrl);
      } else {
        result.thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
        console.log('[CS_ExtractInfo_VideoPage] Used maxresdefault.jpg for video thumbnailUrl:', result.thumbnailUrl);
        // Could add a check here to see if maxresdefault loads, then fallback to hqdefault, but that's complex for CS.
      }
      result.debug_cs_thumbnailUrl = result.thumbnailUrl; // Store for debugging
      
      // Channel Image (Avatar) Extraction (Part B - modify channelImgSelectors)
      const channelImgSelectors_watch = [ // Renamed as per Turn 70's diff, but using the new list
          'a.ytd-video-owner-renderer yt-img-shadow#avatar img#img', 
          'ytd-video-owner-renderer yt-img-shadow#avatar img#img', 
          // Fallbacks from previous versions
          'ytd-video-owner-renderer #avatar.ytd-video-owner-renderer img.yt-img-shadow', 
          'ytd-video-owner-renderer #avatar img', 
          'ytd-channel-name #avatar img',         
          '#meta-contents #owner-avatar img',     
          '#upload-info #avatar img',
          '#owner #avatar img',
          '#meta #avatar img.yt-img-shadow'       
      ];
      let channelImg = null;
      for (const selector of channelImgSelectors_watch) { // Use the correct variable name
          channelImg = document.querySelector(selector);
          if (channelImg) {
              console.log('[CS_ExtractInfo_VideoPage] channelImg found with selector:', selector, channelImg);
              break;
          }
      }
      console.log('[CS_ExtractInfo_VideoPage] Final channelImg found:', channelImg);
      result.debug_cs_channelImgFound = !!channelImg;
      if (channelImg && channelImg.src) {
        result.faviconUrl = channelImg.src; 
        result.debug_cs_channelImgSrc = channelImg.src;
        console.log('[CS_ExtractInfo_VideoPage] channelImg.src set to result.faviconUrl:', channelImg.src);
      } else {
        console.log('[CS_ExtractInfo_VideoPage] channelImg not found or no src.');
      }
      
      // Channel Link (for result.extractedChannelUrl) (Part B - modify channelLinkSelectors)
      const channelLinkSelectors_watch = [ // Renamed as per Turn 70's diff
          'div#upload-info ytd-channel-name a.yt-simple-endpoint[href*="/@"]', 
          'div#upload-info ytd-channel-name a.yt-simple-endpoint[href*="/channel/"]', 
          'a.yt-simple-endpoint.ytd-video-owner-renderer[href*="/@"]', 
          'a.yt-simple-endpoint.ytd-video-owner-renderer[href*="/channel/"]', 
          // Fallbacks from previous versions (includes selectors from Turn 67/73)
          'div#owner ytd-channel-name a.yt-simple-endpoint',
          'ytd-video-owner-renderer .ytd-channel-name a.yt-simple-endpoint', 
          'ytd-video-owner-renderer #owner-name a.yt-simple-endpoint', 
          'ytd-video-owner-renderer #channel-name a.yt-simple-endpoint', 
          // 'ytd-video-owner-renderer a.yt-simple-endpoint[href*="/@"]', // Redundant with 3rd selector if specific enough
          // 'ytd-video-owner-renderer a.yt-simple-endpoint[href*="/channel/"]', // Redundant
          '#meta-contents .ytd-video-owner-renderer #channel-name a.yt-simple-endpoint',
          '#owner .ytd-channel-name a.yt-simple-endpoint', 
          '#info .ytd-channel-name a.yt-simple-endpoint'   
      ];
      let channelLinkElement = null;
      for (const selector of channelLinkSelectors_watch) { // Use the correct variable name
          channelLinkElement = document.querySelector(selector);
          if (channelLinkElement) {
              console.log('[CS_ExtractInfo_VideoPage] channelLinkElement found with selector:', selector, channelLinkElement);
              break;
          }
      }
      console.log('[CS_ExtractInfo_VideoPage] Final channelLinkElement found:', channelLinkElement); // Log after loop
      result.debug_cs_channelLinkElementFound = !!channelLinkElement;

      if (channelLinkElement && channelLinkElement.href) {
        result.extractedChannelUrl = channelLinkElement.href;
        result.debug_cs_channelLinkElementHref = channelLinkElement.href;
        console.log('[CS_ExtractInfo_VideoPage] channelLinkElement.href set to result.extractedChannelUrl:', channelLinkElement.href);
        
        // Part 2.3: Refined logic for extractedChannelTitle on video pages (ensure this reflects the intended logic)
        result.extractedChannelTitle = null; 
        result.debug_cs_usedFallbackChannelTitle = false;
        result.debug_cs_fallbackChannelTitle = null;
        result.debug_cs_channelNameElementFound = false; 
        result.debug_cs_channelNameContent = null;    

        // Refined extractedChannelTitle logic (Part B/C)
        const specificTitleElement = document.querySelector('div#upload-info yt-formatted-string#text[title]');
        if (specificTitleElement) {
            result.extractedChannelTitle = specificTitleElement.getAttribute('title')?.trim();
            if (result.extractedChannelTitle) {
                console.log('[CS_ExtractInfo_VideoPage] Extracted channel title from specific element (div#upload-info yt-formatted-string#text[title]):', result.extractedChannelTitle);
                result.debug_cs_channelNameElementFound = true; // Considered a specific element find
                result.debug_cs_channelNameContent = result.extractedChannelTitle;
                result.debug_cs_usedFallbackChannelTitle = false;
            }
        }

        if (!result.extractedChannelTitle && channelLinkElement) { // If specific title not found, proceed with link based
            // Try specific child selectors within channelLinkElement first
            const channelNameChildSelectors = [ 
                'yt-formatted-string#text', 
                '#channel-title',          
                'yt-formatted-string.ytd-channel-name' 
            ];
            let channelNameElement = null;
            for (const selector of channelNameChildSelectors) { 
                channelNameElement = channelLinkElement.querySelector(selector);
                if (channelNameElement && channelNameElement.textContent?.trim()) {
                    console.log('[CS_ExtractInfo_VideoPage] channelNameElement found within channelLinkElement with selector:', selector, channelNameElement);
                    result.extractedChannelTitle = channelNameElement.textContent.trim();
                    result.debug_cs_channelNameElementFound = true;
                    result.debug_cs_channelNameContent = result.extractedChannelTitle;
                    break; 
                }
            }
            console.log('[CS_ExtractInfo_VideoPage] Final channelNameElement after specific child selectors query:', channelNameElement);

            // If not found via specific child, try link's own text content
            if (!result.extractedChannelTitle && channelLinkElement.textContent?.trim()) {
                const linkText = channelLinkElement.textContent.trim();
                // Check if this link element's selector matches the name area, making its textContent more reliable
                const isNameAreaLink = channelLinkElement.matches('div#upload-info ytd-channel-name a.yt-simple-endpoint');
                if (isNameAreaLink || (linkText.length < 100 && !linkText.toLowerCase().includes("subscribe") && !linkText.toLowerCase().includes("view comments"))) {
                     result.extractedChannelTitle = linkText;
                     console.log('[CS_ExtractInfo_VideoPage] Used channelLinkElement.textContent for extractedChannelTitle:', result.extractedChannelTitle, `(isNameAreaLink: ${isNameAreaLink})`);
                     result.debug_cs_usedFallbackChannelTitle = true; 
                     result.debug_cs_fallbackChannelTitle = result.extractedChannelTitle; 
                     result.debug_cs_channelNameContent = result.extractedChannelTitle; 
                } else {
                    console.log('[CS_ExtractInfo_VideoPage] channelLinkElement.textContent was too long or non-descriptive (and not from name area), not used for title:', linkText);
                }
            }
        }
        
        // If still no title, and we have a channel URL, parse from URL
        if (!result.extractedChannelTitle && result.extractedChannelUrl) {
            try {
                let pathName = new URL(result.extractedChannelUrl).pathname.split('/').pop();
                if (pathName) {
                    result.extractedChannelTitle = pathName.startsWith('@') ? pathName.substring(1) : pathName;
                    console.log('[CS_ExtractInfo_VideoPage] Used fallback for extractedChannelTitle from URL:', result.extractedChannelUrl, '-> title:', result.extractedChannelTitle);
                    result.debug_cs_usedFallbackChannelTitle = true; 
                    result.debug_cs_fallbackChannelTitle = result.extractedChannelTitle; 
                     if (!result.debug_cs_channelNameContent) result.debug_cs_channelNameContent = result.extractedChannelTitle; 
                }
            } catch(e) { 
                console.warn("Error parsing channel link for title fallback", e);
                if (result.extractedChannelTitle == null) { 
                    result.debug_cs_usedFallbackChannelTitle = false;
                    result.debug_cs_fallbackChannelTitle = null;
                }
            }
        }
        console.log('[CS_ExtractInfo_VideoPage] Final extractedChannelTitle after all fallbacks:', result.extractedChannelTitle);

      } else {
        console.log('[CS_ExtractInfo_VideoPage] channelLinkElement NOT found or no href. result.extractedChannelUrl will be null.');
        // debug fields for channelNameElement, usedFallbackChannelTitle, fallbackChannelTitle already initialized to false/null
        console.log('[CS_ExtractInfo_VideoPage] result.extractedChannelTitle remains:', result.extractedChannelTitle);
      }
    } else {
      console.log('[CS_ExtractInfo_VideoPage] Video ID not found in URL parameters.');
       // All debug_cs_ fields for video page specifics remain as initially set (false/null)
    }
  }
  // 4. Special handling for YouTube channel page specifics
  else if (window.location.hostname.includes("youtube.com") && (window.location.pathname.startsWith("/channel/") || window.location.pathname.startsWith("/@"))) {
    console.log('[CS_ExtractInfo_ChannelPage] Processing as channel page.');
    result.debug_cs_isWatchPage = false; // Ensure this is false for channel pages

    result.extractedChannelUrl = window.location.href;
    console.log('[CS_ExtractInfo_ChannelPage] result.extractedChannelUrl set to:', result.extractedChannelUrl);

    const specificChannelTitleElement = document.querySelector('yt-formatted-string#text.ytd-channel-name, yt-formatted-string.ytd-channel-name.ytd-c4-tabbed-header-renderer, #channel-header yt-formatted-string#text.ytd-channel-name, #name yt-formatted-string#text');
    console.log('[CS_ExtractInfo_ChannelPage] specificChannelTitleElement found:', specificChannelTitleElement);
    if (specificChannelTitleElement && specificChannelTitleElement.textContent) {
        result.extractedChannelTitle = specificChannelTitleElement.textContent.trim();
    } else {
        result.extractedChannelTitle = document.title.replace(/ - YouTube$/, '').trim();
    }
    console.log('[CS_ExtractInfo_ChannelPage] result.extractedChannelTitle set to:', result.extractedChannelTitle);
    
    // Set relevant debug fields for channel page context
    result.debug_cs_channelLinkElementFound = true; // Since URL is window.location.href
    result.debug_cs_channelLinkElementHref = result.extractedChannelUrl;
    result.debug_cs_channelNameElementFound = !!specificChannelTitleElement;
    result.debug_cs_channelNameContent = result.extractedChannelTitle; // Best guess given the logic
    result.debug_cs_usedFallbackChannelTitle = !specificChannelTitleElement;


    const channelIcon = document.querySelector('#avatar img.yt-img-shadow, yt-img-shadow#avatar img.yt-img-shadow, #channel-header #avatar img');
    if (channelIcon && channelIcon.src) {
      result.faviconUrl = channelIcon.src; 
      result.thumbnailUrl = channelIcon.src; 
      result.debug_cs_channelImgFound = true;
      result.debug_cs_channelImgSrc = channelIcon.src;
      
      const channelBanner = document.querySelector('#contentContainer #header #banner img, tp-yt-profile-header-renderer #banner img');
      if(channelBanner && channelBanner.src && channelBanner.src.startsWith('http')){
        result.thumbnailUrl = channelBanner.src; // Override thumbnail if banner found
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

  console.log('[CS_ExtractInfo] Final result object before sending:', JSON.parse(JSON.stringify(result)));
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
        // Reverted videoTitle logic for parseYouTubeLinkPreview
        if (titleElement && titleElement.textContent) {
            details.videoTitle = titleElement.textContent.trim();
        } else if (videoLinkElement) { // Ensure videoLinkElement exists for these attributes
            details.videoTitle = videoLinkElement.getAttribute('aria-label') || // Prefer aria-label
                                 videoLinkElement.getAttribute('title') || 
                                 videoLinkElement.textContent.trim() || // Then link's own text
                                 "YouTube Video"; // Generic fallback if nothing else
        } else {
             details.videoTitle = "YouTube Video"; // Should not happen if videoLinkElement is guaranteed by outer logic
        }
        console.log("[CS_ParseLink] Extracted videoTitle:", details.videoTitle); // Reverted log message too

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
