/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Pass-through for Reader API requests
registerRoute(
  /^https:\/\/reader-api-.*\.run\.app\/.*/i,
  new NetworkOnly()
);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

interface PushPayload {
  title?: string;
  body?: string;
  summary?: string;
  articleId?: string | number;
  url?: string;
  apiRoot?: string;
  apiKey?: string;
  tag?: string;
}

// =========================================================================
// 1. Background Push Event Handler
// =========================================================================
self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: 'Research Reader', body: event.data.text() };
    }
  }

  const articleId = payload.articleId ? String(payload.articleId) : undefined;
  const title = payload.title || 'Curated Article to Read';
  const summary = payload.summary || payload.body || 'New unread article picked for you.';
  const targetUrl = payload.url || (articleId ? `/rr.html?articleId=${articleId}` : '/rr.html');

  const options = {
    body: summary,
    icon: '/pwa-192x192.png',
    badge: '/badge-96x96.png',
    tag: payload.tag || 'daily-curation',
    renotify: true,
    data: {
      articleId,
      url: targetUrl,
      apiRoot: payload.apiRoot,
      apiKey: payload.apiKey,
    },
    actions: [
      { action: 'read', title: '📖 Read Now' },
      { action: 'later', title: '⏳ Tag for Later' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options as NotificationOptions));
});

// =========================================================================
// 2. Notification Click Handler
// =========================================================================
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const data: PushPayload = event.notification.data || {};
  const articleId = data.articleId ? String(data.articleId) : undefined;
  const targetUrl = new URL(data.url || (articleId ? `/rr.html?articleId=${articleId}` : '/rr.html'), self.location.origin).href;

  // Option A: User clicked "Tag for Later" directly from notification
  if (event.action === 'later') {
    event.waitUntil(
      (async () => {
        let success = false;
        try {
          if (data.apiRoot && articleId) {
            const res = await fetch(`${data.apiRoot}/articles/${articleId}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(data.apiKey ? { 'X-Api-Key': data.apiKey } : {}),
              },
              body: JSON.stringify({ status: 'later' }),
            });
            success = res.ok;
          }
        } catch (err) {
          console.error('Failed to update article to later status in background:', err);
        }

        // Notify user of completion in notification tray
        await self.registration.showNotification(
          success ? 'Saved for Later' : 'Marked for Later',
          {
            body: success
              ? 'Article tagged for later reading ✓'
              : 'Article flagged for later reading.',
            icon: '/pwa-192x192.png',
            badge: '/badge-96x96.png',
            tag: 'daily-curation-feedback',
            silent: true,
          }
        );

        // Auto-close feedback notification after 3 seconds
        setTimeout(async () => {
          const notifications = await self.registration.getNotifications({
            tag: 'daily-curation-feedback',
          });
          for (const n of notifications) {
            n.close();
          }
        }, 3000);
      })()
    );
    return;
  }

  // Option B: User clicked "Read Now" or tapped the notification body
  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // If an existing Research Reader window is open, focus it and navigate
      for (const client of windowClients) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({
            type: 'NAVIGATE_TO_ARTICLE',
            articleId,
            url: targetUrl,
          });
          return;
        }
      }

      // Otherwise, open a new window
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
