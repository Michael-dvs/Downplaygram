/**
 * Downplaygram In-Memory Zero-Telemetry Ghost Lightbox
 * Background fetches Instagram stories using active session cookies without navigating URL
 * and without firing seen beacons. Renders in isolated Shadow DOM modal.
 */

import { formatStoryFilename, buildDownloadPath, sanitizeUsername } from '../../lib/sanitizer';
import { downloadFile, downloadBatch, type DownloadItem } from '../../lib/downloader';
import { fetchAnonymousStories, AnonymousError } from '../../lib/anonymous-service';
import {
  GLOBAL_ANIMATION_CSS,
  iconSpinner,
  iconRefresh,
  iconClose,
  iconChevronLeft,
  iconChevronRight,
  iconGhost,
  iconLock,
  iconInbox,
  iconSearchOff,
  iconKey,
  iconAlertCircle,
  iconDownload,
} from '../../ui/icons';

export interface StoryItem {
  id: string;
  url: string;
  type: 'video' | 'image';
  timestamp: number;
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const now = Math.floor(Date.now() / 1000);
  const diffSec = Math.max(0, now - timestamp);
  const hours = Math.floor(diffSec / 3600);
  if (hours < 1) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return `${mins}m`;
  }
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export class StoryLightbox {
  private container: HTMLElement;
  private shadow: ShadowRoot;
  private username: string = '';
  private userAvatarUrl: string = '';
  private stories: StoryItem[] = [];
  private currentIndex: number = 0;
  private isBaseRendered: boolean = false;
  private isFromCache: boolean = false;
  private activeKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    const EXISTING_ID = 'downplaygram-lightbox-root';
    const existing = document.getElementById(EXISTING_ID);
    if (existing) {
      this.container = existing;
      this.shadow = existing.shadowRoot || existing.attachShadow({ mode: 'open' });
    } else {
      this.container = document.createElement('div');
      this.container.id = EXISTING_ID;
      this.shadow = this.container.shadowRoot || this.container.attachShadow({ mode: 'open' });
      if (document.body) {
        document.body.appendChild(this.container);
      }
    }
    this.renderBaseStyles();
  }

  private renderBaseStyles() {
    if (this.isBaseRendered) return;
    this.isBaseRendered = true;

    const style = document.createElement('style');
    style.textContent = `
      ${GLOBAL_ANIMATION_CSS}
      :host {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        user-select: none;
      }
      :host(.active) {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.88);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }
      .modal-card {
        position: relative;
        z-index: 10;
        width: 100%;
        max-width: 440px;
        height: 88vh;
        max-height: 820px;
        background: #000000;
        border: 1px solid #262626;
        border-radius: 18px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.9);
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid #1c1c1c;
        background: rgba(12, 12, 12, 0.9);
        color: #ffffff;
      }
      .user-info {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .user-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        object-fit: cover;
        border: 1.5px solid #a855f7;
      }
      .username-meta {
        display: flex;
        flex-direction: column;
      }
      .username-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .username-text {
        font-weight: 600;
        font-size: 14px;
        color: #ffffff;
      }
      .time-text {
        font-size: 12px;
        color: #a1a1aa;
      }
      .ghost-tag {
        font-size: 10px;
        font-weight: 700;
        color: #a855f7;
        background: rgba(168, 85, 247, 0.15);
        padding: 1px 6px;
        border-radius: 6px;
        border: 1px solid rgba(168, 85, 247, 0.3);
      }
      .close-btn {
        background: none;
        border: none;
        color: #a1a1aa;
        cursor: pointer;
        padding: 6px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease, background 0.15s ease;
      }
      .close-btn:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.1);
      }
      .progress-bars {
        display: flex;
        gap: 4px;
        padding: 8px 16px 4px;
        background: #000000;
      }
      .progress-bar-bg {
        flex: 1;
        height: 3px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
        overflow: hidden;
      }
      .progress-bar-fill {
        height: 100%;
        background: #ffffff;
        width: 0%;
      }
      .progress-bar-fill.done {
        width: 100%;
      }
      .progress-bar-fill.active {
        width: 100%;
      }
      .media-viewport {
        flex: 1;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #050505;
        overflow: hidden;
      }
      .media-item {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .nav-click-left {
        position: absolute;
        top: 0;
        left: 0;
        width: 35%;
        height: 100%;
        z-index: 2;
        cursor: pointer;
      }
      .nav-click-right {
        position: absolute;
        top: 0;
        right: 0;
        width: 35%;
        height: 100%;
        z-index: 2;
        cursor: pointer;
      }
      .nav-btn {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(0, 0, 0, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #ffffff;
        border-radius: 50%;
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.2s ease, transform 0.15s ease;
        z-index: 5;
      }
      .nav-btn:hover {
        background: rgba(255, 255, 255, 0.25);
        transform: translateY(-50%) scale(1.08);
      }
      .nav-btn.prev {
        left: 12px;
      }
      .nav-btn.next {
        right: 12px;
      }
      .footer-actions {
        padding: 12px 16px;
        border-top: 1px solid #1c1c1c;
        display: flex;
        gap: 10px;
        background: rgba(12, 12, 12, 0.95);
      }
      .btn-download-active {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: #ffffff;
        color: #000000;
        font-weight: 600;
        font-size: 13px;
        border: none;
        border-radius: 8px;
        padding: 10px;
        cursor: pointer;
        transition: opacity 0.15s ease, transform 0.1s ease;
      }
      .btn-download-active:hover {
        opacity: 0.92;
        transform: translateY(-1px);
      }
      .btn-download-all {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: #18181b;
        color: #ffffff;
        font-weight: 600;
        font-size: 13px;
        border: 1px solid #27272a;
        border-radius: 8px;
        padding: 10px 14px;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .btn-download-all:hover {
        background: #27272a;
      }
      /* Loading & Empty States */
      .state-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px 24px;
        text-align: center;
        gap: 16px;
        color: #ffffff;
      }
      .spinner {
        width: 36px;
        height: 36px;
        border: 3px solid rgba(168, 85, 247, 0.2);
        border-top-color: #a855f7;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .state-title {
        font-size: 15px;
        font-weight: 600;
        color: #ffffff;
      }
      .state-subtitle {
        font-size: 13px;
        color: #a1a1aa;
        max-width: 300px;
        line-height: 1.4;
      }
      .btn-state-close {
        margin-top: 8px;
        background: #27272a;
        color: #ffffff;
        border: none;
        border-radius: 8px;
        padding: 8px 18px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .btn-state-close:hover {
        background: #3f3f46;
      }
    `;
    this.shadow.appendChild(style);
  }

  /**
   * Opens the in-memory lightbox and fetches target user stories.
   */
  public async fetchAndOpen(rawUsername: string) {
    const cleanUser = sanitizeUsername(rawUsername);
    if (!cleanUser || cleanUser === 'anonymous') {
      alert('Please enter a valid Instagram username.');
      return;
    }

    if (!this.container.parentElement && document.body) {
      document.body.appendChild(this.container);
    }

    this.username = cleanUser;
    this.stories = [];
    this.currentIndex = 0;
    this.container.classList.add('active');

    // Attach keyboard listener
    this.bindKeyboard();

    // 1. Show Loading State
    this.renderLoading(`Sedang mendapatkan alamat story @${cleanUser}...`);

    try {
      // 2–5. Fetch via anonymous-service (handles cache, privacy, error taxonomy)
      const { items, fromCacheFallback } = await fetchAnonymousStories(cleanUser);
      this.isFromCache = Boolean(fromCacheFallback);

      const parsedStories: StoryItem[] = items.map((item) => ({
        id: item.id,
        url: item.url,
        type: item.ext === 'mp4' ? 'video' : 'image',
        timestamp: item.takenAt,
      }));

      if (parsedStories.length === 0) {
        this.renderError(new AnonymousError(`@${cleanUser} tidak memiliki story aktif dalam 24 jam terakhir.`, 'NO_STORIES'));
        return;
      }

      this.stories = parsedStories;
      if (this.currentIndex >= this.stories.length) {
        this.currentIndex = 0;
      }
      this.renderPlayer();
    } catch (err: any) {
      this.renderError(err);
    }
  }

  public open(username: string, stories: StoryItem[]) {
    if (!this.container.parentElement && document.body) {
      document.body.appendChild(this.container);
    }
    this.username = sanitizeUsername(username);
    this.stories = stories;
    this.currentIndex = 0;
    this.isFromCache = false;
    this.container.classList.add('active');
    this.bindKeyboard();
    this.renderPlayer();
  }

  public close() {
    this.container.classList.remove('active');
    this.unbindKeyboard();
    const modal = this.shadow.querySelector('.modal-card');
    if (modal) modal.innerHTML = '';
  }

  private bindKeyboard() {
    this.unbindKeyboard();
    this.activeKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'ArrowRight') {
        this.next();
      } else if (e.key === 'ArrowLeft') {
        this.prev();
      }
    };
    window.addEventListener('keydown', this.activeKeyHandler);
  }

  private unbindKeyboard() {
    if (this.activeKeyHandler) {
      window.removeEventListener('keydown', this.activeKeyHandler);
      this.activeKeyHandler = null;
    }
  }

  private next() {
    if (this.currentIndex < this.stories.length - 1) {
      this.currentIndex++;
      this.renderPlayer();
    }
  }

  private prev() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.renderPlayer();
    }
  }

  private async downloadCurrent() {
    const current = this.stories[this.currentIndex];
    if (!current) return;

    const ext = current.type === 'video' ? 'mp4' : 'jpg';
    const filename = formatStoryFilename(current.id, ext, current.timestamp);
    const filepath = buildDownloadPath({
      username: this.username,
      type: 'stories',
      filename,
    });

    console.log('[Downplaygram] Lightbox: downloading current story', filepath);
    await downloadFile(current.url, filepath);
  }

  private async downloadAll() {
    if (this.stories.length === 0) return;

    const items: DownloadItem[] = this.stories.map((story) => {
      const ext = story.type === 'video' ? 'mp4' : 'jpg';
      const filename = formatStoryFilename(story.id, ext, story.timestamp);
      const filepath = buildDownloadPath({
        username: this.username,
        type: 'stories',
        filename,
      });
      return { url: story.url, filepath };
    });

    console.log(`[Downplaygram] Lightbox: batch downloading ${items.length} stories...`);
    await downloadBatch(items, 500);
  }

  private clearModal() {
    const existingBackdrop = this.shadow.querySelector('.backdrop');
    const existingModal = this.shadow.querySelector('.modal-card');
    if (existingBackdrop) existingBackdrop.remove();
    if (existingModal) existingModal.remove();
  }

  private renderLoading(message: string) {
    this.clearModal();

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    backdrop.addEventListener('click', () => this.close());
    this.shadow.appendChild(backdrop);

    const modal = document.createElement('div');
    modal.className = 'modal-card';
    modal.innerHTML = `
      <div class="header">
        <div class="user-info">
          <span style="color: #a855f7; display: flex; align-items: center;">${iconGhost(16, '#a855f7')}</span>
          <span class="ghost-tag">GHOST ENGINE</span>
          <span class="username-text">@${this.username}</span>
        </div>
        <button class="close-btn" id="modal-close-btn" title="Tutup">${iconClose(18, '#a1a1aa')}</button>
      </div>
      <div class="state-container">
        <div style="margin-bottom: 4px;">${iconSpinner(28, '#a855f7')}</div>
        <div class="state-title">${message}</div>
        <div class="state-subtitle">Mengambil data story secara aman tanpa mengirimkan seen beacon ke server target.</div>
      </div>
    `;

    modal.querySelector('#modal-close-btn')?.addEventListener('click', () => this.close());
    this.shadow.appendChild(modal);
  }

  private renderError(err: any) {
    this.clearModal();

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    backdrop.addEventListener('click', () => this.close());
    this.shadow.appendChild(backdrop);

    let title = 'Terjadi Kesalahan';
    let errorIconSvg = iconAlertCircle(36, '#f59e0b');

    if (err instanceof AnonymousError) {
      switch (err.code) {
        case 'PRIVATE_RESTRICTED':
          errorIconSvg = iconLock(36, '#f59e0b');
          title = 'Akun Privat';
          break;
        case 'NO_STORIES':
          errorIconSvg = iconInbox(36, '#94a3b8');
          title = 'Tidak Ada Story';
          break;
        case 'NOT_FOUND':
          errorIconSvg = iconSearchOff(36, '#ef4444');
          title = 'Akun Tidak Ditemukan';
          break;
        case 'AUTH_FAILED':
          errorIconSvg = iconKey(36, '#ec4899');
          title = 'Koneksi Sesi Bermasalah';
          break;
      }
    }

    const message = err?.message || 'Gagal memuat story secara anonim.';

    const modal = document.createElement('div');
    modal.className = 'modal-card';
    modal.innerHTML = `
      <div class="header">
        <div class="user-info">
          <span style="color: #a855f7; display: flex; align-items: center;">${iconGhost(16, '#a855f7')}</span>
          <span class="ghost-tag">GHOST ENGINE</span>
          <span class="username-text">@${this.username}</span>
        </div>
        <button class="close-btn" id="modal-close-btn" title="Tutup">${iconClose(18, '#a1a1aa')}</button>
      </div>
      <div class="state-container">
        <div style="margin-bottom: 12px; width: 68px; height: 68px; border-radius: 50%; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.08);">
          ${errorIconSvg}
        </div>
        <div class="state-title" style="font-size: 16px; font-weight: 600; letter-spacing: -0.2px;">${title}</div>
        <div class="state-subtitle" style="color: #a1a1aa; font-size: 13px; line-height: 1.5; max-width: 320px;">${message}</div>
        <button class="btn-state-close" id="btn-empty-close">Tutup</button>
      </div>
    `;

    modal.querySelector('#modal-close-btn')?.addEventListener('click', () => this.close());
    modal.querySelector('#btn-empty-close')?.addEventListener('click', () => this.close());
    this.shadow.appendChild(modal);
  }

  private renderEmpty(message: string) {
    this.renderError(new AnonymousError(message, 'NO_STORIES'));
  }

  private renderPlayer() {
    this.clearModal();

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    backdrop.addEventListener('click', () => this.close());
    this.shadow.appendChild(backdrop);

    const modal = document.createElement('div');
    modal.className = 'modal-card';

    const currentItem = this.stories[this.currentIndex];
    if (!currentItem) return;

    // Build Progress Indicators
    const progressBarsHtml = this.stories
      .map((_, i) => {
        let fillClass = '';
        if (i < this.currentIndex) fillClass = 'done';
        else if (i === this.currentIndex) fillClass = 'active';
        return `
          <div class="progress-bar-bg">
            <div class="progress-bar-fill ${fillClass}"></div>
          </div>
        `;
      })
      .join('');

    const relativeTime = formatRelativeTime(currentItem.timestamp);

    modal.innerHTML = `
      <div class="header">
        <div class="user-info">
          ${this.userAvatarUrl ? `<img class="user-avatar" src="${this.userAvatarUrl}" alt="${this.username}" />` : `<span style="color: #a855f7; display: flex; align-items: center;">${iconGhost(18, '#a855f7')}</span>`}
          <div class="username-meta">
            <div class="username-row">
              <span class="username-text">@${this.username}</span>
              ${relativeTime ? `<span class="time-text">• ${relativeTime}</span>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span id="anon-cache-indicator" style="${this.isFromCache ? '' : 'display: none; '}font-size: 10px; background: #3f3f46; color: #d4d4d8; padding: 1px 6px; border-radius: 4px;">Tersimpan</span>
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 12px; color: #71717a;">${this.currentIndex + 1}/${this.stories.length}</span>
          <button class="close-btn" id="anon-refresh-btn" title="Perbarui Story Terbaru" style="font-size: 15px; transition: transform 0.3s ease;">
            ${iconRefresh(16, '#a1a1aa')}
          </button>
          <button class="close-btn" id="player-close-btn" title="Tutup">
            ${iconClose(18, '#a1a1aa')}
          </button>
        </div>
      </div>

      <div class="progress-bars">${progressBarsHtml}</div>

      <div class="media-viewport">
        <div class="nav-click-left" id="click-prev"></div>
        <div class="nav-click-right" id="click-next"></div>

        ${
          currentItem.type === 'video'
            ? `<video class="media-item" src="${currentItem.url}" autoplay loop playsinline controls></video>`
            : `<img class="media-item" src="${currentItem.url}" alt="Story preview" />`
        }

        ${this.currentIndex > 0 ? `<button class="nav-btn prev" id="prev-btn" title="Sebelumnya">${iconChevronLeft(20, '#ffffff')}</button>` : ''}
        ${this.currentIndex < this.stories.length - 1 ? `<button class="nav-btn next" id="next-btn" title="Selanjutnya">${iconChevronRight(20, '#ffffff')}</button>` : ''}
      </div>

      <div class="footer-actions">
        <button class="btn-download-active" id="dl-active-btn">
          ${iconDownload(16, 'currentColor')}
          Unduh Story Ini
        </button>
        <button class="btn-download-all" id="dl-all-btn">
          ${iconDownload(16, 'currentColor')}
          Unduh Semua (${this.stories.length})
        </button>
      </div>
    `;

    modal.querySelector('#player-close-btn')?.addEventListener('click', () => this.close());
    const refreshBtn = (modal.querySelector('#anon-refresh-btn') || modal.querySelector('#player-refresh-btn')) as HTMLButtonElement | null;
    refreshBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (refreshBtn) refreshBtn.style.transform = 'rotate(180deg)';
      try {
        await this.fetchAndOpen(this.username);
      } finally {
        setTimeout(() => {
          if (refreshBtn) refreshBtn.style.transform = 'rotate(0deg)';
        }, 300);
      }
    });
    modal.querySelector('#prev-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.prev();
    });
    modal.querySelector('#next-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.next();
    });

    modal.querySelector('#click-prev')?.addEventListener('click', () => this.prev());
    modal.querySelector('#click-next')?.addEventListener('click', () => this.next());

    const dlActiveBtn = modal.querySelector('#dl-active-btn') as HTMLElement;
    dlActiveBtn?.addEventListener('click', async () => {
      dlActiveBtn.style.opacity = '0.5';
      await this.downloadCurrent();
      dlActiveBtn.style.opacity = '1';
    });

    const dlAllBtn = modal.querySelector('#dl-all-btn') as HTMLElement;
    dlAllBtn?.addEventListener('click', async () => {
      dlAllBtn.style.opacity = '0.5';
      await this.downloadAll();
      dlAllBtn.style.opacity = '1';
    });

    this.shadow.appendChild(modal);
  }
}

// Global Singleton Instance
let lightboxInstance: StoryLightbox | null = null;

export function getStoryLightbox(): StoryLightbox {
  if (!lightboxInstance) {
    lightboxInstance = new StoryLightbox();
  }
  return lightboxInstance;
}

export function openGhostLightbox(username: string): void {
  getStoryLightbox().fetchAndOpen(username);
}

export function openAnonymousLightbox(username: string): void {
  openGhostLightbox(username);
}

