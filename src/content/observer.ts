/**
 * Downplaygram DOM Observer & SPA Navigation Engine
 * Scoped MutationObserver with URL change detection and requestAnimationFrame batching.
 */

import { injectStoryButton } from './injectors/stories';
import { injectReelsButtons } from './injectors/reels';
import { setupStoryTrayHoverListeners } from './injectors/story-tray';
import { isExtensionContextValid } from '../lib/runtime';

export type NavigationCallback = (url: string) => void;
export type MutationCallback = (mutations: MutationRecord[]) => void;

let currentUrl = location.href;
const navigationListeners = new Set<NavigationCallback>();
const mutationListeners = new Set<MutationCallback>();

let observer: MutationObserver | null = null;
let isPendingFrame = false;
let pendingMutations: MutationRecord[] = [];
let storyInterval: ReturnType<typeof setInterval> | null = null;
let reelsObserver: MutationObserver | null = null;
let isReelsListenersAttached = false;

/**
 * Setup virtualized scroll observer and wheel/keyboard listener for Instagram Reels.
 */
export function setupReelsObserver(): void {
  if (typeof window === 'undefined' || !window.location || !window.location.pathname.includes('/reel')) {
    return;
  }

  // 1. Eksekusi injeksi awal
  injectReelsButtons();

  // 2. Pantau mutasi pada container virtual list Reels
  const targetRoot = document.querySelector('main') || document.body;
  if (!targetRoot) return;

  if (reelsObserver) {
    reelsObserver.disconnect();
    reelsObserver = null;
  }

  reelsObserver = new MutationObserver((mutations) => {
    if (!isExtensionContextValid()) {
      reelsObserver?.disconnect();
      reelsObserver = null;
      return;
    }

    let hasNewNodes = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        hasNewNodes = true;
        break;
      }
    }

    if (hasNewNodes) {
      injectReelsButtons();
    }
  });

  reelsObserver.observe(targetRoot, {
    childList: true,
    subtree: true,
  });

  // 3. Cadangan Listener Scroll / Wheel untuk menjamin injeksi saat scroll cepat
  if (!isReelsListenersAttached) {
    isReelsListenersAttached = true;

    window.addEventListener(
      'wheel',
      () => {
        if (window.location.pathname.includes('/reel')) {
          setTimeout(injectReelsButtons, 200);
        }
      },
      { passive: true }
    );

    window.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(e.key)) {
        setTimeout(injectReelsButtons, 250);
      }
    });
  }
}

/**
 * Ensures the story download button is reliably injected across slide changes in /stories/*
 */
export function setupStoryPersistentWatcher(): void {
  if (typeof window === 'undefined' || !window.location) return;

  if (window.location.pathname.startsWith('/stories/')) {
    injectStoryButton();
  
    // Bersihkan interval sebelumnya jika ada
    if ((window as any).__downplaygram_story_interval) {
      clearInterval((window as any).__downplaygram_story_interval);
    }
  
    // Polling protektif setiap 250ms untuk menginjeksi tombol pada setiap pergantian slide
    (window as any).__downplaygram_story_interval = setInterval(() => {
      // Jika ekstensi di-reload dari luar, bersihkan interval
      if (!isExtensionContextValid()) {
        clearInterval((window as any).__downplaygram_story_interval);
        (window as any).__downplaygram_story_interval = null;
        return;
      }

      if (!window.location.pathname.startsWith('/stories/')) {
        clearInterval((window as any).__downplaygram_story_interval);
        (window as any).__downplaygram_story_interval = null;
        document.getElementById('downplaygram-story-container')?.remove();
        document.getElementById('downplaygram-story-bottom-btn')?.remove();
        return;
      }
      injectStoryButton();
    }, 250);
  } else {
    if ((window as any).__downplaygram_story_interval) {
      clearInterval((window as any).__downplaygram_story_interval);
      (window as any).__downplaygram_story_interval = null;
    }
  }
}

