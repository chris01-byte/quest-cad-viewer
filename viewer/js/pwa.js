// PWA glue: registers the service worker and offers an "install" button where the browser supports it.

/** @param {{onInstallAvailable: (install: (() => Promise<void>) | null) => void}} handlers */
export function setUpPWA({ onInstallAvailable }) {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker not registered', e));
    });
  }

  let deferred = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // keep the prompt for our own button
    deferred = event;
    onInstallAvailable(async () => {
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      onInstallAvailable(null);
    });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    onInstallAvailable(null);
  });
}
