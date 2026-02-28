document.addEventListener("click", function(event) {
  if (event.altKey) {
    const link = event.target.closest("a");

    if (link && link.href) {
      event.preventDefault();
      event.stopPropagation();

      // Gather screen information
      // We use 'availWidth' to respect taskbars/docks
      const screenData = {
        width: window.screen.availWidth,
        height: window.screen.availHeight,
        left: window.screen.availLeft || 0, // Handles multi-monitor setups
        top: window.screen.availTop || 0
      };

      chrome.runtime.sendMessage({
        action: "openSplit",
        url: link.href,
        screen: screenData
      });
    }
  }
}, true);