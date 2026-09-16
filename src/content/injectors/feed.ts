/**
 * Downplaygram Feed & Carousel Post Injector
 * Decoupled permalink batch fetcher and direct active slide sniffer.
 */

import {
  extractPostShortcode,
  fetchAllMediaFromPostLink,
  extractDirectActiveMediaFromDOM,
} from '../../lib/media-sniffer';
import { safeSendMessage } from '../../lib/runtime';
import { iconSpinner, iconSuccess, iconError, iconDownload } from '../../ui/icons';
import { SYSTEM_FONT_FAMILY, injectGlobalThemeStyles } from '../../ui/theme';

export function injectFeedButtons(): void {
  // Hindari injeksi di halaman stories
  if (typeof window !== 'undefined' && window.location?.pathname?.startsWith('/stories/')) {
    return;
  }

  const posts = document.querySelectorAll<HTMLElement>('article');

  posts.forEach((post) => {
    if (post.getAttribute('data-downplaygram-done') === 'true') return;

    // Temukan ikon simpan / bookmark di baris aksi (mendukung berbagai bahasa)
    const saveSvg = post.querySelector(
      'svg[aria-label*="Save"], svg[aria-label*="Simpan"], svg[aria-label*="Bookmark"]'
    );
    if (!saveSvg) return;

    const saveBtnWrapper: HTMLElement | null =
      saveSvg.closest<HTMLElement>('div[role="button"], button') || saveSvg.parentElement;

    if (!saveBtnWrapper || !saveBtnWrapper.parentElement) return;

    // Cegah duplikasi tombol pada post yang sama
    if (
      post.querySelector('.downplaygram-feed-container') ||
      saveBtnWrapper.parentElement.querySelector('.downplaygram-feed-container')
    ) {
      post.setAttribute('data-downplaygram-done', 'true');
      return;
    }

    const parentRow = saveBtnWrapper.parentElement;
    parentRow.style.display = 'inline-flex';
    parentRow.style.alignItems = 'center';
    parentRow.style.flexDirection = 'row';

    attachFeedDownloadButton(post, saveBtnWrapper);
    post.setAttribute('data-downplaygram-done', 'true');
  });
}

/**
 * Creates an adaptive feed download button honoring Instagram dark/light modes.
 */
export function createFeedDownloadButton(): HTMLButtonElement {
  injectGlobalThemeStyles();

  const dlBtn = document.createElement('button');
  dlBtn.type = 'button';
  dlBtn.setAttribute('aria-label', 'Unduh Media');
  dlBtn.setAttribute('title', 'Unduh Media (Downplaygram)');
  dlBtn.title = 'Unduh Media (Downplaygram)';

  // Menggunakan 'color: inherit' dan 'currentColor':
  // Di Dark Mode IG: Parent color bernilai putih (#fff) -> Ikon otomatis putih.
  // Di Light Mode IG: Parent color bernilai hitam/abu (#262626) -> Ikon otomatis hitam.
  dlBtn.style.cssText = `
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: transparent !important;
    border: none !important;
    cursor: pointer !important;
    padding: 8px !important;
    margin: 0 !important;
    color: inherit !important;
    flex-shrink: 0 !important;
    box-sizing: border-box !important;
    transition: opacity 0.15s ease, transform 0.1s ease !important;
    outline: none !important;
  `;
  dlBtn.style.color = 'inherit';

  dlBtn.innerHTML = iconDownload(24, 'currentColor');

  dlBtn.onmouseenter = () => { dlBtn.style.opacity = '0.65'; };
  dlBtn.onmouseleave = () => { dlBtn.style.opacity = '1'; dlBtn.style.transform = 'scale(1)'; };
  dlBtn.onmousedown = () => { dlBtn.style.transform = 'scale(0.92)'; };
  dlBtn.onmouseup = () => { dlBtn.style.transform = 'scale(1)'; };

  return dlBtn;
}

