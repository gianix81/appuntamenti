'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { wsDoc } from '@/lib/firebase/workspace'
import { clsx } from 'clsx'
import {
  Scissors, Users, Building2, Globe, CheckCircle,
  ChevronRight, ChevronLeft, Sparkles,
} from 'lucide-react'
import type { BusinessLevel } from '@/types/database'

// ─── dati step 1 ────────────────────────────────────────────────────────────

const LEVEL_OPTIONS: {
  value: BusinessLevel
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
}[] = [
  {
    value: 1,
    icon: Scissors,
    title: 'Da sola',
    desc: 'Lavoro da sola, a domicilio o in studio monoposto',
  },
  {
    value: 2,
    icon: Users,
    title: 'Piccolo salone',
    desc: 'Ho 2–4 collaboratrici con me',
  },
  {
    value: 3,
    icon: Building2,
    title: 'Centro strutturato',
    desc: '5 o più operatori, struttura organizzata',
  },
  {
    value: 4,
    icon: Globe,
    title: 'Più sedi',
    desc: 'Gestisco più punti vendita',
  },
]

// ─── dati step 3 ────────────────────────────────────────────────────────────

const SPECIALTY_OPTIONS = [
  { id: 'estetica',      emoji: '✨', label: 'Estetica & Trattamenti viso/corpo' },
  { id: 'nails',         emoji: '💅', label: 'Nails / Unghie' },
  { id: 'massaggi',      emoji: '🤲', label: 'Massaggi' },
  { id: 'parrucchiera',  emoji: '✂️', label: 'Parrucchiera / Hair Styling' },
  { id: 'makeup',        emoji: '💄', label: 'Make-up & Trucco' },
  { id: 'altro',         emoji: '🌸', label: 'Altro' },
]

