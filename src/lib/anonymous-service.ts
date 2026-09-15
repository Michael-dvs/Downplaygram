/**
 * Downplaygram Anonymous Story Service
 * Network-First story hydration with Incremental Cache Merging.
 * Fetches latest stories from server, merges with existing local cache,
 * and seamlessly falls back to valid cache on network/session issues.
 */

const IG_APP_ID = '936619743392459';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_KEY_PREFIX = 'anon_story_';

export interface AnonymousStoryItem {
  id: string;
  url: string;
  ext: 'mp4' | 'jpg';
  takenAt: number;
}

export interface CachedAnonymousData {
  username: string;
  userId: string;
  timestamp: number;
  expiresAt: number;
  items: AnonymousStoryItem[];
}

export type AnonymousErrorCode = 'NOT_FOUND' | 'PRIVATE_RESTRICTED' | 'NO_STORIES' | 'AUTH_FAILED';

export class AnonymousError extends Error {
  code: AnonymousErrorCode;

  constructor(message: string, code: AnonymousErrorCode) {
    super(message);
    this.name = 'AnonymousError';
    this.code = code;
    Object.setPrototypeOf(this, AnonymousError.prototype);
  }
}

function getCsrfToken(): string {
  try {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1]! : '';
  } catch {
    return '';
  }
}

/**
 * Membersihkan cache lama yang sudah kedaluwarsa (> 24 jam)
 */
