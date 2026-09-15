# Chrome Web Store Listing: Downplaygram

**Last Updated:** September 12, 2026  
**Extension Name:** Downplaygram — Anonymous Media Downloader  
**Version:** 3.0.0  
**Category:** Productivity / Privacy  
**Manifest Version:** 3  

---

## Store Listing Metadata

### Short Description (Max 132 chars)
Download original-resolution Instagram stories, reels, posts, and avatars with an anonymous, zero-telemetry Ghost Viewing Engine.

### Detailed Description
Downplaygram is a privacy-first browser extension for Instagram Web that embeds native download overlays and provides a 100% anonymous Ghost Viewing Engine.

View Stories and Highlights completely undetected — your handle is never reported in the creator's viewer list because seen beacons are blocked before they leave your browser.

#### Key Features:
- **100% Anonymous Ghost Viewing:** Uses network-level interception (`declarativeNetRequest`) to block seen beacons (`/api/v1/stories/reel/seen/*`), allowing you to view stories without appearing in viewer lists.
- **Floating Ghost Hub:** Docked unobtrusively in the bottom-right corner next to Instagram Messages for instant Ghost Mode toggling and private story searching.
- **In-Memory Zero-Telemetry Lightbox:** Preview story trays in an isolated modal directly from browser memory with zero tracking beacons triggered.
- **Stories & Reels Downloader:** Save original progressive MP4 videos and high-resolution JPEG images with a single click from the native player.
- **Split Action Carousel Downloader:** Choose to download only the active carousel slide or batch-download the entire carousel with automated throttling to avoid rate limiting.
- **HD Profile Avatar Downloader:** Access original high-resolution profile avatars directly from profile headers.
- **Structured Local File Organization:** Automatically categorizes downloads into `Downloads/Downplaygram/{username}/{type}/` with OS-sanitized filenames.
- **Zero Telemetry & Absolute Privacy:** Operates 100% client-side. No user credentials, cookies, browsing history, or analytics are ever stored or transmitted to external servers.

---

## Permissions Justification

| Permission / Host Permission | Justification |
|---|---|
| `declarativeNetRequest` | Required to dynamically block Instagram's internal seen beacon endpoint (`*://*.instagram.com/api/v1/stories/reel/seen/*`) at the browser network layer to allow anonymous story viewing. |
| `storage` | Required to save the user's Ghost Mode preference (enabled/disabled) and download settings locally in `chrome.storage.local`. |
| `downloads` | Required to save media files (progressive MP4 videos and full-resolution images) directly to the user's local Downloads folder using structured folder paths. |
| `*://*.instagram.com/*` (Host Permission) | Required to run content scripts that render download overlays on Instagram Web pages and allow network rule matching on Instagram endpoints. |

---

## Privacy Policy & Data Handling

### Data Collection Disclosure
- **Personal Information:** None collected.
- **Authentication / Credentials:** None collected. Downplaygram utilizes the user's existing active session inside their own browser.
- **Browsing Activity:** Not tracked or recorded.
- **Third-Party Transmission:** Zero. Downplaygram does not maintain any backend servers, analytics services, or remote telemetry endpoints.

### Single Purpose Description
Downplaygram's single purpose is to provide direct media archiving and anonymous viewing controls for Instagram Web users.

---

## Version History

### 3.0.0 (September 2026)
- Complete Manifest V3 migration and architectural redesign using WXT and TypeScript.
- Implemented network-level Ghost Viewing Engine via `declarativeNetRequest` (Rule 1001).
- Added Floating Ghost Hub and in-memory zero-telemetry Lightbox modal.
- Added in-page contextual overlays for Stories, Feed carousels (with Split Action Button), Reels, and Profile avatars.
- Added automated file path sanitization and progressive MP4 stream selection (DASH fragment rejection).
