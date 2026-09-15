import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getStoryOrHighlightContext,
  getAllHighlightMedia,
} from '../src/lib/media-sniffer';
import { storyMediaCache } from '../src/lib/media-cache';
import * as runtime from '../src/lib/runtime';
import { handleBatchDownload, handleDownloadCurrentStory } from '../src/content/injectors/stories';
import * as sniffer from '../src/lib/media-sniffer';

describe('highlights support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storyMediaCache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getStoryOrHighlightContext', () => {
    it('detects regular story URL without highlight', () => {
      vi.stubGlobal('window', {
        location: { pathname: '/stories/satudua/' },
      });

      const ctx = getStoryOrHighlightContext();
      expect(ctx.isHighlight).toBe(false);
      expect(ctx.highlightId).toBeNull();
      expect(ctx.username).toBe('satudua');
    });

    it('detects regular story URL with media id', () => {
      vi.stubGlobal('window', {
        location: { pathname: '/stories/satudua/34567890123/' },
      });

      const ctx = getStoryOrHighlightContext();
      expect(ctx.isHighlight).toBe(false);
      expect(ctx.highlightId).toBeNull();
      expect(ctx.username).toBe('satudua');
    });

    it('extracts highlightId and username from card header anchor', () => {
      vi.stubGlobal('window', {
        location: { pathname: '/stories/highlights/17890123456/' },
      });

      const mockCard = {
        querySelector: vi.fn().mockImplementation((selector: string) => {
          if (selector.includes('header a')) {
            return {
              getAttribute: (attr: string) => (attr === 'href' ? '/campus_life/' : null),
            };
          }
          return null;
        }),
      } as unknown as HTMLElement;

      const ctx = getStoryOrHighlightContext(mockCard);
      expect(ctx.isHighlight).toBe(true);
      expect(ctx.highlightId).toBe('17890123456');
      expect(ctx.username).toBe('campus_life');
    });

    it('extracts username from reply placeholder input (English)', () => {
      vi.stubGlobal('window', {
        location: { pathname: '/stories/highlights/17890123456/' },
      });

      const mockCard = {
        querySelector: vi.fn().mockImplementation((selector: string) => {
          if (selector.includes('header a')) {
            return {
              getAttribute: (attr: string) => (attr === 'href' ? '/stories/highlights/17890123456/' : null),
            };
          }
          if (selector.includes('Reply to') || selector.includes('Balas ke')) {
            return {
              getAttribute: (attr: string) => (attr === 'placeholder' ? 'Reply to student_org...' : null),
            };
          }
          return null;
        }),
      } as unknown as HTMLElement;

      const ctx = getStoryOrHighlightContext(mockCard);
      expect(ctx.isHighlight).toBe(true);
      expect(ctx.highlightId).toBe('17890123456');
      expect(ctx.username).toBe('student_org');
    });

    it('extracts username from reply placeholder input (Indonesian)', () => {
      vi.stubGlobal('window', {
        location: { pathname: '/stories/highlights/999888777/' },
      });

      const mockCard = {
        querySelector: vi.fn().mockImplementation((selector: string) => {
          if (selector.includes('header a')) {
            return null;
          }
          if (selector.includes('Reply to') || selector.includes('Balas ke')) {
            return {
              getAttribute: (attr: string) => (attr === 'placeholder' ? 'Balas ke hima_ti...' : null),
            };
          }
          return null;
        }),
      } as unknown as HTMLElement;

      const ctx = getStoryOrHighlightContext(mockCard);
      expect(ctx.isHighlight).toBe(true);
      expect(ctx.highlightId).toBe('999888777');
      expect(ctx.username).toBe('hima_ti');
    });

    it('falls back to cache if card header and placeholder are missing', () => {
      vi.stubGlobal('window', {
        location: { pathname: '/stories/highlights/555444333/' },
      });

      storyMediaCache.set('555444333_0', {
        id: '555444333_0',
        url: 'https://cdn.ig/cached.mp4',
        ext: 'mp4',
        username: 'cached_creator',
        highlightId: '555444333',
      });

      const mockCard = {
        querySelector: vi.fn().mockReturnValue(null),
      } as unknown as HTMLElement;

      const ctx = getStoryOrHighlightContext(mockCard);
      expect(ctx.isHighlight).toBe(true);
      expect(ctx.highlightId).toBe('555444333');
      expect(ctx.username).toBe('cached_creator');
    });
  });

  describe('getAllHighlightMedia', () => {
    it('returns existing cached highlight items without making network requests', async () => {
      storyMediaCache.set('hl_item_1', {
        id: 'hl_item_1',
        url: 'https://cdn.ig/hl1.mp4',
        ext: 'mp4',
        username: 'realmadrid',
        highlightId: '12345',
      });
      storyMediaCache.set('hl_item_2', {
        id: 'hl_item_2',
        url: 'https://cdn.ig/hl2.jpg',
        ext: 'jpg',
        username: 'realmadrid',
        highlightId: '12345',
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const items = await getAllHighlightMedia('12345', 'realmadrid');

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(items.length).toBe(2);
      expect(items[0]?.url).toBe('https://cdn.ig/hl1.mp4');
      expect(items[1]?.url).toBe('https://cdn.ig/hl2.jpg');
    });

    it('fetches on-demand using reel_ids=highlight:{id} when cache is empty', async () => {
      const mockResponse = {
        reels: {
          'highlight:987654': {
            id: 'highlight:987654',
            user: { username: 'official_fcb' },
            items: [
              {
                pk: 'item_video_1',
                video_versions: [
                  { url: 'https://cdn.ig/dashinit_vid.mp4', width: 720, height: 1280 },
                  { url: 'https://cdn.ig/progressive_vid.mp4', width: 720, height: 1280 },
                ],
              },
              {
                pk: 'item_photo_2',
                image_versions2: {
                  candidates: [{ url: 'https://cdn.ig/photo_highres.jpg' }],
                },
              },
            ],
          },
        },
      };

      vi.stubGlobal('document', {
        cookie: 'csrftoken=mock_csrf_token_123',
        getElementById: vi.fn().mockReturnValue(null),
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as unknown as Response);

      const items = await getAllHighlightMedia('987654', 'official_fcb');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/v1/feed/reels_media/?reel_ids=highlight%3A987654');
      expect(options.credentials).toBe('include');
      expect((options.headers as any)['X-IG-App-ID']).toBe('936619743392459');
      expect((options.headers as any)['X-CSRFToken']).toBe('mock_csrf_token_123');

      expect(items.length).toBe(2);
      expect(items[0]?.id).toBe('item_video_1');
      expect(items[0]?.url).toBe('https://cdn.ig/progressive_vid.mp4');
      expect(items[0]?.ext).toBe('mp4');
      expect(items[0]?.username).toBe('official_fcb');
      expect(items[0]?.highlightId).toBe('987654');

      expect(items[1]?.id).toBe('item_photo_2');
      expect(items[1]?.url).toBe('https://cdn.ig/photo_highres.jpg');
      expect(items[1]?.ext).toBe('jpg');
      expect(items[1]?.username).toBe('official_fcb');
      expect(items[1]?.highlightId).toBe('987654');

      // Verify cached in storyMediaCache
      expect(storyMediaCache.has('item_video_1')).toBe(true);
      expect(storyMediaCache.has('item_photo_2')).toBe(true);
    });
  });

  describe('batch and single download handlers for highlights', () => {
    it('handleBatchDownload saves files to highlights folder with batch prefix', async () => {
      const mockBtn = {
        innerHTML: '',
        disabled: false,
      } as unknown as HTMLButtonElement;

      const items = [
        { url: 'https://cdn.ig/slide1.jpg', ext: 'jpg' },
        { url: 'https://cdn.ig/slide2.mp4', ext: 'mp4' },
      ];

      const sendSpy = vi.spyOn(runtime, 'safeSendMessage').mockResolvedValue({ success: true });
      vi.spyOn(runtime, 'isExtensionContextValid').mockReturnValue(true);

      await handleBatchDownload(mockBtn, 'campus_life', items, 'highlights');

      expect(sendSpy).toHaveBeenCalledTimes(2);
      const call1 = sendSpy.mock.calls[0]![0];
      expect(call1.action).toBe('DOWNLOAD_MEDIA');
      expect(call1.payload.url).toBe('https://cdn.ig/slide1.jpg');
      expect(call1.payload.filename).toMatch(/^Downplaygram\/campus_life\/highlights\/batch_\d+_1\.jpg$/);

      const call2 = sendSpy.mock.calls[1]![0];
      expect(call2.payload.url).toBe('https://cdn.ig/slide2.mp4');
      expect(call2.payload.filename).toMatch(/^Downplaygram\/campus_life\/highlights\/batch_\d+_2\.mp4$/);
      expect(mockBtn.innerHTML).toContain('dpg-pop-in');
    });

    it('handleDownloadCurrentStory saves single highlight to highlights folder with highlight_ prefix', async () => {
      const mockCard = {
        querySelector: vi.fn().mockImplementation((selector: string) => {
          if (selector.includes('header a')) {
            return { getAttribute: (attr: string) => (attr === 'href' ? '/traveler/' : null) };
          }
          return null;
        }),
      };

      const mockBtn = {
        innerHTML: '',
        disabled: false,
        closest: vi.fn().mockReturnValue(mockCard),
      } as unknown as HTMLButtonElement;

      vi.stubGlobal('window', {
        location: { pathname: '/stories/highlights/888111222/' },
      });

      vi.spyOn(runtime, 'isExtensionContextValid').mockReturnValue(true);
      vi.spyOn(sniffer, 'extractActiveStoryMediaStrict').mockResolvedValue({
        id: 'hl_media_9',
        url: 'https://cdn.ig/active_hl.mp4',
        ext: 'mp4',
        username: 'traveler',
        highlightId: '888111222',
      });

      const sendSpy = vi.spyOn(runtime, 'safeSendMessage').mockResolvedValue({ success: true });

      await handleDownloadCurrentStory(mockBtn);

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const call = sendSpy.mock.calls[0]![0];
      expect(call.action).toBe('DOWNLOAD_MEDIA');
      expect(call.payload.url).toBe('https://cdn.ig/active_hl.mp4');
      expect(call.payload.filename).toMatch(/^Downplaygram\/traveler\/highlights\/highlight_\d+\.mp4$/);
      expect(mockBtn.innerHTML).toContain('dpg-pop-in');
    });

    it('handleBatchDownload automatically deduplicates duplicate items before initiating downloads', async () => {
      const mockBtn = {
        innerHTML: '',
        disabled: false,
      } as unknown as HTMLButtonElement;

      // 14 items representing 7 unique slides (duplicated by ID and URL)
      const duplicateItems = [
        { id: '101_user', url: 'https://cdn.ig/s1.jpg?token=abc', ext: 'jpg' as const },
        { id: '101', url: 'https://cdn.ig/s1.jpg?token=def', ext: 'jpg' as const },
        { id: '102_user', url: 'https://cdn.ig/s2.mp4?token=abc', ext: 'mp4' as const },
        { id: '102', url: 'https://cdn.ig/s2.mp4?token=def', ext: 'mp4' as const },
        { id: '103_user', url: 'https://cdn.ig/s3.jpg', ext: 'jpg' as const },
        { id: '103', url: 'https://cdn.ig/s3.jpg', ext: 'jpg' as const },
        { id: '104_user', url: 'https://cdn.ig/s4.mp4', ext: 'mp4' as const },
        { id: '104', url: 'https://cdn.ig/s4.mp4', ext: 'mp4' as const },
        { id: '105_user', url: 'https://cdn.ig/s5.jpg', ext: 'jpg' as const },
        { id: '105', url: 'https://cdn.ig/s5.jpg', ext: 'jpg' as const },
        { id: '106_user', url: 'https://cdn.ig/s6.mp4', ext: 'mp4' as const },
        { id: '106', url: 'https://cdn.ig/s6.mp4', ext: 'mp4' as const },
        { id: '107_user', url: 'https://cdn.ig/s7.jpg', ext: 'jpg' as const },
        { id: '107', url: 'https://cdn.ig/s7.jpg', ext: 'jpg' as const },
      ];

      const sendSpy = vi.spyOn(runtime, 'safeSendMessage').mockResolvedValue({ success: true });
      vi.spyOn(runtime, 'isExtensionContextValid').mockReturnValue(true);

      await handleBatchDownload(mockBtn, 'seven_slides_account', duplicateItems, 'highlights');

      // Crucial: Must be called EXACTLY 7 times, not 14!
      expect(sendSpy).toHaveBeenCalledTimes(7);
      expect(mockBtn.innerHTML).toContain('dpg-pop-in');
    });
  });

  describe('deduplicateMediaItems helper', () => {
    it('collapses 14 duplicate items to 7 unique items based on id prefix and url base', async () => {
      const { deduplicateMediaItems } = await import('../src/lib/media-sniffer');
      const items = [
        { id: 'item_1_user', url: 'https://cdn.ig/1.jpg?token=1' },
        { id: 'item_1', url: 'https://cdn.ig/1.jpg?token=2' },
        { id: 'item_2_user', url: 'https://cdn.ig/2.mp4?token=1' },
        { id: 'item_2', url: 'https://cdn.ig/2.mp4?token=2' },
        { id: 'item_3_user', url: 'https://cdn.ig/3.jpg' },
        { id: 'item_3', url: 'https://cdn.ig/3.jpg' },
        { id: 'item_4_user', url: 'https://cdn.ig/4.mp4' },
        { id: 'item_4', url: 'https://cdn.ig/4.mp4' },
        { id: 'item_5_user', url: 'https://cdn.ig/5.jpg' },
        { id: 'item_5', url: 'https://cdn.ig/5.jpg' },
        { id: 'item_6_user', url: 'https://cdn.ig/6.mp4' },
        { id: 'item_6', url: 'https://cdn.ig/6.mp4' },
        { id: 'item_7_user', url: 'https://cdn.ig/7.jpg' },
        { id: 'item_7', url: 'https://cdn.ig/7.jpg' },
      ];

      const deduplicated = deduplicateMediaItems(items);
      expect(deduplicated.length).toBe(7);
      expect(deduplicated.map((i) => i.id)).toEqual([
        'item_1_user',
        'item_2_user',
        'item_3_user',
        'item_4_user',
        'item_5_user',
        'item_6_user',
        'item_7_user',
      ]);
    });

    it('getAllHighlightMedia returns exactly 7 items even when cache has 14 duplicate entries', async () => {
      for (let i = 1; i <= 7; i++) {
        const itemObj = {
          url: `https://cdn.ig/slide_${i}.mp4`,
          ext: 'mp4' as const,
          username: 'athlete',
          highlightId: 'hl_7_slides',
        };
        // In-memory cache had both rawId and shortId
        storyMediaCache.set(`media_${i}_user`, { ...itemObj, id: `media_${i}_user` });
        storyMediaCache.set(`media_${i}`, { ...itemObj, id: `media_${i}` });
      }

      expect(Array.from(storyMediaCache.values()).length).toBe(14);

      const items = await getAllHighlightMedia('hl_7_slides', 'athlete');
      expect(items.length).toBe(7);
    });
  });
});
