import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleDownloadSinglePost, handleDownloadActiveSlide } from '../src/content/injectors/feed';
import * as sniffer from '../src/lib/media-sniffer';
import * as runtime from '../src/lib/runtime';

describe('feed-injector', () => {
  let mockPost: any;
  let mockBtn: any;
  let sendMessageMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPost = {
      querySelector: vi.fn().mockImplementation((selector: string) => {
        if (selector.includes('header a') || selector.includes('a[role="link"]')) {
          return { textContent: 'default_user' };
        }
        return null;
      }),
      querySelectorAll: vi.fn().mockReturnValue([]),
    };

    mockBtn = {
      innerHTML: '<svg></svg>',
      disabled: false,
    };

    sendMessageMock = vi.spyOn(runtime, 'safeSendMessage').mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleDownloadSinglePost (Unified API Fetcher)', () => {
    it('downloads progressive MP4 via fetchAllMediaFromPostLink when shortcode exists', async () => {
      vi.spyOn(sniffer, 'extractPostShortcode').mockReturnValue('SHORTCODE_FEED_VIDEO');
      vi.spyOn(sniffer, 'fetchAllMediaFromPostLink').mockResolvedValue({
        username: 'videocreator',
        items: [
          { url: 'https://ig.cdn/progressive_feed_video.mp4', ext: 'mp4', index: 1 },
        ],
      });

      await handleDownloadSinglePost(mockPost as unknown as HTMLElement, mockBtn as unknown as HTMLButtonElement);

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      const callArgs = sendMessageMock.mock.calls[0][0];
      expect(callArgs.action).toBe('DOWNLOAD_MEDIA');
      expect(callArgs.payload.url).toBe('https://ig.cdn/progressive_feed_video.mp4');
      expect(callArgs.payload.filename).toContain('Downplaygram/videocreator/posts/SHORTCODE_FEED_VIDEO_');
      expect(callArgs.payload.filename).toMatch(/\.mp4$/);
      expect(mockBtn.innerHTML).toContain('dpg-pop-in');
    });

    it('falls back to DOM extraction if API returns null and photo is present in DOM', async () => {
      vi.spyOn(sniffer, 'extractPostShortcode').mockReturnValue('SHORTCODE_OFFLINE');
      vi.spyOn(sniffer, 'fetchAllMediaFromPostLink').mockResolvedValue(null);
      vi.spyOn(sniffer, 'extractDirectActiveMediaFromDOM').mockReturnValue({
        url: 'https://ig.cdn/offline_photo.jpg',
        ext: 'jpg',
      });

      mockPost.querySelector = vi.fn().mockImplementation((selector: string) => {
        if (selector.includes('header a') || selector.includes('a[role="link"]')) {
          return { textContent: 'fallback_user' };
        }
        return null;
      });

      await handleDownloadSinglePost(mockPost as unknown as HTMLElement, mockBtn as unknown as HTMLButtonElement);

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      const callArgs = sendMessageMock.mock.calls[0][0];
      expect(callArgs.action).toBe('DOWNLOAD_MEDIA');
      expect(callArgs.payload.url).toBe('https://ig.cdn/offline_photo.jpg');
      expect(callArgs.payload.filename).toContain('Downplaygram/fallback_user/posts/post_');
      expect(callArgs.payload.filename).toMatch(/\.jpg$/);
      expect(mockBtn.innerHTML).toContain('dpg-pop-in');
    });

    it('shows red cross ❌ if both API and DOM fallback return null', async () => {
      vi.spyOn(sniffer, 'extractPostShortcode').mockReturnValue('FAILED_SHORTCODE');
      vi.spyOn(sniffer, 'fetchAllMediaFromPostLink').mockResolvedValue(null);
      vi.spyOn(sniffer, 'extractDirectActiveMediaFromDOM').mockReturnValue(null);

      await handleDownloadSinglePost(mockPost as unknown as HTMLElement, mockBtn as unknown as HTMLButtonElement);

      expect(sendMessageMock).not.toHaveBeenCalled();
      expect(mockBtn.innerHTML).toContain('dpg-error-shake');
    });
  });

  describe('handleDownloadActiveSlide (Carousel Active Slide Fallback)', () => {
    it('downloads photo directly from DOM if present without calling API', async () => {
      vi.spyOn(sniffer, 'extractDirectActiveMediaFromDOM').mockReturnValue({
        url: 'https://ig.cdn/carousel_photo.jpg',
        ext: 'jpg',
      });
      const fetchApiSpy = vi.spyOn(sniffer, 'fetchAllMediaFromPostLink');

      mockPost.querySelector = vi.fn().mockImplementation((selector: string) => {
        if (selector.includes('header a') || selector.includes('a[role="link"]')) {
          return { textContent: 'carousel_author' };
        }
        return null;
      });

      await handleDownloadActiveSlide(mockPost as unknown as HTMLElement, mockBtn as unknown as HTMLButtonElement);

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      const callArgs = sendMessageMock.mock.calls[0][0];
      expect(callArgs.payload.url).toBe('https://ig.cdn/carousel_photo.jpg');
      expect(callArgs.payload.filename).toContain('Downplaygram/carousel_author/posts/slide_');
      expect(fetchApiSpy).not.toHaveBeenCalled();
      expect(mockBtn.innerHTML).toContain('dpg-pop-in');
    });

    it('falls back to API when active slide in DOM is a video (DOM returns null)', async () => {
      // DOM returns null because video src is blob:
      vi.spyOn(sniffer, 'extractDirectActiveMediaFromDOM').mockReturnValue(null);
      vi.spyOn(sniffer, 'extractPostShortcode').mockReturnValue('CAROUSEL_VIDEO_SLIDE');
      vi.spyOn(sniffer, 'fetchAllMediaFromPostLink').mockResolvedValue({
        username: 'carousel_creator',
        items: [
          { url: 'https://ig.cdn/slide1_photo.jpg', ext: 'jpg', index: 1 },
          { url: 'https://ig.cdn/slide2_video.mp4', ext: 'mp4', index: 2 },
        ],
      });

      await handleDownloadActiveSlide(mockPost as unknown as HTMLElement, mockBtn as unknown as HTMLButtonElement);

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      const callArgs = sendMessageMock.mock.calls[0][0];
      expect(callArgs.payload.url).toBe('https://ig.cdn/slide2_video.mp4');
      expect(callArgs.payload.filename).toContain('Downplaygram/carousel_creator/posts/CAROUSEL_VIDEO_SLIDE_');
      expect(callArgs.payload.filename).toMatch(/\.mp4$/);
      expect(mockBtn.innerHTML).toContain('dpg-pop-in');
    });

    it('shows red cross ❌ if both DOM and API fail on active slide', async () => {
      vi.spyOn(sniffer, 'extractDirectActiveMediaFromDOM').mockReturnValue(null);
      vi.spyOn(sniffer, 'extractPostShortcode').mockReturnValue(null);

      await handleDownloadActiveSlide(mockPost as unknown as HTMLElement, mockBtn as unknown as HTMLButtonElement);

      expect(sendMessageMock).not.toHaveBeenCalled();
      expect(mockBtn.innerHTML).toContain('dpg-error-shake');
    });
  });
});
