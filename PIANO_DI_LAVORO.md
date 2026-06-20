# Piano di Lavoro — Estetista App
## Da singola professionista a grande azienda — piano scalabile
**Data redazione:** 20 Giugno 2026
**Stack:** Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + Firebase + Twilio + Web Push

---

## Principio Guida: Complessità Progressiva

L'app deve sembrare **semplice a chi è semplice** e **potente a chi è grande**.
Una singola estetista non deve mai vedere funzionalità che non la riguardano.
Un centro con 10 operatori deve avere tutto lo strumento professionale di cui ha bisogno.

Il meccanismo che governa tutto è il **Profilo Business** — configurato al primo accesso e modificabile in qualsiasi momento. In base al profilo, l'interfaccia si adatta: menu, sezioni, terminologia e funzionalità cambiano in modo progressivo e silenzioso.

---

## I Quattro Livelli di Business

### LIVELLO 1 — Solo Professional
*Una sola persona. Lavora da sola, magari a domicilio o in uno studio monoposto.*

- Nessuna gestione staff (lei È lo staff)
- Agenda personale senza colonne operatori
- Clienti, servizi, appuntamenti
- Promemoria WhatsApp/SMS automatici
- Pacchetti e card prepagate
- Fidelity punti base
- Statistiche personali semplici
- Scontrino PDF

**Terminologia:** "i miei appuntamenti", "i miei clienti", "la mia agenda"

---

### LIVELLO 2 — Piccolo Salone
*Da 2 a 4 operatori. Un titolare + qualche collaboratrice.*

- Tutto il Livello 1
- Gestione staff (aggiunta operatori con orari)
- Agenda a colonne per operatore
- Assegnazione appuntamento a operatore
- Statistiche base per operatore
- Provvigioni semplici

**Terminologia:** "lo staff", "gli operatori", "le collaboratrici"

---

### LIVELLO 3 — Centro Estetico / Salone Strutturato
*Da 5 a 15 operatori. Struttura organizzata con responsabile.*

- Tutto il Livello 2
- Ruoli e permessi (titolare / operatore / reception)
- Marketing automation completo con segmentazione
- Campagne WhatsApp/SMS
- Magazzino prodotti
- Report avanzati con confronto periodi
- Gift card e buoni automatici
- Lista d'attesa con notifica automatica
- SumUp pagamenti integrati
- Scontrino digitale + ADE

**Terminologia:** "il centro", "lo staff", "la reception"

---

### LIVELLO 4 — Catena / Franchising
*Più sedi. Gestione centralizzata.*

- Tutto il Livello 3
- Multi-sede: dashboard unificata
- Report aggregati per sede
- Trasferimento clienti tra sedi
- Gestione operatori per sede
- KPI centralizzati per titolare

**Terminologia:** "le sedi", "il network", "la sede centrale"

---

## Configurazione Iniziale — Wizard di Onboarding

Al primo accesso, invece di buttare l'utente in un'app vuota, un wizard in 4 schermate raccoglie le informazioni necessarie per configurare il profilo corretto.

### Schermata 1 — Chi sei?
```
Benvenuta! Come lavori?

  ○  Da sola / Libera professionista
  ○  Ho un piccolo salone (2–4 persone)
  ○  Ho un centro strutturato (5+ persone)
  ○  Ho più sedi
```
Questa risposta imposta `business_level: 1 | 2 | 3 | 4` in `settings/main`.

### Schermata 2 — Il tuo centro
- Nome del centro (o nome e cognome se livello 1)
- Indirizzo
- Telefono
- Logo (opzionale, caricare immagine)

### Schermata 3 — Il tuo settore
```
Di cosa ti occupi principalmente?

  ☑  Estetica / Trattamenti viso e corpo
  ☑  Nails / Unghie
  ☑  Massaggi
  ☑  Parrucchiera / Hair styling
  ☑  Trucco / Make-up
  ☑  Altro
```
Imposta `specialties[]` in settings — usato per adattare le categorie di default dei servizi.

### Schermata 4 — Come vuoi iniziare?
```
  ○  Inserisco i miei dati da zero
  ○  Ho già un gestionale: importa i miei clienti (CSV)
  ○  Fammi fare un giro guidato prima
```

Al completamento del wizard: la sidebar, i menu e le funzionalità visibili corrispondono esattamente al livello scelto.

---

## Meccanismo di Scaling — Come Funziona

### Settings documento `settings/main` in Firestore
```typescript
{
  business_level: 1 | 2 | 3 | 4,
  specialties: string[],
  // ... tutti gli altri campi esistenti ...
}
```

### Hook `useBusinessLevel()`
```typescript
// src/hooks/useBusinessLevel.ts
export function useBusinessLevel() {
  const level = useSettings().business_level ?? 1
  return {
    level,
    isSolo:       level === 1,
    isSmall:      level <= 2,
    isMedium:     level <= 3,
    isChain:      level === 4,
    hasStaff:     level >= 2,
    hasMarketing: level >= 3,
    hasWarehouse: level >= 3,
    hasMultiSite: level === 4,
  }
}
```

### Utilizzo nei componenti
```typescript
// La voce "Staff" nel menu appare solo dal livello 2 in su
const { hasStaff, hasMarketing } = useBusinessLevel()

// Nel Sidebar:
{hasStaff && <NavItem href="/staff" icon={Users} label="Staff" />}
{hasMarketing && <NavItem href="/marketing" icon={Megaphone} label="Campagne" />}
```

### Upgrade silenzioso
In settings: sezione "Fai crescere il tuo business" — se l'utente è al livello 1, una card discreta dice:
> "Hai assunto una collaboratrice? Attiva la gestione staff →"

Un click cambia `business_level` a 2 e le nuove funzionalità appaiono nel menu.
Nessuna migrazione dati, nessun dato perso. È solo un cambio di visibilità.

---

## Impatto del Livello su Ogni Funzionalità

| Funzionalità | Lv 1 Solo | Lv 2 Piccolo | Lv 3 Centro | Lv 4 Catena |
|---|:---:|:---:|:---:|:---:|
| Agenda giornaliera | ✅ | ✅ | ✅ | ✅ |
| Agenda settimanale | ✅ | ✅ | ✅ | ✅ |
| Drag & Drop appuntamenti | ✅ | ✅ | ✅ | ✅ |
| Clienti + CRM base | ✅ | ✅ | ✅ | ✅ |
| Promemoria SMS/WhatsApp | ✅ | ✅ | ✅ | ✅ |
| Pacchetti + Card prepagate | ✅ | ✅ | ✅ | ✅ |
| Gift Card | ✅ | ✅ | ✅ | ✅ |
| Fidelity punti | ✅ | ✅ | ✅ | ✅ |
| SumUp pagamenti | ✅ | ✅ | ✅ | ✅ |
| Scontrino PDF | ✅ | ✅ | ✅ | ✅ |
| Statistiche personali | ✅ | ✅ | ✅ | ✅ |
| **Gestione Staff** | ❌ | ✅ | ✅ | ✅ |
| **Agenda a colonne operatori** | ❌ | ✅ | ✅ | ✅ |
| **Provvigioni** | ❌ | ✅ | ✅ | ✅ |
| **Ruoli e permessi** | ❌ | ❌ | ✅ | ✅ |
| **Marketing automation** | ⚡ base | ⚡ base | ✅ | ✅ |
| **Segmentazione avanzata** | ❌ | ❌ | ✅ | ✅ |
| **Magazzino prodotti** | ❌ | ⚡ opz | ✅ | ✅ |
| **Report per operatore** | ❌ | ✅ | ✅ | ✅ |
| **Lista d'attesa** | ✅ | ✅ | ✅ | ✅ |
| **Multi-sede** | ❌ | ❌ | ❌ | ✅ |
| **Dashboard centralizzata** | ❌ | ❌ | ❌ | ✅ |

*✅ = incluso | ⚡ = versione semplificata | ❌ = nascosto*

---

---

# FASE 1 — Wizard Onboarding + Profilo Business

## Idea
Prima di implementare qualsiasi altra funzionalità, costruire il sistema di profilo business e il wizard iniziale. Questo è il fondamento che rende tutto il resto scalabile.

## Cosa si Costruisce
- Wizard onboarding a 4 step (primo accesso)
- Hook `useBusinessLevel()`
- Adattamento Sidebar in base al livello
- Sezione "Fai crescere il business" in Settings per upgrade del livello
- Adattamento terminologia in base al livello

## Struttura Dati

### `settings/main` — aggiungere
```typescript
{
  business_level: 1 | 2 | 3 | 4,         // default 1
  specialties: string[],
  onboarding_completed: boolean,
  center_name: string,
  logo_url: string | null,
  address: string | null,
  // ... campi già esistenti ...
}
```

## File da Creare / Modificare

### Nuovi
- `src/app/onboarding/page.tsx` — wizard a 4 step
- `src/app/onboarding/layout.tsx` — layout senza sidebar
- `src/components/onboarding/StepWhoAreYou.tsx`
- `src/components/onboarding/StepYourCenter.tsx`
- `src/components/onboarding/StepSpecialties.tsx`
- `src/components/onboarding/StepHowToStart.tsx`
- `src/hooks/useBusinessLevel.ts` — hook centrale
- `src/hooks/useSettings.ts` — hook per leggere settings da Firestore

