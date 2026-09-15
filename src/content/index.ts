/**
 * Downplaygram Content Script Entry Point
 * Orchestrates DOM observation, contextual button injectors, and the Floating Ghost Hub.
 */

import { defineContentScript } from 'wxt/utils/define-content-script';
import { startObserver, onNavigate, onMutate } from './observer';
import { injectStoryButton } from './injectors/stories';
import { injectFeedButtons } from './injectors/feed';
import { injectReelsButtons } from './injectors/reels';
import { injectProfileAvatarButton } from './injectors/profile';
import { setupStoryTrayHoverListeners } from './injectors/story-tray';
import { mountGhostHub } from './ghost-hub';
import { openGhostLightbox } from './ghost-hub/lightbox';
import '../lib/media-cache';

function isExcludedRoute(): boolean {
  const path = location.pathname;
  return (
    path.startsWith('/accounts/') ||
    path.startsWith('/direct/') ||
    path.startsWith('/onetap/') ||
    path.startsWith('/emails/') ||
    path.startsWith('/challenge/')
  );
}

function checkUrlHashForGhostView() {
  const hash = location.hash;
  if (hash && hash.startsWith('#downplaygram-view=')) {
    const user = hash.replace('#downplaygram-view=', '').trim();
    if (user) {
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch {}
      setTimeout(() => {
        openGhostLightbox(user);
      }, 300);
    }
  }
}

export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  runAt: 'document_idle',
  main() {
    console.log('[Downplaygram] Content Script loaded on Instagram Web.');

    // Listen for anonymous view messages from popup
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        const action = message?.action;
        // Accept both new action name and legacy fallback
        if (action === 'OPEN_ANONYMOUS_LIGHTBOX' || action === 'ANONYMOUS_VIEW_USER') {
          const username = message?.payload?.username || message?.username;
          if (username) {
            openGhostLightbox(username);
            sendResponse?.({ success: true });
          }
        }
      });
    }

    // Check if loaded with #downplaygram-view hash
    checkUrlHashForGhostView();

    function runAllInjectors() {
      // Do not run injectors on authentication/transit routes
      if (isExcludedRoute()) {
        return;
      }

      const injectors: Array<{ name: string; fn: () => void }> = [
        { name: 'StoryButton', fn: injectStoryButton },
        { name: 'FeedButtons', fn: injectFeedButtons },
        { name: 'ReelsButtons', fn: injectReelsButtons },
        { name: 'ProfileAvatarButton', fn: injectProfileAvatarButton },
        { name: 'StoryTrayHover', fn: setupStoryTrayHoverListeners },
        { name: 'GhostHub', fn: mountGhostHub },
      ];

      for (const { name, fn } of injectors) {
        try {
          fn();
        } catch (error: unknown) {
          if (error instanceof DOMException || error instanceof Error) {
            console.error(`[Downplaygram] Error running injector ${name}: ${error.name} - ${error.message}`, error.stack);
          } else {
            console.error(`[Downplaygram] Error running injector ${name}:`, error);
          }
        }
      }
    }

    // Initialize observer engine
    startObserver();

    // Initial injection pass
    runAllInjectors();

    // Re-run on client-side routing
    onNavigate((url) => {
      checkUrlHashForGhostView();
      runAllInjectors();
    });

    // Re-run on relevant DOM hydrations
    onMutate(() => {
      runAllInjectors();
    });
  },
});
