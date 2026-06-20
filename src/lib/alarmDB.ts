// IndexedDB alarm store — same DB accessed by SW (sw.js) and React code

const DB_NAME    = 'estetista-alarms'
const DB_VERSION = 1

export interface StoredAlarm {
  id:               string   // `${appointmentId}_${offsetMinutes}`
  appointment_id:   string
  alarm_time:       number   // ms timestamp — when to fire
  appointment_time: number   // ms timestamp
  client_name:      string
  client_phone:     string
  service_name:     string
  notes:            string | null
  whatsapp_url:     string
  sms_url:          string
  fired:            boolean
}

export interface AlarmSettings {
  offsets_minutes: number[]  // e.g. [1440, 120, 30, 0]
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('alarms')) {
        db.createObjectStore('alarms', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror  = () => reject(req.error)
  })
}

export async function saveAlarms(alarms: StoredAlarm[]): Promise<void> {
  if (!alarms.length) return
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx    = db.transaction('alarms', 'readwrite')
    const store = tx.objectStore('alarms')
    alarms.forEach(a => store.put(a))
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

export async function deleteAlarmsForAppointment(appointmentId: string): Promise<void> {
  const db = await openDB()
  const all = await new Promise<StoredAlarm[]>((resolve, reject) => {
    const tx  = db.transaction('alarms', 'readonly')
    const req = tx.objectStore('alarms').getAll()
    req.onsuccess = () => resolve(req.result as StoredAlarm[])
    req.onerror   = () => reject(req.error)
  })
  const toDelete = all.filter(a => a.appointment_id === appointmentId)
  if (!toDelete.length) return
  await new Promise<void>((resolve, reject) => {
    const tx    = db.transaction('alarms', 'readwrite')
    const store = tx.objectStore('alarms')
    toDelete.forEach(a => store.delete(a.id))
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

export async function getPendingAlarms(): Promise<StoredAlarm[]> {
  const db  = await openDB()
  const now = Date.now()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('alarms', 'readonly')
    const req = tx.objectStore('alarms').getAll()
    req.onsuccess = () => resolve(
      (req.result as StoredAlarm[]).filter(a => !a.fired && a.alarm_time <= now)
    )
    req.onerror = () => reject(req.error)
  })
}

export async function markAlarmFired(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx    = db.transaction('alarms', 'readwrite')
    const store = tx.objectStore('alarms')
    const get   = store.get(id)
    get.onsuccess = () => {
      if (get.result) { get.result.fired = true; store.put(get.result) }
    }
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

export async function getAllAlarms(): Promise<StoredAlarm[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('alarms', 'readonly')
    const req = tx.objectStore('alarms').getAll()
    req.onsuccess = () => resolve(req.result as StoredAlarm[])
    req.onerror   = () => reject(req.error)
  })
}

export async function saveAlarmSettings(settings: AlarmSettings): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite')
    tx.objectStore('settings').put({ id: 'alarm', ...settings })
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

export async function getAlarmSettings(): Promise<AlarmSettings | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('settings', 'readonly')
    const req = tx.objectStore('settings').get('alarm')
    req.onsuccess = () => {
      const r = req.result
      resolve(r ? { offsets_minutes: r.offsets_minutes } : null)
    }
    req.onerror = () => reject(req.error)
  })
}