### Modificati
- `src/app/(app)/layout.tsx` — se `onboarding_completed = false` → redirect a `/onboarding`
- `src/components/layout/Sidebar.tsx` — voci condizionali in base a `useBusinessLevel()`
- `src/components/layout/MobileNav.tsx` — stessa logica
- `src/app/(app)/settings/page.tsx` — sezione "Profilo business" con livello attuale + upgrade

## Step di Sviluppo Dettagliati

### Step 1.1 — Hook useSettings
```typescript
// src/hooks/useSettings.ts
// Legge doc 'settings/main' da Firestore con onSnapshot (real-time)
// Fornisce settings a tutti i componenti senza re-fetch
// Espone anche funzione update() per modificare settings
```

### Step 1.2 — Hook useBusinessLevel
```typescript
// src/hooks/useBusinessLevel.ts
export function useBusinessLevel() {
  const { settings } = useSettings()
  const level = settings?.business_level ?? 1
  return {
    level,
    isSolo: level === 1,
    hasStaff: level >= 2,
    hasRoles: level >= 3,
    hasMarketing: level >= 3,
    hasWarehouse: level >= 3,
    hasMultiSite: level === 4,
    // Terminologia adattiva
    staffLabel: level === 1 ? 'Io' : level <= 2 ? 'Collaboratrici' : 'Staff',
    centerLabel: level === 1 ? 'Il mio studio' : 'Il centro',
  }
}
```

### Step 1.3 — Wizard Onboarding
- Layout senza sidebar (pagina bianca pulita con progress bar in cima)
- Step 1: grandi card selezionabili per livello business
- Step 2: form dati centro (nome, indirizzo, telefono, logo upload)
- Step 3: checkbox specialità
- Step 4: scelta start mode
- Al completamento: salva tutto su Firestore + `onboarding_completed = true` + redirect a dashboard

### Step 1.4 — Sidebar Adattiva
```typescript
// In Sidebar.tsx:
const { hasStaff, hasMarketing, hasWarehouse, hasMultiSite } = useBusinessLevel()

const navItems = [
  { href: '/dashboard', icon: Home, label: 'Dashboard', always: true },
  { href: '/appointments', icon: Calendar, label: 'Appuntamenti', always: true },
  { href: '/clients', icon: Users, label: 'Clienti', always: true },
  { href: '/services', icon: Scissors, label: 'Servizi', always: true },
  { href: '/packages', icon: Package, label: 'Pacchetti', always: true },
  { href: '/staff', icon: UserCheck, label: 'Staff', show: hasStaff },
  { href: '/marketing', icon: Megaphone, label: 'Campagne', show: hasMarketing },
  { href: '/warehouse', icon: Box, label: 'Magazzino', show: hasWarehouse },
  { href: '/stats', icon: BarChart2, label: 'Statistiche', always: true },
  { href: '/payments', icon: CreditCard, label: 'Pagamenti', always: true },
  { href: '/receipts', icon: FileText, label: 'Scontrini', always: true },
  { href: '/sites', icon: Building, label: 'Sedi', show: hasMultiSite },
  { href: '/settings', icon: Settings, label: 'Impostazioni', always: true },
]
```

### Step 1.5 — Upgrade in Settings
```
Sezione: "Fai crescere il tuo business"

[Livello attuale: Solo Professional ●]

Hai assunto una collaboratrice?
→ [Attiva gestione Staff]     (upgrade a Lv 2)

Hai bisogno di campagne marketing avanzate?
→ [Attiva Marketing & CRM]    (upgrade a Lv 3)

Hai più sedi?
→ [Attiva Multi-sede]         (upgrade a Lv 4)
```

## Test

| Scenario | Verifica |
|---|---|
| Primo accesso → onboarding | Wizard mostrato prima della dashboard |
| Scelta "Da sola" | Sidebar senza Staff, Marketing, Magazzino |
| Scelta "Piccolo salone" | Sidebar con Staff, senza Marketing/Magazzino |
| Upgrade a Lv 2 da settings | Voce Staff appare nel menu senza ricarica pagina |
| Onboarding completato | Dashboard mostrata direttamente ai login successivi |

---

---

# FASE 2 — Agenda Avanzata (con scaling per livello)

## Idea
L'agenda è il cuore dell'app per tutti i livelli. Il comportamento cambia in base al livello: per una professionista sola è il suo calendario personale; per un centro è una griglia multi-operatore. La stessa pagina, la stessa URL, UI che si adatta.

## Comportamento per Livello

### Livello 1 — Solo
- Vista giornaliera: lista appuntamenti del giorno (già presente)
- Vista settimanale: 7 colonne per i 7 giorni, solo i suoi appuntamenti
- Drag & drop tra giorni e orari
- Nessuna colonna "operatore" — non serve
- "Nuovo appuntamento" non chiede l'operatore

### Livello 2–4 — Con Staff
- Vista giornaliera: N colonne, una per operatore
- Vista settimanale: può scegliere tra "per giorno" o "per operatore"
- "Nuovo appuntamento" include il campo operatore con filtro disponibilità
- Header colonna: avatar colorato con iniziali + nome operatore
- Slot vuoti visibili per identificare buchi nella giornata

## Struttura Dati — Firestore

Nessuna nuova collection. Modifiche ad `appointments`:
```typescript
// Aggiungere:
staff_id: string | null   // null per livello 1 (sempre la titolare)
```

## File da Creare / Modificare

### Nuovi
- `src/components/agenda/WeeklyView.tsx` — vista settimanale responsiva
- `src/components/agenda/DayColumnView.tsx` — colonne per operatore (lv 2+)
- `src/components/agenda/TimeGrid.tsx` — griglia oraria con slot da 15 min
- `src/components/agenda/DraggableCard.tsx` — card appuntamento draggabile
- `src/components/agenda/DroppableSlot.tsx` — slot target per drop
- `src/components/agenda/CurrentTimeLine.tsx` — linea rossa ora corrente
- `src/components/agenda/ViewToggle.tsx` — bottoni Giorno / Settimana / Lista
- `src/app/(app)/appointments/print/page.tsx` — stampa agenda giornaliera

### Modificati
- `src/app/(app)/dashboard/page.tsx` — integra `ViewToggle` + `WeeklyView`
- `src/components/appointments/AppointmentForm.tsx` — campo staff_id condizionale
- `package.json` — aggiungere `@hello-pangea/dnd`

## Step di Sviluppo Dettagliati

### Step 2.1 — Vista Settimanale Base
- `WeeklyView.tsx`: riceve array di `AppointmentWithRelations[]`
- Griglia: 7 colonne (lun–dom), righe orarie ogni 15 min (es. 07:00–21:00)
- Ogni appuntamento: box colorato che inizia all'orario giusto e ha altezza proporzionale alla durata
- Responsive: su mobile mostra solo il giorno selezionato
- Navigazione: frecce prev/next settimana, click su giorno → vista giornaliera

### Step 2.2 — Vista a Colonne Operatori (lv 2+)
- Se `hasStaff = true` e ci sono 2+ operatori attivi:
  - Vista giornaliera mostra N colonne (una per operatore) invece della lista
  - Header colonna: cerchio colorato con iniziali + nome
  - Appuntamenti filtrati per operatore e posizionati nella colonna corretta
  - Colonna "Non assegnato" per appuntamenti con `staff_id = null`

### Step 2.3 — Drag & Drop
```bash
npm install @hello-pangea/dnd
```
- Ogni `DraggableCard` ha `draggableId = appointment.id`
- Ogni `DroppableSlot` ha `droppableId = "YYYY-MM-DD_HH:mm_staff_id"` (o solo data+ora per lv 1)
- `onDragEnd`:
  1. Parsa il `droppableId` di destinazione
  2. Calcola nuovo `start_time` e `end_time`
  3. Se destinazione già occupata → snap back + toast errore
  4. Altrimenti: update ottimistico UI + write Firestore
  5. Modale conferma opzionale (configurabile in settings)

### Step 2.4 — Vista Lista
- Tabella semplice: data | ora | cliente | servizio | operatore | stato
- Ordinata per data/ora crescente
- Filtri: per periodo, per operatore, per stato
- Utile per export e revisione veloce

### Step 2.5 — Stampa Agenda
- `/appointments/print?date=YYYY-MM-DD`
- CSS `@media print` nasconde tutto tranne la griglia
- Header: data + nome centro
- Per lv 1: lista verticale oraria
- Per lv 2+: colonne operatori su carta A4 orizzontale

## Test

| Scenario (Lv 1) | Verifica |
|---|---|
| Aprire agenda settimanale | 7 colonne giornaliere, appuntamenti posizionati |
| Trascinare appuntamento | Orario aggiornato in Firestore |
| Nessun campo "Operatore" nel form | Non compare per lv 1 |

| Scenario (Lv 2+) | Verifica |
|---|---|
| Vista giornaliera con 3 operatori | 3 colonne colorate |
| Trascinare appuntamento tra colonne operatori | Cambia `staff_id` su Firestore |
| Appuntamento non assegnato | Compare nella colonna "Non assegnato" |

---

