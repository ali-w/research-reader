export interface TopicPreferences {
  interested: string[];
  excluded: string[];
}

const STORAGE_KEY_VAPID = 'push_vapid_public_key';
const STORAGE_KEY_PREFS = 'topic_curation_preferences';

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported on this browser.');
  }
  return await Notification.requestPermission();
}

/**
 * Converts a URL-safe Base64 string to a Uint8Array required by PushManager.subscribe()
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return await registration.pushManager.getSubscription();
}

/**
 * Subscribes the device to push notifications and notifies the backend
 */
export async function subscribeToPush(
  vapidPublicKey: string,
  readerRoot: string,
  apiKey: string
): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported on this device/browser.');
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    throw new Error(`Notification permission was ${permission}. Please allow notifications in browser settings.`);
  }

  const registration = await navigator.serviceWorker.ready;
  const convertedKey = urlBase64ToUint8Array(vapidPublicKey);

  // Subscribe to push manager
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: convertedKey as unknown as BufferSource,
  });

  // Persist the key used
  localStorage.setItem(STORAGE_KEY_VAPID, vapidPublicKey);

  // Send subscription to backend
  const candidateUrls = [
    `/api/push/subscribe`,
    ...(readerRoot ? [`${readerRoot}/push/subscribe`] : []),
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          device_info: `${navigator.userAgent} (${navigator.platform})`,
          created_at: new Date().toISOString(),
        }),
      });
      if (res.ok) break;
    } catch {
      // Try next candidate url
    }
  }

  return subscription;
}

/**
 * Unsubscribes the current device
 */
export async function unsubscribeFromPush(readerRoot: string, apiKey: string): Promise<boolean> {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return true;

  const candidateUrls = [
    `/api/push/unsubscribe`,
    ...(readerRoot ? [`${readerRoot}/push/unsubscribe`] : []),
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
        }),
      });
      if (res.ok) break;
    } catch {
      // try next
    }
  }

  try {
    return await subscription.unsubscribe();
  } catch (err) {
    console.error('Error during unsubscribe:', err);
    return false;
  }
}

/**
 * Fires a local test notification via the Service Worker to immediately verify appearance on Android
 */
export async function triggerLocalTestNotification(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const options = {
    body: 'Gemini curated: "Exploring Scalable Offline-First Architectures" (Short 5 min read)',
    icon: '/pwa-192x192.png',
    badge: '/badge-96x96.png',
    tag: 'test-notification',
    data: {
      url: '/rr.html',
    },
    actions: [
      { action: 'read', title: '📖 Read Now' },
      { action: 'later', title: '⏳ Tag for Later' },
    ],
  };

  await registration.showNotification('Research Reader • Article of the Day', options as NotificationOptions);
}

/**
 * Loads topic curation preferences (from backend or local storage fallback)
 */
export async function loadTopicPreferences(readerRoot: string, apiKey: string): Promise<TopicPreferences> {
  const defaultPrefs: TopicPreferences = {
    interested: ['AI & Agentic Systems', 'Distributed Systems', 'Offline First'],
    excluded: ['Crypto', 'Gossip', 'Celebrity News'],
  };

  const candidateUrls = [
    `/api/user/preferences`,
    ...(readerRoot ? [`${readerRoot}/user/preferences`] : []),
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.interested || data.excluded) {
          const loaded: TopicPreferences = {
            interested: Array.isArray(data.interested) ? data.interested : [],
            excluded: Array.isArray(data.excluded) ? data.excluded : [],
          };
          localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(loaded));
          return loaded;
        }
      }
    } catch {
      // try next candidate
    }
  }

  const stored = localStorage.getItem(STORAGE_KEY_PREFS);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return defaultPrefs;
    }
  }

  return defaultPrefs;
}

/**
 * Saves topic curation preferences to backend and local storage
 */
export async function saveTopicPreferences(
  prefs: TopicPreferences,
  readerRoot: string,
  apiKey: string
): Promise<void> {
  localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs));

  const candidateUrls = [
    `/api/user/preferences`,
    ...(readerRoot ? [`${readerRoot}/user/preferences`] : []),
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
        },
        body: JSON.stringify(prefs),
      });
      if (res.ok) break;
    } catch {
      // try next candidate
    }
  }
}
