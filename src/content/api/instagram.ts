/**
 * Downplaygram Instagram Content API Helper
 * Extracts highlight IDs and fetches highlight items via Background Service Worker to bypass CORS & CSP.
 */

/**
 * Ekstraksi Highlight ID dari URL saat ini
 * Format URL: /stories/highlights/180234567890/
 */
export function extractHighlightIdFromUrl(): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  const match = window.location.pathname.match(/\/stories\/highlights\/([A-Za-z0-9_-]+)/i);
  return match?.[1] ?? null;
}

/**
 * Fetch media items di dalam sebuah Highlight
 */
export async function fetchHighlightItems(highlightId: string): Promise<any[]> {
  // 1. Delegasikan request ke Background Service Worker untuk bypass CORS
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return reject(new Error('chrome.runtime.sendMessage is not available'));
    }

    chrome.runtime.sendMessage(
      { action: 'FETCH_HIGHLIGHT_MEDIA', highlightId },
      (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!response || !response.success) {
          return reject(new Error(response?.error || 'Failed to fetch highlight data'));
        }

        try {
          const reels = response.data?.reels || response.data?.reels_media;
          if (!reels) {
            return reject(new Error('Highlight data empty in response'));
          }

          const reelKey = highlightId.startsWith('highlight:') ? highlightId : `highlight:${highlightId}`;
          const highlightReel =
            (typeof reels === 'object' && !Array.isArray(reels)
              ? reels[reelKey] || reels[highlightId]
              : null) ||
            (Array.isArray(reels)
              ? reels.find((r: any) => r.id === reelKey || r.id === highlightId) || reels[0]
              : null);

          if (!highlightReel || !highlightReel.items) {
            return reject(new Error('Highlight items not found in response'));
          }

          resolve(highlightReel.items);
        } catch (err: any) {
          reject(err);
        }
      }
    );
  });
}
