/**
 * Downplaygram Media Sniffer
 * Extracts direct CDN URLs from Instagram DOM elements and media objects,
 * filtering out adaptive DASH fragments in favor of progressive MP4 streams.
 */

import { safeSendMessage } from './runtime';
import {
  storyMediaCache,
  postMediaCache,
  upsertCarouselData,
  getHydratedCache,
  type CachedPostData,
  type CarouselItem,
  type CachedMedia,
} from './media-cache';

export interface MediaResult {
  url: string;
  type: 'video' | 'image';
  width?: number;
  height?: number;
}

/**
 * Checks if a URL points to a DASH fragment or initialization chunk that cannot
 * be played or downloaded standalone (causes 404 or corrupted file).
 */
export function isDashChunk(url: string): boolean {
  if (!url) return false;
  return (
    url.includes('dashinit') ||
    url.includes('_video_dashinit') ||
    url.includes('_audio_dashinit') ||
    url.includes('.mpd') ||
    url.includes('dash-')
  );
}

/**
 * Parses an HTML srcset attribute and selects the candidate with the highest resolution width.
 */
export function extractHighestResFromSrcset(srcset: string): string | null {
  if (!srcset) return null;

  const candidates = srcset
    .split(',')
    .map((entry) => {
      const parts = entry.trim().split(/\s+/);
      const url = parts[0];
      let width = 0;
      if (parts[1] && parts[1].endsWith('w')) {
        width = parseInt(parts[1].slice(0, -1), 10) || 0;
      }
      return { url, width };
    })
    .filter((c) => Boolean(c.url));

  if (candidates.length === 0) return null;

  // Sort descending by width
  candidates.sort((a, b) => b.width - a.width);
  const best = candidates[0];
  return best?.url ?? null;
}

/**
 * Extracts the best progressive MP4 stream URL from a <video> element.
 */
export function extractVideoUrl(videoEl: HTMLVideoElement): string | null {
  // Check direct src first
  const candidates: string[] = [];

  if (videoEl.currentSrc) {
    candidates.push(videoEl.currentSrc);
  }
  if (videoEl.src) {
    candidates.push(videoEl.src);
  }

  // Check child source elements
  const sources = videoEl.querySelectorAll('source');
  sources.forEach((source) => {
    if (source.src) {
      candidates.push(source.src);
    }
  });

  // Filter out DASH chunks and blob URLs (if any, though blob URLs are usually MSE)
  const validStreams = candidates.filter((url) => {
    return url && !isDashChunk(url) && !url.startsWith('blob:');
  });

  const firstValid = validStreams[0];
  if (firstValid) {
    return firstValid;
  }

  // If only blob or currentSrc exists, return currentSrc if not dash chunk
  if (videoEl.currentSrc && !isDashChunk(videoEl.currentSrc)) {
    return videoEl.currentSrc;
  }

  return null;
}

/**
 * Extracts the highest quality image URL from an <img> element.
 */
export function extractImageUrl(imgEl: HTMLImageElement): string | null {
  if (imgEl.srcset) {
    const highestRes = extractHighestResFromSrcset(imgEl.srcset);
    if (highestRes) return highestRes;
  }
  if (imgEl.currentSrc) {
    return imgEl.currentSrc;
  }
  return imgEl.src || null;
}

/**
 * Traverses an element or container to extract the best media candidate (video preferred if present).
 */
export function extractBestMediaUrl(element: HTMLElement): MediaResult | null {
  if (!element) return null;

  // 1. Check if the element itself or any child is a <video>
  const videoEl =
    element instanceof HTMLVideoElement
      ? element
      : (element.querySelector('video') as HTMLVideoElement | null);

  if (videoEl) {
    const videoUrl = extractVideoUrl(videoEl);
    if (videoUrl) {
      return {
        url: videoUrl,
        type: 'video',
      };
    }
  }

  // 2. Check if the element itself or any child is an <img>
  const imgEl =
    element instanceof HTMLImageElement
      ? element
      : (element.querySelector('img') as HTMLImageElement | null);

  if (imgEl) {
    const imageUrl = extractImageUrl(imgEl);
    if (imageUrl) {
      return {
        url: imageUrl,
        type: 'image',
      };
    }
  }

  // 3. Check for background image in style
  const bgImg = element.style.backgroundImage;
  if (bgImg && bgImg.startsWith('url(')) {
    const match = bgImg.match(/url\(["']?([^"']+)["']?\)/);
    if (match && match[1]) {
      return {
        url: match[1],
        type: 'image',
      };
    }
  }

  return null;
}

/**
 * Finds the story card that is currently active and centered in the viewport.
 */
export function getActiveStoryCard(): HTMLElement | null {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  // 1. Ambil seluruh layer di titik tengah layar
  const elementsAtCenter = document.elementsFromPoint(centerX, centerY);
  for (const el of elementsAtCenter) {
    if (el instanceof HTMLElement && el.clientWidth > 280 && el.clientHeight > 350) {
      if (el.tagName !== 'BODY' && el.tagName !== 'HTML') {
        const isCard =
          el.tagName === 'SECTION' ||
          el.getAttribute('role') === 'region' ||
          el.querySelector('video, img');
        if (isCard) return el;
      }
    }
  }

  // 2. Candidates query
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'section, div[role="dialog"] section, div[role="dialog"] > div'
    )
  );
  for (const card of candidates) {
    const rect = card.getBoundingClientRect();
    if (
      rect.left <= centerX &&
      rect.right >= centerX &&
      rect.top <= centerY &&
      rect.bottom >= centerY &&
      rect.width > 280
    ) {
      return card;
    }
  }

  // 3. Fallback: cari section yang memiliki video aktif (playing)
  const playingVideo = document.querySelector<HTMLVideoElement>('video:not([paused])');
  if (playingVideo) {
    return playingVideo.closest('section') || (playingVideo.parentElement as HTMLElement | null) || null;
  }

  return document.querySelector('section');
}

const IG_APP_ID = '936619743392459';

/**
 * Mengambil CSRF token dari cookie browser
 */
function getCsrfToken(): string {
  if (typeof document === 'undefined' || !document.cookie) return '';
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match && match[1] ? match[1] : '';
}

/**
 * Sniff URL MP4 dari Performance API (mendukung fbcdn.net & cdninstagram.com)
 */
function sniffPerformanceMedia(): string | null {
  try {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const mediaEntries = resources
      .filter((r) => {
        const name = r.name.toLowerCase();
        const isCdn = name.includes('fbcdn.net') || name.includes('cdninstagram.com');
        const isVideo = name.includes('.mp4') || name.includes('/v/t50.') || name.includes('bytestart');
        const isNotDash = !name.includes('dashinit') && !name.includes('_audio_dashinit');
        return isCdn && isVideo && isNotDash;
      })
      .reverse();

    const firstEntry = mediaEntries[0];
    if (firstEntry) {
      return firstEntry.name.replace(/&bytestart=\d+&byteend=\d+/, '');
    }
  } catch (e) {
    console.warn('[Downplaygram] Performance timing error:', e);
  }
  return null;
}

/**
 * Fallback API resmi Instagram Web dengan proteksi CSRF & tipe konten
 */