export async function cleanExpiredAnonymousCache(): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const key of Object.keys(all)) {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        const entry = all[key] as CachedAnonymousData | undefined;
        if (!entry?.expiresAt || now > entry.expiresAt) {
          keysToRemove.push(key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  } catch {
    // Non-fatal: ignore storage errors silently
  }
}

/**
 * Mengambil story secara anonim: Selalu fetch data terbaru dari server,
 * lalu lakukan merge dengan cache lokal (Network-First with Cache Fallback).
 */
export async function fetchAnonymousStories(
  targetUsername: string
): Promise<{ username: string; items: AnonymousStoryItem[]; fromCacheFallback?: boolean }> {
  const cleanUser = targetUsername.trim().toLowerCase().replace(/^@+/, '');
  if (!cleanUser) {
    throw new AnonymousError('Username tidak valid.', 'NOT_FOUND');
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${cleanUser}`;

  // Baca cache yang ada saat ini untuk keperluan merge & fallback
  let existingData: CachedAnonymousData | undefined;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const cached = await chrome.storage.local.get(cacheKey);
      existingData = cached[cacheKey] as CachedAnonymousData | undefined;
    }
  } catch {
    // Cache read failure -> proceed to live fetch
  }

  const csrf = getCsrfToken();
  const baseHeaders: Record<string, string> = {
    'X-IG-App-ID': IG_APP_ID,
    'X-ASBD-ID': '129477',
    'X-IG-WWW-Claim': '0',
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json'
  };
  if (csrf) baseHeaders['X-CSRFToken'] = csrf;

  try {
    // 1. Resolve User ID via Topsearch API
    const searchRes = await fetch(
      `https://www.instagram.com/api/v1/web/search/topsearch/?context=blended&query=${encodeURIComponent(cleanUser)}&include_reel=true`,
      {
        method: 'GET',
        headers: baseHeaders,
        credentials: 'include'
      }
    );

    if (!searchRes.ok) {
      throw new AnonymousError('Sesi Instagram Anda terputus. Pastikan Anda telah login di browser.', 'AUTH_FAILED');
    }

    const searchJson = await searchRes.json();
    const userObj = searchJson?.users?.find(
      (u: any) => u.user?.username?.toLowerCase() === cleanUser
    )?.user;

    if (!userObj) {
      throw new AnonymousError(`Akun @${cleanUser} tidak ditemukan. Periksa kembali penulisan username.`, 'NOT_FOUND');
    }

    const userId = String(userObj.pk || userObj.pk_id || userObj.id);
    const isPrivate = Boolean(userObj.is_private);
    const isFollowing = Boolean(
      userObj.friendship_status?.following ||
      userObj.friendship_status?.followed_by ||
      !userObj.is_private
    );

    if (isPrivate && !isFollowing) {
      throw new AnonymousError(`Akun @${cleanUser} bersifat privat dan belum Anda ikuti.`, 'PRIVATE_RESTRICTED');
    }

    // 2. Fetch Live Reels Media dari Server
    const reelsRes = await fetch(
      `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(userId)}`,
      {
        method: 'GET',
        headers: baseHeaders,
        credentials: 'include'
      }
    );

    if (!reelsRes.ok) {
      throw new AnonymousError('Gagal mengambil data story dari server Instagram.', 'AUTH_FAILED');
    }

    const reelsJson = await reelsRes.json();
    const rawItems = reelsJson?.reels?.[userId]?.items || reelsJson?.reels_media?.[0]?.items || [];

    if (rawItems.length === 0) {
      // Jika server menyatakan tidak ada story aktif saat ini:
      // Jika ada cache lama yang belum 24 jam, sajikan cache lama. Jika tidak, lempar NO_STORIES.
      if (existingData && existingData.items && existingData.items.length > 0 && Date.now() < existingData.expiresAt) {
        return { username: cleanUser, items: existingData.items, fromCacheFallback: true };
      }
      throw new AnonymousError(`@${cleanUser} tidak memiliki story aktif dalam 24 jam terakhir.`, 'NO_STORIES');
    }

    // 3. Mapping data baru dari server
    const freshItems: AnonymousStoryItem[] = rawItems
      .map((item: any) => {
        const isVideo = item.media_type === 2 || Boolean(item.video_versions && item.video_versions.length > 0);
        let url = '';

        if (isVideo && item.video_versions?.length) {
          const progressiveVids = (item.video_versions as any[]).filter(
            (v: any) =>
              v?.url &&
              !v.url.includes('dashinit') &&
              !v.url.includes('_audio_dashinit') &&
              !v.url.endsWith('.m4s') &&
              !v.url.endsWith('.mpd')
          );
          progressiveVids.sort(
            (a: any, b: any) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0)
          );
          url = progressiveVids[0]?.url || item.video_versions[0].url;
        } else if (item.image_versions2?.candidates?.length) {
          const candidates = [...item.image_versions2.candidates].sort(
            (a: any, b: any) => (b.width || 0) - (a.width || 0)
          );
          url = candidates[0]?.url || '';
        }

        return {
          id: String(item.pk || item.id),
          url,
          ext: (isVideo ? 'mp4' : 'jpg') as 'mp4' | 'jpg',
          takenAt: item.taken_at || 0
        };
      })
      .filter((item: AnonymousStoryItem) => Boolean(item.url));

    // 4. INCREMENTAL MERGE: Gabungkan cache lama dan data baru berdasarkan ID unik
    const mergedMap = new Map<string, AnonymousStoryItem>();

    // Masukkan cache lama (jika masih berlaku)
    if (existingData && existingData.items && Date.now() < existingData.expiresAt) {
      existingData.items.forEach((it) => mergedMap.set(it.id, it));
    }
    // Timpa/tambahkan dengan fresh items dari server
    freshItems.forEach((it) => mergedMap.set(it.id, it));

    // Urutkan berdasarkan waktu tayang (takenAt)
    const finalItems = Array.from(mergedMap.values()).sort((a, b) => a.takenAt - b.takenAt);

    if (finalItems.length === 0) {
      if (existingData && existingData.items && existingData.items.length > 0 && Date.now() < existingData.expiresAt) {
        return { username: cleanUser, items: existingData.items, fromCacheFallback: true };
      }
      throw new AnonymousError(`@${cleanUser} tidak memiliki story aktif dalam 24 jam terakhir.`, 'NO_STORIES');
    }

    // 5. Perbarui Cache Lokal dengan TTL 24 jam baru
    const now = Date.now();
    const updatedCacheEntry: CachedAnonymousData = {
      username: cleanUser,
      userId,
      timestamp: now,
      expiresAt: now + ONE_DAY_MS,
      items: finalItems
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [cacheKey]: updatedCacheEntry });
      }
    } catch {
      // Non-fatal: ignore write errors
    }

    return { username: cleanUser, items: finalItems };

  } catch (err: any) {
    // 6. FALLBACK OTOMATIS: Jika ada masalah jaringan/rate-limit, gunakan cache yang ada
    if (existingData && existingData.items && existingData.items.length > 0 && Date.now() < existingData.expiresAt) {
      return { username: cleanUser, items: existingData.items, fromCacheFallback: true };
    }
    throw err;
  }
}