---

# FASE 3 — Gestione Staff (solo Livello 2+)

## Idea
Gli operatori sono un concetto che esiste solo dal livello 2 in su. Per il livello 1 questa sezione non esiste. Quando una professionista sola assume una collaboratrice, fa upgrade a lv 2 in settings e la sezione Staff appare.

## Il Livello 1 Non Vede Nulla
- Nessuna voce Staff nel menu
- Nel form appuntamento: nessun campo operatore
- Nelle stats: nessuna colonna "per operatore"
- Internamente: tutti gli appuntamenti hanno `staff_id = null`

## Struttura Dati — Firestore

### Collection: `staff`
```typescript
{
  id: string,
  name: string,
  role: string,                        // "Estetista" | "Nail Artist" | "Reception"
  color: string,                       // "#3B82F6" — colore in agenda
  initials: string,                    // "MR" — calcolato da nome
  phone: string | null,
  email: string | null,
  active: boolean,
  is_owner: boolean,                   // true per la titolare (non eliminabile)
  permission_level: 'owner' | 'operator' | 'reception',
  commission_pct: number,              // % provvigione su servizi
  schedule: {
    mon: Array<{ from: string, to: string }>,
    tue: Array<{ from: string, to: string }>,
    wed: Array<{ from: string, to: string }>,
    thu: Array<{ from: string, to: string }>,
    fri: Array<{ from: string, to: string }>,
    sat: Array<{ from: string, to: string }>,
    sun: Array<{ from: string, to: string }>,
  },
  days_off: string[],                  // date ISO ferie/permessi
  created_at: string,
  updated_at: string
}
```

## Logica Speciale — La Titolare Come Staff

Al completamento del wizard (fase 1), se `business_level >= 2`:
- Creare automaticamente un documento `staff` con `is_owner = true`, `name = center_name` (o il nome della titolare)
- Questo staff non è eliminabile
- Al livello 1 non viene creato nessun documento staff

Quando si fa upgrade da lv 1 a lv 2:
- Creare il documento staff "titolare" con `is_owner = true`
- Tutti gli appuntamenti precedenti con `staff_id = null` rimangono null (mostrati come "Non assegnato")
- Un banner in dashboard chiede: "Vuoi assegnare i tuoi appuntamenti passati a te?"

## File da Creare / Modificare

### Nuovi
- `src/app/(app)/staff/page.tsx`
- `src/app/(app)/staff/new/page.tsx`
- `src/app/(app)/staff/[id]/edit/page.tsx`
- `src/components/staff/StaffForm.tsx`
- `src/components/staff/WeekScheduleEditor.tsx`
- `src/components/staff/StaffAvatar.tsx` — cerchio colorato con iniziali
- `src/components/staff/StaffCard.tsx`
- `src/hooks/useStaff.ts` — hook lista staff attivi

### Modificati
- `src/components/appointments/AppointmentForm.tsx` — campo operatore condizionale a `hasStaff`
- `src/app/(app)/dashboard/page.tsx` — colonne operatori condizionali
- `src/components/layout/Sidebar.tsx` — voce Staff condizionale

## Step di Sviluppo

### Step 3.1 — CRUD Staff
- Lista staff con: avatar colorato, nome, ruolo, badge attivo/inattivo
- Form: nome, ruolo (select: Estetista/Nail Artist/Parrucchiera/Reception/Altro), colore picker, telefono, email, % provvigione
- `WeekScheduleEditor`: 7 righe (giorni settimana), ogni riga ha toggle attivo + uno o due slot orari

### Step 3.2 — Disponibilità
- Funzione `isStaffAvailable(staffId, startTime, durationMinutes)`:
  1. Controlla `staff.schedule[dayOfWeek]` — è in orario?
  2. Controlla `staff.days_off` — è in ferie?
  3. Controlla appuntamenti Firestore per quello staff in quella finestra temporale
  4. Restituisce `{ available: boolean, reason?: string }`
- Usata nel form appuntamento per filtrare la lista operatori

### Step 3.3 — Gestione Ferie/Permessi
- In pagina edit staff: sezione "Assenze" con mini calendario
- Click su un giorno: aggiunge/rimuove da `days_off`
- Range di giorni: click inizio + click fine → seleziona intervallo
- Badge contatore giorni di ferie nell'anno

### Step 3.4 — Permessi (solo lv 3+)
- `permission_level`:
  - `owner`: vede tutto, modifica tutto
  - `operator`: vede solo i propri appuntamenti e clienti, non vede statistiche generali né contabilità
  - `reception`: vede tutto ma non può modificare impostazioni o staff
- Ogni operatore ha una propria credenziale di accesso (email + password Firebase sub-account)

## Test

| Scenario | Verifica |
|---|---|
| Livello 1: nessuna voce Staff | Staff non appare nel menu |
| Upgrade a Lv 2 | Voce Staff appare + banner "Crea il tuo profilo staff" |
| Creare 2 operatori | Compaiono come colonne in agenda |
| Operatore in ferie: prenotare per quel giorno | Non compare nel dropdown operatori |
| Cancellare operatore owner | Pulsante eliminazione disabilitato |

---

---

# FASE 4 — CRM Avanzato

## Idea
L'anagrafica clienti è presente a tutti i livelli, ma si arricchisce a seconda del contesto. Per una professionista sola: scheda semplice con storico e promemoria. Per un centro grande: segmentazione, VIP list, campagne.

## Differenze per Livello

| Funzione CRM | Lv 1 | Lv 2 | Lv 3–4 |
|---|:---:|:---:|:---:|
| Lista clienti + ricerca | ✅ | ✅ | ✅ |
| Scheda con storico visite | ✅ | ✅ | ✅ |
| Data di nascita | ✅ | ✅ | ✅ |
| Ultima visita + spesa totale | ✅ | ✅ | ✅ |
| Note private | ✅ | ✅ | ✅ |
| Badge VIP | ✅ | ✅ | ✅ |
| Tab "Clienti Inattivi" | ✅ | ✅ | ✅ |
| Operatore preferito | ❌ | ✅ | ✅ |
| Segmentazione per campagne | ❌ | ❌ | ✅ |
| Importazione CSV | ✅ | ✅ | ✅ |

## Struttura Dati — Modifiche a `clients`

```typescript
{
  // Campi esistenti...

  // Nuovi campi:
  birthday: string | null,             // "1985-03-15"
  gender: 'F' | 'M' | 'other' | null,
  gdpr_consent: boolean,
  gdpr_consent_at: string | null,
  notes_private: string | null,        // note visibili solo alla titolare
  preferred_staff_id: string | null,   // lv 2+

  // Campi calcolati (aggiornati automaticamente):
  last_visit_at: string | null,
  total_spent: number,
  visit_count: number,
  avg_ticket: number,
  preferred_service_id: string | null,
  is_vip: boolean,
  loyalty_points: number,
}
```

## File da Creare / Modificare

### Nuovi
- `src/app/(app)/clients/[id]/page.tsx` — scheda cliente completa
- `src/components/clients/ClientHeader.tsx` — nome, contatti, birthday, badge VIP
- `src/components/clients/ClientStats.tsx` — card statistiche (spesa, visite, media)
- `src/components/clients/ClientHistory.tsx` — storico appuntamenti
- `src/components/clients/LoyaltyWidget.tsx` — punti fedeltà con barra progresso
- `src/components/clients/ClientActivePackages.tsx` — pacchetti attivi con sessioni rimanenti
- `src/app/api/clients/recalculate/route.ts` — ricalcolo statistiche
- `src/app/api/clients/import/route.ts` — importazione CSV

### Modificati
- `src/components/clients/ClientForm.tsx` — aggiungere: birthday, gender, gdpr_consent, notes_private, preferred_staff (lv 2+)
- `src/app/(app)/clients/page.tsx` — tab Tutti / VIP / Inattivi + importa CSV

## Step di Sviluppo

### Step 4.1 — Aggiornamento Form e Scheda Cliente
- Form: aggiungere i nuovi campi. `preferred_staff_id` visibile solo se `hasStaff`
- Scheda `/clients/[id]`:
  - Header: nome grande, telefono cliccabile, email, badge VIP, birthday (con conto giorni al compleanno)
  - Grid statistiche: spesa totale / visite / media / ultima visita
  - Tab "Appuntamenti": lista storica + futuri
  - Tab "Prodotti & Servizi": cosa ha acquistato di più
  - Tab "Pacchetti": card prepagate e pacchetti attivi
  - Tab "Messaggi": log SMS/WhatsApp inviati a questa cliente

### Step 4.2 — Ricalcolo Automatico Statistiche
- Trigger: ogni volta che `appointment.status` cambia a `completed`
- `POST /api/clients/recalculate?client_id=xxx`:
  1. Query Firestore: tutti gli appuntamenti `completed` di quel cliente
  2. Calcola: `total_spent`, `visit_count`, `avg_ticket`, `last_visit_at`, `preferred_service_id`
  3. Calcola `is_vip`: se `total_spent > settings.vip_threshold` (default 500€)
  4. Aggiorna documento cliente

