'use client'

import { useSettings } from '@/contexts/SettingsContext'
import type { BusinessLevel } from '@/types/database'

export interface BusinessLevelFlags {
  level: BusinessLevel
  loading: boolean
  /** true → 1 sola persona, nessuno staff */
  isSolo: boolean
  /** true → ha collaboratrici (lv 2+) */
  hasStaff: boolean
  /** true → ha ruoli/permessi differenziati (lv 3+) */
  hasRoles: boolean
  /** true → campagne marketing avanzate (lv 3+) */
  hasMarketing: boolean
  /** true → magazzino prodotti (lv 3+) */
  hasWarehouse: boolean
  /** true → gestione multi-sede (lv 4) */
  hasMultiSite: boolean
  /** etichetta adattiva per il centro */
  centerLabel: string
  /** etichetta adattiva per le collaboratrici */
  staffLabel: string
}

export function useBusinessLevel(): BusinessLevelFlags {
  const { settings, loading } = useSettings()
  const level = (settings?.business_level ?? 1) as BusinessLevel

  return {
    level,
    loading,
    isSolo:       level === 1,
    hasStaff:     level >= 2,
    hasRoles:     level >= 3,
    hasMarketing: level >= 3,
    hasWarehouse: level >= 3,
    hasMultiSite: level === 4,
    centerLabel:  level === 1 ? 'Il mio studio' : 'Il centro',
    staffLabel:   level === 1 ? 'Io' : level === 2 ? 'Collaboratrici' : 'Staff',
  }
}
