import { describe, it, expect } from 'vitest';
import {
  sanitizeName,
  sanitizeUsername,
  buildDownloadPath,
  formatStoryFilename,
  formatHighlightFilename,
  formatPostFilename,
  formatReelFilename,
  formatAvatarFilename,
} from '../src/lib/sanitizer';

describe('sanitizer', () => {
  describe('sanitizeName', () => {
    it('strips leading and trailing single and double quotes', () => {
      expect(sanitizeName('"Summer Vacation"')).toBe('Summer Vacation');
      expect(sanitizeName("'Trip to Bali'")).toBe('Trip to Bali');
      expect(sanitizeName('“Smart Quotes”')).toBe('Smart Quotes');
    });

    it('replaces OS illegal characters with underscores', () => {
      expect(sanitizeName('file/with\\illegal:chars*and?"more"')).toBe('file_with_illegal_chars_and_more');
      expect(sanitizeName('test<bracket>and|pipe')).toBe('test_bracket_and_pipe');
    });

    it('preserves Unicode and emojis', () => {
      expect(sanitizeName('Tokyo 2026 🗼 🌸')).toBe('Tokyo 2026 🗼 🌸');
      expect(sanitizeName('مرحبا بالعالم')).toBe('مرحبا بالعالم');
      expect(sanitizeName('Привет мир ✨')).toBe('Привет мир ✨');
    });

    it('strips trailing dots and spaces', () => {
      expect(sanitizeName('folder name...   ')).toBe('folder name');
    });

    it('returns fallback for empty inputs', () => {
      expect(sanitizeName('')).toBe('untitled');
      expect(sanitizeName('   ')).toBe('untitled');
      expect(sanitizeName('???', 'custom_fallback')).toBe('custom_fallback');
    });
  });

  describe('sanitizeUsername', () => {
    it('strips leading @ symbol', () => {
      expect(sanitizeUsername('@natgeo')).toBe('natgeo');
      expect(sanitizeUsername('@@@test_user')).toBe('test_user');
    });

    it('handles empty or blank username', () => {
      expect(sanitizeUsername('')).toBe('anonymous');
    });
  });

  describe('buildDownloadPath', () => {
    it('conforms strictly to Section 9 of the PRD', () => {
      // Stories
      expect(
        buildDownloadPath({
          username: 'johndoe',
          type: 'stories',
          filename: 'story_1700000000_12345.mp4',
        })
      ).toBe('Downplaygram/johndoe/stories/story_1700000000_12345.mp4');

      // Highlights
      expect(
        buildDownloadPath({
          username: 'johndoe',
          type: 'highlights',
          highlightTitle: 'Summer 2026 🌴',
          filename: 'hl_1700000000_67890.mp4',
        })
      ).toBe('Downplaygram/johndoe/highlights/Summer 2026 🌴/hl_1700000000_67890.mp4');

      // Posts
      expect(
        buildDownloadPath({
          username: 'johndoe',
          type: 'posts',
          filename: 'post_C123abc_0.jpg',
        })
      ).toBe('Downplaygram/johndoe/posts/post_C123abc_0.jpg');

      // Reels
      expect(
        buildDownloadPath({
          username: 'johndoe',
          type: 'reels',
          filename: 'reel_D456def.mp4',
        })
      ).toBe('Downplaygram/johndoe/reels/reel_D456def.mp4');

      // Profile
      expect(
        buildDownloadPath({
          username: 'johndoe',
          type: 'profile',
          filename: 'avatar_johndoe_hd.jpg',
        })
      ).toBe('Downplaygram/johndoe/profile/avatar_johndoe_hd.jpg');
    });
  });

  describe('filename formatters', () => {
    it('formats story filename', () => {
      expect(formatStoryFilename('998877', 'mp4', 1700000000)).toBe('story_1700000000_998877.mp4');
    });

    it('formats highlight filename', () => {
      expect(formatHighlightFilename('112233', 'jpg', 1700000000)).toBe('hl_1700000000_112233.jpg');
    });

    it('formats post filename', () => {
      expect(formatPostFilename('Bxyz123', 2, 'jpg')).toBe('post_Bxyz123_2.jpg');
    });

    it('formats reel filename', () => {
      expect(formatReelFilename('Cx99001')).toBe('reel_Cx99001.mp4');
    });

    it('formats avatar filename', () => {
      expect(formatAvatarFilename('@johndoe')).toBe('avatar_johndoe_hd.jpg');
    });
  });
});