### Step 4.3 — Lista Clienti con Tab
- Tab **Tutti**: ricerca per nome/telefono, ordinamento per ultima visita
- Tab **VIP**: solo `is_vip = true`, ordinate per `total_spent` desc
- Tab **Inattivi**: `last_visit_at < oggi - settings.inactive_days` (default 60 gg)
  - Per ogni cliente inattivo: badge "Assente da X giorni"
  - Bottone rapido: "Invia richiamo WhatsApp" → apre modal con template precompilato

### Step 4.4 — Importazione CSV
- Pagina `/clients/import` (o modal)
- Upload file CSV
- Preview prime 5 righe con mapping colonne → campi app
- Importazione: crea/aggiorna clienti (deduplicazione per telefono)
- Report finale: "Importati 45 clienti, aggiornati 12, saltati 3 (errori)"

### Step 4.5 — VIP Threshold Configurabile
- In Settings: campo "Soglia cliente VIP (€)" — default 500
- Ricalcolo VIP automatico quando la soglia cambia

## Test

| Scenario | Verifica |
|---|---|
| Aggiungere birthday a cliente | Campo salvato, tab mostra "Compleanno tra X giorni" |
| Completare 3 appuntamenti per cliente | `total_spent`, `visit_count`, `last_visit_at` aggiornati |
| Cliente spende 600€ (soglia 500) | `is_vip = true`, badge corona visibile |
| Tab Inattivi con soglia 30 gg | Solo clienti non venuti da 30+ giorni |
| Importare CSV con 50 clienti | 50 documenti creati su Firestore |
| Lv 1: nessun campo "Operatore preferito" | Campo non mostrato nel form |

---

---

# FASE 5 — Pacchetti, Card Prepagate, Gift Card

## Idea
Tutti i livelli hanno questi strumenti. La complessità di configurazione e gestione scala con il livello ma la funzionalità è disponibile a chiunque — anche una singola estetista può vendere pacchetti e gift card.

## Comportamento per Livello

| Aspetto | Lv 1 Solo | Lv 2–4 |
|---|---|---|
| Crea pacchetti | ✅ | ✅ |
| Assegna pacchetti a clienti | ✅ | ✅ |
| Scalo sessioni | ✅ | ✅ |
| Pagamento in acconto | ✅ | ✅ |
| Card prepagate | ✅ | ✅ |
| Gift card | ✅ | ✅ |
| Assegna pacchetto a operatore specifico | ❌ | ✅ |

## Struttura Dati — Firestore

### Collection: `packages` (template)
```typescript
{
  id: string,
  name: string,                        // "5 Trattamenti Viso"
  description: string | null,
  service_id: string,
  sessions_count: number,
  price: number,                       // prezzo scontato totale
  original_price: number,              // calcolato: prezzo_servizio * sessions
  discount_pct: number,                // calcolato
  valid_days: number | null,           // null = nessuna scadenza
  active: boolean,
  created_at: string
}
```

### Collection: `client_packages`
```typescript
{
  id: string,
  client_id: string,
  package_id: string,
  package_snapshot: {                  // copia al momento della vendita (prezzi possono cambiare)
    name: string,
    service_id: string,
    service_name: string,
    sessions_count: number,
    price: number
  },
  sessions_total: number,
  sessions_used: number,
  sessions_remaining: number,          // denormalizzato per query veloci
  price_paid: number,
  deposit_paid: number,                // acconto versato
  balance_due: number,                 // saldo rimanente
  payment_method: 'cash' | 'card' | 'sumup' | null,
  payment_id: string | null,           // ID SumUp se pagato con carta
  expires_at: string | null,
  status: 'active' | 'exhausted' | 'expired' | 'cancelled',
  sold_by_staff_id: string | null,     // lv 2+
  created_at: string,
  updated_at: string
}
```

### Collection: `prepaid_cards`
```typescript
{
  id: string,
  client_id: string,
  name: string,
  initial_balance: number,
  balance: number,
  barcode: string,                     // codice univoco stampabile
  active: boolean,
  transactions: Array<{
    id: string,
    date: string,
    type: 'load' | 'use',
    amount: number,
    appointment_id: string | null,
    note: string | null
  }>,
  created_at: string,
  updated_at: string
}
```

### Collection: `gift_cards`
```typescript
{
  id: string,
  code: string,                        // "GIFT-A3X9K2"
  amount: number,
  balance: number,
  buyer_client_id: string | null,
  recipient_name: string,
  recipient_phone: string | null,
  is_birthday_gift: boolean,
  unlock_at: string | null,            // ISO datetime mezzanotte del compleanno
  is_unlocked: boolean,
  expires_at: string | null,
  status: 'locked' | 'active' | 'exhausted' | 'expired',
  usage_history: Array<{
    date: string,
    amount_used: number,
    appointment_id: string
  }>,
  created_at: string
}
```

## File da Creare / Modificare

### Nuovi
- `src/app/(app)/packages/page.tsx`
- `src/app/(app)/packages/new/page.tsx`
- `src/app/(app)/packages/[id]/edit/page.tsx`
- `src/components/packages/PackageForm.tsx`
- `src/components/packages/PackageCard.tsx` — card con nome, sessioni, prezzo, sconto%
- `src/components/packages/ClientPackageProgress.tsx` — progress bar sessioni usate/rimanenti
- `src/app/(app)/prepaid-cards/page.tsx`
- `src/app/(app)/prepaid-cards/new/page.tsx`
- `src/components/prepaid-cards/PrepaidCardForm.tsx`
- `src/components/prepaid-cards/BalanceDisplay.tsx` — saldo grande con storico
- `src/app/(app)/gift-cards/page.tsx`
- `src/app/(app)/gift-cards/new/page.tsx`
- `src/components/gift-cards/GiftCardForm.tsx`
- `src/components/gift-cards/GiftCardBadge.tsx` — mostra stato (bloccata / attiva / scaduta)
- `src/app/api/cron/gift-cards/route.ts` — sblocco gift card a mezzanotte
- `src/lib/coupon.ts` — generazione codici univoci

### Modificati
- `src/app/(app)/appointments/[id]/edit/page.tsx` — checkout con selezione metodo pagamento
- `src/app/(app)/clients/[id]/page.tsx` — tab "Pacchetti Attivi"
- `src/components/layout/Sidebar.tsx` — voce Pacchetti

## Step di Sviluppo

### Step 5.1 — CRUD Template Pacchetti
- Form: nome, seleziona servizio → mostra prezzo unitario → inserisci N sessioni → calcola prezzo pieno → inserisci prezzo scontato → mostra sconto % calcolato
- Toggle valido_giorni: "Nessuna scadenza" / "Valido X giorni dall'acquisto"
- Lista: card per ogni pacchetto con sconto % in evidenza, badge "Attivo/Inattivo"

### Step 5.2 — Vendita Pacchetto al Cliente
- Da scheda cliente: bottone "Vendi Pacchetto" → drawer/modal con:
  1. Seleziona template pacchetto
  2. Prezzo proposto (modificabile per sconti extra)
  3. Pagamento immediato o in acconto: slider o due campi (acconto + saldo)
  4. Metodo pagamento: Contanti / SumUp / Carta
  5. Note opzionali
- Al salvataggio: crea `client_packages` + eventuale pagamento SumUp

### Step 5.3 — Scalo Sessioni nel Checkout
- Nel form chiusura appuntamento, sezione pagamento:
  - Se il cliente ha `client_packages` attivi con `service_id` compatibile → mostrare opzione
  - "Usa pacchetto: [nome] — Rimanenti: X/Y sessioni"
  - Al click: `sessions_used++`, `sessions_remaining--`, aggiorna su Firestore
  - Se `sessions_remaining = 0` → `status = 'exhausted'` + toast "Pacchetto esaurito!"
  - Se `expires_at < today` → `status = 'expired'` + messaggio errore con offerta rinnovo

### Step 5.4 — Card Prepagate
- Form: cliente, nome card, importo iniziale
- Genera barcode alfanumerico (8 caratteri)
- Pagina dettaglio: saldo grande, lista movimenti, bottone "Ricarica" e "Usa"
- Nel checkout: campo "Codice card" → cerca + mostra saldo + importo da scalare

### Step 5.5 — Gift Card con Sblocco Compleanno
- Form: destinatario nome+telefono, importo, scadenza, flag "Regalo di compleanno"
- Se compleanno: date picker → calcola `unlock_at = mezzanotte del giorno nell'anno corrente o prossimo`
- Genera codice `GIFT-XXXXXX`
- Invio automatico WhatsApp al destinatario con codice (se telefono fornito)
- Cron giornaliero 00:01: trova gift card con `unlock_at <= now` e `is_unlocked = false` → sblocca + invia WhatsApp "Il tuo regalo di compleanno è pronto!"

### Step 5.6 — Checkout Multi-Metodo
```
Sezione "Pagamento" nella chiusura appuntamento:
┌──────────────────────────────────┐
│ Totale da pagare: 80,00 €        │
│                                  │
│ [ ] Contanti         _____ €     │
│ [ ] SumUp (carta)    _____ €     │
│ [ ] Pacchetto         (scala)    │
│ [ ] Card prepagata   _____ €     │
│ [ ] Gift card        _____ €     │
│ [ ] Punti fedeltà    _____ pt    │
│                                  │
│ Rimanente: 0,00 €   [Conferma]   │
└──────────────────────────────────┘
```
- Validazione: la somma dei metodi deve coprire il totale
- "Rimanente" si aggiorna live mentre si compilano i campi

