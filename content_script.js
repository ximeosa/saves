// This script is injected into the page to extract image URLs.
// It sends a message back to the caller (popup or background script) with the findings.

(function() {
  let result = {
    faviconUrl: null,
    thumbnailUrl: null,
    pageTitle: document.title // Also send back the current page title as the tab might not have updated.
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
  // Fallback for favicon if not found by specific selectors
  if (!result.faviconUrl) {
    // Construct a default path to favicon.ico at the domain root
    // This is a common convention but not guaranteed to exist
    result.faviconUrl = new URL('/favicon.ico', window.location.origin).href;
  }


  // 2. Try to get a representative thumbnail (Open Graph, Twitter Card, or prominent image)
  const ogImage = document.querySelector("meta[property='og:image']");
  if (ogImage && ogImage.content) {
    result.thumbnailUrl = ogImage.content;
  } else {
    const twitterImage = document.querySelector("meta[name='twitter:image']");
    if (twitterImage && twitterImage.content) {
      result.thumbnailUrl = twitterImage.content;
    }
  }

  // Special handling for YouTube videos
  if (window.location.hostname.includes("youtube.com") && window.location.pathname.includes("/watch")) {
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (videoId) {
      // High quality YouTube thumbnail
      result.thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      
      // Attempt to get channel icon from the page
      const channelImg = document.querySelector('ytd-video-owner-renderer #avatar img, ytd-channel-name #avatar img, #meta-contents #avatar img, #meta #avatar img.yt-img-shadow'); // More robust selector for channel avatar
      if (channelImg && channelImg.src) {
        result.faviconUrl = channelImg.src; // This is the channel icon
      }

      const channelLinkElement = document.querySelector('ytd-video-owner-renderer .ytd-channel-name a, ytd-channel-name a.yt-simple-endpoint'); // Selector for channel link
      if (channelLinkElement && channelLinkElement.href) {
        result.extractedChannelUrl = channelLinkElement.href; // Custom field
        const channelNameElement = channelLinkElement.querySelector('yt-formatted-string#text, #channel-title'); // Selector for channel name within the link
        if (channelNameElement && channelNameElement.textContent) {
          result.extractedChannelTitle = channelNameElement.textContent.trim(); // Custom field
        } else {
          // Fallback if specific name element isn't found but link is
          result.extractedChannelTitle = new URL(channelLinkElement.href).pathname.split('/').pop(); // Get it from URL if possible
          if(result.extractedChannelTitle.startsWith('@')) {
              // it's a handle, try to make it more presentable
              result.extractedChannelTitle = result.extractedChannelTitle.substring(1);
          }
        }
      }
    }
  }
  // Special handling for YouTube channels
  else if (window.location.hostname.includes("youtube.com") && (window.location.pathname.startsWith("/channel/") || window.location.pathname.startsWith("/@"))) {
    const channelIcon = document.querySelector('#avatar img.yt-img-shadow, yt-img-shadow#avatar img.yt-img-shadow'); // Selector for channel page avatar
    if (channelIcon && channelIcon.src) {
      result.faviconUrl = channelIcon.src; // Use channel icon as favicon
      result.thumbnailUrl = channelIcon.src; // And also as thumbnail for consistency if no banner exists
      
      // Try to get channel banner as a potentially better thumbnail
      const channelBanner = document.querySelector('#contentContainer #header #banner img, tp-yt-profile-header-renderer #banner img');
      if(channelBanner && channelBanner.src){
        // Check if the banner src is a real image URL (not a placeholder)
        if (channelBanner.src.startsWith('http')) {
            result.thumbnailUrl = channelBanner.src;
        }
      }
    }
  }

  // If no specific thumbnail found yet, try to find the largest image on the page (simple heuristic)
  // This is disabled for now as it can be resource-intensive and unreliable.
  // A better approach might be a specific meta tag or a more targeted query.
  /*
  if (!result.thumbnailUrl) {
    let largestImage = null;
    let maxArea = 0;
    document.querySelectorAll('img').forEach(img => {
      if (img.src && img.naturalWidth && img.naturalHeight) {
        const area = img.naturalWidth * img.naturalHeight;
        // Filter out tiny images or icons, and ensure it's a reasonable size
        if (area > maxArea && img.naturalWidth > 100 && img.naturalHeight > 100) {
          maxArea = area;
          largestImage = img;
        }
      }
    });
    if (largestImage) {
      result.thumbnailUrl = largestImage.src;
    }
  }
  */

  // Ensure URLs are absolute
  if (result.faviconUrl && !result.faviconUrl.startsWith('http')) {
    result.faviconUrl = new URL(result.faviconUrl, window.location.origin).href;
  }
  if (result.thumbnailUrl && !result.thumbnailUrl.startsWith('http')) {
    result.thumbnailUrl = new URL(result.thumbnailUrl, window.location.origin).href;
  }
  
  // Send the result back to the extension
  // Check if chrome.runtime is available (it should be in a content script)
  if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ action: "extractedPageInfo", data: result });
  } else {
    // Fallback or error for environments where sendMessage is not available (e.g. testing outside extension)
    console.log("Content script extracted info (chrome.runtime.sendMessage not available):", result);
    return result; // For direct execution in browser console for testing
  }
})();
