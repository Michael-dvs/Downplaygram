import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  extractUsernameFromStoryButton,
  setupStoryTrayHoverListeners,
} from '../src/content/injectors/story-tray';
import * as injectorLightbox from '../src/content/injectors/lightbox';
import * as lightboxModule from '../src/content/ghost-hub/lightbox';

class MockElement {
  public tagName: string;
  public attributes: Record<string, string> = {};
  public style: Record<string, string> = {};
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public textContent: string = '';
  public innerHTML: string = '';
  public listeners: Record<string, Function[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get className(): string {
    return this.attributes['class'] || '';
  }

  set className(val: string) {
    this.attributes['class'] = val;
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] || null;
  }

  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  matches(sel: string): boolean {
    if (sel.includes('a[href*="/stories/"]') && this.tagName === 'A' && this.attributes['href']?.includes('/stories/')) {
      return true;
    }
    return false;
  }

  querySelector(sel: string): MockElement | null {
    for (const child of this.children) {
      if (sel.includes('img') && child.tagName === 'IMG') return child;
      if (sel.includes('canvas') && child.tagName === 'CANVAS') return child;
      if (sel.includes('a[href*="/stories/highlights/"]') && child.tagName === 'A' && child.attributes['href']?.includes('/stories/highlights/')) return child;
      if (sel.includes('a[href*="/stories/"]') && child.tagName === 'A' && child.attributes['href']?.includes('/stories/')) return child;
      if (sel.includes('#dpg-progress-circle') && child.attributes['id'] === 'dpg-progress-circle') return child;
      if (sel.includes('.downplaygram-hover-ghost-overlay') && child.className.includes('downplaygram-hover-ghost-overlay')) return child;
      if (sel.includes('div[dir="auto"]') && child.attributes['dir'] === 'auto') return child;
      const found = child.querySelector(sel);
      if (found) return found;
    }
    return null;
  }

  boundingClientRect: { width: number; height: number } = { width: 64, height: 64 };

  getBoundingClientRect() {
    return this.boundingClientRect;
  }

