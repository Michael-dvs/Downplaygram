/**
 * Downplaygram Story Tray Injector
 * Detects 2-second long hover on Instagram feed story tray avatars and profile rings.
 * Shows a circular semi-transparent overlay with a 2-second progress countdown
 * and opens the Quick Anonymous Lightbox automatically.
 */

import { iconEyeLowVision, renderStoryProgressRing, injectGlobalAnimations } from '../../ui/icons';
import { openAnonymousLightbox } from './lightbox';

const PROCESSED_ATTR = 'data-downplaygram-hover-attached';

/**
 * Ekstrak username dari tombol item story tray
 */
export function extractUsernameFromStoryButton(el: HTMLElement): string | null {
  // 1. Coba dari aria-label tombol ("Story by username, ..." atau "Cerita oleh username, ...")
  const aria = el.getAttribute('aria-label') || '';
  const ariaMatch = aria.match(/(?:Story by|Cerita oleh)\s+([^,]+)/i);
  if (ariaMatch && ariaMatch[1]) {
    const raw = ariaMatch[1].trim().toLowerCase();
    if (raw !== 'your story' && raw !== 'cerita anda') {
      return raw;
    }
  }

  // 2. Coba dari alt avatar image ("username's profile picture" atau "Foto profil ...")
  const img = el.querySelector<HTMLImageElement>('img');
  const alt = img?.getAttribute('alt') || '';
  const altMatch = alt.match(/^(.+?)'s profile picture/i) || alt.match(/Foto profil (.+)/i);
  if (altMatch && altMatch[1]) {
    const raw = altMatch[1].trim().toLowerCase();
    if (raw !== 'your story' && raw !== 'cerita anda') {
      return raw;
    }
  }

  // 3. Coba dari link href jika ada anchor ("/stories/{username}/")
  const link = (el.matches('a[href*="/stories/"]') ? el : el.querySelector<HTMLAnchorElement>('a[href*="/stories/"]')) as HTMLAnchorElement | null;
  if (link) {
    const href = link.getAttribute('href') || '';
    const match = href.match(/\/stories\/([^\/?#]+)/i);
    if (match && match[1] && match[1].toLowerCase() !== 'highlights') {
      const raw = match[1].trim().toLowerCase();
      if (raw !== 'your story' && raw !== 'cerita anda') {
        return raw;
      }
    }
  }

  // 4. Coba dari label teks username di bawah avatar
  const labelEl = el.parentElement?.querySelector('div[dir="auto"], span');
  const labelText = labelEl?.textContent?.trim();
  if (labelText && !labelText.includes(' ')) {
    const raw = labelText.toLowerCase();
    if (raw !== 'your story' && raw !== 'cerita anda' && raw !== 'your_story') {
      return raw;
    }
  }

  // 5. Cek apakah di dalam header profil (avatar profil)
  if (typeof window !== 'undefined' && window.location && el.closest('header')) {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const firstPart = parts[0];
    if (firstPart) {
      const reserved = ['explore', 'reels', 'stories', 'direct', 'accounts', 'emails', 'developer'];
      if (!reserved.includes(firstPart.toLowerCase())) {
        return firstPart.toLowerCase();
      }
    }
  }

  return null;
}

/**
 * Pasang hover listener 2 detik ke seluruh item story tray
 */
export function setupStoryTrayHoverListeners(): void {
  // FIREWALL 1: HANYA aktif di halaman Beranda / Home Feed murni ('/')
  // Jika di halaman profil (misal: /brewberriess/), explore, direct, dll -> TOLAK
  if (typeof window === 'undefined' || !window.location || window.location.pathname !== '/') {
    // Bersihkan overlay yang mungkin tertinggal saat transisi halaman
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('.downplaygram-hover-ghost-overlay').forEach((el) => el.remove());
    }
    return;
  }

  injectGlobalAnimations();

  // Cari elemen baki story (biasanya berupa role="button" atau role="menuitem" di dalam header feed)
  const candidateButtons = Array.from(
    document.querySelectorAll<HTMLElement>(
      'div[role="button"][aria-label*="Story by"], div[role="button"][aria-label*="Cerita oleh"], div[role="menuitem"]'
    )
  );

  candidateButtons.forEach((btn) => {
    // FIREWALL 2: TOLAK jika berada di dalam postingan feed (<article>)
    if (btn.closest('article')) return;

    // FIREWALL 3: TOLAK jika elemen merupakan atau berada di dalam Sorotan (Highlights)
    if (
      btn.closest('a[href*="/stories/highlights/"]') ||
      btn.querySelector('a[href*="/stories/highlights/"]') ||
      btn.getAttribute('aria-label')?.toLowerCase().includes('highlight') ||
      (btn.closest('[data-testid="user-avatar"]') === null && Boolean(btn.closest('header')))
    ) {
      return;
    }

    // FIREWALL 4: Pastikan elemen berada di baki story atas feed (Tray Carousel)
    // Di Instagram web, tray baki atas selalu berada di bagian atas container <main>
    const isInTopFeedTray = Boolean(
      !btn.parentElement ||
      btn.closest('main > div') || 
      btn.closest('div[role="menu"]') ||
      btn.closest('section > main') ||
      btn.closest('main')
    );

    if (!isInTopFeedTray) return;

    // Batasi ukuran avatar (hanya avatar baki berukuran ~55px - 90px)
    if (typeof btn.getBoundingClientRect === 'function') {
      const rect = btn.getBoundingClientRect();
      if (rect && (rect.width > 105 || rect.height > 105 || (rect.width > 0 && rect.width < 40))) {
        return;
      }
    }

    if (btn.getAttribute(PROCESSED_ATTR)) return;

    // Abaikan story milik user sendiri ("Your story")
    const username = extractUsernameFromStoryButton(btn);
    if (!username || username === 'your story' || username === 'cerita anda') return;

    btn.setAttribute(PROCESSED_ATTR, 'true');

    // Temukan kontainer lingkaran avatar murni
    const avatarCanvas = (btn.querySelector('canvas, img')?.parentElement || btn) as HTMLElement;
    avatarCanvas.style.position = 'relative';

    let hoverTimeout: any = null;
    let overlayEl: HTMLElement | null = null;

    const cleanupHoverState = () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
      }
    };

    // 1. KLIK BIASA (< 2 Detik): Batalkan Ghost View & biarkan Instagram membuka story secara reguler
    btn.addEventListener('click', () => {
      cleanupHoverState();
    });

    // 2. MOUSE ENTER: Jalankan visual charging ring dan hitung mundur 2 detik
    btn.addEventListener('mouseenter', () => {
      cleanupHoverState();

      // Buat overlay dengan ukuran presisi 1:1 mengikuti avatar
      const w = avatarCanvas.clientWidth || 64;
      const h = avatarCanvas.clientHeight || 64;
      const size = Math.min(w, h);

      overlayEl = document.createElement('div');
      overlayEl.className = 'downplaygram-hover-ghost-overlay dpg-ghost-overlay-animate';
      overlayEl.style.cssText = `
        position: absolute !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        width: ${size}px !important;
        height: ${size}px !important;
        border-radius: 50% !important;
        background: rgba(0, 0, 0, 0.7) !important;
        backdrop-filter: blur(2.5px) !important;
        -webkit-backdrop-filter: blur(2.5px) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 1000 !important;
        pointer-events: none !important; /* PENTING: Klik tembus langsung ke tombol story reguler Instagram */
        box-sizing: border-box !important;
      `;

      // Gabungkan Progress Ring + Icon Mata
      overlayEl.innerHTML = `
        ${renderStoryProgressRing()}
        <div style="z-index: 2; pointer-events: none; display: flex; align-items: center; justify-content: center; transform: scale(0.9);">
          ${iconEyeLowVision(22, '#ffffff')}
        </div>
      `;

      avatarCanvas.appendChild(overlayEl);

      // Trigger Ghost View HANYA jika kursor bertahan penuh selama 2000 ms tanpa klik/geser
      hoverTimeout = setTimeout(async () => {
        cleanupHoverState();
        await openAnonymousLightbox(username);
      }, 2000);
    });

    // 3. MOUSE LEAVE: Pengguna memindahkan kursor sebelum 2 detik
    btn.addEventListener('mouseleave', () => {
      cleanupHoverState();
    });
  });
}
