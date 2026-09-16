/**
 * Downplaygram Floating Ghost Hub
 * Docked Shadow DOM Web Component providing anonymous story previewing and Ghost Mode toggling.
 */

import { openGhostLightbox } from './lightbox';
import { sanitizeUsername } from '../../lib/sanitizer';
import { safeSendMessage } from '../../lib/runtime';
import { iconClose } from '../../ui/icons';
import { SYSTEM_FONT_FAMILY } from '../../ui/theme';

export class GhostHubElement extends HTMLElement {
  private shadow!: ShadowRoot;
  private isExpanded: boolean = false;
  private isGhostActive: boolean = false;
  private isInitialized: boolean = false;

  constructor() {
    super();
    // Proteksi attachShadow agar hanya dipanggil satu kali
    if (!this.shadow) {
      this.shadow = this.shadowRoot || this.attachShadow({ mode: 'open' });
    }
  }

  async connectedCallback() {
    if (!this.isInitialized) {
      this.isInitialized = true;
      this.initDOM();
    }
    await this.syncGhostStatus();
  }

  private async syncGhostStatus() {
    try {
      const response = await safeSendMessage<{ enabled?: boolean }>({ action: 'GET_GHOST_STATUS' });
      if (response && typeof response.enabled === 'boolean') {
        this.isGhostActive = response.enabled;
        this.updateGhostUI();
      }
    } catch (err) {
      console.warn('[Downplaygram] Could not fetch ghost status:', err);
    }
  }

