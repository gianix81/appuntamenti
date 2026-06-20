const CACHE_NAME  = 'appuntamenti-v9'
const OFFLINE_URL = '/offline'
const DB_NAME     = 'estetista-alarms'
const DB_VERSION  = 1

// ─── IndexedDB helpers (mirrored from src/lib/alarmDB.ts) ────────────────────

function swOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('alarms'))   db.createObjectStore('alarms',   { keyPath: 'id' })
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function swGetPendingAlarms() {
  const db  = await swOpenDB()
  const now = Date.now()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('alarms', 'readonly')
    const req = tx.objectStore('alarms').getAll()
    req.onsuccess = () => resolve(req.result.filter(a => !a.fired && a.alarm_time <= now))
    req.onerror   = () => reject(req.error)
  })
}

async function swMarkFired(id) {
  const db = await swOpenDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction('alarms', 'readwrite')
    const store = tx.objectStore('alarms')
    const get   = store.get(id)
    get.onsuccess = () => { if (get.result) { get.result.fired = true; store.put(get.result) } }
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

function alarmTitle(offsetMs) {
  const mins = Math.round(offsetMs / 60000)
  if (mins === 0) return 'Appuntamento ora!'
  if (mins < 60)  return `Appuntamento tra ${mins} min`
  const h = Math.round(mins / 60)
  return `Appuntamento tra ${h}${h === 1 ? ' ora' : ' ore'}`
}

function formatTime(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

async function checkAndFireAlarms() {
  const alarms = await swGetPendingAlarms()
  for (const alarm of alarms) {
    const offsetMs = alarm.appointment_time - alarm.alarm_time
    const title    = alarmTitle(offsetMs)
    const body     = `${alarm.client_name} — ${alarm.service_name} alle ${formatTime(alarm.appointment_time)}`

    await self.registration.showNotification(title, {
      body,
      icon:     '/icons/icon-192.png',
      badge:    '/icons/icon-72.png',
      tag:      alarm.id,
      renotify: true,
      vibrate:  [300, 100, 300, 100, 600],
      actions:  [
        { action: 'whatsapp', title: '💬 WhatsApp' },
        { action: 'sms',      title: '📱 SMS' },
      ],
      data: alarm,
    })

    await swMarkFired(alarm.id)
  }
}

// ─── Install / Activate ───────────────────────────────────────────────────────

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

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return

  // HTML pages: always network-first
  if (event.request.mode === 'navigate') {
    // Check alarms on every page navigation (app in use)
    checkAndFireAlarms().catch(() => {})
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    )
    return
  }

  // Static assets: network-first with cache fallback
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

// ─── Periodic Sync (Android Chrome background) ────────────────────────────────

self.addEventListener('periodicsync', event => {
  if (event.tag === 'alarm-check') {
    event.waitUntil(checkAndFireAlarms())
  }
})

// ─── Message from page ────────────────────────────────────────────────────────

self.addEventListener('message', event => {
  if (event.data?.type === 'ALARMS_UPDATED') {
    // Immediately check if any new alarm is already due
    checkAndFireAlarms().catch(() => {})
  }
})

// ─── Notification click ───────────────────────────────────────────────────────

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const alarm = event.notification.data

  let url = '/dashboard'
  if (alarm) {
    if (event.action === 'whatsapp') url = alarm.whatsapp_url
    else if (event.action === 'sms') url = alarm.sms_url
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      // If app already open, focus it
      const existing = wins.find(w => w.url.includes(self.location.origin))
      if (existing && 'focus' in existing) {
        existing.focus()
        if (url !== '/dashboard') existing.navigate(url)
        return
      }
      clients.openWindow(url)
    })
  )
})