function attachFeedDownloadButton(post: HTMLElement, saveBtnWrapper: HTMLElement): void {
  const container = document.createElement('div');
  container.className = 'downplaygram-feed-container downplaygram-feed-btn downplaygram-btn-container';
  container.style.cssText = `position: relative; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px;`;

  const mainBtn = createFeedDownloadButton();

  const popupMenu = document.createElement('div');
  popupMenu.className = 'downplaygram-carousel-popup';
  popupMenu.style.cssText = `
    position: absolute !important;
    bottom: calc(100% + 8px) !important;
    right: 0 !important;
    background: var(--dpg-surface, #1b2633) !important;
    border: 1px solid var(--dpg-border, rgba(49, 91, 140, 0.3)) !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25) !important;
    border-radius: 12px !important;
    padding: 8px !important;
    display: none;
    flex-direction: column !important;
    gap: 4px !important;
    min-width: 220px !important;
    z-index: 10000 !important;
    font-family: ${SYSTEM_FONT_FAMILY} !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
  `;

  const closePopup = () => {
    popupMenu.style.display = 'none';
  };

  mainBtn.onclick = async (e) => {
    e.stopPropagation();

    // Deteksi apakah post ini adalah Carousel
    const isCarousel = checkIfCarousel(post);

    if (!isCarousel) {
      // Post Single: Langsung eksekusi download tanpa pop-up
      closePopup();
      await handleDownloadSinglePost(post, mainBtn);
    } else {
      // Post Carousel: Tampilkan menu pop-up opsi
      if (popupMenu.style.display === 'flex') {
        closePopup();
      } else {
        renderFeedPopupOptions(post, popupMenu, closePopup, mainBtn);
        popupMenu.style.display = 'flex';
      }
    }
  };

  // Tutup menu jika klik di luar
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) {
      closePopup();
    }
  });

  container.appendChild(mainBtn);
  container.appendChild(popupMenu);

  saveBtnWrapper.parentElement!.insertBefore(container, saveBtnWrapper);
}

function checkIfCarousel(post: HTMLElement): boolean {
  return Boolean(
    post.querySelector(
      'button[aria-label*="Next"], button[aria-label*="Selanjutnya"], div[role="tablist"], div._acnb, ul li + li'
    )
  );
}