  closest(sel: string): MockElement | null {
    let curr: MockElement | null = this;
    while (curr) {
      if (sel === 'header' && curr.tagName === 'HEADER') return curr;
      if (sel === 'article' && curr.tagName === 'ARTICLE') return curr;
      if (sel.includes('main') && curr.tagName === 'MAIN') return curr;
      if (sel.includes('a[href*="/stories/highlights/"]') && curr.tagName === 'A' && curr.attributes['href']?.includes('/stories/highlights/')) return curr;
      if (sel.includes('[data-testid="user-avatar"]') && curr.attributes['data-testid'] === 'user-avatar') return curr;
      if (sel.includes('div[role="menu"]') && curr.attributes['role'] === 'menu') return curr;
      if (sel.includes('div[role="button"]') && curr.attributes['role'] === 'button') return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  addEventListener(event: string, fn: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event: string, customEvt?: any) {
    const evt = customEvt || {
      preventDefault: () => {},
      stopPropagation: () => {},
    };
    if (this.listeners[event]) {
      this.listeners[event].forEach((fn) => fn(evt));
    }
  }
}

describe('story-tray - 2-Second Long-Hover Anonymous Story Trigger', () => {
  let mockBody: MockElement;
  let candidateQueryResults: MockElement[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    mockBody = new MockElement('BODY');
    candidateQueryResults = [];

    vi.stubGlobal('window', {
      location: {
        pathname: '/',
        href: 'https://www.instagram.com/',
      },
    });

    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => cb());

    vi.stubGlobal('document', {
      body: mockBody,
      createElement: (tag: string) => new MockElement(tag),
      getElementById: (id: string) => null,
      querySelectorAll: (sel: string) => {
        if (sel.includes('.downplaygram-hover-ghost-overlay')) {
          return [];
        }
        return candidateQueryResults;
      },
      querySelector: (sel: string) => mockBody.querySelector(sel),
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('extractUsernameFromStoryButton', () => {
    it('extracts username from aria-label with "Story by [username]"', () => {
      const btn = new MockElement('DIV');
      btn.setAttribute('aria-label', 'Story by realmadrid, 5 hours ago');
      expect(extractUsernameFromStoryButton(btn as any)).toBe('realmadrid');
    });

    it('extracts username from aria-label with "Cerita oleh [username]" (Indonesian)', () => {
      const btn = new MockElement('DIV');
      btn.setAttribute('aria-label', 'Cerita oleh satudua, 3 jam lalu');
      expect(extractUsernameFromStoryButton(btn as any)).toBe('satudua');
    });

    it('rejects "Your story" or "Cerita Anda" in aria-label', () => {
      const btn1 = new MockElement('DIV');
      btn1.setAttribute('aria-label', 'Story by Your story');
      expect(extractUsernameFromStoryButton(btn1 as any)).toBeNull();

      const btn2 = new MockElement('DIV');
      btn2.setAttribute('aria-label', 'Cerita oleh Cerita Anda');
      expect(extractUsernameFromStoryButton(btn2 as any)).toBeNull();
    });

    it('extracts username from image alt attribute', () => {
      const btn = new MockElement('DIV');
      const img = new MockElement('IMG');
      img.setAttribute('alt', "cristiano's profile picture");
      btn.appendChild(img);
      expect(extractUsernameFromStoryButton(btn as any)).toBe('cristiano');

      const btn2 = new MockElement('DIV');
      const img2 = new MockElement('IMG');
      img2.setAttribute('alt', 'Foto profil leomessi');
      btn2.appendChild(img2);
      expect(extractUsernameFromStoryButton(btn2 as any)).toBe('leomessi');
    });

    it('extracts username from anchor link /stories/{username}/', () => {
      const btn = new MockElement('DIV');
      const link = new MockElement('A');
      link.setAttribute('href', '/stories/aurramrsy/');
      btn.appendChild(link);
      expect(extractUsernameFromStoryButton(btn as any)).toBe('aurramrsy');
    });

    it('extracts username from sibling text label', () => {
      const container = new MockElement('DIV');
      const btn = new MockElement('DIV');
      const label = new MockElement('DIV');
      label.setAttribute('dir', 'auto');
      label.textContent = 'photographer_daily';
      container.appendChild(btn);
      container.appendChild(label);
      expect(extractUsernameFromStoryButton(btn as any)).toBe('photographer_daily');
    });

    it('extracts username on profile header avatar', () => {
      (window as any).location.pathname = '/johndoe/';
      const header = new MockElement('HEADER');
      const btn = new MockElement('DIV');
      btn.setAttribute('role', 'button');
      header.appendChild(btn);
      mockBody.appendChild(header);

      expect(extractUsernameFromStoryButton(btn as any)).toBe('johndoe');
    });
  });

  describe('setupStoryTrayHoverListeners - 2s countdown & trigger', () => {
    it('ignores execution when on excluded routes (e.g. /explore/)', () => {
      (window as any).location.pathname = '/explore/';
      const btn = new MockElement('DIV');
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', 'Story by alex');
      candidateQueryResults = [btn];

      setupStoryTrayHoverListeners();
      expect(btn.getAttribute('data-downplaygram-hover-attached')).toBeNull();
    });

    it('attaches listeners to story tray candidate buttons on home feed', () => {
      const btn = new MockElement('DIV');
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', 'Story by traveler');
      candidateQueryResults = [btn];

      setupStoryTrayHoverListeners();
      expect(btn.getAttribute('data-downplaygram-hover-attached')).toBe('true');
    });

    it('displays countdown overlay on mouseenter and cancels on mouseleave before 2s', () => {
      const btn = new MockElement('DIV');
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', 'Story by traveler');
      candidateQueryResults = [btn];

      setupStoryTrayHoverListeners();

      const openSpy = vi.spyOn(injectorLightbox, 'openAnonymousLightbox').mockImplementation(() => {});

      // Simulate mouseenter
      btn.dispatchEvent('mouseenter');

      const overlay = btn.querySelector('.downplaygram-hover-ghost-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay?.innerHTML).toContain('dpg-active-progress-circle');
      expect(overlay?.innerHTML).toContain('rgba(255, 255, 255, 0.2)');
      expect(overlay?.innerHTML).toContain('#c084fc');
      expect(overlay?.innerHTML).toContain('svg');

      // Fast forward 1 second (less than 2s threshold)
      vi.advanceTimersByTime(1000);
      expect(openSpy).not.toHaveBeenCalled();

      // Simulate mouseleave
      btn.dispatchEvent('mouseleave');

      // Overlay should be removed immediately
      expect(btn.querySelector('.downplaygram-hover-ghost-overlay')).toBeNull();

      // Fast forward another 2 seconds
      vi.advanceTimersByTime(2000);
      expect(openSpy).not.toHaveBeenCalled();

      openSpy.mockRestore();
    });

    it('allows native story viewing on click before 2s: cancels hoverTimeout, removes overlay, and does NOT trigger anonymous lightbox', () => {
      const btn = new MockElement('DIV');
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', 'Story by alex_travel');
      candidateQueryResults = [btn];

      setupStoryTrayHoverListeners();

      const openSpy = vi.spyOn(injectorLightbox, 'openAnonymousLightbox').mockImplementation(() => {});

      // Simulate mouseenter
      btn.dispatchEvent('mouseenter');
      const overlay = btn.querySelector('.downplaygram-hover-ghost-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay?.style.cssText).toContain('pointer-events: none !important');

      // Advance by 500ms (before 2s)
      vi.advanceTimersByTime(500);
      expect(openSpy).not.toHaveBeenCalled();

      // Click on native button before 2s
      btn.dispatchEvent('click');

      // Overlay should be cleaned up immediately
      expect(btn.querySelector('.downplaygram-hover-ghost-overlay')).toBeNull();
      expect(openSpy).not.toHaveBeenCalled();

      // Ensure timer was cancelled and no lightbox opens even after 2s
      vi.advanceTimersByTime(2000);
      expect(openSpy).not.toHaveBeenCalled();

      openSpy.mockRestore();
    });

    it('triggers openAnonymousLightbox after full 2.0s hover', () => {
      const btn = new MockElement('DIV');
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', 'Story by unvisionable_');
      candidateQueryResults = [btn];

      setupStoryTrayHoverListeners();

      const openSpy = vi.spyOn(injectorLightbox, 'openAnonymousLightbox').mockImplementation(() => {});

      // Simulate mouseenter
      btn.dispatchEvent('mouseenter');
      expect(btn.querySelector('.downplaygram-hover-ghost-overlay')).not.toBeNull();

      // Advance by 2000ms
      vi.advanceTimersByTime(2000);

      expect(openSpy).toHaveBeenCalledWith('unvisionable_');
      expect(btn.querySelector('.downplaygram-hover-ghost-overlay')).toBeNull();

      openSpy.mockRestore();
    });

    it('Firewall 1: ignores candidate buttons located inside a feed article (<article>)', () => {
      const article = new MockElement('ARTICLE');
      const btn = new MockElement('DIV');
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', 'Story by 433, 2 hours ago');
      article.appendChild(btn);
      candidateQueryResults = [btn];

      setupStoryTrayHoverListeners();

      // Listener attribute must NOT be set
      expect(btn.getAttribute('data-downplaygram-hover-attached')).toBeNull();

      // Mouseenter should not create an overlay
      btn.dispatchEvent('mouseenter');
      expect(btn.querySelector('.downplaygram-hover-ghost-overlay')).toBeNull();
    });

    it('Firewall 2: ignores buttons that exceed or fall below avatar dimensions (35px - 110px)', () => {
      // 1. Oversized button (e.g. 150x150 feed post container)
      const oversizedBtn = new MockElement('DIV');
      oversizedBtn.setAttribute('role', 'button');
      oversizedBtn.setAttribute('aria-label', 'Story by realmadrid');
      oversizedBtn.boundingClientRect = { width: 150, height: 150 };

      // 2. Undersized button (e.g. 20x20 small badge)
      const undersizedBtn = new MockElement('DIV');
      undersizedBtn.setAttribute('role', 'button');
      undersizedBtn.setAttribute('aria-label', 'Story by barcelona');
      undersizedBtn.boundingClientRect = { width: 20, height: 20 };

      // 3. Normal avatar button (e.g. 64x64 story tray)
      const normalBtn = new MockElement('DIV');
      normalBtn.setAttribute('role', 'button');
      normalBtn.setAttribute('aria-label', 'Story by juventus');
      normalBtn.boundingClientRect = { width: 64, height: 64 };

      candidateQueryResults = [oversizedBtn, undersizedBtn, normalBtn];

      setupStoryTrayHoverListeners();

      expect(oversizedBtn.getAttribute('data-downplaygram-hover-attached')).toBeNull();
      expect(undersizedBtn.getAttribute('data-downplaygram-hover-attached')).toBeNull();
      expect(normalBtn.getAttribute('data-downplaygram-hover-attached')).toBe('true');
    });

    it('Firewall 1: rejects execution and cleans up overlays on profile pages (e.g. /brewberriess/)', () => {
      (window as any).location.pathname = '/brewberriess/';
      const btn = new MockElement('DIV');
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', 'Story by brewberriess');
      candidateQueryResults = [btn];

      setupStoryTrayHoverListeners();

      expect(btn.getAttribute('data-downplaygram-hover-attached')).toBeNull();
    });

    it('Firewall 3: rejects elements associated with Highlights', () => {
      // 1. Inside /stories/highlights/ link
      const highlightAnchor = new MockElement('A');
      highlightAnchor.setAttribute('href', '/stories/highlights/1789456123/');
      const highlightBtn1 = new MockElement('DIV');
      highlightBtn1.setAttribute('role', 'button');
      highlightBtn1.setAttribute('aria-label', 'Story by traveler');
      highlightAnchor.appendChild(highlightBtn1);

      // 2. Contains /stories/highlights/ link
      const highlightBtn2 = new MockElement('DIV');
      highlightBtn2.setAttribute('role', 'button');
      highlightBtn2.setAttribute('aria-label', 'Story by traveler');
      const innerAnchor = new MockElement('A');
      innerAnchor.setAttribute('href', '/stories/highlights/987654321/');
      highlightBtn2.appendChild(innerAnchor);

      // 3. aria-label contains 'highlight'
      const highlightBtn3 = new MockElement('DIV');
      highlightBtn3.setAttribute('role', 'button');
      highlightBtn3.setAttribute('aria-label', 'Highlight by traveler, Trip to Bali');

      // 4. In header without [data-testid="user-avatar"]
      const header = new MockElement('HEADER');
      const highlightBtn4 = new MockElement('DIV');
      highlightBtn4.setAttribute('role', 'button');
      highlightBtn4.setAttribute('aria-label', 'Story by traveler');
      header.appendChild(highlightBtn4);

      candidateQueryResults = [highlightBtn1, highlightBtn2, highlightBtn3, highlightBtn4];

      setupStoryTrayHoverListeners();

      expect(highlightBtn1.getAttribute('data-downplaygram-hover-attached')).toBeNull();
      expect(highlightBtn2.getAttribute('data-downplaygram-hover-attached')).toBeNull();
      expect(highlightBtn3.getAttribute('data-downplaygram-hover-attached')).toBeNull();
      expect(highlightBtn4.getAttribute('data-downplaygram-hover-attached')).toBeNull();
    });
  });
});
