// Content script for media control

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'stopMedia') {
    stopAllMedia();
    sendResponse({ success: true });
  }
  return true;
});

function stopAllMedia() {
  // Stop all video elements
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    video.pause();
    video.currentTime = 0;
  });

  // Stop all audio elements
  const audios = document.querySelectorAll('audio');
  audios.forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });

  // Try to stop YouTube specifically
  if (window.location.hostname.includes('youtube.com')) {
    const player = document.querySelector('.html5-video-player') as any;
    if (player && player.pauseVideo) {
      player.pauseVideo();
    }
  }

  // Try to stop Spotify web player
  if (window.location.hostname.includes('spotify.com')) {
    const playButton = document.querySelector('[data-testid="control-button-playpause"]') as HTMLButtonElement;
    if (playButton && playButton.getAttribute('aria-label')?.includes('Pause')) {
      playButton.click();
    }
  }
}
