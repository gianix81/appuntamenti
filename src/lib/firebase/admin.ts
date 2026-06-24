import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  })
}

// Ritorna true solo se la private key è stata configurata con un valore reale
export function isAdminConfigured(): boolean {
  const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? ''
  return key.startsWith('-----BEGIN PRIVATE KEY-----') && key.length > 100
}

// Lazy: inizializzazione solo al primo utilizzo (non al momento dell'import)
export function getAdminAuth()    { return getAuth(getAdminApp()) }
export function getAdminDb()      { return getFirestore(getAdminApp()) }
export function getAdminStorage() { return getStorage(getAdminApp()) }
