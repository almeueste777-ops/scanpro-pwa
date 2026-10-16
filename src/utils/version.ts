export const APP_VERSION = 'v2.1.0';
export const APP_BUILD_NAME = 'VIP Suite: ID Card A4, Carte 2-Pag, Radieră Smart & Filigran PDF';

/**
 * Force clear Service Worker and Cache Storage, then hard-reload
 */
export async function forceAppUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }

    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        await caches.delete(name);
      }
    }
  } catch (e) {
    console.warn('Cache clear error:', e);
  }

  // Force reload bypassing cache
  window.location.href = window.location.pathname + '?t=' + Date.now();
}