## Test

| Scenario | Verifica |
|---|---|
| Creare pacchetto "5 massaggi, prezzo 200€" | Sconto 20% calcolato (full price 250€) |
| Vendere con acconto 100€ | `deposit_paid=100`, `balance_due=100` |
| Scalare 5a sessione | `status='exhausted'`, messaggio di avviso |
| Pacchetto scaduto | Messaggio errore + rinnovo proposto |
| Gift card con compleanno 25 dic | `is_unlocked=false` fino a Natale, poi WhatsApp automatico |
| Checkout misto: 50€ cash + 30€ card | Entrambi i pagamenti registrati |

---

---

# FASE 6 — Fidelity / Raccolta Punti

## Idea
Sistema punti disponibile a tutti i livelli. Per la professionista sola: strumento semplice di fidelizzazione. Per il centro grande: integrato con le campagne marketing.

## Struttura Dati — Firestore

### Aggiungere in `settings/main`
```typescript
loyalty_enabled: boolean,
points_per_euro: number,              // default 1
reward_threshold: number,             // default 100 punti
reward_value_eur: number,             // default 5€
welcome_bonus: number,                // punti regalo alla prima visita
birthday_bonus: number,               // punti regalo il giorno del compleanno
```

### Collection: `loyalty_transactions`
```typescript
{
  id: string,
  client_id: string,
  type: 'earn' | 'redeem' | 'bonus_welcome' | 'bonus_birthday' | 'expire' | 'manual',
  points: number,                      // positivo o negativo
  balance_after: number,
  ref_appointment_id: string | null,
  note: string | null,
  created_at: string
}
```

## File da Creare / Modificare

### Nuovi
- `src/lib/loyalty.ts` — `earnPoints()`, `redeemPoints()`, `addBonus()`
- `src/components/fidelity/LoyaltyWidget.tsx` — punti + barra progresso
- `src/components/fidelity/LoyaltyHistory.tsx` — lista movimenti punti
- `src/app/(app)/settings/fidelity/page.tsx` — configurazione programma

### Modificati
- `src/app/(app)/settings/page.tsx` — link sezione fidelity
- `src/app/(app)/clients/[id]/page.tsx` — aggiungere `LoyaltyWidget`
- `src/app/(app)/appointments/[id]/edit/page.tsx` — accumulo punti al completamento + opzione riscatto

## Step di Sviluppo

### Step 6.1 — Configurazione
- Settings → Fidelity: toggle on/off, punti per euro (slider 1–10), soglia ricompensa, valore ricompensa
- Bonus: welcome bonus (punti alla prima visita), birthday bonus (punti il giorno del compleanno)
- Preview: "Con queste impostazioni, un cliente che spende 200€ accumula 200 punti e ottiene 10€ di sconto"

### Step 6.2 — Accumulo Automatico
- In `appointments/[id]/edit`: quando lo stato passa a `completed` e il pagamento viene confermato
- Chiama `lib/loyalty.ts: earnPoints(clientId, amountPaid)`:
  1. `points = Math.floor(amount * settings.points_per_euro)`
  2. Aggiorna `clients.loyalty_points += points`
  3. Crea `loyalty_transactions` con `type = 'earn'`
  4. Toast: "Maria ha guadagnato +25 punti! Totale: 125 punti"

### Step 6.3 — Riscatto
- Nel checkout: se `loyalty_points >= reward_threshold` → card "Riscatta punti"
  - Mostra: "Hai 120 punti → sconto di 5€"
  - Checkbox "Usa punti" → applica sconto, chiama `redeemPoints()`

### Step 6.4 — Bonus Automatici
- Cron giornaliero:
  - Birthday: clienti con `birthday = oggi` → aggiungi `birthday_bonus` punti
  - Welcome: primo appuntamento `completed` → aggiungi `welcome_bonus` punti

### Step 6.5 — Widget Cliente
- `LoyaltyWidget`: punti in grande (es. "85 pt"), barra progresso verso 100, "Mancano 15 punti per 5€ di sconto"
- Se livello >= reward_threshold: "Hai uno sconto da riscattare!" con bottone

## Test

| Scenario | Verifica |
|---|---|
| Appuntamento da 60€, 1pt/€ | `loyalty_points += 60` |
| Riscatto a 100 punti, valore 5€ | Sconto applicato, punti azzerati |
| Birthday cron | `birthday_bonus` punti aggiunti il giorno corretto |
| Fidelity disabilitata in settings | Nessun punto accumulato, widget nascosto |

---

---

# FASE 7 — SumUp Pagamenti

## Idea
Disponibile a tutti i livelli. Una singola estetista beneficia tanto quanto un grande centro. Nessun canone fisso, solo 1,69% per transazione.

## Prerequisiti
1. Aprire account SumUp: `sumup.com`
2. Sezione "Sviluppatori" → generare API Key sandbox `sup_sk_test_...`
3. Configurare webhook URL nel pannello SumUp
4. Variabili ambiente in `.env.local`

## Variabili Ambiente
```
SUMUP_API_KEY=sup_sk_...
SUMUP_MERCHANT_CODE=M...
SUMUP_WEBHOOK_SECRET=...
NEXT_PUBLIC_APP_URL=https://tuodominio.com
```

## Struttura Dati — Firestore

### Collection: `payments`
```typescript
{
  id: string,
  sumup_checkout_id: string,
  sumup_transaction_id: string | null,
  amount: number,
  currency: 'EUR',
  description: string,
  status: 'pending' | 'paid' | 'failed' | 'refunded',
  payment_url: string,
  ref_type: 'appointment' | 'package' | 'gift_card' | 'prepaid_card' | 'other',
  ref_id: string | null,
  client_id: string | null,
  paid_at: string | null,
  refunded_at: string | null,
  refund_amount: number | null,
  created_at: string
}
```

### Modifiche ad `appointments`
```typescript
payment_id: string | null
payment_method: 'cash' | 'card' | 'sumup' | 'package' | 'prepaid_card' | 'gift_card' | 'mixed' | null
payment_status: 'unpaid' | 'partial' | 'paid' | null
amount_paid: number
```

## File da Creare / Modificare

### Nuovi
- `src/lib/sumup.ts` — wrapper SDK con `createCheckout()`, `getTransaction()`, `refund()`
- `src/app/api/sumup/checkout/route.ts` — crea checkout
- `src/app/api/sumup/webhook/route.ts` — riceve notifiche SumUp
- `src/app/api/sumup/refund/route.ts` — rimborso
- `src/app/api/sumup/status/route.ts` — polling stato pagamento
- `src/app/(app)/appointments/[id]/payment-result/page.tsx` — pagina esito pagamento
- `src/app/(app)/payments/page.tsx` — storico pagamenti
- `src/components/payments/SumUpButton.tsx` — bottone "Paga con carta"
- `src/components/payments/PaymentStatusBadge.tsx`

### Modificati
- `src/app/(app)/appointments/[id]/edit/page.tsx` — sezione pagamento
- `src/types/database.ts` — tipo `Payment`
- `package.json` — `@sumup/sdk`

## Step di Sviluppo

### Step 7.1 — Installazione
```bash
npm install @sumup/sdk
```

### Step 7.2 — lib/sumup.ts
```typescript
import SumUp from '@sumup/sdk'

const client = new SumUp({ apiKey: process.env.SUMUP_API_KEY! })

export async function createCheckout(params: {
  amount: number
  description: string
  checkoutRef: string
  returnUrl: string
}) {
  return client.checkouts.create({
    amount: params.amount,
    currency: 'EUR',
    checkout_reference: params.checkoutRef,
    merchant_code: process.env.SUMUP_MERCHANT_CODE!,
    description: params.description,
    return_url: params.returnUrl,
  })
}

export async function refundTransaction(transactionId: string, amount: number) {
  return client.transactions.refund(transactionId, { amount })
}
```

### Step 7.3 — API Checkout
```typescript
// POST /api/sumup/checkout
// Body: { amount, description, ref_type, ref_id, client_id }
// 1. Genera checkoutRef univoco: `${ref_type}-${ref_id}-${timestamp}`
// 2. Crea checkout SumUp
// 3. Salva su Firestore collection 'payments' con status 'pending'
// 4. Restituisce { payment_url, payment_id }
```

### Step 7.4 — Webhook
```typescript
// POST /api/sumup/webhook
// 1. Verifica firma HMAC: X-Payload-Signature header
// 2. Switch event_type:
//    'CHECKOUT_COMPLETED' → aggiorna payment.status = 'paid'
//                        → aggiorna appointment.payment_status = 'paid'
//                        → triggera generazione scontrino (fase 10)
//    'CHECKOUT_FAILED'    → aggiorna payment.status = 'failed'
// 3. Sempre rispondere 200 subito (SumUp riprova se riceve errore)
```