function handleStoryPolling() {
  setupStoryPersistentWatcher();
}

/**
 * Setup continuous polling watcher for story tray avatars on feed/direct
 * (every 600ms to catch new avatars as the user scrolls horizontally).
 */
export function setupStoryTrayWatcher(): void {
  setupStoryTrayHoverListeners();

  if (typeof window === 'undefined') return;

  if ((window as any).__downplaygram_story_tray_interval) {
    clearInterval((window as any).__downplaygram_story_tray_interval);
  }

  (window as any).__downplaygram_story_tray_interval = setInterval(() => {
    if (!isExtensionContextValid()) {
      clearInterval((window as any).__downplaygram_story_tray_interval);
      (window as any).__downplaygram_story_tray_interval = null;
      return;
    }
    setupStoryTrayHoverListeners();
  }, 600);
}

/**
 * Dispatches navigation event to all registered listeners.
 */
function handleUrlChange() {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    console.log('[Downplaygram] SPA Navigation detected:', currentUrl);
    handleStoryPolling();
    setupReelsObserver();
    setupStoryTrayWatcher();
    for (const listener of navigationListeners) {
      try {
        listener(currentUrl);
      } catch (error: unknown) {
        if (error instanceof DOMException || error instanceof Error) {
          console.error(`[Downplaygram] Error in navigation listener: ${error.name} - ${error.message}`, error.stack);
        } else {
          console.error('[Downplaygram] Error in navigation listener:', error);
        }
      }
    }
  }
}

/**
 * Patches history.pushState and replaceState to catch client-side routing.
 */
function patchHistoryApi() {
  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    const res = originalPushState.apply(this, args);
    handleUrlChange();
    return res;
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    const res = originalReplaceState.apply(this, args);
    handleUrlChange();
    return res;
  };

  window.addEventListener('popstate', handleUrlChange);
  // Backup poll for SPA routing, with 300ms intervals on /stories/ to catch rapid slide changes
  const backupPoll = setInterval(() => {
    if (!isExtensionContextValid()) {
      clearInterval(backupPoll);
      return;
    }
    handleUrlChange();
    if (location.pathname.startsWith('/stories/')) {
      for (const listener of mutationListeners) {
        try {
          listener([]);
        } catch {}
      }
    }
  }, 300);
}

/**
 * Starts observing DOM changes with requestAnimationFrame throttling.
 */
export function startObserver() {
  patchHistoryApi();
  handleStoryPolling();
  setupReelsObserver();
  setupStoryTrayWatcher();

  observer = new MutationObserver((mutations) => {
    pendingMutations.push(...mutations);

    if (!isPendingFrame) {
      isPendingFrame = true;
      requestAnimationFrame(() => {
        isPendingFrame = false;
        const batch = pendingMutations;
        pendingMutations = [];

        for (const listener of mutationListeners) {
          try {
            listener(batch);
          } catch (error: unknown) {
            if (error instanceof DOMException || error instanceof Error) {
              console.error(`[Downplaygram] Error running injectors: ${error.name} - ${error.message}`, error.stack);
            } else {
              console.error('[Downplaygram] Error running injectors:', error);
            }
          }
        }
      });
    }
  });

  // Observe document.body to catch portals, dialogs, and story layers mounted outside main
  const target = document.body;
  if (target) {
    observer.observe(target, {
      childList: true,
      subtree: true,
    });
  }

  console.log('[Downplaygram] Scoped MutationObserver started.');
}

/**
 * Registers a callback for SPA page navigation.
 */
export function onNavigate(callback: NavigationCallback): () => void {
  navigationListeners.add(callback);
  return () => navigationListeners.delete(callback);
}

/**
 * Registers a callback for DOM mutations.
 */
export function onMutate(callback: MutationCallback): () => void {
  mutationListeners.add(callback);
  return () => mutationListeners.delete(callback);
}
