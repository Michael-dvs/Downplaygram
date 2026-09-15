/**
 * Downplaygram Stories Player Injector
 * Injects a native-styled download button and dynamic upward pop-up into the Instagram Stories viewer.
 */

import {
  extractActiveStoryMediaStrict,
  getAllStoriesForUser,
  getStoryOrHighlightContext,
  getAllHighlightMedia,
  deduplicateMediaItems,
  type HighlightContext,
} from '../../lib/media-sniffer';
import { isExtensionContextValid, safeSendMessage } from '../../lib/runtime';
import { iconSpinner, iconSuccess, iconError, iconDownload } from '../../ui/icons';

const STORY_CONTAINER_ID = 'downplaygram-story-container';
const STORY_BOTTOM_BTN_ID = 'downplaygram-story-bottom-btn';

export function injectStoryButton(): void {
  if (!window.location.pathname.startsWith('/stories/')) {
    document.getElementById(STORY_CONTAINER_ID)?.remove();
    document.getElementById(STORY_BOTTOM_BTN_ID)?.remove();
    return;
  }

  // Temukan ikon Love di bar bawah
  const allSvgs = Array.from(document.querySelectorAll<SVGElement>('svg'));
  const heartSvg = allSvgs.find((svg) => {
    const aria = (svg.getAttribute('aria-label') || '').toLowerCase();
    const isLike = aria === 'like' || aria === 'suka';
    const r = svg.getBoundingClientRect();
    const isBottom = r.top > window.innerHeight - 180;
    return (isLike || isBottom) && r.width > 16 && r.width < 40;
  });

  if (!heartSvg) return;

  const likeBtnWrapper = heartSvg.closest<HTMLElement>('div[role="button"], button') || heartSvg.parentElement;
  if (!likeBtnWrapper || !likeBtnWrapper.parentElement) return;

  const bottomActionRow = likeBtnWrapper.parentElement;

  // Cek apakah kontainer sudah terpasang di bar aksi aktif
  const existingContainer = document.getElementById(STORY_CONTAINER_ID);
  if (existingContainer && bottomActionRow.contains(existingContainer)) {
    return;
  }
  existingContainer?.remove();
  document.getElementById(STORY_BOTTOM_BTN_ID)?.remove();

  // Atur baris aksi agar rapi dan tidak wrap
  bottomActionRow.style.display = 'flex';
  bottomActionRow.style.flexDirection = 'row';
  bottomActionRow.style.alignItems = 'center';
  bottomActionRow.style.flexWrap = 'nowrap';
  bottomActionRow.style.gap = '8px';

  // Buat elemen reply input fleksibel jika ada
  const replyInputContainer = Array.from(bottomActionRow.children).find(
    (child) => child !== likeBtnWrapper && child.querySelector('input, textarea, [contenteditable="true"], span')
  ) as HTMLElement | undefined;

  if (replyInputContainer) {
    replyInputContainer.style.flex = '1 1 auto';
    replyInputContainer.style.minWidth = '0';
    replyInputContainer.style.marginRight = '4px';
  }

  // 1. Container Pembungkus Relatif
  const container = document.createElement('div');
  container.id = STORY_CONTAINER_ID;
  container.style.cssText = `
    position: relative !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 50 !important;
  `;

  // 2. Tombol Unduh Utama
  const dlBtn = document.createElement('button');
  dlBtn.id = STORY_BOTTOM_BTN_ID;
  dlBtn.type = 'button';
  dlBtn.setAttribute('aria-label', 'Unduh Story');
  dlBtn.title = 'Unduh Story (Downplaygram)';
  dlBtn.style.cssText = `
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: transparent !important;
    border: none !important;
    cursor: pointer !important;
    padding: 6px !important;
    margin: 0 !important;
    color: #ffffff !important;
    flex-shrink: 0 !important;
    z-index: 50 !important;
    transition: transform 0.15s ease, opacity 0.15s ease !important;
  `;

  dlBtn.innerHTML = iconDownload(24, '#ffffff');

  dlBtn.onmouseenter = () => { dlBtn.style.transform = 'scale(1.15)'; dlBtn.style.opacity = '0.85'; };
  dlBtn.onmouseleave = () => { dlBtn.style.transform = 'scale(1)'; dlBtn.style.opacity = '1'; };

  // 3. Pop-Up Menu (Expand ke Atas)
  const popupMenu = document.createElement('div');
  popupMenu.className = 'downplaygram-story-popup';
  popupMenu.style.cssText = `
    position: absolute !important;
    bottom: calc(100% + 12px) !important;
    right: 0 !important;
    background: rgba(22, 22, 22, 0.95) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    border-radius: 12px !important;
    padding: 6px !important;
    display: none;
    flex-direction: column !important;
    gap: 4px !important;
    min-width: 210px !important;
    z-index: 100 !important;
    box-shadow: 0 10px 30px rgba(0,0,0,0.6) !important;
    animation: dpgSlideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
  `;

  // Helper buka/tutup pop-up
  const closePopup = () => {
    popupMenu.style.display = 'none';
  };

  dlBtn.onclick = async (e) => {
    e.stopPropagation();

    if (!isExtensionContextValid()) {
      dlBtn.innerHTML = `<span style="font-size: 11px; padding: 2px 4px; background: rgba(255,0,0,0.8); border-radius: 4px;">Refresh Tab (F5)</span>`;
      return;
    }

    if (popupMenu.style.display === 'flex') {
      closePopup();
      return;
    }

    // 1. Ekstrak konteks (apakah highlight atau story biasa, beserta username/reelId)
    const context = getStoryOrHighlightContext();

    // 2. Dapatkan seluruh media items untuk konteks ini
    let items: any[] = [];
    if (context.isHighlight && context.highlightId) {
      items = await getAllHighlightMedia(context.highlightId, context.username);
    } else {
      items = await getAllStoriesForUser(context.username);
    }

    // Saring duplikasi agar count presisi
    items = deduplicateMediaItems(items);

    // 3. Evaluasi jumlah media
    if (items.length <= 1) {
      closePopup();
      await handleDownloadCurrentStory(dlBtn);
    } else {
      renderHighlightOrStoryPopup(dlBtn, context, items, popupMenu, closePopup);
      popupMenu.style.display = 'flex';
    }
  };

  // Tutup jika klik di area luar
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) {
      closePopup();
    }
  });

  container.appendChild(dlBtn);
  container.appendChild(popupMenu);

  likeBtnWrapper.parentElement.insertBefore(container, likeBtnWrapper);
}

