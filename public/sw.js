const CACHE_NAME = 'appuntamenti-v3'
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
  try { data = event.data.json() } catch { data = { title: 'Appuntamenti', body: event.data.text() } }

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Appuntamenti App', {
      body:             data.body ?? '',
      icon:             '/icons/icon-192.png',
      badge:            '/icons/icon-192.png',
      data:             { url: data.url || '/dashboard' },
      requireInteraction: true,
      vibrate:          [300, 100, 300, 100, 300],
      tag:              data.tag || 'push',
    })
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
  // Il numero badge viene gestito dalla pagina; qui proviamo a pulirlo
  if ('clearAppBadge' in self.navigator) {
    self.navigator.clearAppBadge().catch(() => {})
  }
})
