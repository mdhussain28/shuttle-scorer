// Minimal service worker so the app is installable as a PWA.
// It does not cache anything yet; offline scoring can be added later.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
