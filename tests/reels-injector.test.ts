import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { injectReelsButtons } from '../src/content/injectors/reels';

describe('Reels Injector', () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;

  beforeEach(() => {
    (globalThis as any).window = {
      location: {
        pathname: '/reels/C9xyz123_abc/',
      },
    };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
  });

  it('does not inject if not on a /reel route', () => {
    (globalThis as any).window.location.pathname = '/';

    let querySelectorAllCalled = false;
    (globalThis as any).document = {
      querySelectorAll: () => {
        querySelectorAllCalled = true;
        return [];
      },
    };

    injectReelsButtons();
    expect(querySelectorAllCalled).toBe(false);
  });

  it('injects download button directly above the Like button action container', () => {
    // Construct DOM structure: columnContainer -> actionItemContainer -> likeBtnWrapper -> likeSvg
    const children: any[] = [];

    const columnContainer: any = {
      querySelector: (selector: string) => {
        return children.find((c) => c.className?.includes(selector.replace('.', ''))) || null;
      },
      children,
    };

    const actionItemContainer: any = {
      parentElement: columnContainer,
      insertAdjacentElement: (position: string, element: any) => {
        if (position === 'beforebegin') {
          children.unshift(element);
        }
      },
    };

    const likeBtnWrapper: any = {
      parentElement: actionItemContainer,
    };

    const likeSvg: any = {
      getAttribute: (attr: string) => (attr === 'aria-label' ? 'Like' : null),
      closest: (sel: string) => {
        if (sel.includes('button')) return likeBtnWrapper;
        return null;
      },
    };

    (globalThis as any).document = {
      querySelectorAll: (sel: string) => {
        if (sel === 'svg') return [likeSvg];
        return [];
      },
      createElement: (tag: string) => {
        const el: any = {
          tagName: tag.toUpperCase(),
          style: {},
          setAttribute: (k: string, v: string) => { el[k] = v; },
          getAttribute: (k: string) => el[k] || null,
          appendChild: (child: any) => {
            el.children = el.children || [];
            el.children.push(child);
          },
          addEventListener: () => {},
        };
        return el;
      },
    };

    injectReelsButtons();

    expect(children.length).toBe(1);
    const injected = children[0];
    expect(injected.className).toContain('downplaygram-reel-dl-btn');
    expect(injected.children[0].title).toBe('Unduh Reel Ini (Downplaygram)');
  });

  it('supports Indonesian "Suka" aria-label', () => {
    const children: any[] = [];

    const columnContainer: any = {
      querySelector: (selector: string) => {
        return children.find((c) => c.className?.includes(selector.replace('.', ''))) || null;
      },
      children,
    };

    const actionItemContainer: any = {
      parentElement: columnContainer,
      insertAdjacentElement: (position: string, element: any) => {
        if (position === 'beforebegin') {
          children.unshift(element);
        }
      },
    };

    const likeBtnWrapper: any = {
      parentElement: actionItemContainer,
    };

    const sukaSvg: any = {
      getAttribute: (attr: string) => (attr === 'aria-label' ? 'Suka' : null),
      closest: (sel: string) => {
        if (sel.includes('button')) return likeBtnWrapper;
        return null;
      },
    };

    (globalThis as any).document = {
      querySelectorAll: (sel: string) => {
        if (sel === 'svg') return [sukaSvg];
        return [];
      },
      createElement: (tag: string) => ({
        style: {},
        setAttribute: () => {},
        appendChild: () => {},
        addEventListener: () => {},
      }),
    };

    injectReelsButtons();
    expect(children.length).toBe(1);
  });

  it('prevents duplicate injection in the same column container', () => {
    const children: any[] = [{ className: 'downplaygram-reel-dl-btn' }];

    const columnContainer: any = {
      querySelector: (selector: string) => {
        if (selector.includes('downplaygram-reel-dl-btn')) return children[0];
        return null;
      },
      children,
    };

    const actionItemContainer: any = {
      parentElement: columnContainer,
      insertAdjacentElement: () => {
        throw new Error('Should not be called');
      },
    };

    const likeBtnWrapper: any = {
      parentElement: actionItemContainer,
    };

    const likeSvg: any = {
      getAttribute: (attr: string) => (attr === 'aria-label' ? 'Like' : null),
      closest: (sel: string) => {
        if (sel.includes('button')) return likeBtnWrapper;
        return null;
      },
    };

    (globalThis as any).document = {
      querySelectorAll: (sel: string) => {
        if (sel === 'svg') return [likeSvg];
        return [];
      },
    };

    injectReelsButtons();
    // Length remains 1 because duplicate was prevented
    expect(children.length).toBe(1);
  });
});