async function fetchStoryMediaViaApi(
  username: string,
  mediaId?: string | null
): Promise<{ url: string; ext: 'mp4' | 'jpg'; username: string } | null> {
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {
    'X-IG-App-ID': IG_APP_ID,
    'X-ASBD-ID': '129477',
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }

  // Jika ada mediaId di URL, coba langsung media info API terlebih dahulu
  if (mediaId && /^\d+$/.test(mediaId)) {
    try {
      const mediaRes = await fetch(`https://www.instagram.com/api/v1/media/${mediaId}/info/`, {
        headers,
      });
      const mediaContentType = mediaRes.headers.get('content-type') || '';
      if (mediaRes.ok && mediaContentType.includes('application/json')) {
        const mediaData = await mediaRes.json();
        const item = mediaData.items?.[0];
        if (item) {
          if (item.video_versions && item.video_versions.length > 0) {
            const bestVideo =
              item.video_versions.find((v: any) => !v.url.includes('dashinit')) ||
              item.video_versions[0];
            return {
              url: bestVideo.url,
              ext: 'mp4',
              username: item.user?.username || username,
            };
          }
          if (item.image_versions2?.candidates && item.image_versions2.candidates.length > 0) {
            return {
              url: item.image_versions2.candidates[0].url,
              ext: 'jpg',
              username: item.user?.username || username,
            };
          }
        }
      }
    } catch (err) {
      console.warn('[Downplaygram] Media info API error:', err);
    }
  }

  try {
    const userRes = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      { headers }
    );

    // Cegah crash SyntaxError jika server mengembalikan HTML
    const contentType = userRes.headers.get('content-type') || '';
    if (!userRes.ok || !contentType.includes('application/json')) {
      return null;
    }

    const userData = await userRes.json();
    const userId = userData?.data?.user?.id;
    if (!userId) return null;

    const reelRes = await fetch(
      `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(userId)}`,
      { headers }
    );
    const reelContentType = reelRes.headers.get('content-type') || '';
    if (!reelRes.ok || !reelContentType.includes('application/json')) {
      return null;
    }

    const reelData = await reelRes.json();
    const items = reelData.reels?.[userId]?.items || [];
    if (items.length === 0) return null;

    // Ambil media dari item aktif
    let activeItem = items[items.length - 1];
    if (mediaId) {
      const matched = items.find(
        (it: any) => String(it.id).startsWith(mediaId) || String(it.pk) === mediaId
      );
      if (matched) activeItem = matched;
    }

    if (activeItem.video_versions && activeItem.video_versions.length > 0) {
      const bestVideo =
        activeItem.video_versions.find((v: any) => !v.url.includes('dashinit')) ||
        activeItem.video_versions[0];
      return { url: bestVideo.url, ext: 'mp4', username: activeItem.user?.username || username };
    }

    if (activeItem.image_versions2?.candidates && activeItem.image_versions2.candidates.length > 0) {
      return {
        url: activeItem.image_versions2.candidates[0].url,
        ext: 'jpg',
        username: activeItem.user?.username || username,
      };
    }
  } catch (err) {
    console.warn('[Downplaygram] API fetch fallback error:', err);
  }

  return null;
}

export interface StoryMediaResult {
  url: string;
  ext: 'mp4' | 'jpg';
  username: string;
}

export interface SniffedMedia {
  type?: 'video' | 'photo' | 'photo_with_music';
  url: string;
  ext?: 'mp4' | 'jpg';
  audioUrl?: string;
  username: string;
}

export type ValidStoryMedia = CachedMedia;

/**
 * Mendapatkan indeks slide story aktif (0, 1, 2, ...) berdasarkan progress bar di atas kartu
 */
export function getActiveStorySlideIndex(cardContainer: HTMLElement): number {
  // Kontainer progress bar di story biasanya berupa kontainer flex di bagian atas
  const header = cardContainer.querySelector('header');
  if (header && header.parentElement) {
    const topBarsContainer = header.parentElement.querySelector('div[style*="display: flex"], div.x78zum5');
    if (topBarsContainer) {
      const segments = Array.from(topBarsContainer.children) as HTMLElement[];
      if (segments.length > 1) {
        // Cari segmen yang sedang aktif (memiliki child dengan transform scaleX > 0)
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          if (!seg) continue;
          const fillBar = seg.querySelector('div');
          if (fillBar) {
            const transform = fillBar.style.transform || '';
            // Jika bar sedang berjalan (scaleX > 0) atau tidak kosong sebelum bar berikutnya kosong
            if (transform.includes('scaleX') && !transform.includes('scaleX(0)')) {
              const nextSegment = segments[i + 1]?.querySelector('div');
              const nextTransform = nextSegment?.style.transform || '';
              if (!nextSegment || nextTransform.includes('scaleX(0)') || nextTransform === '') {
                return i;
              }
            }
          }
        }
      }
    }
  }

  // Fallback: cek querySelectorAll transform di atas
  const progressBars = Array.from(
    cardContainer.querySelectorAll<HTMLElement>('header ~ div div[style*="transform"], header div[role="progressbar"], div._acnb')
  );
  if (progressBars.length > 0) {
    for (let i = 0; i < progressBars.length; i++) {
      const bar = progressBars[i];
      if (!bar) continue;
      const transform = bar.style.transform || '';
      if (transform.includes('scaleX') && !transform.includes('scaleX(0)')) {
        const nextBar = progressBars[i + 1];
        const nextTransform = nextBar?.style.transform || '';
        if (!nextBar || nextTransform.includes('scaleX(0)') || nextTransform === '') {
          return i;
        }
      }
    }
  }

  return 0; // Default ke slide pertama
}

/**
 * Mengambil seluruh story pengguna secara aktif dari Web API jika cache interceptor kosong (Cold Start)
 */
export async function fetchUserStoriesOnDemand(username: string): Promise<void> {
  const csrf = getCsrfToken();
  const headers: Record<string, string> = {
    'X-IG-App-ID': IG_APP_ID,
    'X-ASBD-ID': '129477',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json',
  };
  if (csrf) headers['X-CSRFToken'] = csrf;

  try {
    // 1. Ambil User ID dari Web Profile Info
    const profileRes = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      { headers, credentials: 'include' }
    );
    if (!profileRes.ok) return;

    const profileData = await profileRes.json();
    const userId = profileData?.data?.user?.id;
    if (!userId) return;

    // 2. Ambil daftar Reels Media story dari User ID
    const reelsRes = await fetch(
      `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(userId)}`,
      { headers, credentials: 'include' }
    );
    if (!reelsRes.ok) return;

    const reelsData = await reelsRes.json();
    const items = reelsData?.reels?.[userId]?.items || [];

    // 3. Masukkan ke dalam storyMediaCache
    items.forEach((item: any) => {
      const rawId = item?.pk || item?.id;
      const id = rawId ? String(rawId) : '';
      if (item.video_versions && item.video_versions.length > 0) {
        const validVideos = item.video_versions.filter(
          (v: any) => v?.url && !v.url.includes('dashinit') && !v.url.includes('_audio_dashinit')
        );
        validVideos.sort(
          (a: any, b: any) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
        );
        const bestVideo = validVideos[0] || item.video_versions[0];
        if (bestVideo?.url && id) {
          storyMediaCache.set(id, { url: bestVideo.url, ext: 'mp4', username: username.toLowerCase() });
          if (id.includes('_')) {
            const shortId = id.split('_')[0];
            if (shortId) storyMediaCache.set(shortId, { url: bestVideo.url, ext: 'mp4', username: username.toLowerCase() });
          }
        }
      } else if (item.image_versions2?.candidates && item.image_versions2.candidates.length > 0) {
        const candidate = item.image_versions2.candidates[0];
        if (candidate?.url && id) {
          storyMediaCache.set(id, { url: candidate.url, ext: 'jpg', username: username.toLowerCase() });
          if (id.includes('_')) {
            const shortId = id.split('_')[0];
            if (shortId) storyMediaCache.set(shortId, { url: candidate.url, ext: 'jpg', username: username.toLowerCase() });
          }
        }
      }
    });
  } catch {}
}

