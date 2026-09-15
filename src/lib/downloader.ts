/**
 * Downplaygram Downloader Library
 * Coordinates media downloading with the background service worker,
 * ensuring correct path routing and throttle delays.
 */

export interface DownloadItem {
  url: string;
  filepath: string;
}

export interface DownloadResponse {
  success: boolean;
  downloadId?: number;
  error?: string;
}

import { isExtensionContextValid, safeSendMessage } from './runtime';

/**
 * Triggers download of a single media item via background service worker.
 */
export async function downloadFile(url: string, filepath: string): Promise<DownloadResponse> {
  if (!url || !filepath) {
    return { success: false, error: 'Missing URL or filepath' };
  }

  if (!isExtensionContextValid()) {
    console.warn('[Downplaygram] Extension context invalidated. Refresh tab required.');
    return { success: false, error: 'Extension context invalidated' };
  }

  try {
    const response = await safeSendMessage<DownloadResponse>({
      action: 'DOWNLOAD_MEDIA',
      payload: { url, filepath },
    });
    return response || { success: true };
  } catch (err: any) {
    console.error('[Downplaygram] Download message failed:', err);
    return { success: false, error: err?.message || 'Download failed' };
  }
}

/**
 * Triggers sequential batch downloading with a throttle interval (default 500ms).
 */
export async function downloadBatch(
  items: DownloadItem[],
  throttleMs = 500,
  onProgress?: (current: number, total: number) => void
): Promise<{ successful: number; failed: number }> {
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const res = await downloadFile(item.url, item.filepath);
    if (res.success) {
      successful++;
    } else {
      failed++;
    }

    if (onProgress) {
      onProgress(i + 1, items.length);
    }

    // Wait throttle interval between items if more items remain
    if (i < items.length - 1 && throttleMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, throttleMs));
    }
  }

  return { successful, failed };
}
