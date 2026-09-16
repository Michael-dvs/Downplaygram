/**
 * Downplaygram Design System: Theme Tokens & OS-Native Typography
 * Implements #315B8C (Deep Ocean Blue) & #F5EBDD (Warm Cream) custom palette
 * with adaptive Light/Dark mode support.
 */

/**
 * OS-Native Font Stack
 * Otomatis memprioritaskan SF Pro di macOS/iOS, Segoe UI di Windows, dan Roboto di Android/Linux
 */
export const SYSTEM_FONT_FAMILY = `-apple-system, BlinkMacSystemFont, "SF Pro", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"`;

/**
 * Injeksi Variabel Tema dan Global Styles
 */
export function injectGlobalThemeStyles(): void {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  if (typeof document.getElementById === 'function' && document.getElementById('downplaygram-theme-styles')) return;

  const style = document.createElement('style');
  style.id = 'downplaygram-theme-styles';
  style.textContent = `
    :root {
      --dpg-blue: #315B8C;
      --dpg-cream: #F5EBDD;
      --dpg-font: ${SYSTEM_FONT_FAMILY};
    }

    /* LIGHT MODE (Default OS / IG Light Theme) */
    @media (prefers-color-scheme: light) {
      :root {
        --dpg-surface: #F5EBDD;
        --dpg-surface-elevated: #ffffff;
        --dpg-text-primary: #1c2d42;
        --dpg-text-muted: #5c6e82;
        --dpg-border: rgba(49, 91, 140, 0.2);
        --dpg-btn-feed: #000000;
        --dpg-ring-track: rgba(49, 91, 140, 0.15);
        --dpg-ring-progress: #315B8C;
      }
    }

    /* DARK MODE (OS Dark Mode / IG Dark Theme) */
    @media (prefers-color-scheme: dark) {
      :root {
        --dpg-surface: #1b2633;
        --dpg-surface-elevated: #243242;
        --dpg-text-primary: #F5EBDD;
        --dpg-text-muted: #a3b2c2;
        --dpg-border: rgba(245, 235, 221, 0.15);
        --dpg-btn-feed: #ffffff;
        --dpg-ring-track: rgba(245, 235, 221, 0.2);
        --dpg-ring-progress: #5b8ec7;
      }
    }

    /* Override paksa jika Instagram HTML menyertakan class dark mode khusus */
    html[class*="dark"], body[class*="dark"] {
      --dpg-surface: #1b2633;
      --dpg-surface-elevated: #243242;
      --dpg-text-primary: #F5EBDD;
      --dpg-text-muted: #a3b2c2;
      --dpg-border: rgba(245, 235, 221, 0.15);
      --dpg-btn-feed: #ffffff;
      --dpg-ring-track: rgba(245, 235, 221, 0.2);
      --dpg-ring-progress: #5b8ec7;
    }

    /* KEYFRAMES */
    @keyframes dpg-overlay-fade-in {
      from { opacity: 0; transform: scale(0.92); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes dpg-circle-fill-2s {
      0% { stroke-dashoffset: 251.32; }
      100% { stroke-dashoffset: 0; }
    }

    .dpg-ghost-overlay-animate {
      animation: dpg-overlay-fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
      font-family: var(--dpg-font) !important;
    }

    .dpg-active-progress-circle {
      animation: dpg-circle-fill-2s 2s linear forwards !important;
      transform-origin: center !important;
      stroke: var(--dpg-ring-progress, #315B8C) !important;
    }
  `;
  const target = document.head || document.documentElement || document.body;
  if (target && typeof target.appendChild === 'function') {
    target.appendChild(style);
  }
}

// Auto-injeksi saat file dimuat di browser
if (typeof document !== 'undefined') {
  try {
    injectGlobalThemeStyles();
  } catch (_) {
    // Abaikan jika di luar konteks browser
  }
}