### Step 7.5 — UI Pagamento
- In pagina appuntamento: sezione "Pagamento"
  - Se non pagato: importo da pagare + bottone "Paga con Carta"
  - Click → POST checkout → apre `payment_url` in nuova tab
  - Polling ogni 3 sec su `/api/sumup/status?payment_id=xxx` mentre la tab è aperta
  - Quando `status = 'paid'`: badge verde "Pagato ✓" + confetti animazione
- Se già pagato: badge stato + data + importo + bottone "Rimborsa"

### Step 7.6 — Storico Pagamenti
- Tabella con: data, cliente, descrizione, importo, metodo, stato
- Filtri: periodo, stato, metodo
- Totale periodo in cima
- Bottone rimborso su ogni pagamento paid

## Test

| Scenario | Verifica |
|---|---|
| Creare checkout 80€ in sandbox | URL generato, salvato su Firestore |
| Completare pagamento sandbox | Webhook ricevuto, stato → paid |
| Aprire appuntamento dopo pagamento | Badge "Pagato 80€" visibile |
| Rimborso parziale 30€ | `refund_amount=30`, stato → partial_refund |
| Firma webhook errata | 401, nessun aggiornamento Firestore |

---

---

# FASE 8 — Marketing Automation

## Idea
Per il livello 1 (solo): automazioni semplici preconfigurate (compleanno, richiamo, post-trattamento). Per il livello 3+: campagne avanzate con segmentazione e filtri personalizzati. Il livello 2 sta nel mezzo: automazioni base + invio manuale a lista clienti.

## Differenze per Livello

| Funzione | Lv 1 | Lv 2 | Lv 3–4 |
|---|:---:|:---:|:---:|
| WhatsApp compleanno automatico | ✅ | ✅ | ✅ |
| WhatsApp post-trattamento | ✅ | ✅ | ✅ |
| Richiamo clienti inattivi | ✅ | ✅ | ✅ |
| Richiesta recensione | ✅ | ✅ | ✅ |
| Invio manuale a lista | ❌ | ✅ | ✅ |
| Segmentazione avanzata | ❌ | ❌ | ✅ |
| Campagne programmate | ❌ | ❌ | ✅ |
| Report campagne | ❌ | ✅ | ✅ |
| Coupon allegati | ✅ | ✅ | ✅ |

## Struttura Dati — Firestore

### Collection: `automations` (per tutti i livelli)
```typescript
// Automazioni sempre attive, configurabili on/off
{
  type: 'birthday' | 'inactive' | 'post_treatment' | 'review_request' | 'welcome',
  enabled: boolean,
  channel: 'whatsapp' | 'sms' | 'push',
  message_template: string,           // testo con {{variabili}}
  delay_hours: number | null,         // per post_treatment
  inactive_days: number | null,       // per inactive
  coupon_enabled: boolean,
  coupon_discount_pct: number | null,
  coupon_valid_days: number | null,
}
```
Questi vivono in `settings/main` come oggetto `automations: {}` — non serve collection separata.

### Collection: `campaigns` (solo lv 2+)
```typescript
{
  id: string,
  name: string,
  trigger: 'manual' | 'scheduled',
  scheduled_at: string | null,
  channel: 'whatsapp' | 'sms' | 'push',
  message_template: string,
  filters: {
    gender: 'F' | 'M' | 'all',
    age_from: number | null,
    age_to: number | null,
    inactive_days_min: number | null,
    service_id: string | null,
    has_active_package: boolean | null,
  },
  coupon_discount_pct: number | null,
  coupon_valid_days: number | null,
  status: 'draft' | 'sent' | 'scheduled' | 'cancelled',
  sent_count: number,
  failed_count: number,
  created_at: string,
  sent_at: string | null,
}
```

### Collection: `campaign_sends`
```typescript
{
  id: string,
  campaign_id: string | null,         // null per automazioni
  automation_type: string | null,
  client_id: string,
  channel: string,
  message_sent: string,
  coupon_code: string | null,
  status: 'sent' | 'delivered' | 'failed',
  sent_at: string,
}
```

## File da Creare / Modificare

### Nuovi
- `src/app/(app)/marketing/page.tsx` — lista campagne (lv 2+) + sezione automazioni (tutti)
- `src/app/(app)/marketing/new/page.tsx` — crea campagna
- `src/app/(app)/marketing/[id]/page.tsx` — dettaglio campagna con report
- `src/components/marketing/AutomationToggleCard.tsx` — card on/off per ogni automazione
- `src/components/marketing/CampaignForm.tsx` — wizard campagna (lv 3+)
- `src/components/marketing/AudienceEstimate.tsx` — "Raggiungerai circa X clienti"
- `src/components/marketing/MessageTemplateEditor.tsx` — editor con variabili
- `src/app/api/cron/automations/route.ts` — esegue automazioni giornaliere
- `src/lib/marketing.ts` — logica segmentazione + invio

### Modificati
- `src/app/(app)/settings/page.tsx` — sezione "Automazioni" (link a /marketing)
- `src/lib/twilio.ts` — funzione `sendMarketingMessage()`

## Step di Sviluppo

### Step 8.1 — Automazioni Base (tutti i livelli)
- Sezione "Automazioni" in `/marketing` (o direttamente in settings per lv 1):
  - Card per ogni automazione con toggle on/off
  - Click sulla card: espande il form (template messaggio, canale, configurazioni)
- Cron `GET /api/cron/automations` — eseguito ogni giorno alle 09:30:

  **Birthday:**
  ```
  1. Cerca clienti con birthday.month=oggi.month AND birthday.day=oggi.day
  2. Per ognuno: controlla se già inviato quest'anno (cerca in campaign_sends)
  3. Se no: sostituisci variabili nel template → invia → salva send
  4. Se coupon abilitato: genera codice → includi nel messaggio
  ```

  **Inactive:**
  ```
  1. Cerca clienti con last_visit_at < oggi - inactive_days
  2. Per ognuno: controlla se già inviato negli ultimi 30 giorni
  3. Se no: invia richiamo
  ```

  **Post-Treatment:**
  ```
  Eseguito ogni ora:
  1. Cerca appuntamenti completed negli ultimi delay_hours
  2. Per ognuno: controlla se post-treatment message già inviato
  3. Se no: invia
  ```

  **Review Request:**
  ```
  Eseguito ogni ora:
  1. Cerca appuntamenti completed 48h fa
  2. Invia con link Google My Business (configurato in settings)
  ```

### Step 8.2 — Template Messaggi
- Variabili disponibili: `{{nome}}`, `{{cognome}}`, `{{servizio}}`, `{{data_prossima}}`, `{{punti}}`, `{{coupon}}`
- Editor: textarea con bottoni variabili cliccabili (inserisce il placeholder)
- Preview live: sostituisce variabili con dati di esempio
- Contatore caratteri (utile per SMS: max 160 char)

### Step 8.3 — Campagne Manuali (lv 2+)
- Pagina `/marketing`: tab "Campagne" + tab "Automazioni"
- Crea campagna: nome, canale, messaggio, (lv 3: filtri), anteprima audience → "Invia ora" o "Schedula"
- Lv 2: nessun filtro, invia a tutti i clienti con gdpr_consent=true
- Lv 3+: filtri completi (genere, età, inattività, servizio, pacchetto)

### Step 8.4 — Segmentazione Avanzata (lv 3+)
- `AudienceEstimate`: aggiornato in tempo reale mentre si configurano i filtri
- Testo: "Con questi filtri raggiungerai circa 28 clienti"
- Query Firestore costruita dinamicamente dai filtri

### Step 8.5 — Report Campagna
- Pagina `/marketing/[id]`: totale inviati, falliti, lista destinatari con stato e timestamp

## Test

