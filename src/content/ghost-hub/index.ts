/**
 * Downplaygram Ghost Hub Mount Point
 * Mounts the custom web component inside Instagram's page.
 */

import { GhostHubElement } from './GhostHub';

const EXISTING_HUB_ID = 'downplaygram-ghost-hub-root';
const HUB_TAG = 'downplaygram-ghost-hub';

export function mountGhostHub(): void {
  // Cegah injeksi ganda jika root container atau custom element sudah ada di DOM
  if (document.getElementById(EXISTING_HUB_ID) || document.querySelector(HUB_TAG)) {
    return;
  }

  // Pastikan window dan customElements sudah siap
  if (typeof window === 'undefined' || !window.customElements || !document.body) {
    return;
  }

  // Define custom element if not already registered
  if (!window.customElements.get(HUB_TAG)) {
    try {
      window.customElements.define(HUB_TAG, GhostHubElement);
    } catch {
      // Ignore if already defined in race conditions
    }
  }

  const container = document.createElement('div');
  container.id = EXISTING_HUB_ID;
  container.style.cssText = 'position: fixed; bottom: 20px; right: 24px; z-index: 2147483647;';

  const hub = document.createElement(HUB_TAG);
  container.appendChild(hub);
  document.body.appendChild(container);

  console.log('[Downplaygram] Floating Ghost Hub mounted.');
}

export const injectGhostHub = mountGhostHub;
