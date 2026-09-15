/**
 * Downplaygram Main World Network Interceptor
 * Intercepts Instagram web API responses (Stories, Reels, Feed Posts, Clips, and GraphQL)
 * in the page's Main World to capture complete progressive MP4 media URLs.
 * Stores data directly into a synchronous DOM storage bridge and dispatches CustomEvents.
 */

import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    try {
      const XHR = XMLHttpRequest.prototype;
      const originalOpen = XHR.open;
      const originalSend = XHR.send;
      const originalFetch = window.fetch;

      const pendingStore: Record<string, any> = {};

      function syncToDomStore(newMedia: Record<string, any>, newPosts?: Record<string, any>) {
        Object.assign(pendingStore, newMedia);

        const container = document.head || document.documentElement || document.body;
        if (container) {
          let storeEl = document.getElementById('__downplaygram_store__') as HTMLScriptElement | null;
          if (!storeEl) {
            storeEl = document.createElement('script');
            storeEl.id = '__downplaygram_store__';
            storeEl.setAttribute('type', 'application/json');
            storeEl.textContent = '{}';
            container.appendChild(storeEl);
          }

          try {
            const current = JSON.parse(storeEl.textContent || '{}');
            Object.assign(current, pendingStore);
            storeEl.textContent = JSON.stringify(current);
          } catch {}
        }

        // Tetap dispatch event untuk listener asinkron di Content Script
        window.dispatchEvent(
          new CustomEvent('__DOWNPLAYGRAM_MEDIA_DISCOVERED__', { detail: newMedia })
        );
        if (newPosts && Object.keys(newPosts).length > 0) {
          window.dispatchEvent(
            new CustomEvent('__DOWNPLAYGRAM_POSTS_DISCOVERED__', { detail: newPosts })
          );
        }
      }

      // Flush jika container baru tersedia saat DOMContentLoaded
      if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
          if (Object.keys(pendingStore).length > 0) {
            syncToDomStore({});
          }
        });
      }

      function extractAllMediaRecursively(data: any) {
        const mediaMap: Record<string, { id: string; url: string; ext: 'mp4' | 'jpg'; username: string; shortcode?: string; highlightId?: string }> = {};
        const postMap: Record<string, { shortcode: string; username: string; isCarousel: boolean; items: Array<{ url: string; ext: 'mp4' | 'jpg'; index: number }> }> = {};

        function walk(obj: any, inheritedUsername?: string, inheritedHighlightId?: string) {
          if (!obj || typeof obj !== 'object') return;

          let currentUsername = inheritedUsername;
          let currentHighlightId = inheritedHighlightId;

          if (obj.user && typeof obj.user.username === 'string') {
            currentUsername = obj.user.username.toLowerCase();
          } else if (obj.owner && typeof obj.owner.username === 'string') {
            currentUsername = obj.owner.username.toLowerCase();
          }

          if (typeof obj.id === 'string' && obj.id.startsWith('highlight:')) {
            currentHighlightId = obj.id.replace('highlight:', '');
          }

          // Deteksi Media Story atau Postingan
          if ((obj.video_versions || obj.image_versions2) && (obj.pk || obj.id)) {
            const fullId: string = String(obj.pk || obj.id);
            const rawId: string = fullId.split('_')[0] || fullId;
            const username = currentUsername || 'instagram_user';
            const isVideo = Boolean(obj.video_versions && obj.video_versions.length > 0);

            let mediaUrl = '';
            if (isVideo) {
              const progressive = obj.video_versions.filter(
                (v: any) => v?.url && !v.url.includes('dashinit') && !v.url.includes('_audio_dashinit')
              );
              progressive.sort(
                (a: any, b: any) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
              );
              mediaUrl = progressive[0]?.url || obj.video_versions[0]?.url || '';
            } else if (obj.image_versions2?.candidates?.length) {
              mediaUrl = obj.image_versions2.candidates[0]?.url || '';
            }

            if (mediaUrl && rawId) {
              const itemShortcode: string | undefined = obj.code || obj.shortcode ? String(obj.code || obj.shortcode) : undefined;
              const mediaEntry: { id: string; url: string; ext: 'mp4' | 'jpg'; username: string; shortcode?: string; highlightId?: string } = {
                id: rawId,
                url: mediaUrl,
                ext: (isVideo ? 'mp4' : 'jpg') as 'mp4' | 'jpg',
                username,
                shortcode: itemShortcode,
                highlightId: currentHighlightId,
              };
              mediaMap[rawId] = mediaEntry;
              if (fullId !== rawId) {
                mediaMap[fullId] = { ...mediaEntry, id: fullId };
              }
              if (itemShortcode) {
                mediaMap[itemShortcode] = mediaEntry;
              }
            }
          }

          // Deteksi Carousel (edge_sidecar_to_children atau carousel_media)
          if (obj.shortcode || obj.code) {
            const code = String(obj.shortcode || obj.code);
            const username = currentUsername || 'instagram_user';
            const sidecarEdges = obj.edge_sidecar_to_children?.edges;
            const carouselMedia = obj.carousel_media;

            if (Array.isArray(sidecarEdges) && sidecarEdges.length > 0) {
              const items: Array<{ url: string; ext: 'mp4' | 'jpg'; index: number }> = [];
              sidecarEdges.forEach((edge: any, index: number) => {
                const node = edge?.node;
                if (!node) return;
                if (node.is_video && (node.video_url || node.video_versions)) {
                  const vUrl =
                    node.video_url ||
                    node.video_versions?.find((v: any) => v?.url && !v.url.includes('dashinit'))?.url ||
                    node.video_versions?.[0]?.url;
                  if (vUrl) items.push({ url: vUrl, ext: 'mp4', index });
                } else {
                  const imgUrl =
                    node.display_url ||
                    node.display_resources?.[node.display_resources.length - 1]?.src;
                  if (imgUrl) items.push({ url: imgUrl, ext: 'jpg', index });
                }
              });
              if (items.length > 0) {
                postMap[code] = { shortcode: code, username, isCarousel: true, items };
              }
            } else if (Array.isArray(carouselMedia) && carouselMedia.length > 0) {
              const items: Array<{ url: string; ext: 'mp4' | 'jpg'; index: number }> = [];
              carouselMedia.forEach((m: any, index: number) => {
                if (m?.video_versions && Array.isArray(m.video_versions) && m.video_versions.length > 0) {
                  const vUrl =
                    m.video_versions.find((v: any) => v?.url && !v.url.includes('dashinit'))?.url ||
                    m.video_versions[0]?.url;
                  if (vUrl) items.push({ url: vUrl, ext: 'mp4', index });
                } else {
                  const bestImg = m?.image_versions2?.candidates?.[0]?.url;
                  if (bestImg) items.push({ url: bestImg, ext: 'jpg', index });
                }
              });
              if (items.length > 0) {
                postMap[code] = { shortcode: code, username, isCarousel: true, items };
              }
            }
          }

          for (const k of Object.keys(obj)) {
            walk(obj[k], currentUsername, currentHighlightId);
          }
        }

        walk(data);
        return { mediaMap, postMap };
      }

      function handleData(rawText: string) {
        try {
          const json = JSON.parse(rawText);
          const { mediaMap, postMap } = extractAllMediaRecursively(json);
          if (Object.keys(mediaMap).length > 0 || Object.keys(postMap).length > 0) {
            syncToDomStore(mediaMap, postMap);
          }
        } catch {}
      }

      // Intercept Fetch API
      window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
          const rawUrl = typeof args[0] === 'string' ? args[0] : (args[0] && 'url' in args[0] ? (args[0] as Request).url : '');
          const url = String(rawUrl || '');

          if (
            url.includes('/api/v1/') ||
            url.includes('/graphql/query')
          ) {
            const clone = response.clone();
            clone
              .text()
              .then(handleData)
              .catch(() => {});
          }
        } catch {}
        return response;
      };

      // Intercept XMLHttpRequest
      XHR.open = function (method: string, url: string | URL) {
        (this as any)._downplaygram_url = typeof url === 'string' ? url : url.toString();
        return originalOpen.apply(this, arguments as any);
      };

      XHR.send = function () {
        this.addEventListener('load', function () {
          const reqUrl = (this as any)._downplaygram_url || '';
          if (reqUrl && (reqUrl.includes('/api/v1/') || reqUrl.includes('/graphql/query'))) {
            handleData(this.responseText);
          }
        });
        return originalSend.apply(this, arguments as any);
      };
    } catch {}
  },
});
