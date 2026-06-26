'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { wsCol, wsDoc } from '@/lib/firebase/workspace'
import type { Client, ClientAnamnesi, YesNo } from '@/types/database'
import { clsx } from 'clsx'
import {
  User, MapPin, Phone, AlertTriangle, Eye, Heart, Activity,
  FileText, Leaf,
} from 'lucide-react'

interface Props { existing?: Client }
type Tab = 'anagrafica' | 'anamnesi'

// ── Stili condivisi ──────────────────────────────────────────────────────────
const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300 text-sm text-slate-800 bg-white placeholder:text-slate-300'
const LABEL = 'block text-xs font-semibold text-slate-500 mb-1.5'

// ── Sub-componenti ───────────────────────────────────────────────────────────
function SectionHeader({
  icon: Icon, title, color,
}: { icon: React.ElementType; title: string; color: string }) {
  return (
    <div className={clsx('flex items-center gap-2 pb-2 mb-4 border-b border-current/20', color)}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-xs font-extrabold uppercase tracking-widest">{title}</span>
    </div>
  )
}

function YesNoToggle({ value, onChange }: { value: YesNo; onChange: (v: 'no' | 'si') => void }) {
  return (
    <div className="flex gap-1">
      {(['no', 'si'] as const).map(v => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={clsx(
            'px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all',
            value === v
              ? v === 'si' ? 'bg-rose-500 text-white shadow' : 'bg-slate-700 text-white shadow'
              : 'bg-slate-100 text-slate-400 hover:bg-slate-200',
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

function ChipGroup<T extends string>({
  options, value, onChange,
}: { options: { label: string; value: T }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
            value === o.value
              ? 'bg-orange-500 text-white shadow'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function BoolChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
        checked
          ? 'bg-amber-50 border-amber-400 text-amber-700'
          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300',
      )}
    >
      <span className={clsx(
        'w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
        checked ? 'border-amber-500 bg-amber-500' : 'border-slate-300',
      )}>
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M1 5l3 3 7-7" />
          </svg>
        )}
      </span>
      {label}
    </button>
  )
}

// ── Form principale ──────────────────────────────────────────────────────────
export function ClientForm({ existing }: Props) {
  const router = useRouter()
  const { workspaceId } = useWorkspace()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [tab, setTab]         = useState<Tab>('anagrafica')

  const [form, setForm] = useState({
    first_name: existing?.first_name ?? '',
    last_name:  existing?.last_name  ?? '',
    phone:      existing?.phone      ?? '',
    email:      existing?.email      ?? '',
    notes:      existing?.notes      ?? '',
    birth_date: existing?.birth_date ?? '',
    address:    existing?.address    ?? '',
    city:       existing?.city       ?? '',
    cap:        existing?.cap        ?? '',
    profession: existing?.profession ?? '',
  })

  const [ann, setAnn] = useState<ClientAnamnesi>(existing?.anamnesi ?? {})

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function setA<K extends keyof ClientAnamnesi>(field: K, value: ClientAnamnesi[K]) {
    setAnn(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const payload = {
      first_name: form.first_name.trim(),
      last_name:  form.last_name.trim(),
      phone:      form.phone.trim(),
      email:      form.email.trim()      || null,
      notes:      form.notes.trim()      || null,
      birth_date: form.birth_date.trim() || null,
      address:    form.address.trim()    || null,
      city:       form.city.trim()       || null,
      cap:        form.cap.trim()        || null,
      profession: form.profession.trim() || null,
      anamnesi:   ann,
      updated_at: new Date().toISOString(),
    }

    try {
      if (existing) {
        await updateDoc(wsDoc(db, workspaceId, 'clients', existing.id), payload)
      } else {
        await addDoc(wsCol(db, workspaceId, 'clients'), { ...payload, created_at: new Date().toISOString() })
      }
      router.push('/clients')
      router.refresh()
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">

      {/* ── Tab switcher ──────────────────────────────────────── */}
      <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
        <button
          type="button"
          onClick={() => setTab('anagrafica')}
          className={clsx(
            'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all',
            tab === 'anagrafica' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600',
          )}
        >
          👤 Anagrafica
        </button>
        <button
          type="button"
          onClick={() => setTab('anamnesi')}
          className={clsx(
            'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all',
            tab === 'anamnesi' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600',
          )}
        >
          🏥 Scheda Sanitaria
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════
          TAB: ANAGRAFICA
      ════════════════════════════════════════════════════════ */}
      {tab === 'anagrafica' && (
        <div className="space-y-4">

          {/* Dati anagrafici */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <SectionHeader icon={User} title="Dati anagrafici" color="text-orange-500" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Nome *</label>
                <input
                  required
                  value={form.first_name}
                  onChange={e => set('first_name', e.target.value)}
                  className={INPUT}
                  placeholder="Maria"
                />
              </div>
              <div>
                <label className={LABEL}>Cognome *</label>
                <input
                  required
                  value={form.last_name}
                  onChange={e => set('last_name', e.target.value)}
                  className={INPUT}
                  placeholder="Rossi"
                />
              </div>
              <div>
                <label className={LABEL}>Data di nascita</label>
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={e => set('birth_date', e.target.value)}
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>Professione</label>
                <input
                  value={form.profession}
                  onChange={e => set('profession', e.target.value)}
                  className={INPUT}
                  placeholder="es. Insegnante"
                />
              </div>
            </div>
          </div>

          {/* Contatti */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <SectionHeader icon={Phone} title="Contatti" color="text-orange-500" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={LABEL}>Telefono cellulare *</label>
                <input
                  required
                  type="tel"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  className={INPUT}
                  placeholder="+39 333 1234567"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  className={INPUT}
                  placeholder="maria@email.com"
                />
              </div>
            </div>
          </div>

          {/* Indirizzo */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <SectionHeader icon={MapPin} title="Indirizzo" color="text-emerald-600" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className={LABEL}>Via / Indirizzo</label>
                <input
                  value={form.address}
                  onChange={e => set('address', e.target.value)}
                  className={INPUT}
                  placeholder="Via Roma 12"
                />
              </div>
              <div>
                <label className={LABEL}>CAP</label>
                <input
                  value={form.cap}
                  onChange={e => set('cap', e.target.value)}
                  className={INPUT}
                  placeholder="00100"
                />
              </div>
              <div className="sm:col-span-3">
                <label className={LABEL}>Città</label>
                <input
                  value={form.city}
                  onChange={e => set('city', e.target.value)}
                  className={INPUT}
                  placeholder="Roma"
                />
              </div>
            </div>
          </div>

          {/* Note */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <SectionHeader icon={FileText} title="Note generali" color="text-slate-500" />
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className={clsx(INPUT, 'resize-none')}
              placeholder="Preferenze, annotazioni libere…"
            />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: ANAMNESI
      ════════════════════════════════════════════════════════ */}
      {tab === 'anamnesi' && (
        <div className="space-y-4">

          {/* Banner */}
          <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 text-xs text-orange-700">
            Tutti i campi sono facoltativi. Le informazioni sanitarie sono riservate e visibili solo all'admin.
          </div>

          {/* Salute generale */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <SectionHeader icon={Activity} title="Salute generale" color="text-orange-500" />
            <div className="space-y-3">
              <div>
                <label className={LABEL}>Stato di salute attuale</label>
                <input
                  value={ann.health_state ?? ''}
                  onChange={e => setA('health_state', e.target.value || null)}
                  className={INPUT}
                  placeholder="es. Buona salute"
                />
              </div>
              <div>
                <label className={LABEL}>Eventuali cure in corso</label>
                <input
                  value={ann.ongoing_treatments ?? ''}
                  onChange={e => setA('ongoing_treatments', e.target.value || null)}
                  className={INPUT}
                  placeholder="es. Nessuna"
                />
              </div>
              <div>
                <label className={LABEL}>Precedenti medici o chirurgici</label>
                <input
                  value={ann.medical_history ?? ''}
                  onChange={e => setA('medical_history', e.target.value || null)}
                  className={INPUT}
                  placeholder="es. Nessuno"
                />
              </div>
            </div>
          </div>

          {/* Ginecologia */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <SectionHeader icon={Heart} title="Dati ginecologici" color="text-pink-500" />
            <div className="space-y-4">

              {/* Gravidanza */}
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className={LABEL}>Gravidanza</label>
                  <YesNoToggle value={ann.pregnancy ?? null} onChange={v => setA('pregnancy', v)} />
                </div>
                {ann.pregnancy === 'si' && (
                  <div>
                    <label className={LABEL}>Quante</label>
                    <input
                      value={ann.pregnancy_count ?? ''}
                      onChange={e => setA('pregnancy_count', e.target.value || null)}
                      className={clsx(INPUT, 'w-28')}
                      placeholder="es. 2"
                    />
                  </div>
                )}
              </div>

              {/* Allattamento */}
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className={LABEL}>Allattamento</label>
                  <YesNoToggle value={ann.breastfeeding ?? null} onChange={v => setA('breastfeeding', v)} />
                </div>
                {ann.breastfeeding === 'si' && (
                  <div>
                    <label className={LABEL}>Da quanto</label>
                    <input
                      value={ann.breastfeeding_duration ?? ''}
                      onChange={e => setA('breastfeeding_duration', e.target.value || null)}
                      className={clsx(INPUT, 'w-36')}
                      placeholder="es. 3 mesi"
                    />
                  </div>
                )}
              </div>

              {/* Ciclo */}
              <div>
                <label className={LABEL}>Ciclo mestruale</label>
                <ChipGroup
                  options={[
                    { label: 'Regolare',   value: 'regolare'   as const },
                    { label: 'Irregolare', value: 'irregolare' as const },
                    { label: 'Doloroso',   value: 'doloroso'   as const },
                  ]}
                  value={ann.menstrual_cycle ?? null}
                  onChange={v => setA('menstrual_cycle', v)}
                />
              </div>
            </div>
          </div>

          {/* Allergie & Controindicazioni */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <SectionHeader icon={AlertTriangle} title="Allergie & controindicazioni" color="text-amber-600" />
            <div className="space-y-4">

              {/* Allergie */}
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className={LABEL}>Allergie</label>
                  <YesNoToggle value={ann.allergies ?? null} onChange={v => setA('allergies', v)} />
                </div>
                {ann.allergies === 'si' && (
                  <div className="flex-1 min-w-40">
                    <label className={LABEL}>Quali</label>
                    <input
                      value={ann.allergies_detail ?? ''}
                      onChange={e => setA('allergies_detail', e.target.value || null)}
                      className={INPUT}
                      placeholder="es. Nichel, pollini"
                    />
                  </div>
                )}
              </div>

              {/* Controindicazioni checkbox */}
              <div>
                <label className={clsx(LABEL, 'mb-2')}>Controindicazioni</label>
                <div className="flex flex-wrap gap-2">
                  <BoolChip label="Pace-maker"      checked={ann.pacemaker      ?? false} onChange={v => setA('pacemaker', v)} />
                  <BoolChip label="Ferite aperte"   checked={ann.wounds         ?? false} onChange={v => setA('wounds', v)} />
                  <BoolChip label="Protesi"         checked={ann.prosthesis     ?? false} onChange={v => setA('prosthesis', v)} />
                  <BoolChip label="Fili metallici"  checked={ann.metal_wires    ?? false} onChange={v => setA('metal_wires', v)} />
                  <BoolChip label="Fili chirurgici" checked={ann.surgical_wires ?? false} onChange={v => setA('surgical_wires', v)} />
                  <BoolChip label="Ipertensione"    checked={ann.hypertension   ?? false} onChange={v => setA('hypertension', v)} />
                </div>
              </div>

              {/* Contraccezione */}
              <div>
                <label className={clsx(LABEL, 'mb-2')}>Contraccezione</label>
                <div className="flex flex-wrap gap-2 items-center">
                  <BoolChip label="Spirale (IUD)" checked={ann.contraception_iud ?? false} onChange={v => setA('contraception_iud', v)} />
                  <input
                    value={ann.contraception_other ?? ''}
                    onChange={e => setA('contraception_other', e.target.value || null)}
                    className={clsx(INPUT, 'max-w-52')}
                    placeholder="Altro metodo…"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Stile di vita */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <SectionHeader icon={Leaf} title="Stile di vita" color="text-emerald-600" />
            <div className="space-y-4">

              {/* Alimentazione */}
              <div>
                <label className={LABEL}>Abitudini alimentari</label>
                <ChipGroup
                  options={[
                    { label: 'Regolari',   value: 'regolare'   as const },
                    { label: 'Irregolari', value: 'irregolare' as const },
                  ]}
                  value={ann.diet ?? null}
                  onChange={v => setA('diet', v)}
                />
              </div>

              {/* Fumo */}
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className={LABEL}>Fumo</label>
                  <YesNoToggle value={ann.smoking ?? null} onChange={v => setA('smoking', v)} />
                </div>
                {ann.smoking === 'si' && (
                  <div className="flex-1 min-w-40">
                    <label className={LABEL}>Quanto</label>
                    <input
                      value={ann.smoking_amount ?? ''}
                      onChange={e => setA('smoking_amount', e.target.value || null)}
                      className={INPUT}
                      placeholder="es. 5 sigarette/giorno"
                    />
                  </div>
                )}
              </div>

              {/* Attività fisica */}
              <div className="space-y-3">
                <div className="flex items-end gap-4 flex-wrap">
                  <div>
                    <label className={LABEL}>Attività fisica</label>
                    <YesNoToggle value={ann.physical_activity ?? null} onChange={v => setA('physical_activity', v)} />
                  </div>
                  {ann.physical_activity === 'si' && (
                    <div className="flex-1 min-w-40">
                      <label className={LABEL}>Quale</label>
                      <input
                        value={ann.physical_activity_type ?? ''}
                        onChange={e => setA('physical_activity_type', e.target.value || null)}
                        className={INPUT}
                        placeholder="es. Nuoto, palestra"
                      />
                    </div>
                  )}
                </div>
                {ann.physical_activity === 'si' && (
                  <div>
                    <label className={LABEL}>Frequenza</label>
                    <ChipGroup
                      options={[
                        { label: '1× settimana',   value: 'weekly'      as const },
                        { label: '3+ settimana',   value: 'three_times' as const },
                        { label: 'Tutti i giorni', value: 'daily'       as const },
                      ]}
                      value={ann.physical_activity_freq ?? null}
                      onChange={v => setA('physical_activity_freq', v)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Esame obiettivo */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <SectionHeader icon={Eye} title="Esame obiettivo" color="text-slate-600" />
            <div className="space-y-4">

              {/* Verruche */}
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className={LABEL}>Verruche</label>
                  <YesNoToggle value={ann.warts ?? null} onChange={v => setA('warts', v)} />
                </div>
                {ann.warts === 'si' && (
                  <div className="flex-1 min-w-40">
                    <label className={LABEL}>Dove</label>
                    <input
                      value={ann.warts_location ?? ''}
                      onChange={e => setA('warts_location', e.target.value || null)}
                      className={INPUT}
                      placeholder="es. Mani, piedi"
                    />
                  </div>
                )}
              </div>

              {/* Micosi */}
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className={LABEL}>Micosi varie</label>
                  <YesNoToggle value={ann.mycosis ?? null} onChange={v => setA('mycosis', v)} />
                </div>
                {ann.mycosis === 'si' && (
                  <div className="flex-1 min-w-40">
                    <label className={LABEL}>Dove</label>
                    <input
                      value={ann.mycosis_location ?? ''}
                      onChange={e => setA('mycosis_location', e.target.value || null)}
                      className={INPUT}
                      placeholder="es. Unghie, piedi"
                    />
                  </div>
                )}
              </div>

              {/* Capillari */}
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className={LABEL}>Capillari</label>
                  <YesNoToggle value={ann.capillaries ?? null} onChange={v => setA('capillaries', v)} />
                </div>
                {ann.capillaries === 'si' && (
                  <div className="flex-1 min-w-40">
                    <label className={LABEL}>Dove</label>
                    <input
                      value={ann.capillaries_location ?? ''}
                      onChange={e => setA('capillaries_location', e.target.value || null)}
                      className={INPUT}
                      placeholder="es. Gambe, viso"
                    />
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>
      )}

      {/* ── Errore ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── Azioni ── */}
      <div className="flex gap-3 pt-1 pb-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-gradient-to-r from-violet-500 to-purple-700 disabled:opacity-50 text-white text-sm font-semibold py-3 rounded-xl shadow-md shadow-purple-200 hover:opacity-90 transition-opacity"
        >
          {loading ? 'Salvataggio…' : existing ? 'Aggiorna cliente' : 'Salva cliente'}
        </button>
      </div>

    </form>
  )
}
