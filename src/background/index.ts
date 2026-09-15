/**
 * Downplaygram Background Service Worker
 * Entry point for lifecycle management, network rule interception, and download execution.
 */

import { defineBackground } from 'wxt/utils/define-background';
import {
  enableGhostMode,
  disableGhostMode,
  getGhostStatus,
  initGhostEngine,
} from './ghost-engine';

export default defineBackground(() => {
  console.log('[Downplaygram] Service Worker initializing...');

  // Initialize Ghost Engine rules from storage on startup
  initGhostEngine().catch((err) => {
    console.error('[Downplaygram] Error initializing Ghost Engine:', err);
  });

  // Re-sync on extension install or update
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[Downplaygram] Extension installed/updated:', details.reason);
    await initGhostEngine();
  });

  // Simpan URL stream media terakhir per tab
  const latestMediaByTab: Record<number, { url: string; ext: 'mp4' | 'jpg'; timestamp: number }> = {};

  chrome.webRequest?.onBeforeRequest.addListener(
    (details) => {
      const url = details.url;
      if (
        (url.includes('.fbcdn.net') || url.includes('.cdninstagram.com')) &&
        (url.includes('.mp4') || url.includes('/v/t50.') || url.includes('&bytestart=')) &&
        !url.includes('dashinit')
      ) {
        // Bersihkan range parameters agar menghasilkan full stream MP4
        const cleanUrl = url.replace(/&bytestart=\d+&byteend=\d+/, '');
        if (details.tabId >= 0) {
          latestMediaByTab[details.tabId] = { url: cleanUrl, ext: 'mp4', timestamp: Date.now() };
        }
      }
    },
    { urls: ['*://*.fbcdn.net/*', '*://*.cdninstagram.com/*'] }
  );

  // Handle messages from content scripts and Ghost Hub UI
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        switch (message.action) {
          case 'GET_BACKGROUND_SNIFFED_MEDIA': {
            const tabId = sender.tab?.id;
            if (tabId && latestMediaByTab[tabId]) {
              sendResponse(latestMediaByTab[tabId]);
            } else {
              sendResponse(null);
            }
            break;
          }
          case 'ENABLE_GHOST_MODE': {
            const success = await enableGhostMode();
            if (message.reloadTab && sender.tab?.id) {
              await chrome.tabs.reload(sender.tab.id);
            }
            sendResponse({ success, enabled: true });
            break;
          }

          case 'DISABLE_GHOST_MODE': {
            const success = await disableGhostMode();
            if (message.reloadTab && sender.tab?.id) {
              await chrome.tabs.reload(sender.tab.id);
            }
            sendResponse({ success, enabled: false });
            break;
          }

          case 'GET_GHOST_STATUS': {
            const enabled = await getGhostStatus();
            sendResponse({ success: true, enabled });
            break;
          }

          case 'DOWNLOAD_MEDIA': {
            const { url, filepath, filename } = message.payload || {};
            const targetPath = filepath || filename;
            if (!url || !targetPath) {
              sendResponse({ success: false, error: 'Missing url or filepath' });
              return;
            }

            const downloadId = await chrome.downloads.download({
              url,
              filename: targetPath,
              conflictAction: 'uniquify',
              saveAs: false,
            });

            console.log('[Downplaygram] Download initiated:', downloadId, targetPath);
            sendResponse({ success: true, downloadId });
            break;
          }

          case 'DOWNLOAD_BATCH': {
            const items = message.items || [];
            for (const item of items) {
              if (item?.url && item?.filename) {
                await chrome.downloads.download({
                  url: item.url,
                  filename: item.filename,
                  conflictAction: 'uniquify',
                  saveAs: false,
                });
                await new Promise((r) => setTimeout(r, 250));
              }
            }
            sendResponse({ success: true, count: items.length });
            break;
          }

          case 'FETCH_HIGHLIGHT_MEDIA': {
            const { highlightId } = message;
            if (!highlightId) {
              sendResponse({ success: false, error: 'Missing highlightId' });
              return;
            }

            const formattedReelId = String(highlightId).startsWith('highlight:')
              ? String(highlightId)
              : `highlight:${highlightId}`;

            const apiUrl = `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(formattedReelId)}`;

            try {
              const res = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                  'X-IG-App-ID': '936619743392459',
                  'X-Requested-With': 'XMLHttpRequest',
                  'X-ASBD-ID': '129477',
                  Accept: '*/*',
                },
                credentials: 'include',
              });

              if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
              }

              const data = await res.json();
              sendResponse({ success: true, data });
            } catch (err: any) {
              console.error('[Downplaygram] Error in FETCH_HIGHLIGHT_MEDIA:', err);
              sendResponse({ success: false, error: err?.message || 'Failed to fetch highlight media' });
            }
            break;
          }

          case 'RELOAD_TAB': {
            if (sender.tab?.id) {
              await chrome.tabs.reload(sender.tab.id);
            }
            sendResponse({ success: true });
            break;
          }

          default:
            sendResponse({ success: false, error: `Unknown action: ${message.action}` });
            break;
        }
      } catch (err: any) {
        console.error('[Downplaygram] Error handling message:', message.action, err);
        sendResponse({ success: false, error: err?.message || 'Internal error' });
      }
    })();

    return true; // Keep message channel open for async response
  });
});
