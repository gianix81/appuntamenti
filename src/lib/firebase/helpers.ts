import type { DocumentSnapshot, QuerySnapshot } from 'firebase/firestore'
import type { DocumentSnapshot as AdminDocSnap, QuerySnapshot as AdminQuerySnap } from 'firebase-admin/firestore'

export function docToData<T>(snap: DocumentSnapshot): T | null {
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as T
}

export function docsToData<T>(snap: QuerySnapshot): T[] {
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as T)
}

export function adminDocToData<T>(snap: AdminDocSnap): T | null {
  if (!snap.exists) return null
  return { id: snap.id, ...snap.data() } as T
}

export function adminDocsToData<T>(snap: AdminQuerySnap): T[] {
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as T)
}