/**
 * Mengambil seluruh story aktif milik username tertentu secara lengkap
 */
export async function getAllStoriesForUser(username: string): Promise<CachedMedia[]> {
  const cleanUsername = username.toLowerCase();
  const cache = getHydratedCache();

  // 1. Ambil dari cache jika sudah ada
  let userItems = Array.from(cache.values()).filter(
    (item) => item.username.toLowerCase() === cleanUsername
  );

  // 2. Jika cache masih kosong, hydrate via Web API
  if (userItems.length === 0) {
    await fetchUserStoriesOnDemand(cleanUsername);
    const refreshedCache = getHydratedCache();
    userItems = Array.from(refreshedCache.values()).filter(
      (item) => item.username.toLowerCase() === cleanUsername
    );
  }

  return deduplicateMediaItems(userItems);
}

/**
 * Helper deduplikasi mutlak berbasis ID unik dan URL file
 */
export function deduplicateMediaItems<T extends { id?: string; url: string }>(items: T[]): T[] {
  const uniqueList: T[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();

  for (const item of items) {
    const rawId = item.id ? String(item.id) : '';
    const cleanId = rawId.match(/^(\d+)_\d+$/)?.[1] || rawId.replace(/_user$/, '');
    const cleanUrl = item.url ? item.url.split('?')[0] : '';

    // Jika ID atau URL sudah pernah dicatat, lewati (tolak duplikasi)
    if ((cleanId && seenIds.has(cleanId)) || (cleanUrl && seenUrls.has(cleanUrl)) || seenUrls.has(item.url)) {
      continue;
    }

    if (cleanId) seenIds.add(cleanId);
    if (cleanUrl) seenUrls.add(cleanUrl);
    if (item.url) seenUrls.add(item.url);
    uniqueList.push(item);
  }

  return uniqueList;
}

export interface HighlightContext {
  isHighlight: boolean;
  highlightId: string | null;
  username: string;
}

/**
 * Mendapatkan konteks Story reguler atau Sorotan (Highlight ID & Username pemilik)
 */
export function getStoryOrHighlightContext(cardContainer?: HTMLElement): HighlightContext {
  const path = typeof window !== 'undefined' && window.location ? window.location.pathname : '';
  const isHighlight = path.includes('/stories/highlights/');

  let highlightId: string | null = null;
  let username = 'instagram_user';

  if (isHighlight) {
    const match = path.match(/\/stories\/highlights\/([A-Za-z0-9_-]+)/);
    highlightId = match && match[1] ? match[1] : null;

    const card = cardContainer || (typeof document !== 'undefined' && typeof document.querySelector === 'function'
      ? document.querySelector<HTMLElement>('section, div[role="dialog"]') || undefined
      : undefined);

    // 1. Ekstrak username dari anchor header kartu sorotan
    const headerAnchor = card?.querySelector<HTMLAnchorElement>('header a[role="link"], header a');
    const headerHref = headerAnchor?.getAttribute('href') || '';
    const userFromHref = headerHref.replace(/^\/+|\/+$/g, '').split('?')[0];

    if (
      userFromHref &&
      !userFromHref.includes('/') &&
      userFromHref !== 'stories' &&
      userFromHref !== 'highlights'
    ) {
      username = userFromHref;
    } else {
      // 2. Fallback: Ekstrak dari placeholder input komentar ("Reply to {username}..." atau "Balas ke {username}...")
      const input = card?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input[placeholder*="Reply to"], input[placeholder*="Balas ke"], textarea[placeholder*="Reply to"], textarea[placeholder*="Balas ke"]'
      );
      const placeholder = input?.getAttribute('placeholder') || '';
      const replyMatch = placeholder.match(/(?:Reply to|Balas ke)\s+([A-Za-z0-9._]+)/i);
      if (replyMatch && replyMatch[1]) {
        username = replyMatch[1].replace(/\.+$/, '').trim();
      } else {
        // 3. Fallback: Ekstrak dari teks di dalam header (nama akun)
        const headerTitle = card?.querySelector<HTMLElement>('header span a, header h2, header h1');
        const headerText = headerTitle?.textContent?.trim();
        if (headerText && !headerText.includes(' ') && /^[A-Za-z0-9._]+$/.test(headerText)) {
          username = headerText;
        } else if (highlightId) {
          // 4. Fallback: Periksa cache jika ada item highlightId yang memiliki username valid
          const cache = getHydratedCache();
          for (const item of cache.values()) {
            if (item.highlightId === highlightId && item.username && item.username !== 'instagram_user') {
              username = item.username;
              break;
            }
          }
        }
      }
    }
  } else {
    // Story reguler: ambil langsung dari path /stories/{username}/
    const pathParts = path.split('/').filter(Boolean);
    const storyIdx = pathParts.indexOf('stories');
    if (storyIdx !== -1 && pathParts[storyIdx + 1]) {
      username = pathParts[storyIdx + 1]!;
    }
  }

  return { isHighlight, highlightId, username: username.toLowerCase() };
}

/**
 * Mengambil seluruh media di dalam Sorotan (Highlight) tertentu secara presisi tanpa duplikasi
 */
export async function getAllHighlightMedia(
  highlightId: string,
  username: string
): Promise<CachedMedia[]> {
  const cache = getHydratedCache();
  const cleanUser = username.toLowerCase();

  // 1. Cek cache memori lokal
  const cachedItems = Array.from(cache.values()).filter(
    (item) => item.highlightId === highlightId && (cleanUser !== 'instagram_user' ? item.username.toLowerCase() === cleanUser : true)
  );

  // Jika cache lokal sudah ada, bersihkan duplikat lalu return
  if (cachedItems.length > 0) {
    return deduplicateMediaItems(cachedItems);
  }

  // 2. Fetch On-Demand dari Server Instagram dengan prefix highlight:
  let json: any = null;

  // 2a. Delegasikan ke Background Service Worker untuk bypass CORS & CSP
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      const bgRes = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'FETCH_HIGHLIGHT_MEDIA', highlightId },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(response);
            }
          }
        );
      });
      if (bgRes?.success && bgRes.data) {
        json = bgRes.data;
      }
    } catch {
      // Fallback ke direct fetch
    }
  }

  // 2b. Fallback direct fetch jika background relay tidak tersedia (misal di test env)
  if (!json) {
    const csrf = getCsrfToken();
    const headers: Record<string, string> = {
      'X-IG-App-ID': IG_APP_ID,
      'X-ASBD-ID': '129477',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json',
    };
    if (csrf) headers['X-CSRFToken'] = csrf;

    try {
      const res = await fetch(
        `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=highlight%3A${encodeURIComponent(highlightId)}`,
        { method: 'GET', headers, credentials: 'include' }
      );

      if (!res.ok) return [];
      json = await res.json();
    } catch (err) {
      console.error('[Downplaygram] Error fetching highlight media:', err);
      return [];
    }
  }

  try {
    const reelKey = `highlight:${highlightId}`;

    // PENTING: Gunakan FALLBACK (||), JANGAN PERNAH concat properti ini
    const rawItems =
      json?.reels?.[reelKey]?.items ||
      json?.reels?.[highlightId]?.items ||
      json?.reels_media?.find((r: any) => r.id === reelKey || r.id === highlightId)?.items ||
      json?.reels_media?.[0]?.items ||
      [];

    const reel =
      json?.reels?.[reelKey] ||
      json?.reels?.[highlightId] ||
      json?.reels_media?.find((r: any) => r.id === reelKey || r.id === highlightId) ||
      json?.reels_media?.[0];
    const resolvedUsername = reel?.user?.username ? reel.user.username.toLowerCase() : cleanUser;

    const collected: CachedMedia[] = [];

    rawItems.forEach((item: any, idx: number) => {
      // Normalisasi ID (buang suffix user_id jika ada)
      const fullId = String(item.pk || item.id || `${highlightId}_${idx}`);
      const rawId = fullId.match(/^(\d+)_\d+$/)?.[1] || fullId.replace(/_user$/, '');
      const isVideo = item.media_type === 2 || Boolean(item.video_versions && item.video_versions.length > 0);
      let url = '';

      if (isVideo && item.video_versions?.length) {
        const validVids = item.video_versions.filter(
          (v: any) => v?.url && !v.url.includes('dashinit') && !v.url.includes('_audio_dashinit')
        );
        validVids.sort((a: any, b: any) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
        url = validVids[0]?.url || item.video_versions[0]?.url || '';
      } else if (item.image_versions2?.candidates?.length) {
        url = item.image_versions2.candidates[0].url;
      }

      if (url) {
        const mediaObj: CachedMedia = {
          id: rawId,
          url,
          ext: isVideo ? 'mp4' : 'jpg',
          username: resolvedUsername,
          highlightId,
        };
        storyMediaCache.set(rawId, mediaObj);
        collected.push(mediaObj);
      }
    });

    // 3. Terapkan Double-Lock Deduplication
    return deduplicateMediaItems(collected);
  } catch (err) {
    console.error('[Downplaygram] Error fetching highlight media:', err);
    return [];
  }
}

