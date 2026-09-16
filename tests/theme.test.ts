import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SYSTEM_FONT_FAMILY, injectGlobalThemeStyles } from '../src/ui/theme';

describe('ui/theme - Theme Tokens & OS-Native Typography', () => {
  let mockElements: Record<string, any> = {};
  const origDocument = (globalThis as any).document;

  beforeEach(() => {
    mockElements = {};
    const headChildren: any[] = [];

    (globalThis as any).document = {
      getElementById: (id: string) => mockElements[id] || null,
      querySelectorAll: (sel: string) => {
        if (sel === '#downplaygram-theme-styles') {
          return mockElements['downplaygram-theme-styles'] ? [mockElements['downplaygram-theme-styles']] : [];
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

  it('provides OS-native system font family stack prioritizing SF Pro, Segoe UI, and Roboto', () => {
    expect(SYSTEM_FONT_FAMILY).toContain('-apple-system');
    expect(SYSTEM_FONT_FAMILY).toContain('BlinkMacSystemFont');
    expect(SYSTEM_FONT_FAMILY).toContain('"SF Pro"');
    expect(SYSTEM_FONT_FAMILY).toContain('"Segoe UI"');
    expect(SYSTEM_FONT_FAMILY).toContain('Roboto');
  });

  it('injects global theme styles with custom palette and light/dark mode variables', () => {
    expect((globalThis as any).document.getElementById('downplaygram-theme-styles')).toBeNull();

    injectGlobalThemeStyles();

    const el = (globalThis as any).document.getElementById('downplaygram-theme-styles');
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('--dpg-blue: #315B8C;');
    expect(el.textContent).toContain('--dpg-cream: #F5EBDD;');
    expect(el.textContent).toContain('@media (prefers-color-scheme: light)');
    expect(el.textContent).toContain('@media (prefers-color-scheme: dark)');
    expect(el.textContent).toContain('html[class*="dark"], body[class*="dark"]');
    expect(el.textContent).toContain('--dpg-ring-progress: #315B8C;');
    expect(el.textContent).toContain('--dpg-ring-progress: #5b8ec7;');

    // Idempotent test: should not duplicate
    injectGlobalThemeStyles();
    expect((globalThis as any).document.querySelectorAll('#downplaygram-theme-styles').length).toBe(1);
  });
});
