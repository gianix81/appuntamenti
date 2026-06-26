import { collection, doc } from 'firebase/firestore'
import type { CollectionReference, DocumentReference, Firestore } from 'firebase/firestore'

/**
 * workspaceId = null  → master admin, usa flat collections (dati esistenti intatti)
 * workspaceId = uid   → nuovo utente, usa workspaces/{uid}/ subcollections (archivio isolato)
 */
export function wsCol(db: Firestore, workspaceId: string | null, name: string): CollectionReference {
  if (!workspaceId) return collection(db, name)
  return collection(db, 'workspaces', workspaceId, name)
}

export function wsDoc(db: Firestore, workspaceId: string | null, colName: string, docId: string): DocumentReference {
  if (!workspaceId) return doc(db, colName, docId)
  return doc(db, 'workspaces', workspaceId, colName, docId)
}