/**
 * Ekstraksi media story atau sorotan yang 100% terkunci pada kartu aktif di tengah layar
 * Menerapkan Triple-Lock: URL/Highlight Context Firewall + DOM Storage Bridge + Viewport Center Pinning
 */
export async function extractActiveStoryMediaStrict(
  triggerBtn?: HTMLElement
): Promise<CachedMedia | null> {
  // 1. Pastikan cache telah menyerap data dari DOM Storage Bridge
  const cache = getHydratedCache();

  const cardContainer = triggerBtn ? (
    triggerBtn.closest<HTMLElement>('section') ||
    triggerBtn.closest<HTMLElement>('div[role="dialog"]') ||
    triggerBtn.closest<HTMLElement>('div[tabindex="-1"]') ||
    triggerBtn.parentElement?.closest<HTMLElement>('section, div[role="dialog"]')
  ) : (typeof document !== 'undefined' && typeof document.querySelector === 'function' ? document.querySelector<HTMLElement>('section, div[role="dialog"]') || undefined : undefined);

  // 2. Dapatkan Konteks Story reguler atau Sorotan
  const context = getStoryOrHighlightContext(cardContainer || undefined);
  const activeUsername = context.username;

  if (!context.isHighlight) {
    const pathname = typeof window !== 'undefined' && window.location ? window.location.pathname : '';
    const pathParts = pathname.split('/').filter(Boolean);
    const storyIdx = pathParts.indexOf('stories');
    if (storyIdx === -1 || !pathParts[storyIdx + 1]) {
      return null;
    }
  }

  // JIKA SOROTAN (HIGHLIGHTS):
  if (context.isHighlight && context.highlightId) {
    let highlightItems = Array.from(cache.values()).filter(
      (item) => item.highlightId === context.highlightId
    );

    if (highlightItems.length === 0) {
      highlightItems = await getAllHighlightMedia(context.highlightId, activeUsername);
    }

    if (highlightItems.length > 0) {
      let activeIdx = 0;
      if (cardContainer) {
        const progressSegments = Array.from(
          cardContainer.querySelectorAll('header ~ div div[style*="transform"], header div[role="progressbar"], div._acnb, div[role="tablist"] > *')
        );
        if (progressSegments.length > 1) {
          const foundIdx = progressSegments.findIndex((seg: any) => {
            const tr = seg.style?.transform || '';
            return tr.includes('scaleX') && !tr.includes('scaleX(0)');
          });
          if (foundIdx !== -1) {
            activeIdx = foundIdx;
          } else {
            activeIdx = getActiveStorySlideIndex(cardContainer);
          }
        } else {
          activeIdx = getActiveStorySlideIndex(cardContainer);
        }
      }

      const item = (activeIdx < highlightItems.length && highlightItems[activeIdx]) ? highlightItems[activeIdx] : highlightItems[0];
      if (item) {
        return item;
      }
    }
  } else {
    // JIKA STORY REGULER:
    const pathname = typeof window !== 'undefined' && window.location ? window.location.pathname : '';
    const pathParts = pathname.split('/').filter(Boolean);
    const storyIdx = pathParts.indexOf('stories');
    const urlMediaId = pathParts[storyIdx + 2] && /^\d+$/.test(pathParts[storyIdx + 2]!) ? pathParts[storyIdx + 2]! : null;

    // PRIORITAS 1: Cocokkan langsung Media ID dari URL
    if (urlMediaId && cache.has(urlMediaId)) {
      const item = cache.get(urlMediaId)!;
      if (item.username.toLowerCase() === activeUsername) {
        return item;
      }
    }

    // PRIORITAS 2: Ambil seluruh media milik activeUsername yang tersimpan di cache
    let userItems = Array.from(cache.values()).filter(
      (item) => item.username.toLowerCase() === activeUsername
    );

    // Jika cache masih kosong (misal service worker cache / request awal lolos), picu fetchUserStoriesOnDemand
    if (userItems.length === 0) {
      await fetchUserStoriesOnDemand(activeUsername);
      const refreshedCache = getHydratedCache();
      userItems = Array.from(refreshedCache.values()).filter(
        (item) => item.username.toLowerCase() === activeUsername
      );
    }

    if (userItems.length > 0) {
      // Cari index slide dari progress bar atas
      let activeIdx = 0;
      if (cardContainer) {
        const progressSegments = Array.from(
          cardContainer.querySelectorAll('header ~ div div[style*="transform"], header div[role="progressbar"], div._acnb, div[role="tablist"] > *')
        );
        if (progressSegments.length > 1) {
          const foundIdx = progressSegments.findIndex((seg: any) => {
            const tr = seg.style?.transform || '';
            return tr.includes('scaleX') && !tr.includes('scaleX(0)');
          });
          if (foundIdx !== -1) {
            activeIdx = foundIdx;
          } else {
            activeIdx = getActiveStorySlideIndex(cardContainer);
          }
        } else {
          activeIdx = getActiveStorySlideIndex(cardContainer);
        }
      }

      const item = (activeIdx < userItems.length && userItems[activeIdx]) ? userItems[activeIdx] : userItems[0];
      if (item) {
        return item;
      }
    }
  }

  // PRIORITAS 3: DOM Sniffing Langsung di tengah layar (Hanya jika foto murni non-blob atau video murni)
  const innerW = typeof window !== 'undefined' ? window.innerWidth : 1000;
  const centerX = innerW / 2;
  const tolerance = 80;

  const searchScope: Document | HTMLElement | null =
    (cardContainer && typeof cardContainer.querySelectorAll === 'function')
      ? cardContainer
      : (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function' ? document : null);

  if (searchScope && typeof searchScope.querySelectorAll === 'function') {
    // Deteksi video non-blob di tengah layar
    let allVideos = Array.from(searchScope.querySelectorAll<HTMLVideoElement>('video'));
    if (allVideos.length === 0 && typeof document !== 'undefined' && typeof document.querySelectorAll === 'function' && searchScope !== document) {
      allVideos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
    }

    const activeVideo = allVideos.find((v) => {
      const r = typeof v.getBoundingClientRect === 'function' ? v.getBoundingClientRect() : { left: 0, right: 0, width: 0, height: 0 };
      const left = r.left !== undefined ? r.left : (centerX - (r.width || 0) / 2);
      const right = r.right !== undefined ? r.right : (centerX + (r.width || 0) / 2);
      return left <= centerX + tolerance && right >= centerX - tolerance && (r.width || 0) > 200 && (r.height || 0) > 200;
    });

    if (activeVideo) {
      const src = activeVideo.currentSrc || activeVideo.src || activeVideo.querySelector('source')?.src;
      if (src && !src.startsWith('blob:') && !src.includes('dashinit')) {
        return { id: 'dom_video', url: src, ext: 'mp4', username: activeUsername };
      }
    }

    // Deteksi foto non-blob di tengah layar
    let allImages = Array.from(searchScope.querySelectorAll<HTMLImageElement>('img'));
    if (allImages.length === 0 && typeof document !== 'undefined' && typeof document.querySelectorAll === 'function' && searchScope !== document) {
      allImages = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
    }

    const validImages = allImages.filter((img) => {
      if (img.closest && (img.closest('header') || img.closest('button'))) return false;
      const r = typeof img.getBoundingClientRect === 'function' ? img.getBoundingClientRect() : { left: 0, right: 0, width: 0, height: 0 };
      const left = r.left !== undefined ? r.left : (centerX - (r.width || 0) / 2);
      const right = r.right !== undefined ? r.right : (centerX + (r.width || 0) / 2);
      const isAtCenter = left <= centerX + tolerance && right >= centerX - tolerance;
      const isStorySize = ((r.width || 0) > 200 && (r.height || 0) > 300) || ((img.naturalWidth || 0) > 500 && (img.naturalHeight || 0) > 500);
      return isAtCenter && isStorySize;
    });

    if (validImages.length > 0) {
      validImages.sort((a, b) => {
        const rectA = typeof a.getBoundingClientRect === 'function' ? a.getBoundingClientRect() : { width: 0, height: 0 };
        const rectB = typeof b.getBoundingClientRect === 'function' ? b.getBoundingClientRect() : { width: 0, height: 0 };
        const areaA = (a.clientWidth || rectA.width || 0) * (a.clientHeight || rectA.height || 0);
        const areaB = (b.clientWidth || rectB.width || 0) * (b.clientHeight || rectB.height || 0);
        return areaB - areaA;
      });
      const activeImg = validImages[0];
      if (activeImg) {
        let imgSrc = activeImg.currentSrc || activeImg.src;
        const srcset = activeImg.getAttribute ? activeImg.getAttribute('srcset') : null;
        if (srcset) {
          const parts = srcset.split(',').map((s) => s.trim().split(' '));
          const lastPart = parts[parts.length - 1];
          if (lastPart && lastPart[0]) imgSrc = lastPart[0];
        }
        if (imgSrc && !imgSrc.startsWith('blob:')) {
          return { id: 'dom_photo', url: imgSrc, ext: 'jpg', username: activeUsername };
        }
      }
    }
  }

  return null;
}

/**
 * Ekstraksi media story aktif (Mendukung pendelegasian ke extractActiveStoryMediaStrict)
 */
export async function extractCurrentStoryMedia(
  triggerBtn?: HTMLElement
): Promise<StoryMediaResult | null> {
  const strictResult = await extractActiveStoryMediaStrict(triggerBtn);
  if (strictResult) {
    return {
      url: strictResult.url,
      ext: strictResult.ext,
      username: strictResult.username,
    };
  }

  return null;
}

/**
 * Mengekstrak shortcode postingan/reel langsung dari DOM kartu postingan (article atau dialog)
 */
export function extractShortcodeFromPostElement(postElement: HTMLElement): string | null {
  // 1. Cari tautan yang mengarah ke /p/{shortcode}/ atau /reel/{shortcode}/ atau /reels/{shortcode}/
  const permalinks = Array.from(
    postElement.querySelectorAll<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]')
  );

  for (const link of permalinks) {
    const href = link.getAttribute('href') || '';
    const match = href.match(/\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }

  // 2. Fallback: Cek URL halaman jika pengguna sedang membuka rute modal (/p/{shortcode}/ atau /reel/{shortcode}/)
  const pathname = typeof window !== 'undefined' && window.location ? window.location.pathname : '';
  const pathMatch = pathname.match(/\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/);
  return pathMatch && pathMatch[1] ? pathMatch[1] : null;
}

/**
 * Ekstraksi media Feed (Video atau Foto) menggunakan shortcode dari kartu article
 * untuk menarik Progressive MP4 / JPG langsung dari memory cache network interceptor.
 */
export async function extractFeedMedia(
  postElement: HTMLElement
): Promise<{ url: string; ext: 'mp4' | 'jpg'; username: string } | null> {
  // 1. Dapatkan Username pemilik postingan
  const userAnchor = postElement.querySelector<HTMLAnchorElement>('header a, a[role="link"]');
  const username = userAnchor?.textContent?.trim() || 'instagram_user';

  // 2. Dapatkan Shortcode spesifik untuk postingan ini
  const shortcode = extractShortcodeFromPostElement(postElement);

  // 3. PRIORITAS 1: Tarik Progressive MP4/JPG resmi dari cache GraphQL via Shortcode
  if (shortcode && storyMediaCache.has(shortcode)) {
    const cached = storyMediaCache.get(shortcode);
    if (cached?.url) {
      return {
        url: cached.url,
        ext: cached.ext,
        username: cached.username || username,
      };
    }
  }

  // 4. PRIORITAS 2: Cek apakah postingan memuat elemen <video> di DOM
  const video = postElement.querySelector<HTMLVideoElement>('video');
  if (video) {
    const directSrc = video.currentSrc || video.src || video.querySelector('source')?.src;
    // Jika progressive MP4 langsung tersedia dan bukan blob
    if (directSrc && !directSrc.startsWith('blob:') && !directSrc.includes('dashinit')) {
      return { url: directSrc, ext: 'mp4', username };
    }
  }

  // 5. PRIORITAS 3: Ekstraksi Gambar (Foto Post / Carousel Slide)
  // Ambil gambar slide aktif di dalam viewport postingan
  const images = Array.from(postElement.querySelectorAll<HTMLImageElement>('img')).filter((img) => {
    if (img.closest('header') || img.closest('button')) return false;
    const rect = img.getBoundingClientRect();
    return rect.width > 250 && rect.height > 250;
  });

  if (images.length > 0) {
    // Urutkan berdasarkan area terbesar (slide aktif biasanya terlihat penuh)
    images.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
    const activeImg = images[0];

    if (activeImg) {
      let imgSrc = activeImg.currentSrc || activeImg.src;
      const srcset = activeImg.getAttribute('srcset');
      if (srcset) {
        const candidates = srcset.split(',').map((s) => s.trim().split(' '));
        const lastCandidate = candidates[candidates.length - 1];
        if (lastCandidate && lastCandidate[0]) {
          imgSrc = lastCandidate[0];
        }
      }

      if (imgSrc && !imgSrc.startsWith('blob:')) {
        return { url: imgSrc, ext: 'jpg', username };
      }
    }
  }

  return null;
}

/**
 * Ekstraksi media Reels aktif menggunakan shortcode dari kartu DOM atau URL,
 * dengan pencarian di memory cache hasil intersepsi GraphQL/Clips dan fallback ke elemen video DOM.
 */
export async function extractCurrentReelMedia(
  triggerElement?: HTMLElement
): Promise<{ url: string; ext: 'mp4'; username: string } | null> {
  // 1. Dapatkan shortcode dari container kartu post/reel atau URL
  let shortcode = '';
  if (triggerElement) {
    const container =
      triggerElement.closest<HTMLElement>('article, div[role="dialog"], div[role="presentation"]') || triggerElement;
    shortcode = extractShortcodeFromPostElement(container) || '';
  }

  if (!shortcode) {
    const pathname = typeof window !== 'undefined' && window.location ? window.location.pathname : '';
    const pathParts = pathname.split('/').filter(Boolean);
    const reelIdx = pathParts.findIndex((p) => p === 'reel' || p === 'reels' || p === 'p');
    const matchedPart = reelIdx !== -1 ? pathParts[reelIdx + 1] : undefined;
    shortcode = matchedPart || '';
  }

  // 2. Cek apakah shortcode sudah ada di cache hasil intersepsi GraphQL / Clips
  if (shortcode && storyMediaCache.has(shortcode)) {
    const cached = storyMediaCache.get(shortcode);
    if (cached && cached.ext === 'mp4') {
      return { url: cached.url, ext: 'mp4', username: cached.username };
    }
  }

  // 3. Fallback: Ekstraksi langsung dari elemen <video> di DOM kartu reel aktif
  const reelContainer =
    triggerElement?.closest<HTMLElement>('article, div[role="dialog"], div[role="presentation"]') || document.body;
  const video = reelContainer.querySelector<HTMLVideoElement>('video');

  if (video) {
    const directSrc = video.currentSrc || video.src || video.querySelector('source')?.src;
    if (directSrc && !directSrc.startsWith('blob:') && !directSrc.includes('dashinit')) {
      const usernameElem = reelContainer.querySelector<HTMLElement>('header a, a[role="link"]');
      const username = usernameElem?.textContent?.trim() || 'instagram_reel';
      return { url: directSrc, ext: 'mp4', username };
    }
  }

  return null;
}

/**
 * Mengambil data media postingan (mendukung single & carousel)
 */
export function getPostData(postElement: HTMLElement): CachedPostData | null {
  const shortcode = extractShortcodeFromPostElement(postElement);
  if (shortcode && postMediaCache.has(shortcode)) {
    return postMediaCache.get(shortcode)!;
  }

  // Fallback DOM: Deteksi jika elemen adalah carousel dengan beberapa slide yang terpasang di DOM
  const dotsContainer =
    typeof postElement.querySelector === 'function'
      ? postElement.querySelector('div[role="tablist"], div._acnb')
      : null;
  const slideElements =
    typeof postElement.querySelectorAll === 'function'
      ? Array.from(
          postElement.querySelectorAll<HTMLElement>(
            'ul li div._aagv, ul li div[role="presentation"], ul li img, ul li'
          )
        )
      : [];

  if (dotsContainer || slideElements.length > 1) {
    const userAnchor =
      typeof postElement.querySelector === 'function'
        ? postElement.querySelector<HTMLAnchorElement>('header a, a[role="link"]')
        : null;
    const username = userAnchor?.textContent?.trim() || 'instagram_user';
    const fallbackCode = shortcode || `post_${Date.now()}`;

    const items: CarouselItem[] = [];
    const seenUrls = new Set<string>();

    slideElements.forEach((el) => {
      const img = el.tagName === 'IMG' ? (el as HTMLImageElement) : el.querySelector?.('img');
      const video = el.tagName === 'VIDEO' ? (el as HTMLVideoElement) : el.querySelector?.('video');

      if (video) {
        const vSrc = video.currentSrc || video.src || video.querySelector?.('source')?.src;
        if (vSrc && !vSrc.startsWith('blob:') && !vSrc.includes('dashinit') && !seenUrls.has(vSrc)) {
          seenUrls.add(vSrc);
          items.push({ url: vSrc, ext: 'mp4', index: items.length });
        }
      } else if (img) {
        const iSrc = img.currentSrc || img.src;
        if (iSrc && !iSrc.startsWith('blob:') && !seenUrls.has(iSrc)) {
          seenUrls.add(iSrc);
          items.push({ url: iSrc, ext: 'jpg', index: items.length });
        }
      }
    });

    if (items.length > 1) {
      return {
        shortcode: fallbackCode,
        username,
        isCarousel: true,
        items,
      };
    }
  }

  return null;
}

/**
 * Menghitung indeks slide aktif dan total slide secara presisi (0-indexed murni)
 */
export function getRealSlideCounts(
  postElement: HTMLElement,
  postData: CachedPostData | null
): { activeIndex: number; totalSlides: number } {
  // 1. STRATEGI UTAMA: Deteksi Geometri Track <ul> <li> (Akurasi 100%)
  const uls =
    typeof postElement.querySelectorAll === 'function'
      ? Array.from(postElement.querySelectorAll<HTMLUListElement>('ul'))
      : [];
  const carouselUl = uls.find((ul) => {
    const lis = Array.from(ul.children).filter((c) => c.tagName === 'LI');
    return (
      lis.length > 1 &&
      lis.some(
        (li) =>
          li.querySelector?.('img') ||
          li.querySelector?.('video') ||
          li.querySelector?.('img, video')
      )
    );
  });

  if (carouselUl && typeof postElement.getBoundingClientRect === 'function') {
    const slides = Array.from(carouselUl.children).filter((c) => c.tagName === 'LI') as HTMLElement[];
    const totalSlides = slides.length;
    const postRect = postElement.getBoundingClientRect();
    const centerX = postRect.left + postRect.width / 2;

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      if (!slide || typeof slide.getBoundingClientRect !== 'function') continue;
      const r = slide.getBoundingClientRect();
      // Slide aktif adalah slide yang menutupi titik tengah horizontal container
      if (r.left <= centerX && r.right >= centerX) {
        return { activeIndex: i, totalSlides };
      }
    }
  } else if (typeof postElement.querySelectorAll === 'function' && typeof postElement.getBoundingClientRect === 'function') {
    // Fallback deteksi posisi horizontal slide jika UL terisolasi atau di-mock
    const slideItems = Array.from(
      postElement.querySelectorAll<HTMLElement>('ul li, div[role="presentation"] > div > ul > li')
    );
    if (slideItems.length > 1) {
      const postRect = postElement.getBoundingClientRect();
      const centerX = postRect.left + postRect.width / 2;
      for (let i = 0; i < slideItems.length; i++) {
        const item = slideItems[i];
        if (item && typeof item.getBoundingClientRect === 'function') {
          const r = item.getBoundingClientRect();
          if (r.left <= centerX && r.right >= centerX) {
            return { activeIndex: i, totalSlides: slideItems.length };
          }
        }
      }
    }
  }

  // 2. STRATEGI CADANGAN: Dots Pagination (Hanya ambil CHILDREN, buang kontainer induk!)
  const dotsContainer =
    typeof postElement.querySelector === 'function'
      ? postElement.querySelector('div._acnb, div[role="tablist"]')
      : null;

  let dots: HTMLElement[] = [];
  if (dotsContainer && dotsContainer.children) {
    // PENTING: Gunakan dotsContainer.children agar pembungkus TIDAK masuk ke array
    dots = Array.from(dotsContainer.children) as HTMLElement[];
  } else if (typeof postElement.querySelectorAll === 'function') {
    dots = Array.from(
      postElement.querySelectorAll<HTMLElement>('div._acnb, div[role="tablist"] > *')
    );
  }

  if (dots.length > 0) {
    const totalSlides = Math.max(dots.length, postData?.items?.length || 1);

    const activeDotIdx = dots.findIndex((dot) => {
      const target = (dot.firstElementChild as HTMLElement) || dot;
      const style =
        typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
          ? window.getComputedStyle(target)
          : null;
      const bg = style?.backgroundColor || '';
      const opacity = parseFloat(style?.opacity || '1');
      const className = dot.className || '';

      return (
        dot.getAttribute('aria-selected') === 'true' ||
        dot.getAttribute('aria-current') === 'true' ||
        (typeof className === 'string' && (className.includes('active') || className.includes('_acnc'))) ||
        dot.classList?.contains('active') ||
        bg.includes('0, 149, 246') || // Warna biru aktif IG
        (bg.includes('255, 255, 255') && opacity > 0.8)
      );
    });

    if (activeDotIdx !== -1) {
      return { activeIndex: activeDotIdx, totalSlides };
    }
  }

  // 3. Fallback jika single post atau belum terdeteksi
  const fallbackTotal = postData?.items?.length || 1;
  return { activeIndex: 0, totalSlides: fallbackTotal };
}