function getOptionStyle(): string {
  return `
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    width: 100% !important;
    background: transparent !important;
    border: none !important;
    color: #ffffff !important;
    padding: 10px 12px !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    text-align: left !important;
    transition: background 0.15s ease !important;
    user-select: none !important;
    white-space: nowrap !important;
  `;
}

/**
 * Render Opsi Menu Pop-Up (Mendukung Story & Highlight)
 */
function renderHighlightOrStoryPopup(
  btn: HTMLButtonElement,
  context: HighlightContext,
  items: any[],
  popup: HTMLElement,
  onClose: () => void
): void {
  popup.innerHTML = '';
  const totalCount = Math.max(items.length, 1);
  const typeLabel = context.isHighlight ? 'highlight' : 'story';
  const folder = context.isHighlight ? 'highlights' : 'stories';

  // Opsi 1: Unduh Slide Aktif
  const btnCurrent = document.createElement('button');
  btnCurrent.type = 'button';
  btnCurrent.style.cssText = getOptionStyle();
  btnCurrent.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; width: 100%; color: #ffffff;">
      ${iconDownload(18, '#ffffff')}
      <span style="font-size: 13px; font-weight: 500; line-height: 1;">Unduh ${typeLabel} ini</span>
    </div>
  `;
  btnCurrent.onmouseenter = () => { btnCurrent.style.background = 'rgba(255, 255, 255, 0.1)'; };
  btnCurrent.onmouseleave = () => { btnCurrent.style.background = 'transparent'; };
  btnCurrent.onclick = async (e) => {
    e.stopPropagation();
    onClose();
    await handleDownloadCurrentStory(btn);
  };

  // Opsi 2: Unduh Semua Slide Sekaligus
  const btnAll = document.createElement('button');
  btnAll.type = 'button';
  btnAll.style.cssText = getOptionStyle();
  btnAll.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; width: 100%; color: #ffffff;">
      ${iconDownload(18, '#ffffff')}
      <span style="font-size: 13px; font-weight: 500; line-height: 1;">Unduh semua (${totalCount} ${typeLabel})</span>
    </div>
  `;
  btnAll.onmouseenter = () => { btnAll.style.background = 'rgba(255, 255, 255, 0.1)'; };
  btnAll.onmouseleave = () => { btnAll.style.background = 'transparent'; };
  btnAll.onclick = async (e) => {
    e.stopPropagation();
    onClose();
    await handleBatchDownload(btn, context.username, items, folder);
  };

  popup.appendChild(btnCurrent);
  popup.appendChild(btnAll);
}

