const CACHE_NAME = 'appuntamenti-v6'
const OFFLINE_URL = '/offline'

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(['/offline']))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || response.status !== 200 || response.redirected) return response
        const clone = response.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        return response
      })
      .catch(() =>
        caches.match(event.request).then(cached => cached || caches.match(OFFLINE_URL))
      )
  )
})

// Notifica push server-side (via web-push)
self.addEventListener('push', event => {
  if (!event.data) return
  let data
  try { data = event.data.json() } catch { data = { title: '⏰ Appuntamento', body: event.data.text() } }

  const title   = data.title ?? '⏰ Appuntamento'
  const options = {
    body:               data.body ?? '',
    icon:               '/icons/icon-192.png',
    badge:              '/icons/icon-192.png',
    data:               { url: data.url || '/dashboard', whatsappUrl: data.whatsappUrl },
    requireInteraction: true,
    silent:             false,
    vibrate:            [1000, 300, 1000, 300, 1000, 300, 1000, 300, 1000, 300, 1000],
    tag:                data.tag || 'appt-push',
    renotify:           true,
    actions: [
      { action: 'open',      title: '📋 Apri app' },
      { action: 'whatsapp',  title: '💬 WhatsApp' },
    ],
  }

  event.waitUntil(
    // Chiudi notifiche precedenti con lo stesso tag, poi mostra la nuova
    self.registration.getNotifications({ tag: options.tag })
      .then(existing => existing.forEach(n => n.close()))
      .then(() => self.registration.showNotification(title, options))
  )
})

// Click sulla notifica → apre WhatsApp (azione) o porta in primo piano l'app
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const data = event.notification.data || {}

  // Azione "whatsapp" → apre WhatsApp direttamente
  if (event.action === 'whatsapp' && data.whatsappUrl) {
    event.waitUntil(clients.openWindow(data.whatsappUrl))
    return
  }

  const url = data.url || '/dashboard'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

// Notifica chiusa dall'utente → togli il badge
self.addEventListener('notificationclose', () => {
  if ('clearAppBadge' in self.navigator) {
    self.navigator.clearAppBadge().catch(() => {})
  }
})

// ── Periodic Background Sync ─────────────────────────────────────────────────
// Si sveglia ogni minuto anche con app CHIUSA (Chrome/Android PWA installata)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'remind') {
    event.waitUntil(
      fetch('/api/cron/reminders', { cache: 'no-store', credentials: 'include' })
        .catch(() => {})
    )
  }
})

// ── Background Sync ───────────────────────────────────────────────────────────
// Si attiva quando il dispositivo torna online
self.addEventListener('sync', event => {
  if (event.tag === 'remind') {
    event.waitUntil(
      fetch('/api/cron/reminders', { cache: 'no-store', credentials: 'include' })
        .catch(() => {})
    )
  }
})
