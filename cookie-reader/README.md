# Cookie Manager Extension

A powerful yet simple Chrome extension to manage cookies, view global statistics, and export data.

## Features

*   **Current Site Management**:
    *   View all cookies visible to the current active tab (including cookies from parent domains).
    *   Delete individual cookies.
    *   **Delete All Site Data**: One-click button to remove cookies, `localStorage`, `sessionStorage`, and `IndexedDB` for the current domain.
    *   View detailed cookie properties (Value, Domain, Path, Expiry, Secure, HttpOnly, SameSite).
*   **Global Statistics**:
    *   Analyze cookie usage across all domains.
    *   View total count and size (in bytes) per domain.
    *   Sort by size to identify heavy cookie users.
*   **Data Export**:
    *   Export current site cookies to JSON.
    *   Export global cookie statistics to JSON.
*   **Privacy & Security**:
    *   Supports partitioned cookies (CHIPS).
    *   Handles secure and non-secure cookie deletion protocols.

## Installation

1.  Clone or download this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** in the top right corner.
4.  Click **Load unpacked**.
5.  Select the extension directory.

## Usage

### Managing Current Site
1.  Navigate to any website.
2.  Click the **Cookie Manager** icon in the toolbar.
3.  The **Current Site** tab shows all cookies visible to the current page.
4.  Click **Delete** next to a specific cookie to remove it.
5.  Click **Delete All** to wipe all cookies and local storage for the site (useful for resetting article limits or fresh sessions).

### Viewing Statistics
1.  Click the **Statistics** tab in the popup.
2.  See a ranked list of domains by cookie size.
3.  Click **Load More** to see additional domains.

### Exporting Data
1.  Click the **Export Data** button in the header.
2.  If you are on the **Current Site** tab, it exports the current domain's cookies.
3.  If you are on the **Statistics** tab, it exports the global statistics report.

## Technical Details

### Permissions
*   `cookies`: To read and modify cookies.
*   `activeTab`: To access the current tab's URL.
*   `scripting`: To inject scripts for clearing `localStorage` and `sessionStorage`.
*   `host_permissions`: `<all_urls>` to manage cookies for any site you visit.

### Troubleshooting
If "Delete All" doesn't seem to reset a site's state:
1.  Refresh the page.
2.  Ensure the extension has finished the deletion process.
3.  Some sites may track users via server-side fingerprinting (IP address, etc.), which client-side clearing cannot resolve.

## License
MIT
