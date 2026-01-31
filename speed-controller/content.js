// Content script for Netflix Speed Controller
// Netflix uses a custom video player that requires special handling

class NetflixSpeedController {
  constructor() {
    this.currentSpeed = 1.0;
    this.lastSpeed = 1.5;
    this.settings = {
      speedStep: 0.25,
      maxSpeed: 4.0,
      minSpeed: 0.25,
      showNotifications: true,
      skipSeconds: 30
    };
    this.videoCheckInterval = null;
    this.initialized = false;
    
    this.init();
  }

  async init() {
    // Load settings from storage
    try {
      const stored = await chrome.storage.sync.get([
        'speedStep', 'maxSpeed', 'minSpeed', 'showNotifications', 'lastSpeed', 'skipSeconds'
      ]);
      this.settings = { ...this.settings, ...stored };
      if (stored.lastSpeed) {
        this.lastSpeed = stored.lastSpeed;
      }
    } catch (error) {
      console.log('Netflix Speed Controller: Using default settings');
    }

    // Listen for commands from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'updateSettings') {
        this.settings = { ...this.settings, ...request.settings };
        sendResponse({ success: true });
      } else {
        this.handleCommand(request.action);
        sendResponse({ success: true });
      }
      return true;
    });

    // Start monitoring for video elements
    this.startVideoMonitoring();
    
    // Also set up keyboard shortcuts as fallback
    this.setupKeyboardShortcuts();
    
    console.log('Netflix Speed Controller: Initialized');
  }

  startVideoMonitoring() {
    // Netflix dynamically loads video elements, so we need to keep checking
    this.observeVideos();
    
    // Also poll periodically as a fallback (Netflix can be tricky)
    this.videoCheckInterval = setInterval(() => {
      this.findAndSetupVideos();
    }, 2000);
  }

  observeVideos() {
    // Initial check for existing videos
    this.findAndSetupVideos();

    // Observer for dynamically added videos
    const observer = new MutationObserver((mutations) => {
      // Check if any video elements were added
      let shouldCheck = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeName === 'VIDEO' || 
                (node.nodeType === 1 && node.querySelector?.('video'))) {
              shouldCheck = true;
              break;
            }
          }
        }
        if (shouldCheck) break;
      }
      
      if (shouldCheck) {
        this.findAndSetupVideos();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  findAndSetupVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (!video.dataset.netflixSpeedControllerSetup) {
        this.setupVideoHandlers(video);
        video.dataset.netflixSpeedControllerSetup = 'true';
        
        // Apply current speed to new videos
        if (this.currentSpeed !== 1.0) {
          this.applySpeedToVideo(video, this.currentSpeed);
        }
      }
    });
  }

  setupVideoHandlers(video) {
    // Store original speed when video loads
    video.addEventListener('loadedmetadata', () => {
      // Re-apply speed when new content loads
      if (this.currentSpeed !== 1.0) {
        setTimeout(() => {
          this.applySpeedToVideo(video, this.currentSpeed);
        }, 100);
      }
    });

    // Netflix sometimes resets playback rate, so we need to handle this
    video.addEventListener('ratechange', (e) => {
      // If Netflix resets the rate, re-apply our speed
      if (video.playbackRate !== this.currentSpeed && this.currentSpeed !== 1.0) {
        // Avoid infinite loop by checking if we triggered the change
        if (!video.dataset.settingSpeed) {
          video.dataset.settingSpeed = 'true';
          setTimeout(() => {
            this.applySpeedToVideo(video, this.currentSpeed);
            delete video.dataset.settingSpeed;
          }, 50);
        }
      }
    });

    // Handle when video starts playing
    video.addEventListener('playing', () => {
      if (this.currentSpeed !== 1.0) {
        this.applySpeedToVideo(video, this.currentSpeed);
      }
    });
  }

  applySpeedToVideo(video, speed) {
    try {
      video.playbackRate = speed;
    } catch (error) {
      console.log('Netflix Speed Controller: Could not set playback rate', error);
    }
  }

  getActiveVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    
    if (videos.length === 0) {
      return null;
    }

    // Netflix typically has one main video
    // Find the one that's actually visible and playing or ready to play
    const playingVideo = videos.find(v => !v.paused && !v.ended && v.readyState > 2);
    if (playingVideo) return playingVideo;

    // Find any video that's visible
    const visibleVideo = videos.find(v => {
      const rect = v.getBoundingClientRect();
      return rect.width > 100 && rect.height > 100;
    });
    if (visibleVideo) return visibleVideo;

    // Return the largest video (most likely the main content)
    return videos.reduce((largest, current) => {
      const largestRect = largest?.getBoundingClientRect() || { width: 0, height: 0 };
      const currentRect = current.getBoundingClientRect();
      return (currentRect.width * currentRect.height > largestRect.width * largestRect.height) 
        ? current : largest;
    }, videos[0]);
  }

  handleCommand(command) {
    const video = this.getActiveVideo();
    if (!video) {
      console.log('Netflix Speed Controller: No video found');
      this.showNoVideoNotification();
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
      case 'reset_speed':
        this.setSpeed(video, 1.0);
        break;
      case 'skip_forward':
        this.skipVideo(video, this.settings.skipSeconds);
        break;
      case 'skip_backward':
        this.skipVideo(video, -this.settings.skipSeconds);
        break;
    }
  }

  increaseSpeed(video) {
    const newSpeed = Math.min(
      Math.round((video.playbackRate + this.settings.speedStep) * 100) / 100,
      this.settings.maxSpeed
    );
    this.setSpeed(video, newSpeed);
  }

  decreaseSpeed(video) {
    const newSpeed = Math.max(
      Math.round((video.playbackRate - this.settings.speedStep) * 100) / 100,
      this.settings.minSpeed
    );
    this.setSpeed(video, newSpeed);
  }

  toggleSpeed(video) {
    if (Math.abs(video.playbackRate - 1.0) < 0.01) {
      this.setSpeed(video, this.lastSpeed);
    } else {
      this.lastSpeed = video.playbackRate;
      // Save last speed to storage
      chrome.storage.sync.set({ lastSpeed: this.lastSpeed }).catch(() => {});
      this.setSpeed(video, 1.0);
    }
  }

  skipVideo(video, seconds) {
    // Netflix uses DRM-protected streams. Directly setting video.currentTime
    // can trigger DRM errors (like M7375). Instead, we try multiple approaches:
    
    // Approach 1: Try Netflix's internal player API (if available)
    const netflixSeekSuccess = this.tryNetflixSeek(seconds);
    
    if (!netflixSeekSuccess) {
      // Approach 2: Simulate keyboard events that Netflix handles natively
      // Netflix's native shortcuts: Right Arrow = +10s, Left Arrow = -10s
      this.simulateNetflixSkip(seconds);
    }
    
    if (this.settings.showNotifications) {
      this.showSkipNotification(seconds);
    }
  }

  tryNetflixSeek(seconds) {
    try {
      // Netflix stores its player in the videoPlayer object
      const videoPlayer = window.netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
      if (videoPlayer) {
        const sessionIds = videoPlayer.getAllPlayerSessionIds?.();
        if (sessionIds && sessionIds.length > 0) {
          const player = videoPlayer.getVideoPlayerBySessionId(sessionIds[0]);
          if (player) {
            const currentTime = player.getCurrentTime();
            const newTime = currentTime + (seconds * 1000); // Netflix uses milliseconds
            player.seek(newTime);
            return true;
          }
        }
      }
    } catch (error) {
      console.log('Netflix Speed Controller: Netflix API not available, using fallback');
    }
    return false;
  }

  simulateNetflixSkip(seconds) {
    // Netflix handles Arrow keys for seeking: Right = +10s, Left = -10s
    // We simulate multiple key presses to approximate the desired skip time
    const direction = seconds > 0 ? 'ArrowRight' : 'ArrowLeft';
    const absSeconds = Math.abs(seconds);
    const keyPresses = Math.ceil(absSeconds / 10); // Netflix skips 10s per arrow key
    
    // Get the video container or player element for dispatching events
    const playerContainer = document.querySelector('.watch-video--player-view') || 
                           document.querySelector('[data-uia="player"]') ||
                           document.querySelector('.nf-player-container') ||
                           document.body;
    
    // Dispatch key events to trigger Netflix's native seeking
    for (let i = 0; i < keyPresses; i++) {
      setTimeout(() => {
        const keydownEvent = new KeyboardEvent('keydown', {
          key: direction,
          code: direction,
          keyCode: direction === 'ArrowRight' ? 39 : 37,
          which: direction === 'ArrowRight' ? 39 : 37,
          bubbles: true,
          cancelable: true
        });
        playerContainer.dispatchEvent(keydownEvent);
      }, i * 50); // Small delay between key presses
    }
  }

  setSpeed(video, speed) {
    const roundedSpeed = Math.round(speed * 100) / 100;
    
    // Apply to all videos on the page (Netflix sometimes has multiple)
    const allVideos = document.querySelectorAll('video');
    allVideos.forEach(v => {
      this.applySpeedToVideo(v, roundedSpeed);
    });
    
    this.currentSpeed = roundedSpeed;

    if (this.settings.showNotifications) {
      this.showSpeedNotification(roundedSpeed);
    }

    // Send speed to background script for badge
    try {
      chrome.runtime.sendMessage({
        action: 'showNotification',
        speed: roundedSpeed === 1.0 ? '1x' : `${roundedSpeed}x`
      }).catch(() => {});
    } catch (error) {
      // Ignore if background script is not available
    }
  }

  showSpeedNotification(speed) {
    // Remove existing notification
    const existing = document.getElementById('netflix-speed-controller-notification');
    if (existing) {
      existing.remove();
    }

    // Create notification element with Netflix-like styling
    const notification = document.createElement('div');
    notification.id = 'netflix-speed-controller-notification';
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.85);
      color: #e50914;
      padding: 12px 24px;
      border-radius: 4px;
      font-family: 'Netflix Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 18px;
      font-weight: bold;
      z-index: 2147483647;
      transition: opacity 0.3s ease;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(229, 9, 20, 0.3);
    `;
    notification.innerHTML = `⚡ Speed: <span style="color: white;">${speed}x</span>`;

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

  showSkipNotification(seconds) {
    // Remove existing notification
    const existing = document.getElementById('netflix-speed-controller-notification');
    if (existing) {
      existing.remove();
    }

    const direction = seconds > 0 ? '⏩' : '⏪';
    const absSeconds = Math.abs(seconds);

    // Create notification element with Netflix-like styling
    const notification = document.createElement('div');
    notification.id = 'netflix-speed-controller-notification';
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.85);
      color: #e50914;
      padding: 12px 24px;
      border-radius: 4px;
      font-family: 'Netflix Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 18px;
      font-weight: bold;
      z-index: 2147483647;
      transition: opacity 0.3s ease;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(229, 9, 20, 0.3);
    `;
    notification.innerHTML = `${direction} <span style="color: white;">${absSeconds}s</span>`;

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

  showNoVideoNotification() {
    if (!this.settings.showNotifications) return;
    
    const existing = document.getElementById('netflix-speed-controller-notification');
    if (existing) {
      existing.remove();
    }

    const notification = document.createElement('div');
    notification.id = 'netflix-speed-controller-notification';
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.85);
      color: #ffa500;
      padding: 12px 24px;
      border-radius: 4px;
      font-family: 'Netflix Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 16px;
      font-weight: bold;
      z-index: 2147483647;
      transition: opacity 0.3s ease;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;
    notification.textContent = '⚠️ No video playing';

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }, 1500);
  }

  setupKeyboardShortcuts() {
    // Fallback keyboard shortcuts in case Chrome commands don't work
    document.addEventListener('keydown', (e) => {
      // Only handle if on Netflix video page
      if (!window.location.hostname.includes('netflix.com')) return;
      
      // Ctrl/Cmd + Shift + > (increase speed)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '>') {
        e.preventDefault();
        e.stopPropagation();
        this.handleCommand('increase_speed');
      }
      
      // Ctrl/Cmd + Shift + < (decrease speed)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '<') {
        e.preventDefault();
        e.stopPropagation();
        this.handleCommand('decrease_speed');
      }
      
      // Alt + T (toggle speed)
      if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        e.stopPropagation();
        this.handleCommand('toggle_speed');
      }
      
      // Alt + Right Arrow (skip forward)
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        this.handleCommand('skip_forward');
      }
      
      // Alt + Left Arrow (skip backward)
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        this.handleCommand('skip_backward');
      }
    }, true);
  }
}

// Initialize the controller
let controller = null;

function initController() {
  if (!controller) {
    controller = new NetflixSpeedController();
  }
}

// Initialize when the page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initController);
} else {
  initController();
}

// Also try to initialize when the window loads (for Netflix's lazy loading)
window.addEventListener('load', () => {
  setTimeout(initController, 500);
});
