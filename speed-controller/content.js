// Content script for Video Speed Controller
class VideoSpeedController {
  constructor() {
    this.currentSpeed = 1.0;
    this.lastSpeed = 1.0;
    this.settings = {
      speedStep: 0.25,
      maxSpeed: 4.0,
      minSpeed: 0.25,
      showNotifications: true
    };
    
    this.init();
  }

  async init() {
    // Load settings from storage
    try {
      const stored = await chrome.storage.sync.get([
        'speedStep', 'maxSpeed', 'minSpeed', 'showNotifications'
      ]);
      this.settings = { ...this.settings, ...stored };
    } catch (error) {
      console.log('Using default settings');
    }

    // Listen for keyboard commands and settings updates
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'updateSettings') {
        this.settings = { ...this.settings, ...request.settings };
      } else {
        this.handleCommand(request.action);
      }
    });

    // Monitor for video elements
    this.observeVideos();
  }

  observeVideos() {
    // Initial check for existing videos
    this.findAndSetupVideos();

    // Observer for dynamically added videos
    const observer = new MutationObserver(() => {
      this.findAndSetupVideos();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  findAndSetupVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (!video.dataset.speedControllerSetup) {
        this.setupVideoHandlers(video);
        video.dataset.speedControllerSetup = 'true';
      }
    });
  }

  setupVideoHandlers(video) {
    // Store original speed when video loads
    video.addEventListener('loadedmetadata', () => {
      this.currentSpeed = video.playbackRate || 1.0;
    });

    // Track speed changes made by the website
    video.addEventListener('ratechange', () => {
      this.currentSpeed = video.playbackRate;
    });
  }

  getActiveVideo() {
    // Priority order: focused video, playing video, any video
    const videos = Array.from(document.querySelectorAll('video'));
    
    // Check for focused video
    const focusedVideo = videos.find(v => v === document.activeElement);
    if (focusedVideo) return focusedVideo;

    // Check for playing video
    const playingVideo = videos.find(v => !v.paused && !v.ended);
    if (playingVideo) return playingVideo;

    // Return first visible video
    const visibleVideo = videos.find(v => {
      const rect = v.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    return visibleVideo || videos[0];
  }

  handleCommand(command) {
    const video = this.getActiveVideo();
    if (!video) {
      console.log('No video found');
      return;
    }

    switch (command) {
      case 'increase_speed':
        this.increaseSpeed(video);
        break;
      case 'decrease_speed':
        this.decreaseSpeed(video);
        break;
      case 'toggle_speed':
        this.toggleSpeed(video);
        break;
    }
  }

  increaseSpeed(video) {
    const newSpeed = Math.min(
      video.playbackRate + this.settings.speedStep,
      this.settings.maxSpeed
    );
    this.setSpeed(video, newSpeed);
  }

  decreaseSpeed(video) {
    const newSpeed = Math.max(
      video.playbackRate - this.settings.speedStep,
      this.settings.minSpeed
    );
    this.setSpeed(video, newSpeed);
  }

  toggleSpeed(video) {
    if (video.playbackRate === 1.0) {
      this.setSpeed(video, this.lastSpeed);
    } else {
      this.lastSpeed = video.playbackRate;
      this.setSpeed(video, 1.0);
    }
  }

  setSpeed(video, speed) {
    const roundedSpeed = Math.round(speed * 100) / 100;
    video.playbackRate = roundedSpeed;
    this.currentSpeed = roundedSpeed;

    if (this.settings.showNotifications) {
      this.showSpeedNotification(roundedSpeed);
    }

    // Send speed to background script for badge
    try {
      chrome.runtime.sendMessage({
        action: 'showNotification',
        speed: roundedSpeed === 1.0 ? '1x' : `${roundedSpeed}x`
      });
    } catch (error) {
      // Ignore if background script is not available
    }
  }

  showSpeedNotification(speed) {
    // Remove existing notification
    const existing = document.getElementById('speed-controller-notification');
    if (existing) {
      existing.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'speed-controller-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 15px;
      border-radius: 5px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      font-weight: bold;
      z-index: 10000;
      transition: opacity 0.3s ease;
      pointer-events: none;
    `;
    notification.textContent = `Speed: ${speed}x`;

    document.body.appendChild(notification);

    // Fade out and remove after 1.5 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }, 1500);
  }
}

// Initialize the controller when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new VideoSpeedController();
  });
} else {
  new VideoSpeedController();
}
