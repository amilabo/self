// Service worker: кэширует только код формы, чтобы она открывалась без интернета.
// Данные (IndexedDB) он не трогает и никуда не отправляет.
// При любом изменении файлов формы поднимите VERSION — иначе телефон останется на старой версии.

const VERSION = '0.1.5';
const CACHE = `self-form-${VERSION}`;
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fonts/manrope-cyrillic.woff2',
  './fonts/manrope-latin.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/app.js',
  './js/actions.js',
  './js/content.js',
  './js/dates.js',
  './js/ellis.enc.js',
  './js/ellislock.js',
  './js/db.js',
  './js/exporter.js',
  './js/install.js',
  './js/nav.js',
  './js/rules.js',
  './js/safety.js',
  './js/session.js',
  './js/testrules.js',
  './js/sheets.js',
  './js/store.js',
  './js/timer.js',
  './js/ui.js',
  './js/util.js',
  './js/screens/data.js',
  './js/screens/evening.js',
  './js/screens/help.js',
  './js/screens/morning.js',
  './js/screens/prep.js',
  './js/screens/testcommon.js',
  './js/screens/testresult.js',
  './js/screens/testrun.js',
  './js/screens/tests.js',
  './js/screens/today.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('self-form-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Сначала кэш, затем сеть. Открытие самой формы (корень или index.html) — из кэша, даже без сети.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  if (req.mode === 'navigate' && (url.pathname === scope || url.pathname === `${scope}index.html`)) {
    event.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
