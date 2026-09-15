/**
 * Downplaygram Sanitizer
 * Ported from legacy CLI (src/ig_story_dl/utils.py)
 * Handles title, shortcode, and filename sanitization for cross-platform OS compatibility.
 */

// Characters forbidden in Windows/macOS/Linux paths: / \ : * ? " < > | and control chars (0x00-0x1F)
const ILLEGAL_CHAR_REGEX = /[/\\:*?"<>|\x00-\x1F]/g;

/**
 * Strips leading/trailing single or double quotes, replaces illegal OS path characters
 * with underscores, preserves Unicode and emojis, and trims trailing whitespace/dots.
 */
export function sanitizeName(input: string, fallback = 'untitled'): string {
  if (!input) return fallback;

  // Strip leading and trailing quotes (single and double, including smart quotes)
  let cleaned = input.trim().replace(/^['"“”‘’]+|['"“”‘’]+$/g, '');

  // Replace illegal OS path characters with underscore
  cleaned = cleaned.replace(ILLEGAL_CHAR_REGEX, '_');

  // Collapse consecutive underscores or spaces
  cleaned = cleaned.replace(/_+/g, '_').trim();

  // Strip leading/trailing underscores, dots, and spaces (invalid on Windows/macOS/Linux)
  cleaned = cleaned.replace(/^[._ ]+|[._ ]+$/g, '');

  return cleaned || fallback;
}

/**
 * Sanitizes username specifically (alphanumeric, dots, underscores, no leading/trailing dots or @)
 */
export function sanitizeUsername(username: string): string {
  if (!username) return 'anonymous';
  let cleaned = username.trim().replace(/^@+/, '');
  cleaned = cleaned.replace(ILLEGAL_CHAR_REGEX, '_');
  cleaned = cleaned.replace(/[. ]+$/, '');
  return cleaned || 'anonymous';
}

export interface DownloadPathOptions {
  username: string;
  type: 'stories' | 'highlights' | 'posts' | 'reels' | 'profile';
  filename: string;
  highlightTitle?: string;
}

/**
 * Builds the structured download path adhering to Section 9 of the PRD:
 * Downplaygram/{username}/{type}/{filename}
 */
export function buildDownloadPath(options: DownloadPathOptions): string {
  const user = sanitizeUsername(options.username);
  const file = sanitizeName(options.filename);

  switch (options.type) {
    case 'stories':
      return `Downplaygram/${user}/stories/${file}`;
    case 'highlights': {
      const hlFolder = sanitizeName(options.highlightTitle || 'highlights', 'highlights');
      return `Downplaygram/${user}/highlights/${hlFolder}/${file}`;
    }
    case 'posts':
      return `Downplaygram/${user}/posts/${file}`;
    case 'reels':
      return `Downplaygram/${user}/reels/${file}`;
    case 'profile':
      return `Downplaygram/${user}/profile/${file}`;
    default:
      return `Downplaygram/${user}/${file}`;
  }
}

/**
 * Formats a story filename: story_{timestamp}_{media_id}.{ext}
 */
export function formatStoryFilename(mediaId: string, ext = 'mp4', timestamp?: number): string {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const cleanId = sanitizeName(mediaId, 'media');
  return `story_${ts}_${cleanId}.${ext}`;
}

/**
 * Formats a highlight filename: hl_{timestamp}_{media_id}.{ext}
 */
export function formatHighlightFilename(mediaId: string, ext = 'mp4', timestamp?: number): string {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const cleanId = sanitizeName(mediaId, 'media');
  return `hl_${ts}_${cleanId}.${ext}`;
}

/**
 * Formats a feed post filename: post_{shortcode}_{index}.{ext}
 */
export function formatPostFilename(shortcode: string, index = 0, ext = 'jpg'): string {
  const code = sanitizeName(shortcode, 'post');
  return `post_${code}_${index}.${ext}`;
}

/**
 * Formats a reel filename: reel_{shortcode}.mp4
 */
export function formatReelFilename(shortcode: string): string {
  const code = sanitizeName(shortcode, 'reel');
  return `reel_${code}.mp4`;
}

/**
 * Formats an avatar filename: avatar_{username}_hd.jpg
 */
export function formatAvatarFilename(username: string): string {
  const user = sanitizeUsername(username);
  return `avatar_${user}_hd.jpg`;
}
