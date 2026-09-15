import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchAnonymousStories,
  cleanExpiredAnonymousCache,
  AnonymousError,
} from '../src/lib/anonymous-service';

describe('anonymous-service', () => {
  let localStorageMock: Record<string, any> = {};
  const origFetch = globalThis.fetch;
  const origChrome = (globalThis as any).chrome;
  const origDocument = (globalThis as any).document;

  beforeEach(() => {
    localStorageMock = {};
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn(async (keys: string | string[] | null) => {
            if (keys === null) return { ...localStorageMock };
            if (typeof keys === 'string') {
              return { [keys]: localStorageMock[keys] };
            }
            if (Array.isArray(keys)) {
              const res: Record<string, any> = {};
              for (const k of keys) res[k] = localStorageMock[k];
              return res;
            }
            return {};
          }),
          set: vi.fn(async (items: Record<string, any>) => {
            Object.assign(localStorageMock, items);
          }),
          remove: vi.fn(async (keys: string | string[]) => {
            const arr = Array.isArray(keys) ? keys : [keys];
            for (const k of arr) delete localStorageMock[k];
          }),
        },
      },
    };

    (globalThis as any).document = {
      cookie: 'csrftoken=mock_csrf_token_xyz;',
    };
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    (globalThis as any).chrome = origChrome;
    (globalThis as any).document = origDocument;
    vi.restoreAllMocks();
  });

  describe('AnonymousError', () => {
    it('creates an error with proper code and inheritance', () => {
      const err = new AnonymousError('Akun privat', 'PRIVATE_RESTRICTED');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AnonymousError);
      expect(err.code).toBe('PRIVATE_RESTRICTED');
      expect(err.message).toBe('Akun privat');
      expect(err.name).toBe('AnonymousError');
    });
  });

  describe('fetchAnonymousStories - Topsearch User Resolution & Session Credentials', () => {
    it('successfully resolves public user via Topsearch and fetches stories', async () => {
      globalThis.fetch = vi.fn(async (input: any, init?: RequestInit) => {
        const url = String(input);
        // Verify credentials include
        expect(init?.credentials).toBe('include');

        if (url.includes('/web/search/topsearch/')) {
          expect(url).toContain('query=realmadrid');
          expect(init?.headers).toMatchObject({
            'X-IG-App-ID': '936619743392459',
            'X-IG-WWW-Claim': '0',
            'X-CSRFToken': 'mock_csrf_token_xyz',
          });
          return {
            ok: true,
            json: async () => ({
              users: [
                {
                  user: {
                    pk: '1067259270',
                    username: 'realmadrid',
                    is_private: false,
                    friendship_status: { following: false },
                  },
                },
              ],
            }),
          } as any;
        }

        if (url.includes('/feed/reels_media/')) {
          expect(url).toContain('reel_ids=1067259270');
          return {
            ok: true,
            json: async () => ({
              reels: {
                '1067259270': {
                  items: [
                    {
                      id: 'story_rm_1',
                      media_type: 2,
                      video_versions: [
                        { width: 720, height: 1280, url: 'https://ig.cdn/rm_dashinit.mp4' },
                        { width: 1080, height: 1920, url: 'https://ig.cdn/rm_progressive.mp4' },
                      ],
                      taken_at: 1700000000,
                    },
                    {
                      id: 'story_rm_2',
                      media_type: 1,
                      image_versions2: {
                        candidates: [
                          { width: 1080, height: 1920, url: 'https://ig.cdn/rm_photo_high.jpg' },
                        ],
                      },
                      taken_at: 1700000100,
                    },
                  ],
                },
              },
            }),
          } as any;
        }

        return { ok: false, status: 404 } as any;
      });

      const res = await fetchAnonymousStories('@RealMadrid');
      expect(res.username).toBe('realmadrid');
      expect(res.items.length).toBe(2);

      // Verify progressive video was preferred over dashinit
      expect(res.items[0]).toEqual({
        id: 'story_rm_1',
        url: 'https://ig.cdn/rm_progressive.mp4',
        ext: 'mp4',
        takenAt: 1700000000,
      });

      expect(res.items[1]).toEqual({
        id: 'story_rm_2',
        url: 'https://ig.cdn/rm_photo_high.jpg',
        ext: 'jpg',
        takenAt: 1700000100,
      });

      // Verify cached in storage
      expect(localStorageMock['anon_story_realmadrid']).toBeDefined();
      expect(localStorageMock['anon_story_realmadrid'].items.length).toBe(2);
    });

    it('allows followed private account to view and download stories', async () => {
      globalThis.fetch = vi.fn(async (input: any) => {
        const url = String(input);
        if (url.includes('/web/search/topsearch/')) {
          return {
            ok: true,
            json: async () => ({
              users: [
                {
                  user: {
                    pk: '222222',
                    username: 'close_friend',
                    is_private: true,
                    friendship_status: { following: true }, // Followed!
                  },
                },
              ],
            }),
          } as any;
        }

        if (url.includes('/feed/reels_media/')) {
          return {
            ok: true,
            json: async () => ({
              reels: {
                '222222': {
                  items: [
                    {
                      id: 'friend_story_1',
                      media_type: 1,
                      image_versions2: {
                        candidates: [{ width: 1080, height: 1080, url: 'https://ig.cdn/friend.jpg' }],
                      },
                      taken_at: 1700000200,
                    },
                  ],
                },
              },
            }),
          } as any;
        }

        return { ok: false } as any;
      });

      const res = await fetchAnonymousStories('close_friend');
      expect(res.username).toBe('close_friend');
      expect(res.items.length).toBe(1);
      expect(res.items[0]?.url).toBe('https://ig.cdn/friend.jpg');
    });

    it('throws PRIVATE_RESTRICTED for private account not followed', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          users: [
            {
              user: {
                pk: '333333',
                username: 'private_stranger',
                is_private: true,
                friendship_status: { following: false, followed_by: false },
              },
            },
          ],
        }),
      })) as any;

      await expect(fetchAnonymousStories('private_stranger')).rejects.toThrow(
        expect.objectContaining({
          code: 'PRIVATE_RESTRICTED',
          message: expect.stringContaining('bersifat privat dan belum Anda ikuti'),
        })
      );
    });

    it('throws NOT_FOUND when account does not exist in topsearch', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ users: [] }),
      })) as any;

      await expect(fetchAnonymousStories('non_existent_account_12345')).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('tidak ditemukan'),
        })
      );
    });

    it('throws AUTH_FAILED when topsearch returns HTTP 401 and no cache exists', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 401,
      })) as any;

      await expect(fetchAnonymousStories('someuser')).rejects.toThrow(
        expect.objectContaining({
          code: 'AUTH_FAILED',
        })
      );
    });

    it('throws NO_STORIES when account has no active stories and no cache exists', async () => {
      globalThis.fetch = vi.fn(async (input: any) => {
        const url = String(input);
        if (url.includes('/web/search/topsearch/')) {
          return {
            ok: true,
            json: async () => ({
              users: [
                {
                  user: {
                    pk: '444444',
                    username: 'nostory_user',
                    is_private: false,
                  },
                },
              ],
            }),
          } as any;
        }
        if (url.includes('/feed/reels_media/')) {
          return {
            ok: true,
            json: async () => ({
              reels: {
                '444444': { items: [] },
              },
            }),
          } as any;
        }
        return { ok: false } as any;
      });

      await expect(fetchAnonymousStories('nostory_user')).rejects.toThrow(
        expect.objectContaining({
          code: 'NO_STORIES',
          message: expect.stringContaining('tidak memiliki story aktif dalam 24 jam terakhir'),
        })
      );
    });
  });

  describe('Network-First Hydration & Incremental Merging', () => {
    it('always contacts network first and merges newly posted story (N+1) into cache', async () => {
      // 1. Pre-populate cache with Story 1 from 2 hours ago
      localStorageMock['anon_story_satudua'] = {
        username: 'satudua',
        userId: '555555',
        timestamp: Date.now() - 7200000,
        expiresAt: Date.now() + 22 * 3600000,
        items: [
          {
            id: 'story_early_1',
            url: 'https://ig.cdn/story1.jpg',
            ext: 'jpg',
            takenAt: 1700000000,
          },
        ],
      };

      // 2. Server now returns Story 1 AND new Story 2
      globalThis.fetch = vi.fn(async (input: any) => {
        const url = String(input);
        if (url.includes('/web/search/topsearch/')) {
          return {
            ok: true,
            json: async () => ({
              users: [
                {
                  user: {
                    pk: '555555',
                    username: 'satudua',
                    is_private: false,
                  },
                },
              ],
            }),
          } as any;
        }
        if (url.includes('/feed/reels_media/')) {
          return {
            ok: true,
            json: async () => ({
              reels: {
                '555555': {
                  items: [
                    {
                      id: 'story_early_1',
                      media_type: 1,
                      image_versions2: {
                        candidates: [{ width: 1080, height: 1080, url: 'https://ig.cdn/story1.jpg' }],
                      },
                      taken_at: 1700000000,
                    },
                    {
                      id: 'story_new_2',
                      media_type: 2,
                      video_versions: [{ width: 720, height: 1280, url: 'https://ig.cdn/story2.mp4' }],
                      taken_at: 1700001000,
                    },
                  ],
                },
              },
            }),
          } as any;
        }
        return { ok: false } as any;
      });

      const res = await fetchAnonymousStories('satudua');
      expect(res.username).toBe('satudua');
      // Incremental merge resulted in 2 stories (Story 1 + Story 2)
      expect(res.items.length).toBe(2);
      expect(res.items[0]?.id).toBe('story_early_1');
      expect(res.items[1]?.id).toBe('story_new_2');
      expect(res.fromCacheFallback).toBeUndefined();

      // Verify cache in chrome.storage.local was refreshed with both items
      expect(localStorageMock['anon_story_satudua'].items.length).toBe(2);
    });

    it('falls back to cache when network fails or disconnects', async () => {
      // Pre-populate unexpired cache
      localStorageMock['anon_story_offlineuser'] = {
        username: 'offlineuser',
        userId: '777777',
        timestamp: Date.now() - 3600000,
        expiresAt: Date.now() + 20 * 3600000,
        items: [
          {
            id: 'cached_item_1',
            url: 'https://ig.cdn/cached_item.jpg',
            ext: 'jpg',
            takenAt: 1700000000,
          },
        ],
      };

      // Network throws error (e.g. offline or 500)
      globalThis.fetch = vi.fn(async () => {
        throw new Error('Failed to fetch (offline)');
      });

      const res = await fetchAnonymousStories('offlineuser');
      expect(res.username).toBe('offlineuser');
      expect(res.items.length).toBe(1);
      expect(res.items[0]?.id).toBe('cached_item_1');
      expect(res.fromCacheFallback).toBe(true);
    });

    it('falls back to cache when server returns 0 stories if unexpired cache exists', async () => {
      localStorageMock['anon_story_activecache'] = {
        username: 'activecache',
        userId: '888888',
        timestamp: Date.now() - 3600000,
        expiresAt: Date.now() + 10 * 3600000,
        items: [
          {
            id: 'saved_story_1',
            url: 'https://ig.cdn/saved_story.jpg',
            ext: 'jpg',
            takenAt: 1700000000,
          },
        ],
      };

      // Server returns empty reel items
      globalThis.fetch = vi.fn(async (input: any) => {
        const url = String(input);
        if (url.includes('/web/search/topsearch/')) {
          return {
            ok: true,
            json: async () => ({
              users: [{ user: { pk: '888888', username: 'activecache', is_private: false } }],
            }),
          } as any;
        }
        if (url.includes('/feed/reels_media/')) {
          return {
            ok: true,
            json: async () => ({
              reels: { '888888': { items: [] } },
            }),
          } as any;
        }
        return { ok: false } as any;
      });

      const res = await fetchAnonymousStories('activecache');
      expect(res.username).toBe('activecache');
      expect(res.items.length).toBe(1);
      expect(res.items[0]?.id).toBe('saved_story_1');
      expect(res.fromCacheFallback).toBe(true);
    });

    it('cleanExpiredAnonymousCache purges stale entries and keeps active ones', async () => {
      const now = Date.now();
      localStorageMock['anon_story_expired'] = {
        username: 'expired',
        expiresAt: now - 1000, // expired
      };
      localStorageMock['anon_story_valid'] = {
        username: 'valid',
        expiresAt: now + 50000, // valid
      };
      localStorageMock['other_setting'] = {
        enabled: true,
      };

      await cleanExpiredAnonymousCache();

      expect(localStorageMock['anon_story_expired']).toBeUndefined();
      expect(localStorageMock['anon_story_valid']).toBeDefined();
      expect(localStorageMock['other_setting']).toBeDefined();
    });
  });
});
