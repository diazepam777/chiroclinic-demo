const CACHE_NAME = 'chiroclinic-v505-p1-latest-v20-rebuild-2026-10-22';
const EXERCISE_CACHE_NAME = 'chiroclinic-exercise-images-v11';
// Install precache: shell + DBs + dermatomes + icons + ice/heat only.
// Large Ex_Chatgt_codex exercise PNGs are runtime-cached on first fetch.
const APP_SHELL = [
  './',
  './index.html',
  './csp-events.js', // v8 CSP: moved out of the HTML
  './p1-boot-kiosk.js', // v8 CSP: moved out of the HTML
  './p1-boot-stamp.js', // v8 CSP: moved out of the HTML
  './app-main.js', // v8 CSP: moved out of the HTML
  './pwa-boot.js', // v8 CSP: moved out of the HTML
  './diary-main.js', // v8 CSP: moved out of the HTML
  './diary-weekend.js', // v8 CSP: moved out of the HTML
  './intake-flag.js', // v8 CSP: moved out of the HTML
  './intake-main.js', // v8 CSP: moved out of the HTML
  './diary.html',
  './ehr-p0.js',
  './p1-item1.js',
  './p1-item2.js',
  './p1-item3.js',
  './p1-item4.js',
  './p1-item5.js',
  './p1-docpractice.js',
  './p1-item6.js',
  './icd10-mit-2021.js',
  './p1-item7.js',
  './p1-item7-rates.js',
  './p1-item8.js',
  './p1-item9.js',
  './p1-auth.js',
  './p1-backup.js',
  './p1-sha256.js',
  './p1-store.js',
  './p1-a11y.js',
  './p1-a11y.css',
  './p1-techwarn.js',
  './p1-hyper.js',
  './intake.html',
  './p1-rom-data.js',
  './p1-rom-figure.js',
  './rom-pose-core.js',
  './rom-anat.js',
  './vendor/three-rom.min.js',
  './vendor/LICENSES-three-meshopt.txt',
  './vendor/fonts/fonts.css',
  './vendor/fonts/DMSans-latin-f71cbe.woff2',
  './vendor/fonts/DMSans-latin-ext-7477c8.woff2',
  './vendor/fonts/PlayfairDisplay-latin-fdd6c3.woff2',
  './vendor/fonts/PlayfairDisplay-latin-ext-74f689.woff2',
  './vendor/fonts/OFL-DMSans.txt',
  './vendor/fonts/OFL-PlayfairDisplay.txt',
  './rom/rom_figure.glb',
  './manifest.webmanifest',
  './medication-database.js',
  './medication-interactions.js',
  './referral-database.js',
  './dermatome-reference.png',
  './dermatome-referral-outline.jpg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/logo-cc.svg',
  './images/iceheat/01_Cervical_Heat.jpg',
  './images/iceheat/02_Cervical_Ice.jpg',
  './images/iceheat/03_Shoulder_Left_Heat.jpg',
  './images/iceheat/04_Shoulder_Left_Ice.jpg',
  './images/iceheat/05_Shoulder_Right_Heat.jpg',
  './images/iceheat/06_Shoulder_Right_Ice.jpg',
  './images/iceheat/07_Thoracic_Spine_Heat.jpg',
  './images/iceheat/08_Thoracic_Spine_Ice.jpg',
  './images/iceheat/09_Lumbar_Spine_Heat.jpg',
  './images/iceheat/10_Lumbar_Spine_Ice.jpg',
  './images/iceheat/11_Elbow_Left_Heat.jpg',
  './images/iceheat/12_Elbow_Left_Ice.jpg',
  './images/iceheat/13_Elbow_Right_Heat.jpg',
  './images/iceheat/14_Elbow_Right_Ice.jpg',
  './images/iceheat/15_Elbow_Left_Medial_Heat.jpg',
  './images/iceheat/16_Elbow_Left_Medial_Ice.jpg',
  './images/iceheat/17_Elbow_Left_Lateral_Heat.jpg',
  './images/iceheat/18_Elbow_Left_Lateral_Ice.jpg',
  './images/iceheat/19_Elbow_Right_Medial_Heat.jpg',
  './images/iceheat/20_Elbow_Right_Medial_Ice.jpg',
  './images/iceheat/21_Elbow_Right_Lateral_Heat.jpg',
  './images/iceheat/22_Elbow_Right_Lateral_Ice.jpg',
  './images/iceheat/23_Wrist_Left_Heat.jpg',
  './images/iceheat/24_Wrist_Left_Ice.jpg',
  './images/iceheat/25_Wrist_Right_Heat.jpg',
  './images/iceheat/26_Wrist_Right_Ice.jpg',
  './images/iceheat/27_Knee_Left_Heat.jpg',
  './images/iceheat/28_Knee_Left_Ice.jpg',
  './images/iceheat/29_Knee_Right_Heat.jpg',
  './images/iceheat/30_Knee_Right_Ice.jpg',
  './images/iceheat/31_ITB_Left_Heat.jpg',
  './images/iceheat/32_ITB_Left_Ice.jpg',
  './images/iceheat/33_ITB_Right_Heat.jpg',
  './images/iceheat/34_ITB_Right_Ice.jpg',
  './images/iceheat/35_Ankle_Left_Heat.jpg',
  './images/iceheat/36_Ankle_Left_Ice.jpg',
  './images/iceheat/37_Ankle_Right_Heat.jpg',
  './images/iceheat/38_Ankle_Right_Ice.jpg',
  './images/iceheat/39_Achilles_Left_Heat.jpg',
  './images/iceheat/40_Achilles_Left_Ice.jpg',
  './images/iceheat/41_Achilles_Right_Heat.jpg',
  './images/iceheat/42_Achilles_Right_Ice.jpg',
  './images/iceheat/43_Calf_Left_Heat.jpg',
  './images/iceheat/44_Calf_Left_Ice.jpg',
  './images/iceheat/45_Calf_Right_Heat.jpg',
  './images/iceheat/46_Calf_Right_Ice.jpg',
  './images/iceheat/47_Hamstring_Left_Heat.jpg',
  './images/iceheat/48_Hamstring_Left_Ice.jpg',
  './images/iceheat/49_Hamstring_Right_Heat.jpg',
  './images/iceheat/50_Hamstring_Right_Ice.jpg'
];

function isExerciseImagePath(pathname) {
  return pathname.includes('/Ex_Chatgt_codex/');
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(
            k =>
              k !== CACHE_NAME &&
              k !== EXERCISE_CACHE_NAME &&
              k.startsWith('chiroclinic-')
          )
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.includes('/api/')) return;

  // Navigation: network-first, offline fallback to shell HTML
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        const p = url.pathname.toLowerCase();
        if (p.endsWith('/diary') || p.endsWith('/diary.html')) {
          return (await cache.match('./diary.html')) || Response.error();
        }
        if (p.endsWith('/intake.html') || p.endsWith('/intake')) {
          return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./intake.html')) || Response.error();
        }
        return (
          (await cache.match('./index.html')) ||
          (await cache.match('./')) ||
          Response.error()
        );
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Exercise PNGs: cache-first into dedicated exercise cache (not install-precached)
  if (isExerciseImagePath(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(EXERCISE_CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (e) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Other same-origin assets: cache-first into main shell cache
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});
