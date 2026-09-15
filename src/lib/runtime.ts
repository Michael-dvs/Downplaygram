/**
 * Downplaygram Runtime Utilities
 * Safe messaging and silent extension context validation for MV3 content scripts.
 */

export function isExtensionContextValid(): boolean {
  try {
    return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

export function safeSendMessage<T = any>(message: any): Promise<T | null> {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) {
      showRefreshToast();
      resolve(null);
      return;
    }

    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || '';
          if (msg.includes('Extension context invalidated')) {
            showRefreshToast();
          }
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (err: any) {
      if (err?.message?.includes('Extension context invalidated')) {
        showRefreshToast();
      }
      resolve(null);
    }
  });
}

function showRefreshToast(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('downplaygram-refresh-toast')) return;

  const toast = document.createElement('div');
  toast.id = 'downplaygram-refresh-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(18, 18, 18, 0.95);
    color: #ffffff;
    border: 1px solid #333333;
    padding: 10px 18px;
    border-radius: 9999px;
    font-size: 13px;
    z-index: 999999;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `;
  toast.innerHTML = `<span>Ekstensi diperbarui. Silakan <b>Refresh Halaman (F5)</b>.</span>`;
  document.body?.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
