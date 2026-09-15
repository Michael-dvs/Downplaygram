/**
 * Downplaygram Profile Injector
 * Injects an HD Avatar download overlay on Instagram profile avatars.
 */

import { extractImageUrl } from '../../lib/media-sniffer';
import { formatAvatarFilename, buildDownloadPath, sanitizeUsername } from '../../lib/sanitizer';
import { downloadFile } from '../../lib/downloader';

const INJECT_MARKER = 'data-downplaygram-profile-injected';

/**
 * Extracts username from profile page URL.
 */
function getProfileUsername(): string | null {
  const parts = location.pathname.split('/').filter(Boolean);
  const candidate = parts[0];
  if (candidate) {
    const reserved = ['explore', 'reels', 'stories', 'direct', 'accounts', 'emails'];
    if (!reserved.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Handles avatar download.
 */
async function handleAvatarDownload(avatarImg: HTMLImageElement, button: HTMLElement) {
  try {
    button.style.opacity = '0.5';

    const username = getProfileUsername() || 'instagram_user';
    const avatarUrl = extractImageUrl(avatarImg);

    if (!avatarUrl) {
      console.warn('[Downplaygram] Could not extract avatar image URL');
      return;
    }

    const filename = formatAvatarFilename(username);
    const filepath = buildDownloadPath({
      username,
      type: 'profile',
      filename,
    });

    console.log('[Downplaygram] Downloading profile avatar:', { username, filepath, avatarUrl });
    const res = await downloadFile(avatarUrl, filepath);

    if (res.success) {
      button.style.color = '#22c55e';
      setTimeout(() => {
        button.style.color = 'currentColor';
      }, 1500);
    }
  } catch (err) {
    console.error('[Downplaygram] Error downloading avatar:', err);
  } finally {
    button.style.opacity = '1';
  }
}

/**
 * Creates an avatar download overlay wrapped in Shadow DOM.
 */
function createAvatarOverlay(avatarImg: HTMLImageElement): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute(INJECT_MARKER, 'true');
  container.className = 'downplaygram-avatar-overlay';
  container.style.cssText = `
    position: absolute;
    inset: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    z-index: 50;
    opacity: 0;
    transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    cursor: pointer;
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  `;

  const shadow = container.shadowRoot || container.attachShadow({ mode: 'open' });
  const button = document.createElement('button');
  button.type = 'button';
  button.title = 'Unduh Foto Profil HD (Downplaygram)';
  button.setAttribute('aria-label', 'Unduh Foto Profil HD');
  button.style.cssText = `
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #ffffff;
    transition: transform 0.2s ease, color 0.2s ease;
    outline: none;
  `;

  button.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  `;

  container.addEventListener('mouseenter', () => {
    container.style.opacity = '1';
    button.style.transform = 'scale(1.1)';
  });
  container.addEventListener('mouseleave', () => {
    container.style.opacity = '0';
    button.style.transform = 'scale(1)';
  });

  container.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    handleAvatarDownload(avatarImg, button);
  });

  shadow.appendChild(button);
  return container;
}

/**
 * Scans profile header for avatar and mounts the circular hover overlay.
 */
export function injectProfileAvatarButton(): void {
  const username = getProfileUsername();
  if (!username) return;

  // Search for profile avatar inside header
  const header = document.querySelector('header');
  if (!header) return;

  const avatarImg = (
    header.querySelector('img[alt*="profile picture"]') ||
    header.querySelector('img[alt*="profil"]') ||
    header.querySelector('img[crossorigin="anonymous"]') ||
    header.querySelector('img')
  ) as HTMLImageElement | null;

  if (!avatarImg) return;

  // Locate the avatar circle wrapper
  const avatarWrapper =
    avatarImg.closest<HTMLElement>('div[role="button"]') ||
    avatarImg.closest<HTMLElement>('span[role="link"]') ||
    avatarImg.parentElement;

  if (avatarWrapper && !avatarWrapper.querySelector(`[${INJECT_MARKER}]`)) {
    // Ensure wrapper coordinates and bounds are relative & circular
    avatarWrapper.style.position = 'relative';
    avatarWrapper.style.overflow = 'hidden';
    avatarWrapper.style.borderRadius = '50%';

    const overlay = createAvatarOverlay(avatarImg);

    // Show overlay when user hovers over the avatar wrapper
    avatarWrapper.addEventListener('mouseenter', () => {
      overlay.style.opacity = '1';
    });
    avatarWrapper.addEventListener('mouseleave', () => {
      overlay.style.opacity = '0';
    });

    avatarWrapper.appendChild(overlay);
  }
}