// 1. Eksekusi Unduh Story atau Highlight yang Sedang Diputar
export async function handleDownloadCurrentStory(btn: HTMLButtonElement): Promise<void> {
  if (!isExtensionContextValid()) {
    btn.innerHTML = `<span style="font-size: 11px; padding: 2px 4px; background: rgba(255,0,0,0.8); border-radius: 4px;">Refresh Tab (F5)</span>`;
    setTimeout(() => { window.location.reload(); }, 1500);
    return;
  }

  const origHtml = btn.innerHTML;
  btn.innerHTML = iconSpinner(18, '#ffffff');
  btn.disabled = true;

  try {
    let media = await extractActiveStoryMediaStrict(btn);

    // Jika belum langsung siap, tunggu 300ms sekali lagi untuk sinkronisasi DOM bridge
    if (!media) {
      await new Promise((r) => setTimeout(r, 300));
      media = await extractActiveStoryMediaStrict(btn);
    }

    if (!media || !media.url) {
      btn.innerHTML = iconError(18, '#ef4444');
      setTimeout(() => { btn.innerHTML = origHtml; btn.disabled = false; }, 1500);
      return;
    }

    const card = btn.closest<HTMLElement>('section, div[role="dialog"]') || document.body;
    const context = getStoryOrHighlightContext(card);
    const folder = context.isHighlight ? 'highlights' : 'stories';
    const prefix = context.isHighlight ? 'highlight' : 'story';
    const username = media.username || context.username || 'instagram_user';

    await safeSendMessage({
      action: 'DOWNLOAD_MEDIA',
      payload: {
        url: media.url,
        filename: `Downplaygram/${username}/${folder}/${prefix}_${Date.now()}.${media.ext}`,
      },
    });

    btn.innerHTML = iconSuccess(18, '#22c55e');
    setTimeout(() => { btn.innerHTML = origHtml; btn.disabled = false; }, 1500);
  } catch (error: any) {
    if (error?.message?.includes('Extension context invalidated')) {
      btn.innerHTML = `<span style="font-size: 11px; padding: 2px 4px; background: rgba(255,0,0,0.8); border-radius: 4px;">Refresh Tab</span>`;
    } else {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }
  }
}

// 2. Eksekusi Unduh Semua Story/Highlight Milik Akun Tersebut Secara Berurutan
export async function handleBatchDownload(
  btn: HTMLButtonElement,
  username: string,
  items: any[],
  folder: 'stories' | 'highlights' = 'stories'
): Promise<void> {
  if (!isExtensionContextValid()) {
    btn.innerHTML = `<span style="font-size: 11px; padding: 2px 4px; background: rgba(255,0,0,0.8); border-radius: 4px;">Refresh Tab (F5)</span>`;
    setTimeout(() => { window.location.reload(); }, 1500);
    return;
  }

  const origHtml = btn.innerHTML;
  btn.disabled = true;

  // Jika data items belum lengkap, ambil ulang
  let targetItems = items;
  if (!targetItems || targetItems.length === 0) {
    btn.innerHTML = `
      <div style="display: inline-flex; align-items: center; gap: 4px;">
        ${iconSpinner(14, '#ffffff')}
        <span style="font-size: 11px; font-weight: 500;">Menyiapkan...</span>
      </div>
    `;
    const card = btn.closest<HTMLElement>('section, div[role="dialog"]') || document.body;
    const context = getStoryOrHighlightContext(card);
    if (context.isHighlight && context.highlightId) {
      targetItems = await getAllHighlightMedia(context.highlightId, username);
    } else {
      targetItems = await getAllStoriesForUser(username);
    }
  }

  targetItems = deduplicateMediaItems(targetItems);

  if (!targetItems || targetItems.length === 0) {
    btn.innerHTML = iconError(18, '#ef4444');
    setTimeout(() => { btn.innerHTML = origHtml; btn.disabled = false; }, 1500);
    return;
  }

  const timestamp = Date.now();
  const total = targetItems.length;

  for (let i = 0; i < total; i++) {
    const item = targetItems[i];
    if (!item?.url) continue;

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
        filename: `Downplaygram/${username}/${folder}/batch_${timestamp}_${i + 1}.${item.ext}`,
      },
    });

    // Jeda 400ms antar-file untuk stabilitas download Chrome
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  btn.innerHTML = iconSuccess(18, '#22c55e');
  setTimeout(() => { btn.innerHTML = origHtml; btn.disabled = false; }, 2000);
}

// Alias untuk backward compatibility
export const handleDownloadAllUserStories = (btn: HTMLButtonElement, username: string, stories: any[]) =>
  handleBatchDownload(btn, username, stories, 'stories');