/**
 * Mendapatkan indeks slide aktif pada carousel berdasarkan kalkulasi track geometri atau dots
 */
export function getActiveCarouselIndex(postElement: HTMLElement): number {
  return getRealSlideCounts(postElement, null).activeIndex;
}

/**
 * Mengekstrak media slide aktif langsung dari DOM jika belum tercatat di memory cache
 */
export function extractActiveSlideFromDOM(postElement: HTMLElement): CarouselItem | null {
  const postRect = postElement.getBoundingClientRect();
  const centerX = postRect.left + postRect.width / 2;

  // 1. Cek langsung slide aktif di dalam track <ul> <li> jika ada
  const uls = Array.from(postElement.querySelectorAll<HTMLUListElement>('ul'));
  const carouselUl = uls.find((ul) => {
    const lis = Array.from(ul.children).filter((c) => c.tagName === 'LI');
    return (
      lis.length > 1 &&
      lis.some(
        (li) =>
          li.querySelector?.('img') ||
          li.querySelector?.('video') ||
          li.querySelector?.('img, video')
      )
    );
  });

  if (carouselUl) {
    const slides = Array.from(carouselUl.children).filter((c) => c.tagName === 'LI') as HTMLElement[];
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      if (!slide) continue;
      const r = slide.getBoundingClientRect();
      if (r.left <= centerX && r.right >= centerX) {
        // Ini adalah slide aktif! Ekstrak video atau gambar di dalam slide ini
        const video = slide.querySelector<HTMLVideoElement>('video');
        if (video) {
          const src = video.currentSrc || video.src;
          if (src && !src.startsWith('blob:') && !src.includes('dashinit')) {
            return { url: src, ext: 'mp4', index: i };
          }
        }
        const img = slide.querySelector<HTMLImageElement>('img');
        if (img) {
          let src = img.currentSrc || img.src;
          const srcset = img.getAttribute('srcset');
          if (srcset) {
            const parts = srcset.split(',').map((s) => s.trim().split(' '));
            const lastPart = parts[parts.length - 1];
            if (lastPart && lastPart[0]) src = lastPart[0];
          }
          if (src && !src.startsWith('blob:')) {
            return { url: src, ext: 'jpg', index: i };
          }
        }
      }
    }
  }

  // 2. Fallback: Cek seluruh video dan gambar di tengah viewport container
  const videos = Array.from(postElement.querySelectorAll<HTMLVideoElement>('video'));
  for (const v of videos) {
    const r = v.getBoundingClientRect();
    if (r.left <= centerX && r.right >= centerX) {
      const src = v.currentSrc || v.src;
      if (src && !src.startsWith('blob:') && !src.includes('dashinit')) {
        return { url: src, ext: 'mp4', index: 0 };
      }
    }
  }

  const images = Array.from(postElement.querySelectorAll<HTMLImageElement>('img')).filter((img) => {
    if (img.closest('header') || img.closest('button')) return false;
    const r = img.getBoundingClientRect();
    return r.width > 250 && r.height > 250;
  });

  for (const img of images) {
    const r = img.getBoundingClientRect();
    if (r.left <= centerX && r.right >= centerX) {
      let src = img.currentSrc || img.src;
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        const parts = srcset.split(',').map((s) => s.trim().split(' '));
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart[0]) src = lastPart[0];
      }
      return { url: src, ext: 'jpg', index: 0 };
    }
  }

  return null;
}