  private toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
    const panel = this.shadow.querySelector('#hub-card');
    if (panel) {
      panel.classList.toggle('expanded', this.isExpanded);
    }
  }

  private collapse(): void {
    this.isExpanded = false;
    const panel = this.shadow.querySelector('#hub-card');
    if (panel) {
      panel.classList.remove('expanded');
    }
  }

  private updateGhostUI(): void {
    const toggle = this.shadow.querySelector('#ghost-toggle') as HTMLInputElement | null;
    if (toggle) {
      toggle.checked = this.isGhostActive;
    }

    const desc = this.shadow.querySelector('#toggle-desc');
    if (desc) {
      desc.textContent = this.isGhostActive ? 'Seen beacons blocked' : 'Normal tracking';
    }

    const indicator = this.shadow.querySelector('.ghost-status-indicator') as HTMLElement | null;
    if (indicator) {
      indicator.style.background = this.isGhostActive ? '#315B8C' : '#71717a';
      indicator.style.boxShadow = this.isGhostActive ? '0 0 8px #315B8C' : 'none';
    }
  }

  private async toggleGhostMode() {
    const nextState = !this.isGhostActive;
    const action = nextState ? 'ENABLE_GHOST_MODE' : 'DISABLE_GHOST_MODE';

    try {
      const response = await safeSendMessage<{ success?: boolean }>({
        action,
        reloadTab: true, // Reload tab so seen beacon event listeners are refreshed
      });

      if (response && response.success) {
        this.isGhostActive = nextState;
        this.updateGhostUI();
      }
    } catch (err) {
      console.error('[Downplaygram] Error toggling ghost mode:', err);
    }
  }

  private fetchTargetStories(rawUsername: string) {
    const cleanUser = sanitizeUsername(rawUsername);
    if (!cleanUser || cleanUser === 'anonymous') {
      alert('Please enter a valid Instagram username.');
      return;
    }

    this.collapse();
    openGhostLightbox(cleanUser);
  }

  private initDOM() {
    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          position: relative;
          font-family: ${SYSTEM_FONT_FAMILY};
          user-select: none;
        }

        .hub-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(10, 10, 10, 0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid #262626;
          border-radius: 9999px;
          padding: 8px 14px;
          color: #ffffff;
          cursor: pointer;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .hub-pill:hover {
          transform: translateY(-2px);
          border-color: #3f3f46;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7);
        }

        .ghost-icon {
          font-size: 16px;
        }

        .pill-label {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.01em;
        }

        .ghost-status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${this.isGhostActive ? '#315B8C' : '#71717a'};
          box-shadow: ${this.isGhostActive ? '0 0 8px #315B8C' : 'none'};
          transition: all 0.2s ease;
        }

        /* Panel Card */
        .hub-card {
          display: none;
          position: absolute;
          bottom: 50px;
          right: 0;
          width: 320px;
          background: #000000;
          border: 1px solid #262626;
          border-radius: 16px;
          padding: 16px;
          flex-direction: column;
          gap: 14px;
          box-shadow: 0 20px 48px rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          z-index: 100;
        }

        .hub-card.expanded {
          display: flex;
        }

        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #1c1c1c;
          padding-bottom: 10px;
        }

        .brand-title {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .version-badge {
          font-size: 10px;
          background: #18181b;
          color: #a1a1aa;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #27272a;
        }

        /* Ghost Mode Toggle Section */
        .toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #09090b;
          border: 1px solid #1c1c1c;
          border-radius: 10px;
          padding: 10px 12px;
        }

        .toggle-label-wrap {
          display: flex;
          flex-direction: column;
        }

        .toggle-title {
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
        }

        .toggle-desc {
          font-size: 11px;
          color: #71717a;
        }

        .switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }

        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background-color: #27272a;
          transition: 0.25s ease;
          border-radius: 24px;
        }

        .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.25s ease;
          border-radius: 50%;
        }

        input:checked + .slider {
          background-color: #315B8C;
        }

        input:checked + .slider:before {
          transform: translateX(20px);
        }

        /* Search Section */
        .search-wrap {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .search-label {
          font-size: 12px;
          font-weight: 500;
          color: #a1a1aa;
        }

        .input-group {
          display: flex;
          gap: 6px;
        }

        .username-input {
          flex: 1;
          background: #09090b;
          border: 1px solid #27272a;
          border-radius: 8px;
          padding: 8px 12px;
          color: #ffffff;
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s ease;
        }

        .username-input:focus {
          border-color: #315B8C;
        }

        .search-btn {
          background: #ffffff;
          color: #000000;
          border: none;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s ease;
        }

        .search-btn:hover {
          opacity: 0.9;
        }

        .status-msg {
          display: none;
          font-size: 12px;
          color: #315B8C;
          text-align: center;
        }
      </style>

      <div class="hub-pill" id="hub-pill">
        <span class="pill-label">Downplaygram</span>
        <span class="ghost-status-indicator"></span>
      </div>

      <div class="hub-card" id="hub-card">
        <div class="card-header">
          <div class="brand-title">
            <span>Downplaygram</span>
            <span class="version-badge">v3.0</span>
          </div>
          <button id="close-card" style="background: none; border: none; color: #71717a; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;">${iconClose(16, '#71717a')}</button>
        </div>

        <div class="toggle-row">
          <div class="toggle-label-wrap">
            <span class="toggle-title">Ghost Viewing</span>
            <span class="toggle-desc" id="toggle-desc">${this.isGhostActive ? 'Seen beacons blocked' : 'Normal tracking'}</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="ghost-toggle" ${this.isGhostActive ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="search-wrap">
          <span class="search-label">Anonymous Target Viewer</span>
          <div class="input-group">
            <input
              type="text"
              class="username-input"
              id="target-input"
              placeholder="username (e.g. natgeo)"
            />
            <button class="search-btn" id="search-btn">View</button>
          </div>
          <div class="status-msg" id="search-status"></div>
        </div>
      </div>
    `;

    // Bind event listeners ONCE
    const pill = this.shadow.querySelector('#hub-pill');
    pill?.addEventListener('click', () => {
      this.toggleExpand();
    });

    const closeCard = this.shadow.querySelector('#close-card');
    closeCard?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.collapse();
    });

    const ghostToggle = this.shadow.querySelector('#ghost-toggle') as HTMLInputElement | null;
    ghostToggle?.addEventListener('change', () => {
      this.toggleGhostMode();
    });

    const targetInput = this.shadow.querySelector('#target-input') as HTMLInputElement | null;
    const searchBtn = this.shadow.querySelector('#search-btn');

    const triggerSearch = () => {
      if (targetInput && targetInput.value) {
        this.fetchTargetStories(targetInput.value);
      }
    };

    searchBtn?.addEventListener('click', triggerSearch);
    targetInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        triggerSearch();
      }
    });
  }
}
