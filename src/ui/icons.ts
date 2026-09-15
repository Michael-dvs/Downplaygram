/**
 * Downplaygram Design System: Animated SVG Icons & Global CSS Keyframes
 * Minimalist Lucide/Feather style SVG vectors with smooth micro-interactions.
 */

export const GLOBAL_ANIMATION_CSS = `
  @keyframes dpg-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes dpg-pop {
    0% { transform: scale(0.5); opacity: 0; }
    70% { transform: scale(1.18); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes dpg-shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-2.5px); }
    40%, 80% { transform: translateX(2.5px); }
  }
  @keyframes dpg-overlay-fade-in {
    from {
      opacity: 0;
      transform: scale(0.92);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @keyframes dpg-circle-fill-2s {
    0% {
      stroke-dashoffset: 251.32;
    }
    100% {
      stroke-dashoffset: 0;
    }
  }
  .dpg-spinner {
    animation: dpg-spin 0.75s linear infinite !important;
    transform-origin: center !important;
    display: inline-block;
  }
  .dpg-pop-in {
    animation: dpg-pop 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards !important;
    display: inline-block;
  }
  .dpg-error-shake {
    animation: dpg-shake 0.35s ease-in-out forwards !important;
    display: inline-block;
  }
  .dpg-ghost-overlay-animate {
    animation: dpg-overlay-fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
  }
  .dpg-active-progress-circle {
    animation: dpg-circle-fill-2s 2s linear forwards !important;
    transform-origin: center !important;
  }
  .dpg-progress-ring-circle {
    stroke: #c084fc !important;
    stroke-width: 5 !important;
    fill: none !important;
    stroke-linecap: round !important;
    stroke-dasharray: 251.32 !important;
    stroke-dashoffset: 251.32 !important;
    animation: dpg-circle-fill-2s 2s linear forwards !important;
  }
`;

/**
 * Injeksi style animasi global Downplaygram ke DOM
 */
export function injectGlobalAnimations(): void {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  if (typeof document.getElementById === 'function' && document.getElementById('downplaygram-anim-styles')) return;

  const style = document.createElement('style');
  style.id = 'downplaygram-anim-styles';
  style.textContent = GLOBAL_ANIMATION_CSS;
  const target = document.head || document.documentElement || document.body;
  if (target && typeof target.appendChild === 'function') {
    target.appendChild(style);
  }
}

// Pastikan animasi global diinjeksi secara mandiri saat file dimuat di browser
if (typeof document !== 'undefined') {
  try {
    injectGlobalAnimations();
  } catch (_) {
    // Ignore in non-browser/restricted contexts
  }
}

/**
 * Ring Progress SVG 2 Detik Beresolusi Presisi dengan Fallback Inline Attributes
 * Radius 40 (Keliling = 2 * PI * 40 = 251.32) pas di dalam canvas 100x100 tanpa terpotong
 */
export function renderStoryProgressRing(): string {
  injectGlobalAnimations();
  return `
    <svg 
      viewBox="0 0 100 100" 
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; transform: rotate(-90deg); pointer-events: none; overflow: visible; display: block;"
    >
      <!-- Track Latar Belakang (Transparan Samar) -->
      <circle 
        cx="50" 
        cy="50" 
        r="40" 
        fill="none" 
        stroke="rgba(255, 255, 255, 0.2)" 
        stroke-width="4.5"
      />
      <!-- Garis Progres Ungu Neon Berjalan (2 Detik) -->
      <circle 
        cx="50" 
        cy="50" 
        r="40" 
        fill="none" 
        stroke="#c084fc" 
        stroke-width="5" 
        stroke-linecap="round"
        stroke-dasharray="251.32" 
        stroke-dashoffset="251.32" 
        class="dpg-active-progress-circle"
        style="filter: drop-shadow(0 0 3px rgba(192, 132, 252, 0.8));"
      />
    </svg>
  `;
}