| Scenario | Verifica |
|---|---|
| Automazione birthday abilitata | Al cron di oggi (se c'è un cliente nato oggi) → WhatsApp inviato |
| Automazione inattivi 45 gg | Solo clienti non venuti da 45+ gg |
| Disabilita automazione | Cron salta quella tipologia |
| Lv 1: nessuna voce Campagne | Tab "Campagne" nascosta |
| Lv 2: campagna senza filtri | Invia a tutti i clienti con consenso |
| Lv 3: campagna con filtro "Donne > 35 anni" | Solo clientele corrispondenti |

---

---

# FASE 9 — Statistiche & Report

## Idea
Le statistiche scalano con il livello: semplici e personali per lv 1, multi-operatore e avanzate per lv 3+. L'export CSV è disponibile a tutti.

## Differenze per Livello

| Report | Lv 1 | Lv 2 | Lv 3–4 |
|---|:---:|:---:|:---:|
| Ricavi per periodo | ✅ | ✅ | ✅ |
| Appuntamenti per periodo | ✅ | ✅ | ✅ |
| Servizi più richiesti | ✅ | ✅ | ✅ |
| Scontrino medio | ✅ | ✅ | ✅ |
| Clienti nuovi / inattivi | ✅ | ✅ | ✅ |
| Confronto periodi | ✅ | ✅ | ✅ |
| Export CSV | ✅ | ✅ | ✅ |
| Performance per operatore | ❌ | ✅ | ✅ |
| Provvigioni staff | ❌ | ✅ | ✅ |
| Report prodotti (magazzino) | ❌ | ❌ | ✅ |
| Report campagne marketing | ❌ | ✅ | ✅ |
| Multi-sede | ❌ | ❌ | ❌ | ✅ |

## File da Creare / Modificare

### Nuovi
- `src/app/(app)/stats/page.tsx` — dashboard statistiche
- `src/components/stats/PeriodSelector.tsx` — picker periodo (oggi/settimana/mese/anno/custom)
- `src/components/stats/KpiCards.tsx` — 4 card metriche principali con trend
- `src/components/stats/RevenueChart.tsx` — grafico lineare ricavi
- `src/components/stats/TopServicesBar.tsx` — barre orizzontali top servizi
- `src/components/stats/ClientsReport.tsx` — nuovi, inattivi, VIP
- `src/components/stats/StaffTable.tsx` — performance staff (lv 2+)
- `src/components/stats/CommissionsTable.tsx` — provvigioni (lv 2+)
- `src/app/api/stats/summary/route.ts` — aggregazione dati periodo
- `src/lib/stats.ts` — funzioni calcolo metriche

### Modificati
- `src/components/layout/Sidebar.tsx` — voce Statistiche

## Step di Sviluppo

### Step 9.1 — Selezione Periodo
- Bottoni rapidi: Oggi / Questa settimana / Questo mese / Quest'anno
- Date picker custom: data da + data a
- Toggle "Confronta con periodo precedente"
- Il periodo selezionato si propaga a tutti i widget tramite context

### Step 9.2 — KPI Cards
Quattro card in testa:
- **Ricavo**: totale € nel periodo + variazione % vs precedente (↑ verde, ↓ rosso)
- **Appuntamenti**: numero + variazione %
- **Nuovi clienti**: numero + variazione %
- **Scontrino medio**: € + variazione %

### Step 9.3 — Grafico Ricavi
- Linea giornaliera del ricavo (data sull'asse X, importo sull'Y)
- Se confronto attivo: due linee sovrapposte con colori distinti
- Tooltip al hover: data + importo + variazione vs stesso giorno periodo precedente

### Step 9.4 — Top Servizi
- Barre orizzontali ordinabili per: esecuzioni / ricavo generato
- Ogni barra: nome servizio, valore, % sul totale
- Limite a top 10, link "Vedi tutti"

### Step 9.5 — Performance Staff (lv 2+)
- Tabella: operatore | n° appuntamenti | ricavo | scontrino medio | % sul totale | provvigione
- Totale in fondo
- Export CSV con tutti i dati

### Step 9.6 — Clienti nel Periodo
- **Nuovi**: clienti con primo appuntamento nel periodo
- **Abituali**: clienti con 2+ visite nel periodo
- **Inattivi**: clienti con ultima visita prima del periodo + non ancora ricontattati
- Per inattivi: bottone "Invia richiamo" → lancia automazione manuale

### Step 9.7 — Export
- Bottone "Scarica CSV" su: appuntamenti, clienti, staff performance, provvigioni
- CSV con intestazione colonne, separatore `;`, encoding UTF-8 (compatibile Excel italiano)

## Test

| Scenario | Verifica |
|---|---|
| 20 appuntamenti in 30 gg | Ricavo e media corrispondono alla somma manuale |
| Confronto mese vs precedente | Variazioni % calcolate correttamente |
| Lv 1: nessuna sezione Staff | Tabella staff non appare |
| Export CSV appuntamenti | File corretto con tutte le colonne |

---

---

# FASE 10 — Magazzino Prodotti (Livello 3+)

## Idea
Il magazzino è per centri strutturati. Una singola estetista a domicilio non ne ha bisogno. Dal livello 2 diventa opzionale (attivabile da settings). Dal livello 3 è incluso di default.

## Comportamento per Livello

- **Lv 1**: nascosto completamente
- **Lv 2**: disponibile come opzione — in settings: "Gestisci prodotti" toggle
- **Lv 3–4**: incluso di default nel menu

## Struttura Dati — Firestore

### Collection: `products`
```typescript
{
  id: string,
  name: string,
  brand: string | null,
  barcode: string | null,
  category: string,
  supplier: string | null,
  buy_price: number,
  last_buy_price: number | null,
  avg_buy_price: number,
  sell_price: number | null,
  stock_qty: number,
  min_stock: number,
  unit: 'pz' | 'ml' | 'g' | 'l' | 'kg',
  active: boolean,
  created_at: string,
  updated_at: string
}
```

### Collection: `stock_movements`
```typescript
{
  id: string,
  product_id: string,
  product_name: string,
  type: 'load' | 'sale' | 'cabin_use' | 'adjustment' | 'waste',
  qty: number,                         // positivo = carico, negativo = scarico
  qty_before: number,
  qty_after: number,
  unit_price: number | null,
  total_value: number | null,
  staff_id: string | null,
  appointment_id: string | null,
  client_id: string | null,
  supplier_invoice: string | null,
  note: string | null,
  created_at: string
}
```

## File da Creare / Modificare

### Nuovi
- `src/app/(app)/warehouse/page.tsx` — lista prodotti
- `src/app/(app)/warehouse/new/page.tsx`
- `src/app/(app)/warehouse/[id]/page.tsx` — scheda prodotto + storico
- `src/app/(app)/warehouse/[id]/edit/page.tsx`
- `src/app/(app)/warehouse/load/page.tsx` — carico merce
- `src/components/warehouse/ProductForm.tsx`
- `src/components/warehouse/StockBadge.tsx` — verde/giallo/rosso in base a soglia
- `src/components/warehouse/MovementList.tsx`
- `src/components/warehouse/LowStockBanner.tsx`
- `src/app/api/warehouse/movement/route.ts`

### Modificati
- `src/app/(app)/appointments/[id]/edit/page.tsx` — sezione prodotti usati in cabina + venduti (lv 2+)
- `src/components/layout/Sidebar.tsx` — voce Magazzino condizionale
- `src/app/(app)/stats/page.tsx` — sezione prodotti più venduti (lv 3+)

## Step di Sviluppo

### Step 10.1 — CRUD Prodotti
- Form: nome, brand, barcode, categoria (select custom), fornitore, prezzo acquisto, prezzo vendita, giacenza iniziale, soglia minima, unità
- Lista: badge colorato giacenza, filtri per categoria/fornitore/"solo sottoscorta"

### Step 10.2 — Carico Merce
- `/warehouse/load`: seleziona prodotti → inserisci quantità + prezzo acquisto → salva
- Aggiorna `stock_qty += qty`, aggiorna `avg_buy_price`, crea `stock_movements` tipo `load`

### Step 10.3 — Scarico
- **Vendita al cliente**: nel checkout appuntamento → sezione "Prodotti venduti" → aggiunge al totale scontrino
- **Uso in cabina**: stessa UI, tipo `cabin_use`, non aumenta il totale scontrino

### Step 10.4 — Alert Sottoscorta
- Banner giallo in cima alla pagina magazzino se `stock_qty <= min_stock` per qualche prodotto
- Notifica push alla riapertura dell'app (una volta al giorno al massimo)

### Step 10.5 — Scheda Prodotto
- Storico movimenti con: data, tipo, quantità, chi l'ha fatto, prezzo
- Confronto prezzi acquisto: `last_buy_price` vs `buy_price`

## Test

| Scenario | Verifica |
|---|---|
| Lv 1: magazzino nascosto | Voce non compare in sidebar |
| Caricare 10 pz | `stock_qty = 10`, movimento `load` creato |
| Scarico vendita 3 pz | `stock_qty = 7`, aggiunto al totale scontrino |
| Soglia minima = 8 | Alert sottoscorta visibile con qty 7 |

---

---

# FASE 11 — Scontrino Digitale PDF

## Idea
Disponibile a tutti i livelli. Una singola estetista ha bisogno dello scontrino tanto quanto un centro grande. PDF generato, inviato via WhatsApp, archiviato.

## Struttura Dati — Firestore

### Collection: `receipts`
```typescript
{
  id: string,
  receipt_number: string,              // "2026-0001" (progressivo annuale)
  appointment_id: string | null,
  client_id: string | null,
  client_name: string,                 // snapshot
  items: Array<{
    type: 'service' | 'product' | 'package' | 'discount' | 'loyalty',
    description: string,
    qty: number,
    unit_price: number,
    total: number,
    vat_pct: number
  }>,
  subtotal: number,
  discount_total: number,
  vat_total: number,
  total: number,
  payment_breakdown: Record<string, number>,  // { cash: 30, sumup: 50 }
  pdf_url: string | null,
  sent_via: string[],
  sent_at: string | null,
  status: 'issued' | 'cancelled',
  cancelled_at: string | null,
  cancellation_reason: string | null,
  credit_note_id: string | null,
  created_at: string
}
```

### Dati Fiscali in `settings/main`
```typescript
fiscal_name: string,                   // "Maria Rossi" o "Centro Bellezza Srl"
fiscal_vat: string,                    // P.IVA o C.F.
fiscal_address: string,
fiscal_city: string,
fiscal_zip: string,
logo_url: string | null,
default_vat_pct: number,              // 22
receipt_counter: number,              // progressivo scontrini (incrementato ad ogni emissione)
```

## File da Creare / Modificare

### Nuovi
- `src/lib/pdf/ReceiptDocument.tsx` — template PDF con react-pdf/renderer
- `src/lib/pdf/generateReceiptPDF.ts` — genera buffer PDF + upload Firebase Storage
- `src/app/api/receipts/create/route.ts`
- `src/app/api/receipts/send/route.ts`
- `src/app/api/receipts/cancel/route.ts`
- `src/app/(app)/receipts/page.tsx`
- `src/app/(app)/receipts/[id]/page.tsx`
- `src/components/receipts/ReceiptPreview.tsx`
- `src/components/receipts/ReceiptStatusBadge.tsx`

### Modificati
- `src/app/(app)/settings/page.tsx` — sezione "Dati Fiscali"
- `src/app/(app)/appointments/[id]/edit/page.tsx` — bottone "Emetti Scontrino"
- `package.json` — `@react-pdf/renderer`

## Step di Sviluppo

### Step 11.1 — Dati Fiscali in Settings
- Sezione "Dati per lo Scontrino": ragione sociale, P.IVA, indirizzo completo, upload logo, aliquota IVA default

### Step 11.2 — Template PDF
Layout A5 o A6, verticale:
```
┌─────────────────────────────┐
│  [LOGO]   Centro Bellezza   │
│           Via Roma 1, FR    │
│           P.IVA 01234567890 │
├─────────────────────────────┤
│  N. 2026-0001  20/06/2026   │
│  Cliente: Maria Rossi       │
├─────────────────────────────┤
│  Trattamento viso  1  60€   │
│  Siero vitamina C  1  25€   │
│  Sconto fedeltà        -5€  │
├─────────────────────────────┤
│  IVA 22%           17,60€   │
│  TOTALE            80,00€   │
├─────────────────────────────┤
│  Pagamento: Carta SumUp     │
│  Grazie per la visita!      │
└─────────────────────────────┘
```

### Step 11.3 — Generazione e Storage
1. `renderToBuffer(<ReceiptDocument />)` con `@react-pdf/renderer`
2. Upload su Firebase Storage: `receipts/2026/2026-0001.pdf`
3. Generate URL firmato (validità 30 giorni — rinnovabile)
4. Salva URL in `receipts.pdf_url`
5. Incrementa `settings.receipt_counter`

### Step 11.4 — Invio WhatsApp
- Twilio: messagio + media URL (il PDF su Storage)
- Template: "Ciao {{nome}}, ecco il tuo scontrino per la visita di oggi. 💅"
- Aggiorna `receipts.sent_via` e `receipts.sent_at`

### Step 11.5 — Storico
- Lista con: numero, data, cliente, totale, stato, metodi pagamento
- Filtri: periodo, stato, cliente
- Totale e IVA del periodo (utile per la liquidazione mensile)
- Download PDF per ogni riga

### Step 11.6 — Annullamento
- Bottone "Annulla" → modal con motivo obbligatorio
- Genera nota di credito (nuovo receipt con importi negativi)
- Link tra i due documenti

## Test

| Scenario | Verifica |
|---|---|
| Emettere scontrino per appuntamento 80€ | PDF generato con dati corretti |
| PDF aperto | Logo, dati centro, righe, totali, metodo pagamento visibili |
| Invio WhatsApp | Cliente riceve link PDF funzionante |
| Annullo + motivo | Nota di credito creata, originale mostra "Annullato" |
| Storico: filtro mese | Solo scontrini del mese selezionato |

---

---

# FASE 12 — Multi-sede (solo Livello 4)

## Idea
Per chi ha più punti vendita. Dashboard centralizzata per il titolare. Ogni sede ha il suo staff, la sua agenda, i suoi clienti. I clienti possono prenotare in qualsiasi sede.

## Struttura Dati — Firestore

### Collection: `sites`
```typescript
{
  id: string,
  name: string,
  address: string,
  city: string,
  phone: string,
  active: boolean,
  manager_staff_id: string | null,
  color: string,
  created_at: string
}
```

### Modifica a tutti i documenti principali
Aggiungere `site_id: string` su: `appointments`, `staff`, `clients` (clienti condivisi tra sedi ma con visite per sede), `receipts`, `payments`

## Comportamento
- Titolare (lv 4): vede tutto in dashboard centralizzata + può filtrare per sede
- Manager sede: vede solo la sua sede
- Clienti: condivisi globalmente (lo stesso cliente può visitare più sedi)
- Report: aggregati globali + breakdown per sede

## File da Creare
- `src/app/(app)/sites/page.tsx` — lista sedi
- `src/app/(app)/sites/new/page.tsx`
- `src/app/(app)/sites/[id]/page.tsx` — dashboard singola sede
- `src/components/sites/SiteSelector.tsx` — dropdown selezione sede attiva (nella topbar)
- `src/hooks/useActiveSite.ts` — sede attiva dell'utente corrente

---

---

# Dipendenze tra Fasi

```
FASE 1 (Onboarding + Business Level)
    └──> TUTTE le altre fasi dipendono da questa

FASE 2 (Agenda Avanzata)
    └──> FASE 3 (Staff) per colonne operatori

FASE 3 (Staff)
    └──> FASE 9 (Stats) per performance operatori
    └──> FASE 2 (Agenda) per colonne

FASE 4 (CRM)
    └──> FASE 6 (Fidelity) per punti nella scheda
    └──> FASE 8 (Marketing) per segmentazione
    └──> FASE 9 (Stats) per inattivi e top clienti

FASE 5 (Pacchetti)
    └──> FASE 7 (SumUp) per pagamento pacchetti
    └──> FASE 11 (Scontrino) per scontrino vendita

FASE 6 (Fidelity)
    └──> FASE 8 (Marketing) per filtro punti nelle campagne

FASE 7 (SumUp)
    └──> FASE 9 (Stats) per ricavi da pagamenti carta
    └──> FASE 11 (Scontrino) per metodo pagamento

FASE 8 (Marketing)
    └──> dipende da FASE 4 (CRM) per dati segmentazione

FASE 9 (Stats)
    └──> dipende da FASE 3, 4, 7, 10

FASE 10 (Magazzino)
    └──> FASE 9 (Stats) per prodotti venduti
    └──> FASE 11 (Scontrino) per righe prodotti

FASE 11 (Scontrino)
    └──> dipende da FASE 7 (SumUp) e FASE 10 (Magazzino)

FASE 12 (Multi-sede)
    └──> dipende da tutto: è l'ultimo livello
```

---

# Ordine Implementazione Consigliato

```
FASE 1  → Onboarding & Business Level         (sblocca tutto)
FASE 2  → Agenda avanzata + DnD               (cuore dell'app)
FASE 4  → CRM avanzato                        (base per marketing e stats)
FASE 7  → SumUp pagamenti                     (revenue feature immediata)
FASE 5  → Pacchetti + Card + Gift Card        (revenue feature)
FASE 6  → Fidelity punti                      (retention)
FASE 3  → Staff (se lv >= 2)                  (scala quando serve)
FASE 8  → Marketing automation                (scala con CRM)
FASE 9  → Statistiche avanzate                (scala con dati)
FASE 10 → Magazzino (se lv >= 2)              (scala quando serve)
FASE 11 → Scontrino digitale PDF              (fiscale)
FASE 12 → Multi-sede (se lv = 4)             (enterprise)
```

---

# Riepilogo Globale

| Fase | Funzionalità | Per Chi | Priorità | Stima |
|---|---|---|---|---|
| 1 | Onboarding + Business Level | Tutti | 🔴 Alta | 2–3 gg |
| 2 | Agenda Avanzata + DnD | Tutti | 🔴 Alta | 3–4 gg |
| 3 | Gestione Staff | Lv 2+ | 🟡 Media | 3–4 gg |
| 4 | CRM Avanzato | Tutti | 🔴 Alta | 3–4 gg |
| 5 | Pacchetti + Card + Gift Card | Tutti | 🔴 Alta | 5–6 gg |
| 6 | Fidelity Punti | Tutti | 🟡 Media | 2–3 gg |
| 7 | SumUp Pagamenti | Tutti | 🔴 Alta | 2–3 gg |
| 8 | Marketing Automation | Tutti (scala) | 🟡 Media | 4–5 gg |
| 9 | Statistiche & Report | Tutti (scala) | 🟡 Media | 4–5 gg |
| 10 | Magazzino Prodotti | Lv 2+ opz, Lv 3+ | 🟢 Bassa | 3–4 gg |
| 11 | Scontrino Digitale PDF | Tutti | 🟢 Bassa | 3–4 gg |
| 12 | Multi-sede | Lv 4 | 🟢 Bassa | 5–7 gg |
| **TOT** | | | | **39–52 gg** |

---

## Regola d'Oro per lo Sviluppo

> **Se una funzionalità è nascosta per il livello attuale,
> non deve esistere nell'interfaccia — nessun bottone grigio,
> nessun "funzionalità disponibile nel piano Pro",
> nessuna sezione vuota. Semplicemente non c'è.**

L'utente non deve mai sentire che sta usando una versione limitata.
Quando la sua esigenza cresce, fa l'upgrade in settings e le nuove funzionalità appaiono
come se fossero sempre state lì — senza migrazioni, senza reinstallazioni, senza frizioni.

---

*Piano redatto il 20/06/2026 — da aggiornare ad ogni fase completata.*