// ─── componente ─────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const { workspaceId } = useWorkspace()

  const [step, setStep]           = useState(1)
  const [level, setLevel]         = useState<BusinessLevel>(1)
  const [centerName, setCenterName] = useState('')
  const [city, setCity]           = useState('')
  const [specialties, setSpecialties] = useState<string[]>(['estetica'])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  function toggleSpecialty(id: string) {
    setSpecialties(prev =>
      prev.includes(id)
        ? prev.filter(s => s !== id)
        : [...prev, id],
    )
  }

  function next() { setStep(s => Math.min(s + 1, 4)) }
  function back() { setStep(s => Math.max(s - 1, 1)) }

  async function finish() {
    setSaving(true)
    setError(null)
    try {
      await setDoc(
        wsDoc(db, workspaceId, 'settings', 'main'),
        {
          business_level:         level,
          onboarding_completed:   true,
          specialties:            specialties.length > 0 ? specialties : ['estetica'],
          center_name:            centerName.trim() || 'Il mio centro',
          city:                   city.trim() || null,
          phone_number:           null,
          address:                null,
          logo_url:               null,
          // valori default per il sistema di notifiche
          reminder_enabled:       true,
          notification_slots:     [],
          reminder_intervals:     [1440, 120],
          reminder_minutes:       120,
          alarm_offsets_minutes:  [1440, 120, 30],
          created_at:             new Date().toISOString(),
          updated_at:             new Date().toISOString(),
        },
        { merge: true },
      )
      router.replace('/dashboard')
    } catch (err) {
      setError('Errore durante il salvataggio. Riprova.')
      setSaving(false)
    }
  }

  // ── progress bar ──────────────────────────────────────────────────────────

  const progressDots = (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4].map(s => (
        <div
          key={s}
          className={clsx(
            'h-1.5 rounded-full transition-all duration-300',
            s === step   ? 'w-8 bg-sky-400'  :
            s < step     ? 'w-3 bg-sky-700'  :
                           'w-3 bg-blue-800',
          )}
        />
      ))}
    </div>
  )

  // ── header ────────────────────────────────────────────────────────────────

  const header = (
    <div className="flex items-center justify-between px-4 sm:px-6 pt-6 pb-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-sky-400 flex items-center justify-center">
          <Scissors className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white text-sm leading-tight">
          Estetista App
        </span>
      </div>
      {progressDots}
    </div>
  )

  // ── step 1 — chi sei ──────────────────────────────────────────────────────

  const step1 = (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Come lavori?</h1>
        <p className="text-blue-300 text-sm mt-1">
          L'app si adatta al tuo tipo di attività
        </p>
      </div>

      <div className="space-y-3 pt-2">
        {LEVEL_OPTIONS.map(({ value, icon: Icon, title, desc }) => (
          <button
            key={value}
            onClick={() => setLevel(value)}
            className={clsx(
              'w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
              level === value
                ? 'bg-sky-400/10 border-sky-400'
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20',
            )}
          >
            <div className={clsx(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
              level === value ? 'bg-sky-400' : 'bg-white/10',
            )}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">{title}</p>
              <p className="text-blue-300 text-xs mt-0.5">{desc}</p>
            </div>
            {level === value && (
              <CheckCircle className="w-5 h-5 text-sky-400 ml-auto shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  )

  // ── step 2 — il tuo centro ────────────────────────────────────────────────

  const step2 = (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">
          {level === 1 ? 'Come ti chiami?' : 'Il tuo centro'}
        </h1>
        <p className="text-blue-300 text-sm mt-1">
          {level === 1
            ? 'Il nome che userai nell\'app'
            : 'Il nome che i tuoi clienti vedranno'}
        </p>
      </div>

      <div className="space-y-3 pt-2">
        <div>
          <label className="block text-xs font-medium text-blue-300 mb-1.5">
            {level === 1 ? 'Nome o nome del tuo studio' : 'Nome del centro'}
          </label>
          <input
            type="text"
            value={centerName}
            onChange={e => setCenterName(e.target.value)}
            placeholder={level === 1 ? 'Es. Maria Rossi Estetica' : 'Es. Beauty Center Roma'}
            autoFocus
            className="w-full px-4 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-blue-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-blue-300 mb-1.5">
            Città <span className="text-blue-500">(opzionale)</span>
          </label>
          <input
            type="text"
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="Es. Roma, Milano, Napoli…"
            className="w-full px-4 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-blue-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
          />
        </div>
      </div>
    </div>
  )

  // ── step 3 — specialità ───────────────────────────────────────────────────

  const step3 = (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Di cosa ti occupi?</h1>
        <p className="text-blue-300 text-sm mt-1">
          Seleziona tutto ciò che fai — anche più di una
        </p>
      </div>

      <div className="space-y-2 pt-2">
        {SPECIALTY_OPTIONS.map(({ id, emoji, label }) => {
          const selected = specialties.includes(id)
          return (
            <button
              key={id}
              onClick={() => toggleSpecialty(id)}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all',
                selected
                  ? 'bg-sky-400/10 border-sky-400'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20',
              )}
            >
              <span className="text-xl leading-none">{emoji}</span>
              <span className={clsx(
                'text-sm font-medium flex-1',
                selected ? 'text-white' : 'text-blue-200',
              )}>
                {label}
              </span>
              {selected && <CheckCircle className="w-4 h-4 text-sky-400 shrink-0" />}
            </button>
          )
        })}
      </div>

      {specialties.length === 0 && (
        <p className="text-xs text-amber-400 bg-amber-400/10 rounded-xl px-3 py-2">
          Seleziona almeno una specialità per continuare
        </p>
      )}
    </div>
  )

  // ── step 4 — pronti ───────────────────────────────────────────────────────

  const selectedLevel  = LEVEL_OPTIONS.find(l => l.value === level)!
  const selectedSpecs  = SPECIALTY_OPTIONS.filter(s => specialties.includes(s.id))

  const step4 = (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-sky-400 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Tutto pronto!</h1>
          <p className="text-blue-300 text-sm">Ecco un riepilogo della tua configurazione</p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 mt-2">
        <div className="flex items-center gap-3">
          <selectedLevel.icon className="w-4 h-4 text-sky-400 shrink-0" />
          <div>
            <p className="text-xs text-blue-400">Tipo di attività</p>
            <p className="text-white text-sm font-medium">{selectedLevel.title}</p>
          </div>
        </div>

        {centerName.trim() && (
          <div className="flex items-center gap-3">
            <Scissors className="w-4 h-4 text-sky-400 shrink-0" />
            <div>
              <p className="text-xs text-blue-400">Nome</p>
              <p className="text-white text-sm font-medium">
                {centerName.trim()}{city.trim() ? ` · ${city.trim()}` : ''}
              </p>
            </div>
          </div>
        )}

        {selectedSpecs.length > 0 && (
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-blue-400">Specialità</p>
              <p className="text-white text-sm font-medium">
                {selectedSpecs.map(s => s.label).join(', ')}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-sky-400/10 border border-sky-400/30 rounded-2xl px-4 py-3">
        <p className="text-sky-200 text-xs leading-relaxed">
          💡 Puoi cambiare tutto questo in qualsiasi momento dalle{' '}
          <strong>Impostazioni</strong>. L'app si adatterà automaticamente.
        </p>
      </div>

      {error && (
        <p className="text-red-400 text-xs bg-red-400/10 rounded-xl px-3 py-2">{error}</p>
      )}
    </div>
  )

  // ── navigazione bottom ────────────────────────────────────────────────────

  const canGoNext =
    step === 1 ? true :
    step === 2 ? true :
    step === 3 ? specialties.length > 0 :
    true

  const isLastStep = step === 4

  const bottomNav = (
    <div className="flex gap-3 pt-4">
      {step > 1 && (
        <button
          onClick={back}
          disabled={saving}
          className="flex items-center justify-center gap-1.5 px-5 py-3.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors disabled:opacity-50"
        >
          <ChevronLeft className="w-4 h-4" />
          Indietro
        </button>
      )}

      <button
        onClick={isLastStep ? finish : next}
        disabled={!canGoNext || saving}
        className={clsx(
          'flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-colors',
          canGoNext && !saving
            ? 'bg-sky-400 hover:bg-sky-300 text-blue-950'
            : 'bg-white/10 text-blue-400 cursor-not-allowed',
        )}
      >
        {saving ? (
          <>
            <div className="w-4 h-4 border-2 border-blue-950 border-t-transparent rounded-full animate-spin" />
            Salvataggio…
          </>
        ) : isLastStep ? (
          <>
            <Sparkles className="w-4 h-4" />
            Inizia!
          </>
        ) : (
          <>
            Continua
            <ChevronRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  )

  // ── render ────────────────────────────────────────────────────────────────

  const stepContent = [step1, step2, step3, step4][step - 1]

  return (
    <div className="min-h-screen flex flex-col">
      {header}

      <div className="flex-1 px-4 sm:px-6 pb-8 flex flex-col max-w-md mx-auto w-full">
        <div className="flex-1 flex flex-col justify-center">
          {stepContent}
        </div>
        {bottomNav}
      </div>
    </div>
  )
}
