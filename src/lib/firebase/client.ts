import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// Durante il build (prerender SSR) le NEXT_PUBLIC_* non sono disponibili:
// in quel caso restituiamo null cast come tipo reale — i componenti
// non eseguono query durante il prerender (useEffect non gira lato server).
function getApp(): FirebaseApp | null {
  if (!firebaseConfig.apiKey) return null
  return getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig)
}

const _app = getApp()
export const auth    = (_app ? getAuth(_app)       : null) as Auth
export const db      = (_app ? getFirestore(_app)  : null) as Firestore
export const storage = (_app ? getStorage(_app)    : null) as FirebaseStorage