// 1. Loading Spinner Interaktif (Circular Arc 360° rotation)
export function iconSpinner(size = 18, color = 'currentColor'): string {
  injectGlobalAnimations();
  return `<svg class="dpg-spinner" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="${color}" stroke-width="2.5" stroke-opacity="0.25" /><path d="M12 3a9 9 0 0 1 9 9" stroke="${color}" stroke-width="2.5" stroke-linecap="round" /></svg>`;
}

// 2. Success Checkmark Pop (Spring Bounce Pop-In)
export function iconSuccess(size = 18, color = '#22c55e'): string {
  injectGlobalAnimations();
  return `<svg class="dpg-pop-in" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
}

// 3. Error Cross Shake (Subtle Horizontal Shake)
export function iconError(size = 18, color = '#ef4444'): string {
  injectGlobalAnimations();
  return `<svg class="dpg-error-shake" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
}

// 4. Refresh Arrow (Circular Rotating Arrows)
export function iconRefresh(size = 16, color = 'currentColor'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19"/></svg>`;
}

// 5. Close (X)
export function iconClose(size = 18, color = 'currentColor'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
}

// 6. Navigation Chevrons
export function iconChevronLeft(size = 20, color = '#ffffff'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
}

export function iconChevronRight(size = 20, color = '#ffffff'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
}

// 7. Ghost Engine Emblem
export function iconGhost(size = 16, color = 'currentColor'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-2 3 2 2-2 2 2 3-2 3 2V10a8 8 0 0 0-8-8z"/></svg>`;
}

// 8. Error State Icons (Hero / Modal)
export function iconLock(size = 36, color = '#f59e0b'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
}

export function iconInbox(size = 36, color = '#94a3b8'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>`;
}

export function iconSearchOff(size = 36, color = '#ef4444'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="8" x2="14" y2="14"></line></svg>`;
}

export function iconKey(size = 36, color = '#ec4899'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L14 9a5 5 0 1 0 3 3l5-5-2-2 1.5-1.5z"></path></svg>`;
}

export function iconAlertCircle(size = 36, color = '#f59e0b'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
}

/**
 * Canonical Download Icon (24x24 Clean Path)
 */
