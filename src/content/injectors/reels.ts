/**
 * Downplaygram Reels Injector
 * Injects download buttons into Instagram Reels action bars, anchored directly above the Like button.
 */

import { extractCurrentReelMedia } from '../../lib/media-sniffer';
import { safeSendMessage } from '../../lib/runtime';
import { iconSpinner, iconSuccess, iconError, iconDownload } from '../../ui/icons';

const REEL_BTN_CLASS = 'downplaygram-reel-dl-btn';

export function injectReelsButtons(): void {
  // 1. Pastikan browser berada di rute Reels
  if (typeof window === 'undefined' || !window.location || !window.location.pathname.includes('/reel')) {
    return;
  }

  // 2. Temukan semua ikon Like (Hati) yang ada di viewport aktif maupun yang baru di-render
  const allSvgs = Array.from(document.querySelectorAll<SVGElement>('svg'));

  const likeSvgs = allSvgs.filter((svg) => {
    const aria = (
      svg.getAttribute('aria-label') ||
      svg.closest('button, div[role="button"]')?.getAttribute('aria-label') ||
      ''
    ).toLowerCase();
    return (
      aria === 'like' ||
      aria === 'suka' ||
      aria === 'unlike' ||
      aria === 'batal suka' ||
      aria.includes('like') ||
      aria.includes('suka')
    );
  });

  likeSvgs.forEach((likeSvg) => {
    // Cari wrapper tombol Like (div[role="button"] atau button)
    const likeBtnWrapper = likeSvg.closest<HTMLElement>('div[role="button"], button');
    if (!likeBtnWrapper) return;

    // Cari item container di dalam flex column aksi vertikal
    // Struktur reels: flex column -> item wrapper (berisi tombol + teks angka like)
    const actionItemContainer = likeBtnWrapper.parentElement;
    if (!actionItemContainer || !actionItemContainer.parentElement) return;

    const columnContainer = actionItemContainer.parentElement;

    // Cegah injeksi ganda pada kolom aksi yang sama
    if (columnContainer.querySelector(`.${REEL_BTN_CLASS}`)) {
      return;
    }

    // 3. Buat wrapper tombol unduh Downplaygram
    const btnWrapper = document.createElement('div');
    btnWrapper.className = `${REEL_BTN_CLASS} downplaygram-reel-wrapper`;
    btnWrapper.style.cssText = `
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      margin-bottom: 16px !important;
      z-index: 50 !important;
    `;

    const dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.setAttribute('aria-label', 'Unduh Reel');
    dlBtn.title = 'Unduh Reel Ini (Downplaygram)';
    dlBtn.style.cssText = `
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      background: transparent !important;
      border: none !important;
      cursor: pointer !important;
      padding: 8px !important;
      color: #ffffff !important;
      transition: transform 0.15s ease, opacity 0.15s ease !important;
    `;

    dlBtn.innerHTML = iconDownload(24, '#ffffff');

    // Efek Hover
    dlBtn.onmouseenter = () => {
      dlBtn.style.transform = 'scale(1.15)';
      dlBtn.style.opacity = '0.85';
    };
    dlBtn.onmouseleave = () => {
      dlBtn.style.transform = 'scale(1)';
      dlBtn.style.opacity = '1';
    };

    // Handler Klik Unduh
    dlBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const origHtml = dlBtn.innerHTML;
      dlBtn.innerHTML = iconSpinner(18, '#ffffff');
      dlBtn.disabled = true;

      try {
        const media = await extractCurrentReelMedia(dlBtn);
        if (!media || !media.url) {
          console.warn('[Downplaygram] Reels media belum siap di cache.');
          dlBtn.innerHTML = iconError(18, '#ef4444');
          setTimeout(() => {
            dlBtn.innerHTML = origHtml;
            dlBtn.disabled = false;
          }, 1500);
          return;
        }

        const downloadPath = `Downplaygram/${media.username}/reels/reel_${Date.now()}.mp4`;

        await safeSendMessage({
          action: 'DOWNLOAD_MEDIA',
          payload: {
            url: media.url,
            filename: downloadPath,
            filepath: downloadPath,
          },
        });

        dlBtn.innerHTML = iconSuccess(18, '#22c55e');
        setTimeout(() => {
          dlBtn.innerHTML = origHtml;
          dlBtn.disabled = false;
        }, 1500);
      } catch (err) {
        console.error('[Downplaygram] Gagal mengunduh reel:', err);
        dlBtn.innerHTML = origHtml;
        dlBtn.disabled = false;
      }
    });

    btnWrapper.appendChild(dlBtn);

    // 4. SISIPKAN PERSIS DI ATAS ITEM TOMBOL LIKE
    actionItemContainer.insertAdjacentElement('beforebegin', btnWrapper);
  });
}

export const injectReelButton = injectReelsButtons;
