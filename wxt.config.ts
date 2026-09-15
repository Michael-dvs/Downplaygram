import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  entrypointsDir: '.',
  manifest: {
    name: 'Downplaygram',
    description: 'Privacy-first, zero-telemetry Instagram media downloader and ghost viewing engine.',
    version: '3.0.0',
    permissions: [
      'declarativeNetRequest',
      'storage',
      'downloads',
      'webRequest',
    ],
    host_permissions: [
      '*://*.instagram.com/*',
      '*://*.cdninstagram.com/*',
      '*://*.fbcdn.net/*',
    ],
    action: {},
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
});