export function iconDownload(size = 24, color = 'currentColor'): string {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; flex-shrink: 0;">
      <path d="M18.22 20.75H5.78C5.43322 20.7359 5.09262 20.6535 4.77771 20.5075C4.4628 20.3616 4.17975 20.155 3.94476 19.8996C3.70977 19.6442 3.52745 19.3449 3.40824 19.019C3.28903 18.693 3.23525 18.3468 3.25 18V15C3.25 14.8011 3.32902 14.6103 3.46967 14.4697C3.61033 14.329 3.80109 14.25 4 14.25C4.19892 14.25 4.38968 14.329 4.53033 14.4697C4.67099 14.6103 4.75 14.8011 4.75 15V18C4.72419 18.2969 4.81365 18.5924 4.99984 18.8251C5.18602 19.0579 5.45465 19.21 5.75 19.25H18.22C18.5154 19.21 18.784 19.0579 18.9702 18.8251C19.1564 18.5924 19.2458 18.2969 19.22 18V15C19.22 14.8011 19.299 14.6103 19.4397 14.4697C19.5803 14.329 19.7711 14.25 19.97 14.25C20.1689 14.25 20.3597 14.329 20.5003 14.4697C20.641 14.6103 20.72 14.8011 20.72 15V18C20.75 18.6954 20.5041 19.3744 20.0359 19.8894C19.5677 20.4045 18.9151 20.7137 18.22 20.75Z" fill="${color}"/>
      <path d="M12 15.75C11.9015 15.7504 11.8038 15.7312 11.7128 15.6934C11.6218 15.6557 11.5392 15.6001 11.47 15.53L7.47 11.53C7.33752 11.3878 7.2654 11.1997 7.26882 11.0054C7.27225 10.8111 7.35096 10.6258 7.48838 10.4883C7.62579 10.3509 7.81118 10.2722 8.00548 10.2688C8.19978 10.2654 8.38782 10.3375 8.53 10.47L12 13.94L15.47 10.47C15.6122 10.3375 15.8002 10.2654 15.9945 10.2688C16.1888 10.2722 16.3742 10.3509 16.5116 10.4883C16.649 10.6258 16.7277 10.8111 16.7312 11.0054C16.7346 11.1997 16.6625 11.3878 16.53 11.53L12.53 15.53C12.4608 15.6001 12.3782 15.6557 12.2872 15.6934C12.1962 15.7312 12.0985 15.7504 12 15.75Z" fill="${color}"/>
      <path d="M12 15.75C11.8019 15.7474 11.6126 15.6676 11.4725 15.5275C11.3324 15.3874 11.2526 15.1981 11.25 15V4C11.25 3.80109 11.329 3.61032 11.4697 3.46967C11.6103 3.32902 11.8011 3.25 12 3.25C12.1989 3.25 12.3897 3.32902 12.5303 3.46967C12.671 3.61032 12.75 3.80109 12.75 4V15C12.7474 15.1981 12.6676 15.3874 12.5275 15.5275C12.3874 15.6676 12.1981 15.7474 12 15.75Z" fill="${color}"/>
    </svg>
  `;
}

// Alias agar kompatibel dengan pemanggilan kode yang sudah ada
export const iconSingleDownload = iconDownload;
export const iconMultiDownload = iconDownload;

/**
 * Icon Eye-Low-Vision (Anonymous Indicator)
 */
export function iconEyeLowVision(size = 22, color = '#ffffff'): string {
  injectGlobalAnimations();
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="${color}" xmlns="http://www.w3.org/2000/svg" style="display: block; flex-shrink: 0;">
      <path d="M24.372 22.603c2.513-1.651 4.675-3.561 6.535-5.738l0.035-0.042c0.192-0.219 0.309-0.507 0.309-0.823s-0.117-0.604-0.31-0.825l0.001 0.001c-6.911-7.893-13.98-10.246-21.028-7.032l-7.029-7.029c-0.226-0.225-0.537-0.363-0.881-0.363-0.69 0-1.25 0.56-1.25 1.25 0 0.344 0.139 0.655 0.363 0.881l27.999 28.001c0.226 0.226 0.539 0.366 0.884 0.366 0.691 0 1.251-0.56 1.251-1.251 0-0.345-0.14-0.658-0.366-0.884l0 0zM28.318 16c-1.661 1.843-3.558 3.428-5.653 4.721l-0.111 0.064-2.076-2.076c0.482-0.771 0.768-1.706 0.771-2.709v-0.001c-0.004-2.898-2.352-5.246-5.25-5.25h-0c-1.003 0.003-1.939 0.29-2.732 0.785l0.022-0.013-1.467-1.467c5.474-2.061 10.894-0.115 16.496 5.945zM15.18 13.412c0.242-0.091 0.522-0.149 0.814-0.162l0.005-0c0.029-0.001 0.063-0.002 0.097-0.002 1.466 0 2.655 1.189 2.655 2.655 0 0.329-0.060 0.644-0.169 0.935l0.006-0.018zM2.884 9.115c-0.226-0.226-0.539-0.366-0.884-0.366-0.69 0-1.25 0.56-1.25 1.25 0 0.345 0.14 0.658 0.366 0.884l19.999 20.002c0.226 0.226 0.539 0.366 0.884 0.366 0.691 0 1.251-0.56 1.251-1.251 0-0.345-0.14-0.658-0.366-0.884l0 0zM3.052 17.284c-0.226-0.224-0.537-0.363-0.881-0.363-0.69 0-1.25 0.56-1.25 1.25 0 0.344 0.139 0.656 0.364 0.882l11.832 11.832c0.226 0.226 0.539 0.366 0.884 0.366 0.691 0 1.251-0.56 1.251-1.251 0-0.346-0.14-0.658-0.367-0.885v0z"/>
    </svg>
  `;
}
