import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  injectGlobalAnimations,
  iconSpinner,
  iconSuccess,
  iconError,
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
  iconSingleDownload,
  iconMultiDownload,
  iconEyeLowVision,
  renderStoryProgressRing,
  GLOBAL_ANIMATION_CSS,
} from '../src/ui/icons';

describe('ui/icons - Design System & Micro-Interactions', () => {
  let mockElements: Record<string, any> = {};
  const origDocument = (globalThis as any).document;

  beforeEach(() => {
    mockElements = {};
    const headChildren: any[] = [];

    (globalThis as any).document = {
      getElementById: (id: string) => mockElements[id] || null,
      querySelectorAll: (sel: string) => {
        if (sel === '#downplaygram-anim-styles') {
          return mockElements['downplaygram-anim-styles'] ? [mockElements['downplaygram-anim-styles']] : [];
        }
        return [];
      },
      createElement: (tag: string) => {
        const el: any = {
          tagName: tag.toUpperCase(),
          id: '',
          textContent: '',
          remove: () => {
            if (el.id && mockElements[el.id]) {
              delete mockElements[el.id];
            }
          },
        };
        return el;
      },
      head: {
        appendChild: (child: any) => {
          headChildren.push(child);
          if (child.id) {
            mockElements[child.id] = child;
          }
          return child;
        },
      },
      documentElement: null,
    };
  });

  afterEach(() => {
    (globalThis as any).document = origDocument;
  });

  it('injects global animation stylesheet into document', () => {
    expect((globalThis as any).document.getElementById('downplaygram-anim-styles')).toBeNull();
    injectGlobalAnimations();
    const el = (globalThis as any).document.getElementById('downplaygram-anim-styles');
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('@keyframes dpg-spin');
    expect(el.textContent).toContain('@keyframes dpg-pop');
    expect(el.textContent).toContain('@keyframes dpg-shake');

    // Idempotent test
    injectGlobalAnimations();
    const count = (globalThis as any).document.querySelectorAll('#downplaygram-anim-styles').length;
    expect(count).toBe(1);
  });

  it('renders interactive loading spinner SVG with dpg-spinner class', () => {
    const svg = iconSpinner(24, '#ffffff');
    expect(svg).toContain('<svg class="dpg-spinner"');
    expect(svg).toContain('width="24"');
    expect(svg).toContain('height="24"');
    expect(svg).toContain('stroke="#ffffff"');
  });

  it('renders success pop-in checkmark SVG with dpg-pop-in class', () => {
    const svg = iconSuccess(20, '#22c55e');
    expect(svg).toContain('<svg class="dpg-pop-in"');
    expect(svg).toContain('width="20"');
    expect(svg).toContain('stroke="#22c55e"');
    expect(svg).toContain('<polyline points="20 6 9 17 4 12"');
  });

  it('renders error cross SVG with dpg-error-shake class', () => {
    const svg = iconError(18, '#ef4444');
    expect(svg).toContain('<svg class="dpg-error-shake"');
    expect(svg).toContain('width="18"');
    expect(svg).toContain('stroke="#ef4444"');
    expect(svg).toContain('<line x1="18" y1="6" x2="6" y2="18"');
  });

  it('renders refresh arrow SVG', () => {
    const svg = iconRefresh(16, '#a1a1aa');
    expect(svg).toContain('<svg width="16" height="16"');
    expect(svg).toContain('stroke="#a1a1aa"');
    expect(svg).toContain('<path');
  });

  it('renders close cross SVG', () => {
    const svg = iconClose(18, '#a1a1aa');
    expect(svg).toContain('<svg width="18" height="18"');
    expect(svg).toContain('stroke="#a1a1aa"');
  });

  it('renders navigation chevrons', () => {
    const left = iconChevronLeft(22, '#ffffff');
    const right = iconChevronRight(22, '#ffffff');
    expect(left).toContain('points="15 18 9 12 15 6"');
    expect(right).toContain('points="9 18 15 12 9 6"');
  });

  it('renders ghost engine emblem', () => {
    const ghost = iconGhost(20, '#a855f7');
    expect(ghost).toContain('<svg width="20" height="20"');
    expect(ghost).toContain('stroke="#a855f7"');
    expect(ghost).toContain('d="M9 10h.01M15 10h.01');
  });

  it('renders modal error state icons', () => {
    expect(iconLock(36, '#f59e0b')).toContain('<rect x="3" y="11"');
    expect(iconInbox(36, '#94a3b8')).toContain('<polyline points="22 12 16 12');
    expect(iconSearchOff(36, '#ef4444')).toContain('<circle cx="11" cy="11"');
    expect(iconKey(36, '#ec4899')).toContain('stroke="#ec4899"');
    expect(iconAlertCircle(36, '#f59e0b')).toContain('<circle cx="12" cy="12" r="10"');
  });

  it('exports GLOBAL_ANIMATION_CSS for shadow DOM usage', () => {
    expect(GLOBAL_ANIMATION_CSS).toContain('@keyframes dpg-spin');
    expect(GLOBAL_ANIMATION_CSS).toContain('.dpg-spinner');
    expect(GLOBAL_ANIMATION_CSS).toContain('.dpg-pop-in');
    expect(GLOBAL_ANIMATION_CSS).toContain('.dpg-error-shake');
    expect(GLOBAL_ANIMATION_CSS).toContain('@keyframes dpg-overlay-fade-in');
    expect(GLOBAL_ANIMATION_CSS).toContain('@keyframes dpg-circle-fill-2s');
    expect(GLOBAL_ANIMATION_CSS).toContain('.dpg-ghost-overlay-animate');
    expect(GLOBAL_ANIMATION_CSS).toContain('.dpg-progress-ring-circle');
    expect(GLOBAL_ANIMATION_CSS).toContain('.dpg-active-progress-circle');
  });

  it('renders renderStoryProgressRing with background track and neon progress circle', () => {
    const ring = renderStoryProgressRing();
    expect(ring).toContain('viewBox="0 0 100 100"');
    expect(ring).toContain('dpg-active-progress-circle');
    expect(ring).toContain('stroke="rgba(255, 255, 255, 0.2)"');
    expect(ring).toContain('stroke="#c084fc"');
    expect(ring).toContain('stroke-dasharray="251.32"');
    expect(ring).toContain('drop-shadow(0 0 3px rgba(192, 132, 252, 0.8))');
  });

  it('renders canonical 24x24 download icon with dynamic color and size', () => {
    const defaultSvg = iconDownload();
    expect(defaultSvg).toContain('width="24"');
    expect(defaultSvg).toContain('height="24"');
    expect(defaultSvg).toContain('viewBox="0 0 24 24"');
    expect(defaultSvg).toContain('fill="currentColor"');
    expect(defaultSvg).toContain('M18.22 20.75H5.78');

    const customSvg = iconDownload(18, '#ffffff');
    expect(customSvg).toContain('width="18"');
    expect(customSvg).toContain('height="18"');
    expect(customSvg).toContain('fill="#ffffff"');
  });

  it('provides iconSingleDownload and iconMultiDownload aliases for backward compatibility', () => {
    expect(iconSingleDownload).toBe(iconDownload);
    expect(iconMultiDownload).toBe(iconDownload);
    expect(iconSingleDownload(16, '#000000')).toContain('width="16"');
    expect(iconSingleDownload(16, '#000000')).toContain('fill="#000000"');
    expect(iconMultiDownload(24, 'currentColor')).toContain('fill="currentColor"');
  });

  it('renders iconEyeLowVision SVG with correct size and fill', () => {
    const defaultSvg = iconEyeLowVision();
    expect(defaultSvg).toContain('width="22"');
    expect(defaultSvg).toContain('height="22"');
    expect(defaultSvg).toContain('viewBox="0 0 32 32"');
    expect(defaultSvg).toContain('fill="#ffffff"');
    expect(defaultSvg).toContain('M24.372 22.603c2.513');

    const customSvg = iconEyeLowVision(24, '#a855f7');
    expect(customSvg).toContain('width="24"');
    expect(customSvg).toContain('fill="#a855f7"');
  });
});