/**
 * Mengambil nama file atau hash unik dari URL CDN Instagram untuk pencocokan presisi
 */
export function extractMediaFingerprint(url: string): string {
  try {
    const cleanUrl = url.split('?')[0] || '';
    const segments = cleanUrl.split('/');
    const filename = segments[segments.length - 1] || '';
    // Ambil pola ID unik sebelum ekstensi
    const match = filename.match(/([0-9]+_[0-9]+_[0-9]+)/);
    return match && match[1] ? match[1] : filename;
  } catch {
    return url;
  }
}

/**
 * Mengambil data blueprint 100% lengkap dari seluruh slide carousel via shortcode
 */
export async function getOrFetchFullCarouselData(
  postElement: HTMLElement
): Promise<CachedPostData | null> {
  const shortcode = extractShortcodeFromPostElement(postElement);
  if (!shortcode) return getPostData(postElement);

  let cached = postMediaCache.get(shortcode);

  // Jika sudah ada dan bukan carousel, return langsung
  if (cached && !cached.isCarousel) {
    return cached;
  }

  // Coba hidrasi via API internal resmi Instagram
  try {
    const res = await fetch(`https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`, {
      headers: {
        'X-IG-App-ID': IG_APP_ID,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (res.ok) {
      const data = await res.json();
      const item = data?.items?.[0] || data?.graphql?.shortcode_media;

      if (item) {
        const username = item.user?.username || item.owner?.username || 'instagram_user';
        const rawChildren = item.carousel_media || item.edge_sidecar_to_children?.edges;

        if (Array.isArray(rawChildren) && rawChildren.length > 0) {
          const items: CarouselItem[] = rawChildren.map((child: any, idx: number) => {
            const node = child.node || child;
            const isVid = node.is_video || Boolean(node.video_versions);
            let url = '';

            if (isVid) {
              const validVids = (node.video_versions || []).filter((v: any) => !v.url.includes('dashinit'));
              url = validVids[0]?.url || node.video_url || node.video_versions?.[0]?.url;
            } else {
              url =
                node.image_versions2?.candidates?.[0]?.url ||
                node.display_url ||
                node.display_resources?.[node.display_resources.length - 1]?.src;
            }

            return {
              url,
              ext: isVid ? 'mp4' : 'jpg',
              index: idx,
            };
          });

          const completeData: CachedPostData = {
            shortcode,
            username,
            isCarousel: true,
            items,
          };

          postMediaCache.set(shortcode, completeData);
          return completeData;
        } else {
          // Single post media
          const isVid = item.is_video || Boolean(item.video_versions);
          let url = '';
          if (isVid) {
            const validVids = (item.video_versions || []).filter((v: any) => !v.url.includes('dashinit'));
            url = validVids[0]?.url || item.video_url || item.video_versions?.[0]?.url;
          } else {
            url =
              item.image_versions2?.candidates?.[0]?.url ||
              item.display_url ||
              item.display_resources?.[item.display_resources.length - 1]?.src;
          }

          if (url) {
            const singleData: CachedPostData = {
              shortcode,
              username,
              isCarousel: false,
              items: [{ url, ext: isVid ? 'mp4' : 'jpg', index: 0 }],
            };
            postMediaCache.set(shortcode, singleData);
            return singleData;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Downplaygram] Gagal hidrasi penuh via shortcode API:', e);
  }

  return cached || getPostData(postElement) || null;
}

/**
 * Menentukan indeks slide yang sedang dilihat user secara presisi (100% akurat)
 */
export function getPreciseActiveSlideIndex(
  postElement: HTMLElement,
  fullItems: CarouselItem[]
): number {
  if (!fullItems || fullItems.length <= 1) return 0;

  const postRect = postElement.getBoundingClientRect();
  const centerX = postRect.left + postRect.width / 2;

  // 1. Ambil seluruh elemen gambar/video di dalam post yang sedang berada di tengah layar
  const visibleMediaElements = Array.from(
    postElement.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video')
  ).filter((el) => {
    if (el.closest?.('header') || el.closest?.('button')) return false;
    const r = el.getBoundingClientRect();
    return r.left <= centerX && r.right >= centerX && (r.width > 200 || r.width === undefined);
  });

  for (const el of visibleMediaElements) {
    const imgEl = el as HTMLImageElement;
    const activeSrc = imgEl.currentSrc || el.src || imgEl.getAttribute?.('src') || '';
    if (!activeSrc) continue;

    const activePrint = extractMediaFingerprint(activeSrc);

    // Cocokkan dengan blueprint items dari API
    const matchIdx = fullItems.findIndex((item) => {
      const itemPrint = extractMediaFingerprint(item.url);
      return (
        (activePrint && (item.url.includes(activePrint) || activeSrc.includes(itemPrint))) ||
        (itemPrint && activeSrc.includes(itemPrint))
      );
    });

    if (matchIdx !== -1) {
      return matchIdx;
    }
  }

  // 2. Fallback jika transisi belum tuntas atau DOM virtual belum terdeteksi sempurna
  return getRealSlideCounts(postElement, null).activeIndex || 0;
}

export interface ExtractedMediaItem {
  url: string;
  ext: 'mp4' | 'jpg';
  index: number;
}

/**
 * Mengonversi shortcode Instagram (alfanumerik) menjadi Media ID numerik (BigInt)
 */
export function shortcodeToMediaId(shortcode: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let mediaId = BigInt(0);

  for (let i = 0; i < shortcode.length; i++) {
    const char = shortcode[i];
    if (!char) continue;
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    mediaId = mediaId * BigInt(64) + BigInt(index);
  }

  return mediaId.toString();
}

/**
 * Ekstraksi shortcode postingan yang 100% akurat via elemen <time> (Permalink Resmi)
 */
export function extractPostShortcode(postElement: HTMLElement): string | null {
  // 1. PRIORITAS UTAMA: Tag <time> selalu dibungkus oleh anchor tautan permanen postingan
  const timeAnchor = postElement.querySelector?.('time')?.closest<HTMLAnchorElement>('a');
  if (timeAnchor) {
    const href = timeAnchor.getAttribute('href') || '';
    const match = href.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
    if (match && match[1]) return match[1];
  }

  // 2. Cari anchor lain yang memuat /p/ atau /reel/ di dalam artikel
  const allLinks = Array.from(
    postElement.querySelectorAll<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"]')
  );
  for (const link of allLinks) {
    const href = link.getAttribute('href') || '';
    const match = href.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
    if (match && match[1]) return match[1];
  }

  // 3. Fallback jika user sedang membuka postingan dalam bentuk modal overlay
  const pathname = typeof window !== 'undefined' && window.location ? window.location.pathname : '';
  const urlMatch = pathname.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
  return urlMatch && urlMatch[1] ? urlMatch[1] : null;
}

/**
 * Mengambil seluruh daftar slide media secara lengkap dari API internal resmi Instagram
 */
export async function fetchAllMediaFromPostLink(
  shortcode: string
): Promise<{ username: string; items: ExtractedMediaItem[] } | null> {
  try {
    const mediaId = shortcodeToMediaId(shortcode);
    if (!mediaId || mediaId === '0') {
      console.warn('[Downplaygram] Gagal mengonversi shortcode ke Media ID:', shortcode);
      return null;
    }

    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {
      'X-IG-App-ID': IG_APP_ID,
      'X-ASBD-ID': '129477',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
    };
    if (csrfToken) headers['X-CSRFToken'] = csrfToken;

    // Panggil Web API resmi Instagram dengan session browser aktif
    const res = await fetch(`https://www.instagram.com/api/v1/media/${mediaId}/info/`, {
      method: 'GET',
      headers,
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      console.warn('[Downplaygram] API info merespons dengan status:', res.status, contentType);
      return null;
    }

    const data = await res.json();
    const item = data?.items?.[0];
    if (!item) return null;

    const username = item.user?.username || 'instagram_user';
    const rawCarousel = item.carousel_media;

    // Kasus 1: Postingan Multi-Slide (Carousel)
    if (Array.isArray(rawCarousel) && rawCarousel.length > 0) {
      const items: ExtractedMediaItem[] = rawCarousel.map((child: any, idx: number) => {
        const isVideo = child.media_type === 2 || Boolean(child.video_versions);
        let url = '';

        if (isVideo && child.video_versions?.length) {
          // Ambil progressive MP4 tertinggi yang bukan DASH chunk
          const vids = child.video_versions.filter((v: any) => !v.url.includes('dashinit'));
          const selected = vids[0] || child.video_versions[0];
          url = selected?.url || '';
        } else if (child.image_versions2?.candidates?.length) {
          url = child.image_versions2.candidates[0]?.url || '';
        }

        return {
          url,
          ext: isVideo ? 'mp4' : 'jpg',
          index: idx + 1,
        };
      });

      return { username, items };
    }

    // Kasus 2: Postingan Tunggal (Single Post)
    const isVideo = item.media_type === 2 || Boolean(item.video_versions);
    let singleUrl = '';
    if (isVideo && item.video_versions?.length) {
      const vids = item.video_versions.filter((v: any) => !v.url.includes('dashinit'));
      const selected = vids[0] || item.video_versions[0];
      singleUrl = selected?.url || '';
    } else if (item.image_versions2?.candidates?.length) {
      singleUrl = item.image_versions2.candidates[0]?.url || '';
    }

    return {
      username,
      items: [{ url: singleUrl, ext: isVideo ? 'mp4' : 'jpg', index: 1 }],
    };
  } catch (err) {
    console.error('[Downplaygram] Fetch media info API error:', err);
    return null;
  }
}

/**
 * Mengambil URL media dari slide yang saat ini sedang aktif di viewport
 */
export function extractDirectActiveMediaFromDOM(
  postElement: HTMLElement
): { url: string; ext: 'mp4' | 'jpg' } | null {
  const postRect = postElement.getBoundingClientRect();
  const centerX = postRect.left + postRect.width / 2;

  // 1. Cek apakah ada Video yang berada di tengah frame
  const videos = Array.from(postElement.querySelectorAll<HTMLVideoElement>('video'));
  for (const video of videos) {
    const r = video.getBoundingClientRect();
    if (r.left <= centerX && r.right >= centerX) {
      const src = video.currentSrc || video.src;
      if (src && !src.startsWith('blob:') && !src.includes('dashinit')) {
        return { url: src, ext: 'mp4' };
      }
    }
  }

  // 2. Cek elemen Foto yang sedang berada di tengah frame
  const images = Array.from(postElement.querySelectorAll<HTMLImageElement>('img')).filter((img) => {
    if (img.closest?.('header') || img.closest?.('button')) return false;
    const r = img.getBoundingClientRect();
    return (r.width > 200 || r.width === undefined) && (r.height > 200 || r.height === undefined);
  });

  for (const img of images) {
    const r = img.getBoundingClientRect();
    if (r.left <= centerX && r.right >= centerX) {
      let src = img.currentSrc || img.src;

      // Ambil resolusi tertinggi dari srcset
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        const parts = srcset.split(',').map((s) => s.trim().split(' '));
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart[0]) {
          src = lastPart[0];
        }
      }

      if (src && !src.startsWith('blob:')) {
        return { url: src, ext: 'jpg' };
      }
    }
  }

  return null;
}



