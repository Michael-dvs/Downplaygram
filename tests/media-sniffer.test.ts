import { describe, it, expect } from 'vitest';
import {
  isDashChunk,
  extractHighestResFromSrcset,
  type SniffedMedia,
} from '../src/lib/media-sniffer';

describe('media-sniffer', () => {
  describe('isDashChunk', () => {
    it('detects DASH initialization and fragment chunks', () => {
      expect(isDashChunk('https://instagram.fsnc1-1.fna.fbcdn.net/v/t50.2886-16/1234_video_dashinit.mp4')).toBe(true);
      expect(isDashChunk('https://instagram.fsnc1-1.fna.fbcdn.net/v/t50.2886-16/5678_audio_dashinit.mp4')).toBe(true);
      expect(isDashChunk('https://instagram.fsnc1-1.fna.fbcdn.net/v/t50.2886-16/9999_dashinit.mp4')).toBe(true);
      expect(isDashChunk('https://instagram.fsnc1-1.fna.fbcdn.net/manifest.mpd')).toBe(true);
      expect(isDashChunk('https://instagram.fsnc1-1.fna.fbcdn.net/dash-segment-1.m4s')).toBe(true);
    });

    it('identifies valid progressive MP4 streams', () => {
      expect(isDashChunk('https://instagram.fsnc1-1.fna.fbcdn.net/v/t50.2886-16/10000000_123456789_n.mp4?_nc_ht=...')).toBe(false);
      expect(isDashChunk('https://scontent.cdninstagram.com/o1/v/t16/f1/m84/reel_video.mp4')).toBe(false);
    });

    it('handles empty or undefined url', () => {
      expect(isDashChunk('')).toBe(false);
    });
  });

  describe('extractHighestResFromSrcset', () => {
    it('extracts candidate with highest width resolution', () => {
      const srcset = `
        https://instagram.com/p1_320.jpg 320w,
        https://instagram.com/p1_1080.jpg 1080w,
        https://instagram.com/p1_640.jpg 640w,
        https://instagram.com/p1_750.jpg 750w
      `;

      expect(extractHighestResFromSrcset(srcset)).toBe('https://instagram.com/p1_1080.jpg');
    });

    it('returns first URL if no width descriptors provided', () => {
      const srcset = 'https://instagram.com/single.jpg';
      expect(extractHighestResFromSrcset(srcset)).toBe('https://instagram.com/single.jpg');
    });

    it('returns null for empty string', () => {
      expect(extractHighestResFromSrcset('')).toBe(null);
    });
  });

  describe('SniffedMedia type definitions', () => {
    it('supports photo_with_music, photo, and video types', () => {
      const media1: SniffedMedia = {
        type: 'photo_with_music',
        url: 'https://instagram.com/photo.jpg',
        audioUrl: 'https://instagram.com/audio.mp4',
        username: 'user123',
      };
      expect(media1.type).toBe('photo_with_music');
      expect(media1.audioUrl).toBeDefined();

      const media2: SniffedMedia = {
        type: 'photo',
        url: 'https://instagram.com/photo.jpg',
        username: 'user123',
      };
      expect(media2.type).toBe('photo');
      expect(media2.audioUrl).toBeUndefined();

      const media3: SniffedMedia = {
        type: 'video',
        url: 'https://instagram.com/video.mp4',
        username: 'user123',
      };
      expect(media3.type).toBe('video');
    });
  });

  describe('storyMediaCache & extractCurrentStoryMedia', () => {
    it('stores and retrieves intercepted progressive MP4 by media ID', async () => {
      const { storyMediaCache } = await import('../src/lib/media-cache');
      const { extractCurrentStoryMedia } = await import('../src/lib/media-sniffer');

      storyMediaCache.set('3000000001', {
        url: 'https://cdn.instagram.com/v/t50.2886-16/full_prog_video.mp4',
        ext: 'mp4',
        username: 'mchlancholy',
      });

      const previousWindow = (globalThis as any).window;
      (globalThis as any).window = {
        location: {
          pathname: '/stories/mchlancholy/3000000001/',
        },
      };

      const result = await extractCurrentStoryMedia();
      expect(result).not.toBeNull();
      expect(result?.url).toBe('https://cdn.instagram.com/v/t50.2886-16/full_prog_video.mp4');
      expect(result?.ext).toBe('mp4');
      expect(result?.username).toBe('mchlancholy');

      (globalThis as any).window = previousWindow;
    });

    it('retrieves media by username if media ID is not in URL', async () => {
      const { storyMediaCache } = await import('../src/lib/media-cache');
      const { extractCurrentStoryMedia } = await import('../src/lib/media-sniffer');

      storyMediaCache.set('3000000002', {
        url: 'https://cdn.instagram.com/v/t50.2886-16/another_story.mp4',
        ext: 'mp4',
        username: 'special_creator',
      });

      const previousWindow = (globalThis as any).window;
      (globalThis as any).window = {
        location: {
          pathname: '/stories/special_creator/',
        },
      };

      const result = await extractCurrentStoryMedia();
      expect(result).not.toBeNull();
      expect(result?.username).toBe('special_creator');
      expect(result?.ext).toBe('mp4');

      (globalThis as any).window = previousWindow;
    });

    it('extracts Reel progressive MP4 matching shortcode in cache', async () => {
      const { storyMediaCache } = await import('../src/lib/media-cache');
      const { extractCurrentReelMedia } = await import('../src/lib/media-sniffer');

      const shortcode = 'DdNHEWYtanC';
      storyMediaCache.set(shortcode, {
        url: 'https://cdn.instagram.com/v/t50.2886-16/reel_audio_video_full.mp4',
        ext: 'mp4',
        username: 'mchlancholy',
        shortcode,
      });

      const previousWindow = (globalThis as any).window;
      (globalThis as any).window = {
        location: {
          pathname: `/reels/${shortcode}/`,
        },
      };

      const result = await extractCurrentReelMedia();
      expect(result).not.toBeNull();
      expect(result?.url).toBe('https://cdn.instagram.com/v/t50.2886-16/reel_audio_video_full.mp4');
      expect(result?.ext).toBe('mp4');
      expect(result?.username).toBe('mchlancholy');

      (globalThis as any).window = previousWindow;
    });
  });

  describe('extractShortcodeFromPostElement', () => {
    it('extracts shortcode from /p/{shortcode}/ link inside article', async () => {
      const { extractShortcodeFromPostElement } = await import('../src/lib/media-sniffer');

      const mockArticle = {
        querySelectorAll: (selector: string) => {
          if (selector.includes('/p/')) {
            return [
              {
                getAttribute: (attr: string) => (attr === 'href' ? '/p/C9xyz123_abc/' : null),
              },
            ];
          }
          return [];
        },
      } as unknown as HTMLElement;

      const shortcode = extractShortcodeFromPostElement(mockArticle);
      expect(shortcode).toBe('C9xyz123_abc');
    });

    it('extracts shortcode from /reel/{shortcode}/ link inside article', async () => {
      const { extractShortcodeFromPostElement } = await import('../src/lib/media-sniffer');

      const mockArticle = {
        querySelectorAll: (selector: string) => {
          if (selector.includes('/reel/')) {
            return [
              {
                getAttribute: (attr: string) => (attr === 'href' ? '/reel/DdNHEWYtanC/' : null),
              },
            ];
          }
          return [];
        },
      } as unknown as HTMLElement;

      const shortcode = extractShortcodeFromPostElement(mockArticle);
      expect(shortcode).toBe('DdNHEWYtanC');
    });

    it('fallbacks to window.location.pathname if no permalink in article', async () => {
      const { extractShortcodeFromPostElement } = await import('../src/lib/media-sniffer');

      const mockArticle = {
        querySelectorAll: () => [],
      } as unknown as HTMLElement;

      const previousWindow = (globalThis as any).window;
      (globalThis as any).window = {
        location: {
          pathname: '/p/FALLBACK_CODE123/',
        },
      };

      const shortcode = extractShortcodeFromPostElement(mockArticle);
      expect(shortcode).toBe('FALLBACK_CODE123');

      (globalThis as any).window = previousWindow;
    });

    it('returns null if neither post nor URL has a valid shortcode', async () => {
      const { extractShortcodeFromPostElement } = await import('../src/lib/media-sniffer');

      const mockArticle = {
        querySelectorAll: () => [],
      } as unknown as HTMLElement;

      const previousWindow = (globalThis as any).window;
      (globalThis as any).window = {
        location: {
          pathname: '/',
        },
      };

      const shortcode = extractShortcodeFromPostElement(mockArticle);
      expect(shortcode).toBeNull();

      (globalThis as any).window = previousWindow;
    });
  });

  describe('extractFeedMedia', () => {
    it('prioritizes progressive MP4 from storyMediaCache via shortcode', async () => {
      const { storyMediaCache } = await import('../src/lib/media-cache');
      const { extractFeedMedia } = await import('../src/lib/media-sniffer');

      const code = 'FEED_TEST_CODE_01';
      storyMediaCache.set(code, {
        url: 'https://cdn.instagram.com/v/t50.2886-16/cached_feed_video.mp4',
        ext: 'mp4',
        username: 'videomaker',
        shortcode: code,
      });

      const mockArticle = {
        querySelector: (sel: string) => {
          if (sel.includes('header a')) {
            return { textContent: 'videomaker' };
          }
          return null;
        },
        querySelectorAll: (sel: string) => {
          if (sel.includes('/p/')) {
            return [
              {
                getAttribute: (attr: string) => (attr === 'href' ? `/p/${code}/` : null),
              },
            ];
          }
          return [];
        },
      } as unknown as HTMLElement;

      const media = await extractFeedMedia(mockArticle);
      expect(media).not.toBeNull();
      expect(media?.url).toBe('https://cdn.instagram.com/v/t50.2886-16/cached_feed_video.mp4');
      expect(media?.ext).toBe('mp4');
      expect(media?.username).toBe('videomaker');
    });

    it('falls back to direct progressive DOM video if not in cache', async () => {
      const { extractFeedMedia } = await import('../src/lib/media-sniffer');

      const mockArticle = {
        querySelector: (sel: string) => {
          if (sel.includes('header a')) {
            return { textContent: 'travel_user' };
          }
          if (sel === 'video') {
            return {
              currentSrc: 'https://scontent.cdninstagram.com/o1/v/t16/f1/m84/progressive.mp4',
              src: '',
              querySelector: () => null,
            };
          }
          return null;
        },
        querySelectorAll: () => [],
      } as unknown as HTMLElement;

      const media = await extractFeedMedia(mockArticle);
      expect(media).not.toBeNull();
      expect(media?.url).toBe('https://scontent.cdninstagram.com/o1/v/t16/f1/m84/progressive.mp4');
      expect(media?.ext).toBe('mp4');
      expect(media?.username).toBe('travel_user');
    });

    it('extracts active carousel slide image when video is not present', async () => {
      const { extractFeedMedia } = await import('../src/lib/media-sniffer');

      const mockArticle = {
        querySelector: (sel: string) => {
          if (sel.includes('header a')) {
            return { textContent: 'photo_artist' };
          }
          if (sel === 'video') return null;
          return null;
        },
        querySelectorAll: (sel: string) => {
          if (sel === 'img') {
            return [
              {
                closest: () => null,
                getBoundingClientRect: () => ({ width: 600, height: 600 }),
                clientWidth: 600,
                clientHeight: 600,
                currentSrc: 'https://instagram.com/photo_active.jpg',
                src: 'https://instagram.com/photo_active.jpg',
                getAttribute: () => null,
              },
            ];
          }
          return [];
        },
      } as unknown as HTMLElement;

      const media = await extractFeedMedia(mockArticle);
      expect(media).not.toBeNull();
      expect(media?.url).toBe('https://instagram.com/photo_active.jpg');
      expect(media?.ext).toBe('jpg');
      expect(media?.username).toBe('photo_artist');
    });

    it('returns null if no cache hit and DOM video is blob MSE', async () => {
      const { extractFeedMedia } = await import('../src/lib/media-sniffer');

      const mockArticle = {
        querySelector: (sel: string) => {
          if (sel.includes('header a')) {
            return { textContent: 'someone' };
          }
          if (sel === 'video') {
            return {
              currentSrc: 'blob:https://www.instagram.com/d6874409-7d88-46c5',
              src: '',
              querySelector: () => null,
            };
          }
          return null;
        },
        querySelectorAll: () => [],
      } as unknown as HTMLElement;

      const media = await extractFeedMedia(mockArticle);
      expect(media).toBeNull();
    });
  });

  describe('getActiveCarouselIndex', () => {
    it('detects active slide index via pagination dots (aria-selected="true")', async () => {
      const { getActiveCarouselIndex } = await import('../src/lib/media-sniffer');

      const mockDots = [
        { getAttribute: (attr: string) => (attr === 'aria-selected' ? 'false' : null), className: '' },
        { getAttribute: (attr: string) => (attr === 'aria-selected' ? 'true' : null), className: '' },
        { getAttribute: (attr: string) => (attr === 'aria-selected' ? 'false' : null), className: '' },
      ];

      const mockArticle = {
        querySelector: (sel: string) => {
          if (sel.includes('tablist')) {
            return { children: mockDots };
          }
          return null;
        },
        querySelectorAll: () => [],
      } as unknown as HTMLElement;

      const index = getActiveCarouselIndex(mockArticle);
      expect(index).toBe(1);
    });

    it('detects active slide index via active class name on dot', async () => {
      const { getActiveCarouselIndex } = await import('../src/lib/media-sniffer');

      const mockDots = [
        { getAttribute: () => null, className: 'dot' },
        { getAttribute: () => null, className: 'dot' },
        { getAttribute: () => null, className: 'dot active _acnc' },
      ];

      const mockArticle = {
        querySelector: (sel: string) => {
          if (sel.includes('tablist')) {
            return { children: mockDots };
          }
          return null;
        },
        querySelectorAll: () => [],
      } as unknown as HTMLElement;

      const index = getActiveCarouselIndex(mockArticle);
      expect(index).toBe(2);
    });

    it('detects active slide index via horizontal slide position in viewport', async () => {
      const { getActiveCarouselIndex } = await import('../src/lib/media-sniffer');

      const mockSlides = [
        { getBoundingClientRect: () => ({ left: -600, right: 0 }) },
        { getBoundingClientRect: () => ({ left: 0, right: 600 }) }, // Centers around 300
        { getBoundingClientRect: () => ({ left: 600, right: 1200 }) },
      ];

      const mockArticle = {
        querySelector: () => null,
        querySelectorAll: (sel: string) => {
          if (sel.includes('ul li')) return mockSlides;
          return [];
        },
        getBoundingClientRect: () => ({ left: 0, width: 600 }), // Center = 300
      } as unknown as HTMLElement;

      const index = getActiveCarouselIndex(mockArticle);
      expect(index).toBe(1);
    });

    it('defaults to index 0 if no indicators found', async () => {
      const { getActiveCarouselIndex } = await import('../src/lib/media-sniffer');

      const mockArticle = {
        querySelector: () => null,
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, width: 600 }),
      } as unknown as HTMLElement;

      const index = getActiveCarouselIndex(mockArticle);
      expect(index).toBe(0);
    });
  });

  describe('getPostData & postMediaCache', () => {
    it('retrieves cached carousel post data by shortcode', async () => {
      const { postMediaCache } = await import('../src/lib/media-cache');
      const { getPostData } = await import('../src/lib/media-sniffer');

      const shortcode = 'CAROUSEL_CODE_433';
      postMediaCache.set(shortcode, {
        shortcode,
        username: '433',
        isCarousel: true,
        items: [
          { url: 'https://cdn.instagram.com/slide1.jpg', ext: 'jpg', index: 0 },
          { url: 'https://cdn.instagram.com/slide2.jpg', ext: 'jpg', index: 1 },
          { url: 'https://cdn.instagram.com/slide3.mp4', ext: 'mp4', index: 2 },
        ],
      });

      const mockArticle = {
        querySelectorAll: (sel: string) => {
          if (sel.includes('/p/')) {
            return [{ getAttribute: (attr: string) => (attr === 'href' ? `/p/${shortcode}/` : null) }];
          }
          return [];
        },
      } as unknown as HTMLElement;

      const data = getPostData(mockArticle);
      expect(data).not.toBeNull();
      expect(data?.shortcode).toBe(shortcode);
      expect(data?.username).toBe('433');
      expect(data?.isCarousel).toBe(true);
      expect(data?.items.length).toBe(3);
      expect(data?.items[2]?.ext).toBe('mp4');
    });

    it('falls back to DOM slide extraction when not in cache but has multiple slides', async () => {
      const { getPostData } = await import('../src/lib/media-sniffer');

      const mockSlideElements = [
        {
          tagName: 'DIV',
          querySelector: (tag: string) =>
            tag === 'img' ? { currentSrc: 'https://instagram.com/dom_slide1.jpg', src: '' } : null,
        },
        {
          tagName: 'DIV',
          querySelector: (tag: string) =>
            tag === 'img' ? { currentSrc: 'https://instagram.com/dom_slide2.jpg', src: '' } : null,
        },
      ];

      const mockArticle = {
        querySelector: (sel: string) => {
          if (sel.includes('header a')) {
            return { textContent: 'photographer' };
          }
          if (sel.includes('tablist')) {
            return { children: [{}, {}] };
          }
          return null;
        },
        querySelectorAll: (sel: string) => {
          if (sel.includes('ul li')) return mockSlideElements;
          if (sel.includes('/p/')) {
            return [{ getAttribute: (attr: string) => (attr === 'href' ? '/p/DOM_CAROUSEL_99/' : null) }];
          }
          return [];
        },
      } as unknown as HTMLElement;

      const data = getPostData(mockArticle);
      expect(data).not.toBeNull();
      expect(data?.isCarousel).toBe(true);
      expect(data?.items.length).toBe(2);
      expect(data?.items[0]?.url).toBe('https://instagram.com/dom_slide1.jpg');
      expect(data?.items[1]?.url).toBe('https://instagram.com/dom_slide2.jpg');
    });

    it('returns null if not in cache and not a carousel in DOM', async () => {
      const { getPostData } = await import('../src/lib/media-sniffer');

      const mockArticle = {
        querySelector: () => null,
        querySelectorAll: () => [],
      } as unknown as HTMLElement;

      const data = getPostData(mockArticle);
      expect(data).toBeNull();
    });
  });

  describe('upsertCarouselData', () => {
    it('creates new carousel entry when key does not exist', async () => {
      const { postMediaCache, upsertCarouselData } = await import('../src/lib/media-cache');

      const code = 'NEW_CAROUSEL_TEST_1';
      upsertCarouselData(code, 'test_user', [
        { url: 'https://cdn.instagram.com/p1.jpg', ext: 'jpg', index: 0 },
        { url: 'https://cdn.instagram.com/p2.jpg', ext: 'jpg', index: 1 },
      ]);

      const cached = postMediaCache.get(code);
      expect(cached).toBeDefined();
      expect(cached?.items.length).toBe(2);
      expect(cached?.items[0]?.url).toBe('https://cdn.instagram.com/p1.jpg');
    });

    it('incrementally merges new slide items without duplicates', async () => {
      const { postMediaCache, upsertCarouselData } = await import('../src/lib/media-cache');

      const code = 'FAKTABOLA_3SLIDES';
      // First network payload has only 2 items
      upsertCarouselData(code, 'faktabola', [
        { url: 'https://cdn.instagram.com/faktabola_s1.jpg', ext: 'jpg', index: 0 },
        { url: 'https://cdn.instagram.com/faktabola_s2.jpg', ext: 'jpg', index: 1 },
      ]);

      expect(postMediaCache.get(code)?.items.length).toBe(2);

      // Subsequent payload loads slide 3 (and repeats slide 2)
      upsertCarouselData(code, 'faktabola', [
        { url: 'https://cdn.instagram.com/faktabola_s2.jpg', ext: 'jpg', index: 1 },
        { url: 'https://cdn.instagram.com/faktabola_s3.jpg', ext: 'jpg', index: 2 },
      ]);

      const updated = postMediaCache.get(code);
      expect(updated?.items.length).toBe(3);
      expect(updated?.items[0]?.url).toBe('https://cdn.instagram.com/faktabola_s1.jpg');
      expect(updated?.items[1]?.url).toBe('https://cdn.instagram.com/faktabola_s2.jpg');
      expect(updated?.items[2]?.url).toBe('https://cdn.instagram.com/faktabola_s3.jpg');
      expect(updated?.items[2]?.index).toBe(2);
    });
  });

  describe('getRealSlideCounts (Fixes 3/2 Bug)', () => {
    it('correctly reports 3/3 instead of 3/2 when on slide 3 of a 3-slide post with 2 cached items', async () => {
      const { getRealSlideCounts } = await import('../src/lib/media-sniffer');

      const mockDots = [
        { getAttribute: (a: string) => (a === 'aria-selected' ? 'false' : null), classList: { contains: () => false } },
        { getAttribute: (a: string) => (a === 'aria-selected' ? 'false' : null), classList: { contains: () => false } },
        { getAttribute: (a: string) => (a === 'aria-selected' ? 'true' : null), classList: { contains: () => true } },
      ];

      const mockArticle = {
        querySelectorAll: (sel: string) => {
          if (sel.includes('_acnb')) return mockDots;
          return [];
        },
      } as unknown as HTMLElement;

      // Cache only has 2 items (e.g. from partial initial fetch)
      const mockPostData = {
        shortcode: 'FAKTABOLA_3SLIDES',
        username: 'faktabola',
        isCarousel: true,
        items: [
          { url: 'https://cdn.instagram.com/s1.jpg', ext: 'jpg' as const, index: 0 },
          { url: 'https://cdn.instagram.com/s2.jpg', ext: 'jpg' as const, index: 1 },
        ],
      };

      const { activeIndex, totalSlides } = getRealSlideCounts(mockArticle, mockPostData);
      expect(activeIndex).toBe(2); // 0-based index 2 -> slide 3
      expect(totalSlides).toBe(3); // Total 3 slides!
      // In UI this displays: "Unduh slide ini (3/3)" and "Unduh semua (3 media)"
      expect(`${activeIndex + 1}/${totalSlides}`).toBe('3/3');
    });

    it('identifies active dot by blue background color', async () => {
      const { getRealSlideCounts } = await import('../src/lib/media-sniffer');

      const mockDots = [
        { getAttribute: () => null, classList: { contains: () => false } },
        { getAttribute: () => null, classList: { contains: () => false } },
      ];

      const previousWindow = (globalThis as any).window;
      (globalThis as any).window = {
        getComputedStyle: (el: any) => {
          if (el === mockDots[1]) {
            return { backgroundColor: 'rgb(0, 149, 246)', opacity: '1' };
          }
          return { backgroundColor: 'rgb(255, 255, 255)', opacity: '0.4' };
        },
      };

      const mockArticle = {
        querySelectorAll: (sel: string) => {
          if (sel.includes('_acnb')) return mockDots;
          return [];
        },
      } as unknown as HTMLElement;

      const { activeIndex, totalSlides } = getRealSlideCounts(mockArticle, null);
      expect(activeIndex).toBe(1);
      expect(totalSlides).toBe(2);

      (globalThis as any).window = previousWindow;
    });
  });

  describe('extractActiveSlideFromDOM', () => {
    it('extracts image centered in the viewport of the post element', async () => {
      const { extractActiveSlideFromDOM } = await import('../src/lib/media-sniffer');

      const mockImages = [
        {
          closest: () => null,
          getBoundingClientRect: () => ({ left: -600, right: 0, width: 600, height: 600 }),
          currentSrc: 'https://instagram.com/slide1_offscreen.jpg',
          src: '',
          getAttribute: () => null,
        },
        {
          closest: () => null,
          getBoundingClientRect: () => ({ left: 0, right: 600, width: 600, height: 600 }), // Center = 300
          currentSrc: 'https://instagram.com/slide3_jonathan_david.jpg',
          src: '',
          getAttribute: () => null,
        },
      ];

      const mockArticle = {
        getBoundingClientRect: () => ({ left: 0, width: 600 }), // Center = 300
        querySelectorAll: (sel: string) => {
          if (sel === 'video') return [];
          if (sel === 'img') return mockImages;
          return [];
        },
      } as unknown as HTMLElement;

      const result = extractActiveSlideFromDOM(mockArticle);
      expect(result).not.toBeNull();
      expect(result?.url).toBe('https://instagram.com/slide3_jonathan_david.jpg');
      expect(result?.ext).toBe('jpg');
    });

    it('prioritizes active progressive video over images if active in center', async () => {
      const { extractActiveSlideFromDOM } = await import('../src/lib/media-sniffer');

      const mockVideos = [
        {
          getBoundingClientRect: () => ({ left: 0, right: 600, width: 600, height: 600 }), // Center = 300
          currentSrc: 'https://cdn.instagram.com/slide_video.mp4',
          src: '',
        },
      ];

      const mockArticle = {
        getBoundingClientRect: () => ({ left: 0, width: 600 }),
        querySelectorAll: (sel: string) => {
          if (sel === 'video') return mockVideos;
          if (sel === 'img') return [];
          return [];
        },
      } as unknown as HTMLElement;

      const result = extractActiveSlideFromDOM(mockArticle);
      expect(result).not.toBeNull();
      expect(result?.url).toBe('https://cdn.instagram.com/slide_video.mp4');
      expect(result?.ext).toBe('mp4');
    });
    it('extracts active slide directly from active LI in carousel UL', async () => {
      const { extractActiveSlideFromDOM } = await import('../src/lib/media-sniffer');

      const mockSlides = [
        {
          tagName: 'LI',
          getBoundingClientRect: () => ({ left: -1200, right: -600 }),
          querySelector: (sel: string) =>
            sel === 'img' ? { currentSrc: 'https://instagram.com/slide1_foto.jpg', src: '', getAttribute: () => null } : null,
        },
        {
          tagName: 'LI',
          getBoundingClientRect: () => ({ left: -600, right: 0 }),
          querySelector: (sel: string) =>
            sel === 'img' ? { currentSrc: 'https://instagram.com/slide2_foto.jpg', src: '', getAttribute: () => null } : null,
        },
        {
          tagName: 'LI',
          getBoundingClientRect: () => ({ left: 0, right: 600 }), // Covers center 300
          querySelector: (sel: string) =>
            sel === 'img'
              ? { currentSrc: 'https://instagram.com/slide3_jonathan_david.jpg', src: '', getAttribute: () => null }
              : null,
        },
      ];

      const mockUl = {
        tagName: 'UL',
        children: mockSlides,
      };

      const mockArticle = {
        getBoundingClientRect: () => ({ left: 0, width: 600 }), // Center = 300
        querySelectorAll: (sel: string) => {
          if (sel === 'ul') return [mockUl];
          return [];
        },
      } as unknown as HTMLElement;

      const result = extractActiveSlideFromDOM(mockArticle);
      expect(result).not.toBeNull();
      expect(result?.url).toBe('https://instagram.com/slide3_jonathan_david.jpg');
      expect(result?.ext).toBe('jpg');
      expect(result?.index).toBe(2);
    });
  });

  describe('Track Geometry & Off-by-One Detection (Task 8 Acceptance Criteria)', () => {
    it('accurately detects slide 1, slide 2, and slide 3 using UL > LI track geometry', async () => {
      const { getRealSlideCounts } = await import('../src/lib/media-sniffer');

      const createMockPost = (activeSlideIndex: number) => {
        // Container width 600, centerX = 300
        // Slide 0: -600 * activeSlideIndex
        const slides = [0, 1, 2].map((i) => ({
          tagName: 'LI',
          getBoundingClientRect: () => {
            const left = (i - activeSlideIndex) * 600;
            return { left, right: left + 600, width: 600, height: 600 };
          },
          querySelector: (sel: string) => (sel === 'img' ? { src: `https://ig.cdn/s${i + 1}.jpg` } : null),
        }));

        const mockUl = {
          tagName: 'UL',
          children: slides,
        };

        return {
          getBoundingClientRect: () => ({ left: 0, width: 600, height: 600 }),
          querySelectorAll: (sel: string) => (sel === 'ul' ? [mockUl] : []),
          querySelector: () => null,
        } as unknown as HTMLElement;
      };

      // Test Slide 1
      const post1 = createMockPost(0);
      const res1 = getRealSlideCounts(post1, null);
      expect(res1.activeIndex).toBe(0);
      expect(res1.totalSlides).toBe(3);
      expect(`Unduh slide ini (${res1.activeIndex + 1}/${res1.totalSlides})`).toBe('Unduh slide ini (1/3)');

      // Test Slide 2
      const post2 = createMockPost(1);
      const res2 = getRealSlideCounts(post2, null);
      expect(res2.activeIndex).toBe(1);
      expect(res2.totalSlides).toBe(3);
      expect(`Unduh slide ini (${res2.activeIndex + 1}/${res2.totalSlides})`).toBe('Unduh slide ini (2/3)');

      // Test Slide 3 (Jonathan David)
      const post3 = createMockPost(2);
      const res3 = getRealSlideCounts(post3, null);
      expect(res3.activeIndex).toBe(2);
      expect(res3.totalSlides).toBe(3);
      expect(`Unduh slide ini (${res3.activeIndex + 1}/${res3.totalSlides})`).toBe('Unduh slide ini (3/3)');
    });

    it('excludes container wrapper div._acnb from dots array to eliminate +1 shift', async () => {
      const { getRealSlideCounts } = await import('../src/lib/media-sniffer');

      const mockDotElements = [
        { getAttribute: (a: string) => (a === 'aria-selected' ? 'true' : 'false') }, // dot 1 (active)
        { getAttribute: (a: string) => (a === 'aria-selected' ? 'false' : 'false') }, // dot 2
        { getAttribute: (a: string) => (a === 'aria-selected' ? 'false' : 'false') }, // dot 3
      ];

      const dotsContainerWrapper = {
        tagName: 'DIV',
        className: '_acnb',
        children: mockDotElements, // Children does NOT include wrapper itself!
      };

      const mockArticle = {
        querySelector: (sel: string) => {
          if (sel.includes('_acnb')) return dotsContainerWrapper;
          return null;
        },
        querySelectorAll: () => [],
      } as unknown as HTMLElement;

      const result = getRealSlideCounts(mockArticle, null);
      // Dot 0 is active -> activeIndex should be 0 (NOT 1!)
      expect(result.activeIndex).toBe(0);
      expect(result.totalSlides).toBe(3);
      expect(result.activeIndex + 1).toBe(1); // (1/3), not (2/3)!
    });
  });

  describe('extractMediaFingerprint', () => {
    it('extracts unique numeric triplets from Instagram CDN URLs', async () => {
      const { extractMediaFingerprint } = await import('../src/lib/media-sniffer');

      const url1 =
        'https://instagram.fsub8-2.fna.fbcdn.net/v/t51.2885-15/456789123_987654321_123456789_n.jpg?_nc_cat=101&_nc_sid=abcdef';
      expect(extractMediaFingerprint(url1)).toBe('456789123_987654321_123456789');

      const url2 = 'https://scontent.cdninstagram.com/v/t50.2886-16/11223344_55667788_99001122_n.mp4?efg=xxx';
      expect(extractMediaFingerprint(url2)).toBe('11223344_55667788_99001122');
    });

    it('falls back to the filename when no numeric triplet pattern is present', async () => {
      const { extractMediaFingerprint } = await import('../src/lib/media-sniffer');

      const url = 'https://instagram.com/static/custom_photo_asset.jpg?version=2';
      expect(extractMediaFingerprint(url)).toBe('custom_photo_asset.jpg');
    });
  });

  describe('getOrFetchFullCarouselData (10-Slide Blueprint)', () => {
    it('hydrates 10 slides from Instagram API and saves to cache', async () => {
      const { getOrFetchFullCarouselData } = await import('../src/lib/media-sniffer');
      const { postMediaCache } = await import('../src/lib/media-cache');

      const code = 'TEN_SLIDES_CAROUSEL';

      // 10 mock slides in API response
      const mockChildren = Array.from({ length: 10 }, (_, i) => ({
        node: {
          is_video: i % 3 === 0,
          video_versions: i % 3 === 0 ? [{ url: `https://ig.cdn/v/1000_${i}_9999_n.mp4` }] : undefined,
          display_url: i % 3 !== 0 ? `https://ig.cdn/p/2000_${i}_8888_n.jpg` : undefined,
        },
      }));

      const mockApiResponse = {
        graphql: {
          shortcode_media: {
            owner: { username: 'football_gallery' },
            edge_sidecar_to_children: {
              edges: mockChildren,
            },
          },
        },
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: any) => {
        if (typeof url === 'string' && url.includes(code)) {
          return {
            ok: true,
            json: async () => mockApiResponse,
          } as any;
        }
        return { ok: false } as any;
      };

      const mockArticle = {
        querySelectorAll: (sel: string) => {
          if (sel.includes('/p/')) {
            return [{ getAttribute: (a: string) => (a === 'href' ? `/p/${code}/` : null) }];
          }
          return [];
        },
      } as unknown as HTMLElement;

      const data = await getOrFetchFullCarouselData(mockArticle);
      expect(data).not.toBeNull();
      expect(data?.isCarousel).toBe(true);
      expect(data?.items.length).toBe(10);
      expect(data?.username).toBe('football_gallery');
      expect(data?.items[0]?.ext).toBe('mp4');
      expect(data?.items[1]?.ext).toBe('jpg');
      expect(data?.items[9]?.ext).toBe('mp4');

      // Verify postMediaCache has the hydrated complete data
      expect(postMediaCache.get(code)?.items.length).toBe(10);

      globalThis.fetch = originalFetch;
    });
  });

  describe('getPreciseActiveSlideIndex (Fixes Virtualized 8-10 Slides & Random Indices)', () => {
    it('matches onscreen active media to exact blueprint index via URL fingerprinting across 10 slides', async () => {
      const { getPreciseActiveSlideIndex } = await import('../src/lib/media-sniffer');

      const fullItems = Array.from({ length: 10 }, (_, i) => ({
        url: `https://instagram.fsub8-2.fna.fbcdn.net/v/t51.2885-15/55555555_${i}_99999999_n.jpg?_nc_cat=101`,
        ext: 'jpg' as const,
        index: i,
      }));

      // Test Slide 1 (index 0)
      const mockImageSlide1 = {
        closest: () => null,
        getBoundingClientRect: () => ({ left: 0, right: 600, width: 600 }), // Center = 300
        currentSrc: 'https://cdn.instagram.com/s/55555555_0_99999999_n.jpg?token=abc',
        src: '',
      };
      const postEl1 = {
        getBoundingClientRect: () => ({ left: 0, width: 600 }),
        querySelectorAll: () => [mockImageSlide1],
      } as unknown as HTMLElement;
      expect(getPreciseActiveSlideIndex(postEl1, fullItems)).toBe(0);

      // Test Slide 5 (index 4) - In virtualized DOM, only slide 4 is in memory
      const mockImageSlide5 = {
        closest: () => null,
        getBoundingClientRect: () => ({ left: 0, right: 600, width: 600 }),
        currentSrc: 'https://cdn.instagram.com/s/55555555_4_99999999_n.jpg?token=def',
        src: '',
      };
      const postEl5 = {
        getBoundingClientRect: () => ({ left: 0, width: 600 }),
        querySelectorAll: () => [mockImageSlide5],
      } as unknown as HTMLElement;
      expect(getPreciseActiveSlideIndex(postEl5, fullItems)).toBe(4);

      // Test Slide 10 (index 9) - Last slide in a 10-slide album
      const mockImageSlide10 = {
        closest: () => null,
        getBoundingClientRect: () => ({ left: 0, right: 600, width: 600 }),
        currentSrc: 'https://cdn.instagram.com/s/55555555_9_99999999_n.jpg?token=ghi',
        src: '',
      };
      const postEl10 = {
        getBoundingClientRect: () => ({ left: 0, width: 600 }),
        querySelectorAll: () => [mockImageSlide10],
      } as unknown as HTMLElement;
      expect(getPreciseActiveSlideIndex(postEl10, fullItems)).toBe(9);
    });
  });

  describe('shortcodeToMediaId', () => {
    it('accurately decodes Instagram base64 shortcodes into numeric BigInt string IDs', async () => {
      const { shortcodeToMediaId } = await import('../src/lib/media-sniffer');

      expect(shortcodeToMediaId('B')).toBe('1');
      expect(shortcodeToMediaId('C')).toBe('2');
      expect(shortcodeToMediaId('BC')).toBe('66'); // 1 * 64 + 2 = 66

      // Known Instagram shortcode example
      const mediaId = shortcodeToMediaId('C123456');
      expect(typeof mediaId).toBe('string');
      expect(BigInt(mediaId) > BigInt(0)).toBe(true);
    });
  });

  describe('extractPostShortcode (Refactored)', () => {
    it('prioritizes official <time> anchor permalink over other links', async () => {
      const { extractPostShortcode } = await import('../src/lib/media-sniffer');

      const mockTime = {
        closest: (sel: string) => {
          if (sel === 'a') {
            return {
              getAttribute: (attr: string) => (attr === 'href' ? '/p/OFFICIAL_TIME_SHORTCODE/' : null),
            };
          }
          return null;
        },
      };

      const mockArticle = {
        querySelector: (sel: string) => (sel === 'time' ? mockTime : null),
        querySelectorAll: (sel: string) => {
          if (sel.includes('/p/')) {
            // Other link (e.g. user tagged link or previous post)
            return [{ getAttribute: (attr: string) => (attr === 'href' ? '/p/SECONDARY_CODE/' : null) }];
          }
          return [];
        },
      } as unknown as HTMLElement;

      expect(extractPostShortcode(mockArticle)).toBe('OFFICIAL_TIME_SHORTCODE');
    });

    it('extracts shortcode from /p/ link in article when no time tag present', async () => {
      const { extractPostShortcode } = await import('../src/lib/media-sniffer');

      const mockArticle = {
        querySelector: () => null,
        querySelectorAll: (sel: string) => {
          if (sel.includes('/p/')) {
            return [{ getAttribute: (attr: string) => (attr === 'href' ? '/p/C123456_post/' : null) }];
          }
          return [];
        },
      } as unknown as HTMLElement;

      expect(extractPostShortcode(mockArticle)).toBe('C123456_post');
    });

    it('extracts shortcode from /reel/ link in article', async () => {
      const { extractPostShortcode } = await import('../src/lib/media-sniffer');

      const mockArticle = {
        querySelector: () => null,
        querySelectorAll: (sel: string) => {
          if (sel.includes('/reel/')) {
            return [{ getAttribute: (attr: string) => (attr === 'href' ? '/reel/D789012_reel/' : null) }];
          }
          return [];
        },
      } as unknown as HTMLElement;

      expect(extractPostShortcode(mockArticle)).toBe('D789012_reel');
    });
  });

  describe('fetchAllMediaFromPostLink (Internal Web API)', () => {
    it('fetches and maps all carousel slides from api/v1/media/{mediaId}/info/', async () => {
      const { fetchAllMediaFromPostLink, shortcodeToMediaId } = await import('../src/lib/media-sniffer');

      const shortcode = 'BATCH_PERMALINK_CODE';
      const expectedMediaId = shortcodeToMediaId(shortcode);

      const mockApiResponse = {
        items: [
          {
            user: { username: 'gallery_creator' },
            carousel_media: [
              {
                media_type: 1,
                image_versions2: { candidates: [{ url: 'https://ig.cdn/p1_high.jpg' }] },
              },
              {
                media_type: 2,
                video_versions: [{ url: 'https://ig.cdn/v2_prog.mp4' }],
              },
              {
                media_type: 1,
                image_versions2: { candidates: [{ url: 'https://ig.cdn/p3_high.jpg' }] },
              },
            ],
          },
        ],
      };

      const origFetch = globalThis.fetch;
      globalThis.fetch = async (url: any) => {
        if (typeof url === 'string' && url.includes(`/api/v1/media/${expectedMediaId}/info/`)) {
          return {
            ok: true,
            headers: {
              get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null),
            },
            json: async () => mockApiResponse,
          } as any;
        }
        return { ok: false, headers: { get: () => 'text/html' } } as any;
      };

      const result = await fetchAllMediaFromPostLink(shortcode);
      expect(result).not.toBeNull();
      expect(result?.username).toBe('gallery_creator');
      expect(result?.items.length).toBe(3);
      expect(result?.items[0]).toEqual({ url: 'https://ig.cdn/p1_high.jpg', ext: 'jpg', index: 1 });
      expect(result?.items[1]).toEqual({ url: 'https://ig.cdn/v2_prog.mp4', ext: 'mp4', index: 2 });
      expect(result?.items[2]).toEqual({ url: 'https://ig.cdn/p3_high.jpg', ext: 'jpg', index: 3 });

      globalThis.fetch = origFetch;
    });

    it('handles single media post permalink correctly via internal API', async () => {
      const { fetchAllMediaFromPostLink, shortcodeToMediaId } = await import('../src/lib/media-sniffer');

      const shortcode = 'SINGLE_PERMALINK_CODE';
      const expectedMediaId = shortcodeToMediaId(shortcode);

      const mockApiResponse = {
        items: [
          {
            user: { username: 'single_photographer' },
            media_type: 1,
            image_versions2: { candidates: [{ url: 'https://ig.cdn/single_photo.jpg' }] },
          },
        ],
      };

      const origFetch = globalThis.fetch;
      globalThis.fetch = async (url: any) => {
        if (typeof url === 'string' && url.includes(`/api/v1/media/${expectedMediaId}/info/`)) {
          return {
            ok: true,
            headers: {
              get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
            },
            json: async () => mockApiResponse,
          } as any;
        }
        return { ok: false, headers: { get: () => 'text/html' } } as any;
      };

      const result = await fetchAllMediaFromPostLink(shortcode);
      expect(result).not.toBeNull();
      expect(result?.username).toBe('single_photographer');
      expect(result?.items.length).toBe(1);
      expect(result?.items[0]?.url).toBe('https://ig.cdn/single_photo.jpg');
      expect(result?.items[0]?.ext).toBe('jpg');

      globalThis.fetch = origFetch;
    });

    it('returns null and logs warning if API returns HTML login redirect', async () => {
      const { fetchAllMediaFromPostLink } = await import('../src/lib/media-sniffer');

      const origFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        headers: {
          get: (h: string) => (h.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null),
        },
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      } as any);

      const result = await fetchAllMediaFromPostLink('REDIRECT_CODE');
      expect(result).toBeNull();

      globalThis.fetch = origFetch;
    });
  });

  describe('extractDirectActiveMediaFromDOM (Direct Active Frame Sniffer)', () => {
    it('directly extracts high-res image currently centered at post frame', async () => {
      const { extractDirectActiveMediaFromDOM } = await import('../src/lib/media-sniffer');

      const mockImages = [
        {
          closest: () => null,
          getBoundingClientRect: () => ({ left: -600, right: 0, width: 600, height: 600 }),
          src: 'https://ig.cdn/offscreen.jpg',
          getAttribute: () => null,
        },
        {
          closest: () => null,
          getBoundingClientRect: () => ({ left: 0, right: 600, width: 600, height: 600 }), // Center = 300
          src: 'https://ig.cdn/low_preview.jpg',
          currentSrc: '',
          getAttribute: (attr: string) =>
            attr === 'srcset' ? 'https://ig.cdn/mid.jpg 640w, https://ig.cdn/high_res_slide.jpg 1080w' : null,
        },
      ];

      const mockPost = {
        getBoundingClientRect: () => ({ left: 0, width: 600 }),
        querySelectorAll: (sel: string) => {
          if (sel === 'video') return [];
          if (sel === 'img') return mockImages;
          return [];
        },
      } as unknown as HTMLElement;

      const media = extractDirectActiveMediaFromDOM(mockPost);
      expect(media).not.toBeNull();
      expect(media?.url).toBe('https://ig.cdn/high_res_slide.jpg');
      expect(media?.ext).toBe('jpg');
    });

    it('prioritizes video currently centered at post frame', async () => {
      const { extractDirectActiveMediaFromDOM } = await import('../src/lib/media-sniffer');

      const mockVideo = {
        getBoundingClientRect: () => ({ left: 0, right: 600, width: 600, height: 600 }),
        currentSrc: 'https://ig.cdn/active_video_slide.mp4',
        src: '',
      };

      const mockPost = {
        getBoundingClientRect: () => ({ left: 0, width: 600 }),
        querySelectorAll: (sel: string) => {
          if (sel === 'video') return [mockVideo];
          if (sel === 'img') return [];
          return [];
        },
      } as unknown as HTMLElement;

      const media = extractDirectActiveMediaFromDOM(mockPost);
      expect(media).not.toBeNull();
      expect(media?.url).toBe('https://ig.cdn/active_video_slide.mp4');
      expect(media?.ext).toBe('mp4');
    });
  });

  describe('getActiveStorySlideIndex (Progress Bar Detection)', () => {
    it('returns 0 when no progress bar container is present', async () => {
      const { getActiveStorySlideIndex } = await import('../src/lib/media-sniffer');
      const mockCard = {
        querySelector: () => null,
        querySelectorAll: () => [],
      } as unknown as HTMLElement;

      expect(getActiveStorySlideIndex(mockCard)).toBe(0);
    });

    it('detects active slide index 0 when first bar is filling and second is scaleX(0)', async () => {
      const { getActiveStorySlideIndex } = await import('../src/lib/media-sniffer');

      const seg0 = {
        querySelector: () => ({ style: { transform: 'scaleX(0.45)' } }),
      };
      const seg1 = {
        querySelector: () => ({ style: { transform: 'scaleX(0)' } }),
      };

      const topBarsContainer = {
        children: [seg0, seg1],
      };

      const headerParent = {
        querySelector: (sel: string) => (sel.includes('display: flex') ? topBarsContainer : null),
      };

      const mockCard = {
        querySelector: (sel: string) => (sel === 'header' ? { parentElement: headerParent } : null),
        querySelectorAll: () => [],
      } as unknown as HTMLElement;

      expect(getActiveStorySlideIndex(mockCard)).toBe(0);
    });

    it('detects active slide index 1 when first bar is full and second bar is filling', async () => {
      const { getActiveStorySlideIndex } = await import('../src/lib/media-sniffer');

      const seg0 = {
        querySelector: () => ({ style: { transform: 'scaleX(1)' } }),
      };
      const seg1 = {
        querySelector: () => ({ style: { transform: 'scaleX(0.3)' } }),
      };
      const seg2 = {
        querySelector: () => ({ style: { transform: 'scaleX(0)' } }),
      };

      const topBarsContainer = {
        children: [seg0, seg1, seg2],
      };

      const headerParent = {
        querySelector: (sel: string) => (sel.includes('display: flex') ? topBarsContainer : null),
      };

      const mockCard = {
        querySelector: (sel: string) => (sel === 'header' ? { parentElement: headerParent } : null),
        querySelectorAll: () => [],
      } as unknown as HTMLElement;

      expect(getActiveStorySlideIndex(mockCard)).toBe(1);
    });
  });

  describe('extractActiveStoryMediaStrict', () => {
    it('returns null if triggerBtn has no card container', async () => {
      const { extractActiveStoryMediaStrict } = await import('../src/lib/media-sniffer');
      const triggerBtn = {
        closest: () => null,
        parentElement: null,
      } as unknown as HTMLElement;

      const result = await extractActiveStoryMediaStrict(triggerBtn);
      expect(result).toBeNull();
    });

    it('ignores header avatar and returns main story image in card', async () => {
      const { extractActiveStoryMediaStrict } = await import('../src/lib/media-sniffer');

      const origWindow = (globalThis as any).window;
      (globalThis as any).window = {
        innerWidth: 1000,
        location: { pathname: '/stories/story_user/' },
      };

      const avatarImg = {
        closest: (sel: string) => (sel === 'header' ? true : false),
        getBoundingClientRect: () => ({ left: 20, right: 60, width: 40, height: 40 }),
        naturalWidth: 150,
        naturalHeight: 150,
        currentSrc: 'https://ig.cdn/avatar.jpg',
        src: 'https://ig.cdn/avatar.jpg',
        getAttribute: () => null,
      };

      const storyMainImg = {
        closest: () => false,
        getBoundingClientRect: () => ({ left: 300, right: 700, width: 400, height: 700 }),
        naturalWidth: 1080,
        naturalHeight: 1920,
        clientWidth: 400,
        clientHeight: 700,
        currentSrc: '',
        src: 'https://ig.cdn/story_main_photo.jpg',
        getAttribute: (attr: string) => (attr === 'srcset' ? 'https://ig.cdn/low.jpg 320w, https://ig.cdn/story_high.jpg 1080w' : null),
      };

      const cardContainer = {
        querySelector: (sel: string) => {
          if (sel.includes('header a')) return { textContent: 'story_user' };
          if (sel === 'video') return null;
          return null;
        },
        querySelectorAll: (sel: string) => {
          if (sel === 'img') return [avatarImg, storyMainImg];
          return [];
        },
      };

      const triggerBtn = {
        closest: (sel: string) => (sel === 'section' ? cardContainer : null),
        parentElement: null,
      } as unknown as HTMLElement;

      const result = await extractActiveStoryMediaStrict(triggerBtn);
      expect(result).not.toBeNull();
      expect(result?.url).toBe('https://ig.cdn/story_high.jpg');
      expect(result?.ext).toBe('jpg');
      expect(result?.username).toBe('story_user');

      (globalThis as any).window = origWindow;
    });

    it('selects slide #1 (index 0) from cache on initial load/refresh without mediaId in URL, not the last item', async () => {
      const { extractActiveStoryMediaStrict } = await import('../src/lib/media-sniffer');
      const { storyMediaCache } = await import('../src/lib/media-cache');

      storyMediaCache.clear();
      // Story #1 (first slide)
      storyMediaCache.set('3000000001', {
        url: 'https://ig.cdn/story_slide_1.mp4',
        ext: 'mp4',
        username: 'fashion_blogger',
      });
      // Story #2
      storyMediaCache.set('3000000002', {
        url: 'https://ig.cdn/story_slide_2.mp4',
        ext: 'mp4',
        username: 'fashion_blogger',
      });
      // Story #5 (last slide)
      storyMediaCache.set('3000000005', {
        url: 'https://ig.cdn/story_slide_5.mp4',
        ext: 'mp4',
        username: 'fashion_blogger',
      });

      // Window pathname has no mediaId (e.g. /stories/fashion_blogger/)
      const origWindow = (globalThis as any).window;
      (globalThis as any).window = {
        innerWidth: 1000,
        location: { pathname: '/stories/fashion_blogger/' },
      };

      const cardContainer = {
        querySelector: (sel: string) => {
          if (sel.includes('header a')) return { textContent: 'fashion_blogger' };
          if (sel === 'video') return null;
          return null;
        },
        querySelectorAll: () => [],
      };

      const triggerBtn = {
        closest: (sel: string) => (sel === 'section' ? cardContainer : null),
        parentElement: null,
      } as unknown as HTMLElement;

      const result = await extractActiveStoryMediaStrict(triggerBtn);
      expect(result).not.toBeNull();
      // MUST be slide 1, NOT slide 5!
      expect(result?.url).toBe('https://ig.cdn/story_slide_1.mp4');
      expect(result?.username).toBe('fashion_blogger');

      (globalThis as any).window = origWindow;
    });

    it('enforces Username Firewall: never returns adjacent user cache item even if prefetched', async () => {
      const { extractActiveStoryMediaStrict } = await import('../src/lib/media-sniffer');
      const { storyMediaCache } = await import('../src/lib/media-cache');

      storyMediaCache.clear();
      // Active user story
      storyMediaCache.set('4000000001', {
        url: 'https://ig.cdn/otherawr_selfie.jpg',
        ext: 'jpg',
        username: 'otherawr',
      });
      // Prefetched next user story
      storyMediaCache.set('4000000002', {
        url: 'https://ig.cdn/kojaeee_food.mp4',
        ext: 'mp4',
        username: 'kojaeee',
      });

      const origWindow = (globalThis as any).window;
      (globalThis as any).window = {
        innerWidth: 1000,
        location: { pathname: '/stories/otherawr/' },
      };

      const cardContainer = {
        querySelector: (sel: string) => (sel.includes('header a') ? { textContent: 'otherawr' } : null),
        querySelectorAll: () => [],
      };

      const triggerBtn = {
        closest: (sel: string) => (sel === 'section' ? cardContainer : null),
        parentElement: null,
      } as unknown as HTMLElement;

      const result = await extractActiveStoryMediaStrict(triggerBtn);
      expect(result).not.toBeNull();
      expect(result?.username).toBe('otherawr');
      expect(result?.url).toBe('https://ig.cdn/otherawr_selfie.jpg');
      expect(result?.url).not.toContain('kojaeee');

      (globalThis as any).window = origWindow;
    });

    it('enforces Viewport Center Pinning: ignores neighbor card video outside center', async () => {
      const { extractActiveStoryMediaStrict } = await import('../src/lib/media-sniffer');

      const origWindow = (globalThis as any).window;
      (globalThis as any).window = {
        innerWidth: 1000, // centerX = 500
        location: { pathname: '/stories/otherawr/' },
      };

      // Video in right neighbor card (left: 800, right: 1400) -> NOT centered!
      const neighborVideo = {
        getBoundingClientRect: () => ({ left: 800, right: 1400, width: 600, height: 800 }),
        currentSrc: 'https://ig.cdn/kojaeee_neighbor_video.mp4',
        src: '',
        querySelector: () => null,
      };

      const cardContainer = {
        querySelector: () => null,
        querySelectorAll: (sel: string) => (sel === 'video' ? [neighborVideo] : []),
      };

      const triggerBtn = {
        closest: (sel: string) => (sel === 'section' ? cardContainer : null),
        parentElement: null,
      } as unknown as HTMLElement;

      const result = await extractActiveStoryMediaStrict(triggerBtn);
      // Because neighbor video is not centered and no cache/photo for otherawr, it must NOT return kojaeee's video!
      expect(result?.url).not.toBe('https://ig.cdn/kojaeee_neighbor_video.mp4');

      (globalThis as any).window = origWindow;
    });

    it('hydrates story cache on-demand when opening story with empty cache', async () => {
      const { extractActiveStoryMediaStrict, fetchUserStoriesOnDemand } = await import('../src/lib/media-sniffer');
      const { storyMediaCache } = await import('../src/lib/media-cache');

      storyMediaCache.clear();

      const origFetch = globalThis.fetch;
      const origWindow = (globalThis as any).window;

      // Mock fetch for web_profile_info and reels_media
      globalThis.fetch = async (input: any) => {
        const url = String(input);
        if (url.includes('web_profile_info')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                user: {
                  id: '987654321',
                  username: 'hydrateduser',
                },
              },
            }),
          } as any;
        }
        if (url.includes('reels_media')) {
          return {
            ok: true,
            json: async () => ({
              reels: {
                '987654321': {
                  items: [
                    {
                      id: '5555555555',
                      video_versions: [
                        {
                          width: 720,
                          height: 1280,
                          url: 'https://ig.cdn/hydrated_prog_video.mp4',
                        },
                      ],
                    },
                  ],
                },
              },
            }),
          } as any;
        }
        return { ok: false } as any;
      };

      (globalThis as any).window = {
        innerWidth: 1000,
        location: { pathname: '/stories/hydrateduser/' },
      };

      const result = await extractActiveStoryMediaStrict();
      expect(result).not.toBeNull();
      expect(result?.username).toBe('hydrateduser');
      expect(result?.url).toBe('https://ig.cdn/hydrated_prog_video.mp4');
      expect(result?.ext).toBe('mp4');

      // Verify it was stored in storyMediaCache
      expect(storyMediaCache.has('5555555555')).toBe(true);

      globalThis.fetch = origFetch;
      (globalThis as any).window = origWindow;
    });

    it('fetchUserStoriesOnDemand handles network failure gracefully without throwing', async () => {
      const { fetchUserStoriesOnDemand } = await import('../src/lib/media-sniffer');
      const origFetch = globalThis.fetch;

      globalThis.fetch = async () => {
        throw new Error('Network offline');
      };

      await expect(fetchUserStoriesOnDemand('faileduser')).resolves.not.toThrow();

      globalThis.fetch = origFetch;
    });

    it('synchronizes cache from DOM Storage Bridge (__downplaygram_store__)', async () => {
      const { getHydratedCache, storyMediaCache } = await import('../src/lib/media-cache');
      const { extractActiveStoryMediaStrict } = await import('../src/lib/media-sniffer');

      storyMediaCache.clear();

      const origDocument = (globalThis as any).document;
      const storeEl = {
        id: '__downplaygram_store__',
        textContent: JSON.stringify({
          '8888888888': {
            id: '8888888888',
            url: 'https://ig.cdn/aurramrsy_story_bridge.mp4',
            ext: 'mp4',
            username: 'aurramrsy',
          },
        }),
      };

      (globalThis as any).document = {
        getElementById: (id: string) => (id === '__downplaygram_store__' ? storeEl : null),
        querySelectorAll: () => [],
      };

      // Verify getHydratedCache loads the bridge data into memory
      const cache = getHydratedCache();
      expect(cache.has('8888888888')).toBe(true);
      expect(cache.get('8888888888')?.username).toBe('aurramrsy');

      // Verify extractActiveStoryMediaStrict succeeds on cold load using DOM bridge
      const origWindow = (globalThis as any).window;
      (globalThis as any).window = {
        innerWidth: 1000,
        location: { pathname: '/stories/aurramrsy/' },
      };

      const result = await extractActiveStoryMediaStrict();
      expect(result).not.toBeNull();
      expect(result?.username).toBe('aurramrsy');
      expect(result?.url).toBe('https://ig.cdn/aurramrsy_story_bridge.mp4');
      expect(result?.ext).toBe('mp4');

      (globalThis as any).window = origWindow;
      (globalThis as any).document = origDocument;
    });
  });

  describe('getAllStoriesForUser', () => {
    it('returns cached stories for a specified username', async () => {
      const { storyMediaCache } = await import('../src/lib/media-cache');
      const { getAllStoriesForUser } = await import('../src/lib/media-sniffer');

      storyMediaCache.clear();
      storyMediaCache.set('11111', {
        id: '11111',
        url: 'https://cdn.ig/realmadrid_story1.mp4',
        ext: 'mp4',
        username: 'realmadrid',
      });
      storyMediaCache.set('22222', {
        id: '22222',
        url: 'https://cdn.ig/realmadrid_story2.jpg',
        ext: 'jpg',
        username: 'RealMadrid',
      });
      storyMediaCache.set('33333', {
        id: '33333',
        url: 'https://cdn.ig/other_story.jpg',
        ext: 'jpg',
        username: 'otheruser',
      });

      const stories = await getAllStoriesForUser('realmadrid');
      expect(stories.length).toBe(2);
      expect(stories[0]?.url).toBe('https://cdn.ig/realmadrid_story1.mp4');
      expect(stories[1]?.url).toBe('https://cdn.ig/realmadrid_story2.jpg');
    });

    it('deduplicates items with identical media URLs', async () => {
      const { storyMediaCache } = await import('../src/lib/media-cache');
      const { getAllStoriesForUser } = await import('../src/lib/media-sniffer');

      storyMediaCache.clear();
      storyMediaCache.set('dup1', {
        id: 'dup1',
        url: 'https://cdn.ig/duplicate_story.mp4',
        ext: 'mp4',
        username: 'realmadrid',
      });
      storyMediaCache.set('dup2', {
        id: 'dup2',
        url: 'https://cdn.ig/duplicate_story.mp4',
        ext: 'mp4',
        username: 'realmadrid',
      });

      const stories = await getAllStoriesForUser('realmadrid');
      expect(stories.length).toBe(1);
      expect(stories[0]?.url).toBe('https://cdn.ig/duplicate_story.mp4');
    });

    it('falls back to on-demand hydration when cache is initially empty', async () => {
      const { storyMediaCache } = await import('../src/lib/media-cache');
      const { getAllStoriesForUser } = await import('../src/lib/media-sniffer');

      storyMediaCache.clear();

      const origFetch = globalThis.fetch;
      globalThis.fetch = async (input: any) => {
        const url = String(input);
        if (url.includes('web_profile_info')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                user: {
                  id: '7777777',
                  username: 'barcelona',
                },
              },
            }),
          } as any;
        }
        if (url.includes('reels_media')) {
          return {
            ok: true,
            json: async () => ({
              reels: {
                '7777777': {
                  items: [
                    {
                      id: 'story_barca_1',
                      image_versions2: {
                        candidates: [
                          { width: 1080, height: 1920, url: 'https://cdn.ig/barca1.jpg' },
                        ],
                      },
                    },
                    {
                      id: 'story_barca_2',
                      video_versions: [
                        { width: 720, height: 1280, url: 'https://cdn.ig/barca2.mp4' },
                      ],
                    },
                  ],
                },
              },
            }),
          } as any;
        }
        return { ok: false } as any;
      };

      const stories = await getAllStoriesForUser('barcelona');
      expect(stories.length).toBe(2);
      expect(stories[0]?.url).toBe('https://cdn.ig/barca1.jpg');
      expect(stories[0]?.ext).toBe('jpg');
      expect(stories[1]?.url).toBe('https://cdn.ig/barca2.mp4');
      expect(stories[1]?.ext).toBe('mp4');

      globalThis.fetch = origFetch;
    });
  });
});

