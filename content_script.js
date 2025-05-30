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
  // This general thumbnail extraction should happen before page-specific logic might overwrite it.
  const ogImageGlobal = document.querySelector("meta[property='og:image']");
  if (ogImageGlobal && ogImageGlobal.content) {
    result.thumbnailUrl = ogImageGlobal.content;
  } else {
    const twitterImageGlobal = document.querySelector("meta[name='twitter:image']");
    if (twitterImageGlobal && twitterImageGlobal.content) {
      result.thumbnailUrl = twitterImageGlobal.content;
    }
  }

  // 3. Special handling for YouTube video page specifics
  if (window.location.hostname.includes("youtube.com") && window.location.pathname.includes("/watch")) {
    console.log('[CS_ExtractInfo_VideoPage] Processing as video page.');
    result.debug_cs_isWatchPage = true;
    const videoId = new URLSearchParams(window.location.search).get('v');
    console.log('[CS_ExtractInfo_VideoPage] videoId:', videoId);

    // Video Page Title Extraction (Part C from Turn 70, applied Turn 75)
    const specificVideoTitleSelectors = [
        'h1.ytd-watch-metadata yt-formatted-string.ytd-video-primary-info-renderer',
        'yt-formatted-string.title.ytd-video-primary-info-renderer',
        'ytd-watch-metadata .title yt-formatted-string', 
        'h1.ytd-watch-metadata yt-formatted-string'      
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
    if (!result.debug_cs_videoPageSpecificTitleFound) { // If no specific title found
        result.pageTitle = document.title.replace(/ - YouTube$/, '').trim(); 
        console.log('[CS_ExtractInfo_VideoPage] Used document.title for video pageTitle:', result.pageTitle);
    }
    result.debug_cs_pageTitle = result.pageTitle; 

    if (videoId) {
      // Video Page Thumbnail Extraction (From Turn 75)
      const ogImage_video = document.querySelector("meta[property='og:image']"); 
      const imageSrcLink_video = document.querySelector("link[rel='image_src']"); 
      if (ogImage_video && ogImage_video.content) {
        result.thumbnailUrl = ogImage_video.content;
        console.log('[CS_ExtractInfo_VideoPage] Used og:image for video thumbnailUrl:', result.thumbnailUrl);
      } else if (imageSrcLink_video && imageSrcLink_video.href) {
        result.thumbnailUrl = imageSrcLink_video.href;
        console.log('[CS_ExtractInfo_VideoPage] Used link[rel="image_src"] for video thumbnailUrl:', result.thumbnailUrl);
      } else {
        result.thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`; // Default to maxres
        console.log('[CS_ExtractInfo_VideoPage] Used maxresdefault.jpg for video thumbnailUrl:', result.thumbnailUrl);
      }
      result.debug_cs_thumbnailUrl = result.thumbnailUrl; 
      
      // Channel Image (Avatar) Extraction (Favicon for video bookmark)
      // This uses selectors confirmed/updated around Turn 67/73
      const channelImgSelectors = [
          'ytd-video-owner-renderer #avatar.ytd-video-owner-renderer img.yt-img-shadow', 
          'ytd-video-owner-renderer #avatar img', 
          'ytd-channel-name #avatar img',         
          '#meta-contents #owner-avatar img',     
          '#upload-info #avatar img',
          '#owner #avatar img',
          '#meta #avatar img.yt-img-shadow'       
      ];
      let channelImg = null;
      for (const selector of channelImgSelectors) {
          channelImg = document.querySelector(selector);
          if (channelImg) {
              console.log('[CS_ExtractInfo_VideoPage] channelImg (for favicon) found with selector:', selector, channelImg);
              break;
          }
      }
      console.log('[CS_ExtractInfo_VideoPage] Final channelImg (for favicon) found:', channelImg);
      result.debug_cs_channelImgFound = !!channelImg;
      if (channelImg && channelImg.src) {
        result.faviconUrl = channelImg.src; // This will be used as favicon for the video bookmark
        result.debug_cs_channelImgSrc = channelImg.src;
        console.log('[CS_ExtractInfo_VideoPage] channelImg.src set to result.faviconUrl (channel avatar):', channelImg.src);
      } else {
        console.log('[CS_ExtractInfo_VideoPage] channelImg (for favicon) not found or no src.');
      }
      
      // Extracted Channel URL & Title (for "Bookmark Channel from Link" P1)
      // This uses selectors confirmed/updated around Turn 67/73
      const channelLinkSelectors = [ 
          'a.yt-simple-endpoint.ytd-video-owner-renderer[href*="/@"]', 
          'a.yt-simple-endpoint.ytd-video-owner-renderer[href*="/channel/"]',
          'div#owner ytd-channel-name a.yt-simple-endpoint',
          'ytd-video-owner-renderer .ytd-channel-name a.yt-simple-endpoint', 
          'ytd-video-owner-renderer #owner-name a.yt-simple-endpoint', 
          'ytd-video-owner-renderer #channel-name a.yt-simple-endpoint', 
          'ytd-video-owner-renderer a.yt-simple-endpoint[href*="/@"]', 
          'ytd-video-owner-renderer a.yt-simple-endpoint[href*="/channel/"]',
          '#meta-contents .ytd-video-owner-renderer #channel-name a.yt-simple-endpoint',
          '#owner .ytd-channel-name a.yt-simple-endpoint', 
          '#info .ytd-channel-name a.yt-simple-endpoint'   
      ];
      let channelLinkElement = null;
      for (const selector of channelLinkSelectors) {
          channelLinkElement = document.querySelector(selector);
          if (channelLinkElement) {
              console.log('[CS_ExtractInfo_VideoPage] channelLinkElement (for extractedChannelUrl) found with selector:', selector, channelLinkElement);
              break;
          }
      }
      console.log('[CS_ExtractInfo_VideoPage] Final channelLinkElement (for extractedChannelUrl) found:', channelLinkElement); 
      result.debug_cs_channelLinkElementFound = !!channelLinkElement;

      if (channelLinkElement && channelLinkElement.href) {
        result.extractedChannelUrl = channelLinkElement.href;
        result.debug_cs_channelLinkElementHref = channelLinkElement.href;
        console.log('[CS_ExtractInfo_VideoPage] channelLinkElement.href set to result.extractedChannelUrl:', channelLinkElement.href);
        
        result.extractedChannelTitle = null; 
        result.debug_cs_usedFallbackChannelTitle = false;
        result.debug_cs_fallbackChannelTitle = null;
        result.debug_cs_channelNameElementFound = false; 
        result.debug_cs_channelNameContent = null;    

        const currentChannelNameSelectors = [ 
            'yt-formatted-string#text', 
            '#channel-title',          
            'yt-formatted-string.ytd-channel-name' 
        ];
        let channelNameElement = null;
        for (const selector of currentChannelNameSelectors) { 
            channelNameElement = channelLinkElement.querySelector(selector);
            if (channelNameElement && channelNameElement.textContent?.trim()) {
                console.log('[CS_ExtractInfo_VideoPage] channelNameElement (for extractedChannelTitle) found with selector:', selector, channelNameElement);
                result.extractedChannelTitle = channelNameElement.textContent.trim();
                result.debug_cs_channelNameElementFound = true;
                result.debug_cs_channelNameContent = result.extractedChannelTitle;
                break; 
            }
        }
        console.log('[CS_ExtractInfo_VideoPage] Final channelNameElement (for extractedChannelTitle) after specific selectors query:', channelNameElement);
        
        if (!result.extractedChannelTitle && channelLinkElement.textContent?.trim()) {
            const linkText = channelLinkElement.textContent.trim();
            if (linkText.length < 100 && !linkText.toLowerCase().includes("subscribe") && !linkText.toLowerCase().includes("view comments")) {
                 result.extractedChannelTitle = linkText;
                 console.log('[CS_ExtractInfo_VideoPage] Used channelLinkElement.textContent for extractedChannelTitle:', result.extractedChannelTitle);
                 result.debug_cs_usedFallbackChannelTitle = true; 
                 result.debug_cs_fallbackChannelTitle = result.extractedChannelTitle;
                 result.debug_cs_channelNameContent = result.extractedChannelTitle; 
            } else {
                console.log('[CS_ExtractInfo_VideoPage] channelLinkElement.textContent was too long or non-descriptive, not used for title:', linkText);
            }
        }
        
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
        console.log('[CS_ExtractInfo_VideoPage] channelLinkElement (for extractedChannelUrl) NOT found or no href. result.extractedChannelUrl will be null.');
        console.log('[CS_ExtractInfo_VideoPage] result.extractedChannelTitle remains (due to no link):', result.extractedChannelTitle);
      }
    } else {
      console.log('[CS_ExtractInfo_VideoPage] Video ID not found in URL parameters.');
    }
  }
  // 4. Special handling for YouTube channel page specifics
  else if (window.location.hostname.includes("youtube.com") && (window.location.pathname.startsWith("/channel/") || window.location.pathname.startsWith("/@"))) {
    console.log('[CS_ExtractInfo_ChannelPage] Processing as channel page.');
    result.debug_cs_isWatchPage = false; 

    result.extractedChannelUrl = window.location.href; // For channel pages, this is the main URL
    console.log('[CS_ExtractInfo_ChannelPage] result.extractedChannelUrl set to:', result.extractedChannelUrl);

    const specificChannelTitleElement = document.querySelector('yt-formatted-string#text.ytd-channel-name, yt-formatted-string.ytd-channel-name.ytd-c4-tabbed-header-renderer, #channel-header yt-formatted-string#text.ytd-channel-name, #name yt-formatted-string#text');
    console.log('[CS_ExtractInfo_ChannelPage] specificChannelTitleElement found:', specificChannelTitleElement);
    if (specificChannelTitleElement && specificChannelTitleElement.textContent) {
        result.pageTitle = specificChannelTitleElement.textContent.trim(); // For channel page, pageTitle is channel title
        result.extractedChannelTitle = result.pageTitle;
    } else {
        result.pageTitle = document.title.replace(/ - YouTube$/, '').trim();
        result.extractedChannelTitle = result.pageTitle;
    }
    console.log('[CS_ExtractInfo_ChannelPage] result.pageTitle (channel title) set to:', result.pageTitle);
    console.log('[CS_ExtractInfo_ChannelPage] result.extractedChannelTitle set to:', result.extractedChannelTitle);
    
    result.debug_cs_pageTitle = result.pageTitle;
    result.debug_cs_channelLinkElementFound = true; 
    result.debug_cs_channelLinkElementHref = result.extractedChannelUrl;
    result.debug_cs_channelNameElementFound = !!specificChannelTitleElement;
    result.debug_cs_channelNameContent = result.extractedChannelTitle; 
    result.debug_cs_usedFallbackChannelTitle = !specificChannelTitleElement;
    if (!specificChannelTitleElement) result.debug_cs_fallbackChannelTitle = result.extractedChannelTitle;


    const channelIcon = document.querySelector('#avatar img.yt-img-shadow, yt-img-shadow#avatar img.yt-img-shadow, #channel-header #avatar img');
    if (channelIcon && channelIcon.src) {
      result.faviconUrl = channelIcon.src; 
      result.thumbnailUrl = channelIcon.src; // Default thumbnail to avatar
      result.debug_cs_channelImgFound = true;
      result.debug_cs_channelImgSrc = channelIcon.src;
      
      const channelBanner = document.querySelector('#contentContainer #header #banner img, tp-yt-profile-header-renderer #banner img');
      if(channelBanner && channelBanner.src && channelBanner.src.startsWith('http')){
        result.thumbnailUrl = channelBanner.src; // Override with banner if found
        console.log('[CS_ExtractInfo_ChannelPage] Channel banner found for thumbnailUrl:', result.thumbnailUrl);
      }
      result.debug_cs_thumbnailUrl = result.thumbnailUrl;
    } else {
        console.log('[CS_ExtractInfo_ChannelPage] Channel icon not found.');
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
                // Reverted: Use document.title as a broader fallback for non-preview contexts if videoLinkElement not found
                details.videoTitle = document.title.replace(/ - YouTube$/, '').trim(); 
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
        // Reverted videoTitle logic for parseYouTubeLinkPreview (from Turn 71)
        if (titleElement && titleElement.textContent) {
            details.videoTitle = titleElement.textContent.trim();
        } else if (videoLinkElement) { 
            details.videoTitle = videoLinkElement.getAttribute('aria-label') || 
                                 videoLinkElement.getAttribute('title') || 
                                 videoLinkElement.textContent.trim() || 
                                 "YouTube Video"; 
        } else {
             details.videoTitle = "YouTube Video"; 
        }
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
        
        details.channelTitle = null; 
        details.channelUrl = null;   

        console.log("[CS_ParseLink_Chan] Attempting to find channel information within previewContainer:", previewContainer);

        const channelNameSelectors = [
            '#byline-container yt-formatted-string.ytd-channel-name', 
            '.ytd-video-meta-block #byline-container yt-formatted-string.ytd-channel-name',
            '#channel-name .ytd-channel-name', 
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

        const channelLinkSelectors = [
            '#byline-container a.yt-simple-endpoint.ytd-video-meta-block[href*="/@"]',
            '#byline-container a.yt-simple-endpoint.ytd-video-meta-block[href*="/channel/"]',
            '.ytd-channel-name a.yt-simple-endpoint[href*="/@"]', 
            '.ytd-channel-name a.yt-simple-endpoint[href*="/channel/"]',
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
                channelLinkElement = linkEl; 
                console.log(`[CS_ParseLink_Chan] Found channelUrl using selector '${selector}':`, details.channelUrl);
                break;
            }
        }
        
        if (details.channelUrl) {
            if (!details.channelTitle && channelLinkElement) {
                details.channelTitle = channelLinkElement.title || channelLinkElement.textContent.trim().split('\n').find(s => s.trim()) || '';
                console.log("[CS_ParseLink_Chan] Fallback channelTitle from found channelLinkElement text/title:", details.channelTitle);
                if (!details.channelTitle) { 
                    try {
                        details.channelTitle = new URL(details.channelUrl).pathname.split('/').pop().replace(/^@/, '');
                        console.log("[CS_ParseLink_Chan] Fallback channelTitle from channelUrl pathname:", details.channelTitle);
                    } catch (e) { console.warn("[CS_ParseLink_Chan] Could not parse channelUrl for fallback title", e); }
                }
            }
            if (details.channelUrl && !details.channelUrl.startsWith('http') && window.location.origin) {
                try {
                    details.channelUrl = new URL(details.channelUrl, window.location.origin).href;
                } catch (e) { console.warn("[CS_ParseLink_Chan] Failed to make channelUrl absolute:", e); details.channelUrl = null; }
            }
        } else {
            console.warn("[CS_ParseLink_Chan] Channel URL not found using any selectors.");
        }
        
        if (details.channelTitle && !details.channelUrl) {
            console.warn("[CS_ParseLink_Chan] Found channelTitle but NO channelUrl:", details.channelTitle);
        }
        
        const channelAvatarInPreview = previewContainer.querySelector(
            '#avatar-link yt-img-shadow img, a.yt-simple-endpoint yt-img-shadow#avatar img, .ytd-channel-name yt-img-shadow img'
        );
        if (channelAvatarInPreview && channelAvatarInPreview.src) {
            details.channelIconUrl = channelAvatarInPreview.src;
            console.log("[CS_ParseLink_Chan] Extracted channelIconUrl from preview:", details.channelIconUrl); 
        } else {
            console.warn("[CS_ParseLink_Chan] Could not find channelIconUrl in preview."); 
        }
        if (details.channelIconUrl && !details.channelIconUrl.startsWith('http') && !details.channelIconUrl.startsWith('data:') && window.location.origin) {
             try { details.channelIconUrl = new URL(details.channelIconUrl, window.location.origin).href; } catch (e) { console.warn("[CS_ParseLink_Chan] Failed to make channelIconUrl absolute:", e); details.channelIconUrl = null; }
        }

    } else { // if (!previewContainer)
        console.warn("[CS_ParseLink] No previewContainer found for linkUrl:", linkUrl);
        // Fallback for videoTitle if no preview container but videoLinkElement exists
        if (videoLinkElement) { // Should always be true if this else block is reached
             details.videoTitle = videoLinkElement.getAttribute('aria-label') || 
                                 videoLinkElement.getAttribute('title') || 
                                 document.title.replace(/ - YouTube$/, '').trim();
        } else { // Should theoretically not be reached if outer logic ensures videoLinkElement
            details.videoTitle = document.title.replace(/ - YouTube$/, '').trim();
        }
        
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

[end of content_script.js]
