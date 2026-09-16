/**
 * Downplaygram Popup
 * Quick Anonymous View — search & preview any Instagram story without being seen.
 */

import { sanitizeUsername } from '../lib/sanitizer';
import { cleanExpiredAnonymousCache } from '../lib/anonymous-service';
import { iconGhost, iconSpinner } from '../ui/icons';

// Purge stale 24h cache entries on every popup open
cleanExpiredAnonymousCache();

// ─── Render UI ────────────────────────────────────────────────────────────────
const app = document.getElementById('app')!;

app.innerHTML = `
  <div class="header">
    <div class="brand">
      ${iconGhost(20, '#315B8C')}
      <span>Downplaygram</span>
    </div>
    <span class="version">v3.0</span>
  </div>

  <div class="card">
    <div class="card-header">
      <span class="card-title">QUICK ANONYMOUS VIEW</span>
    </div>
    <p class="card-desc">Lihat &amp; unduh story tanpa terlihat sebagai viewer.</p>

    <form id="anon-form" class="anon-form" autocomplete="off">
      <div class="input-wrapper">
        <span class="at-sign">@</span>
        <input
          type="text"
          id="anon-username"
          class="anon-input"
          placeholder="username..."
          required
          autocomplete="off"
          spellcheck="false"
        />
      </div>
      <button type="submit" id="anon-submit-btn" class="anon-submit-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span>Lihat</span>
      </button>
    </form>
  </div>

  <button class="btn-secondary" id="btn-open-ig">
    <span>Buka Instagram Web</span>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="7" y1="17" x2="17" y2="7"></line>
      <polyline points="7 7 17 7 17 17"></polyline>
    </svg>
  </button>

  <div class="footer">
    <span class="telemetry-badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      Zero Telemetry
    </span>
    <span>Local MV3 Engine</span>
  </div>
`;

// ─── Element Refs ─────────────────────────────────────────────────────────────
const form = document.getElementById('anon-form') as HTMLFormElement;
const usernameInput = document.getElementById('anon-username') as HTMLInputElement;
const submitBtn = document.getElementById('anon-submit-btn') as HTMLButtonElement;
const openIgBtn = document.getElementById('btn-open-ig') as HTMLButtonElement;

// ─── Submit Handler ───────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const raw = usernameInput.value.trim();
  const username = sanitizeUsername(raw);
  if (!username || username === 'anonymous') return;

  // Set loading state
  const btnSpan = submitBtn.querySelector('span')!;
  const origText = btnSpan.textContent;
  submitBtn.disabled = true;
  btnSpan.innerHTML = iconSpinner(14, '#ffffff');

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isInstagramActive =
      activeTab?.url && activeTab.url.includes('instagram.com');

    const sendToTab = async (tabId: number) => {
      await chrome.tabs.sendMessage(tabId, {
        action: 'OPEN_ANONYMOUS_LIGHTBOX',
        payload: { username },
      });
    };

    if (isInstagramActive && activeTab?.id) {
      await sendToTab(activeTab.id);
    } else {
      const igTabs = await chrome.tabs.query({ url: '*://*.instagram.com/*' });
      const targetHashUrl = `https://www.instagram.com/#downplaygram-view=${encodeURIComponent(username)}`;

      if (igTabs.length > 0 && igTabs[0]?.id) {
        await chrome.tabs.update(igTabs[0].id, { active: true });
        // Brief delay so the tab can focus before we send the message
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(igTabs[0]!.id!, {
              action: 'OPEN_ANONYMOUS_LIGHTBOX',
              payload: { username },
            });
          } catch { }
        }, 350);
      } else {
        await chrome.tabs.create({ url: targetHashUrl });
      }
    }
  } catch (err) {
    // Restore button on unexpected error
    btnSpan.innerHTML = origText ?? 'Lihat';
    submitBtn.disabled = false;
    return;
  }

  window.close();
});

// ─── Open Instagram ───────────────────────────────────────────────────────────
openIgBtn.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: '*://*.instagram.com/*' });
  if (tabs.length > 0 && tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { active: true });
  } else {
    await chrome.tabs.create({ url: 'https://www.instagram.com/' });
  }
  window.close();
});
