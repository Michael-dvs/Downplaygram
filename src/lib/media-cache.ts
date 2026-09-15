/**
 * Downplaygram Media Cache
 * In-memory cache bridging Main World network interception events to Isolated World content scripts.
 * Synchronizes with the synchronous DOM Storage Bridge (<script id="__downplaygram_store__">).
 */

export interface CachedMedia {
  id?: string;
  url: string;
  ext: 'mp4' | 'jpg';
  username: string;
  shortcode?: string;
  highlightId?: string;
}

export type CachedMediaInfo = CachedMedia;

export interface CarouselItem {
  url: string;
  ext: 'mp4' | 'jpg';
  index: number;
}

export interface CachedPostData {
  shortcode: string;
  username: string;
  isCarousel: boolean;
  items: CarouselItem[];
}

// Memory cache di Content Script
export const storyMediaCache: Map<string, CachedMedia> = new Map();
export const postMediaCache: Map<string, CachedPostData> = new Map();

/**
 * Menyinkronkan cache memori dengan script tag DOM bridge
 */
export function getHydratedCache(): Map<string, CachedMedia> {
  if (typeof document !== 'undefined') {
    const storeEl = document.getElementById('__downplaygram_store__');
    if (storeEl && storeEl.textContent) {
      try {
        const parsed = JSON.parse(storeEl.textContent);
        Object.entries(parsed).forEach(([id, data]: [string, any]) => {
          if (id && data?.url) {
            storyMediaCache.set(id, data);
          }
        });
      } catch {}
    }
  }
  return storyMediaCache;
}

/**
 * Menyimpan atau memperbarui data carousel secara dinamis (incremental merge)
 */
export function upsertCarouselData(shortcode: string, username: string, newItems: CarouselItem[]): void {
  const existing = postMediaCache.get(shortcode);

  if (!existing) {
    postMediaCache.set(shortcode, {
      shortcode,
      username,
      isCarousel: true,
      items: newItems,
    });
    return;
  }

  // Gabungkan item lama dengan item baru, buang duplikasi berdasarkan URL
  const combined = [...existing.items];
  newItems.forEach((newItem) => {
    const exists = combined.some((item) => item.url === newItem.url);
    if (!exists) {
      combined.push({
        ...newItem,
        index: combined.length,
      });
    }
  });

  existing.items = combined;
  postMediaCache.set(shortcode, existing);
}

// Dengarkan event dari Main World Interceptor
if (typeof window !== 'undefined') {
  window.addEventListener('__DOWNPLAYGRAM_MEDIA_DISCOVERED__', ((event: CustomEvent<Record<string, CachedMedia>>) => {
    const mediaMap = event.detail;
    if (!mediaMap || typeof mediaMap !== 'object') return;

    Object.entries(mediaMap).forEach(([id, mediaInfo]) => {
      if (id && mediaInfo?.url) {
        storyMediaCache.set(id, mediaInfo);
      }
    });
  }) as EventListener);

  window.addEventListener('__DOWNPLAYGRAM_POSTS_DISCOVERED__', ((event: CustomEvent<Record<string, CachedPostData>>) => {
    const postMap = event.detail;
    if (!postMap || typeof postMap !== 'object') return;

    Object.entries(postMap).forEach(([code, postData]) => {
      if (code && postData) {
        if (postData.isCarousel) {
          upsertCarouselData(code, postData.username, postData.items);
        } else {
          postMediaCache.set(code, postData);
        }
      }
    });
  }) as EventListener);
}