function renderFeedPopupOptions(
  post: HTMLElement,
  popup: HTMLElement,
  closePopup: () => void,
  btn: HTMLButtonElement
): void {
  popup.innerHTML = '';

  // OPSI 1: UNDUH SLIDE AKTIF
  const btnActive = document.createElement('button');
  btnActive.type = 'button';
  btnActive.style.cssText = getOptionStyle();
  btnActive.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; width: 100%; color: var(--dpg-text-primary, #F5EBDD); font-family: ${SYSTEM_FONT_FAMILY};">
      ${iconDownload(18, 'currentColor')}
      <span style="font-size: 13px; font-weight: 500; line-height: 1.2;">Unduh slide yang tampil</span>
    </div>
  `;
  btnActive.onmouseenter = () => {
    btnActive.style.background = 'rgba(49, 91, 140, 0.2)';
  };
  btnActive.onmouseleave = () => {
    btnActive.style.background = 'transparent';
  };

  btnActive.onclick = async (e) => {
    e.stopPropagation();
    closePopup();
    await handleDownloadActiveSlide(post, btn);
  };

  // OPSI 2: UNDUH SEMUA SLIDE MELALUI LINK POSTINGAN
  const btnAll = document.createElement('button');
  btnAll.type = 'button';
  btnAll.style.cssText = getOptionStyle();
  btnAll.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; width: 100%; color: var(--dpg-text-primary, #F5EBDD); font-family: ${SYSTEM_FONT_FAMILY};">
      ${iconDownload(18, 'currentColor')}
      <span style="font-size: 13px; font-weight: 500; line-height: 1.2;">Unduh semua media (via link)</span>
    </div>
  `;
  btnAll.onmouseenter = () => {
    btnAll.style.background = 'rgba(49, 91, 140, 0.2)';
  };
  btnAll.onmouseleave = () => {
    btnAll.style.background = 'transparent';
  };

  btnAll.onclick = async (e) => {
    e.stopPropagation();
    closePopup();
    await handleDownloadAllViaLink(post, btn);
  };

  popup.appendChild(btnActive);
  popup.appendChild(btnAll);
}

/**
 * Menangani pengunduhan postingan tunggal (Video Feed, Reels di Beranda, atau Foto Tunggal)
 */
export async function handleDownloadSinglePost(post: HTMLElement, btn: HTMLButtonElement): Promise<void> {
  const orig = btn.innerHTML;
  btn.innerHTML = iconSpinner(18, '#ffffff');
  btn.disabled = true;

  const shortcode = extractPostShortcode(post);
  const userEl = post.querySelector<HTMLElement>('header a, a[role="link"]');
  const fallbackUsername = userEl?.textContent?.trim() || 'instagram_user';

  try {
    // 1. STRATEGI UTAMA: Gunakan API resmi via Shortcode (100% Berhasil untuk Video/Reels & Foto)
    if (shortcode) {
      const postData = await fetchAllMediaFromPostLink(shortcode);
      if (postData && postData.items.length > 0) {
        const item = postData.items[0];
        if (item) {
          const downloadPath = `Downplaygram/${postData.username}/posts/${shortcode}_${Date.now()}.${item.ext}`;

          await safeSendMessage({
            action: 'DOWNLOAD_MEDIA',
            payload: {
              url: item.url,
              filename: downloadPath,
              filepath: downloadPath,
            },
          });

          btn.innerHTML = iconSuccess(18, '#22c55e');
          setTimeout(() => {
            btn.innerHTML = orig;
            btn.disabled = false;
          }, 1500);
          return;
        }
      }
    }

    // 2. STRATEGI CADANGAN: Ambil dari DOM jika offline atau API limit (Hanya untuk foto)
    const domMedia = extractDirectActiveMediaFromDOM(post);
    if (domMedia && domMedia.url) {
      const downloadPath = `Downplaygram/${fallbackUsername}/posts/post_${Date.now()}.${domMedia.ext}`;
      await safeSendMessage({
        action: 'DOWNLOAD_MEDIA',
        payload: {
          url: domMedia.url,
          filename: downloadPath,
          filepath: downloadPath,
        },
      });

      btn.innerHTML = iconSuccess(18, '#22c55e');
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.disabled = false;
      }, 1500);
      return;
    }

    // Jika kedua strategi gagal
    console.warn('[Downplaygram] Gagal mengekstrak postingan tunggal.');
    btn.innerHTML = iconError(18, '#ef4444');
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.disabled = false;
    }, 1500);
  } catch (err) {
    console.error('[Downplaygram] Error downloading single post:', err);
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

/**
 * Menangani pengunduhan slide aktif pada postingan carousel (Foto atau Video)
 */
export async function handleDownloadActiveSlide(post: HTMLElement, btn: HTMLButtonElement): Promise<void> {
  const orig = btn.innerHTML;
  btn.innerHTML = iconSpinner(18, '#ffffff');
  btn.disabled = true;

  try {
    // 1. Coba ambil dari DOM (berhasil jika slide berupa foto)
    const domMedia = extractDirectActiveMediaFromDOM(post);
    if (domMedia && domMedia.url) {
      const userEl = post.querySelector<HTMLElement>('header a, a[role="link"]');
      const username = userEl?.textContent?.trim() || 'instagram_user';
      const downloadPath = `Downplaygram/${username}/posts/slide_${Date.now()}.${domMedia.ext}`;

      await safeSendMessage({
        action: 'DOWNLOAD_MEDIA',
        payload: {
          url: domMedia.url,
          filename: downloadPath,
          filepath: downloadPath,
        },
      });

      btn.innerHTML = iconSuccess(18, '#22c55e');
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.disabled = false;
      }, 1500);
      return;
    }

    // 2. Jika DOM me-return null (artinya slide aktif adalah VIDEO bertipe blob):
    // Tarik via API permalink postingan
    const shortcode = extractPostShortcode(post);
    if (shortcode) {
      const postData = await fetchAllMediaFromPostLink(shortcode);
      if (postData && postData.items.length > 0) {
        // Ambil video dari list item
        const videoItem = postData.items.find((it) => it.ext === 'mp4') || postData.items[0];
        if (videoItem) {
          const downloadPath = `Downplaygram/${postData.username}/posts/${shortcode}_${Date.now()}.${videoItem.ext}`;
          await safeSendMessage({
            action: 'DOWNLOAD_MEDIA',
            payload: {
              url: videoItem.url,
              filename: downloadPath,
              filepath: downloadPath,
            },
          });

          btn.innerHTML = iconSuccess(18, '#22c55e');
          setTimeout(() => {
            btn.innerHTML = orig;
            btn.disabled = false;
          }, 1500);
          return;
        }
      }
    }

    console.warn('[Downplaygram] Gagal mengekstrak slide aktif carousel.');
    btn.innerHTML = iconError(18, '#ef4444');
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.disabled = false;
    }, 1500);
  } catch (err) {
    console.error('[Downplaygram] Download active slide error:', err);
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

async function handleDownloadAllViaLink(post: HTMLElement, btn: HTMLButtonElement): Promise<void> {
  const orig = btn.innerHTML;
  btn.innerHTML = `
    <div style="display: inline-flex; align-items: center; gap: 4px;">
      ${iconSpinner(14, '#ffffff')}
      <span style="font-size: 11px; font-weight: 500;">Membaca data...</span>
    </div>
  `;
  btn.disabled = true;

  const shortcode = extractPostShortcode(post);
  if (!shortcode) {
    console.warn('[Downplaygram] Tidak dapat menemukan shortcode postingan.');
    btn.innerHTML = iconError(18, '#ef4444');
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.disabled = false;
    }, 2000);
    return;
  }

  const postData = await fetchAllMediaFromPostLink(shortcode);
  if (!postData || !postData.items || postData.items.length === 0) {
    console.warn('[Downplaygram] Gagal memuat metadata media dari server.');
    btn.innerHTML = iconError(18, '#ef4444');
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.disabled = false;
    }, 2000);
    return;
  }

  const timestamp = Date.now();
  const total = postData.items.length;

  try {
    for (let i = 0; i < total; i++) {
      const item = postData.items[i];
      if (!item) continue;
      btn.innerHTML = `
        <div style="display: inline-flex; align-items: center; gap: 6px;">
          ${iconSpinner(16, '#ffffff')}
          <span style="font-size: 11px; font-weight: 600; font-family: system-ui;">${i + 1}/${total}</span>
        </div>
      `;

      await safeSendMessage({
        action: 'DOWNLOAD_MEDIA',
        payload: {
          url: item.url,
          filename: `Downplaygram/${postData.username}/posts/${shortcode}_${timestamp}_slide${item.index}.${item.ext}`,
        },
      });

      // Jeda 400ms agar browser Chrome tidak mencekik antrean unduhan
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    btn.innerHTML = iconSuccess(18, '#22c55e');
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('[Downplaygram] Batch download error:', err);
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

function getOptionStyle(): string {
  return `
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    background: transparent !important;
    border: none !important;
    color: var(--dpg-text-primary, #F5EBDD) !important;
    font-family: ${SYSTEM_FONT_FAMILY} !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    padding: 8px 10px !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    width: 100% !important;
    text-align: left !important;
    white-space: nowrap !important;
    transition: background 0.15s ease !important;
  `;
}
