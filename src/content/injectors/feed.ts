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

function attachFeedDownloadButton(post: HTMLElement, saveBtnWrapper: HTMLElement): void {
  const container = document.createElement('div');
  container.className = 'downplaygram-feed-container downplaygram-feed-btn downplaygram-btn-container';
  container.style.cssText = `position: relative; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px;`;

  const mainBtn = document.createElement('button');
  mainBtn.type = 'button';
  mainBtn.title = 'Unduh Postingan (Downplaygram)';
  mainBtn.style.cssText = `background: transparent; border: none; cursor: pointer; padding: 0; color: currentColor; display: inline-flex; align-items: center; justify-content: center; line-height: 0; transition: transform 0.15s ease;`;
  mainBtn.innerHTML = iconDownload(24);

  const popupMenu = document.createElement('div');
  popupMenu.className = 'downplaygram-carousel-popup';
  popupMenu.style.cssText = `
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    background: rgba(22, 22, 22, 0.95);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    padding: 6px;
    display: none;
    flex-direction: column;
    gap: 4px;
    min-width: 220px;
    z-index: 10000;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  `;

  // Animasi hover sederhana
  mainBtn.onmouseenter = () => {
    mainBtn.style.transform = 'scale(1.1)';
  };
  mainBtn.onmouseleave = () => {
    mainBtn.style.transform = 'scale(1)';
  };

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
    <div style="display: flex; align-items: center; gap: 10px; width: 100%; color: #ffffff;">
      ${iconDownload(18, '#ffffff')}
      <span style="font-size: 13px; font-weight: 500; line-height: 1;">Unduh slide yang tampil</span>
    </div>
  `;
  btnActive.onmouseenter = () => {
    btnActive.style.background = 'rgba(255, 255, 255, 0.12)';
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
    <div style="display: flex; align-items: center; gap: 10px; width: 100%; color: #ffffff;">
      ${iconDownload(18, '#ffffff')}
      <span style="font-size: 13px; font-weight: 500; line-height: 1;">Unduh semua media</span>
    </div>
  `;
  btnAll.onmouseenter = () => {
    btnAll.style.background = 'rgba(255, 255, 255, 0.12)';
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
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    color: #ffffff;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    width: 100%;
    text-align: left;
    white-space: nowrap;
    transition: background 0.15s ease;
  `;
}
