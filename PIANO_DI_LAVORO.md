# Piano di Lavoro — Estetista App
## Integrazione Funzionalità Avanzate (ispirate a Maki App)
**Data redazione:** 20 Giugno 2026  
**Stack:** Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + Firebase + Twilio + Web Push

---

## Stato Attuale dell'App

### Già Implementato
- Dashboard con calendario mini e vista giornaliera appuntamenti
- Orologio live con conto alla rovescia e allarme sonoro
- Gestione Appuntamenti (CRUD completo)
- Gestione Clienti (CRUD base)
- Gestione Servizi (CRUD completo)
- Pagina Impostazioni (nome centro, promemoria, intervalli)
- Sistema Promemoria SMS + WhatsApp via Twilio
- Web Push Notifications (browser)
- Autenticazione Firebase
- Notifiche push multiple con intervalli configurabili

### Mancante (da implementare)
Vedi le 10 fasi seguenti.

---

## Indice delle Fasi

| # | Funzionalità | Priorità | Stima giorni |
|---|---|---|---|
| 1 | Gestione Staff | 🔴 Alta | 3–4 |
| 2 | CRM Avanzato (VIP + Inattivi + Scheda) | 🔴 Alta | 3–4 |
| 3 | Pacchetti, Card Prepagate, Gift Card | 🔴 Alta | 5–6 |
| 4 | Fidelity — Raccolta Punti | 🟡 Media | 2–3 |
| 5 | SumUp — Integrazione Pagamenti | 🔴 Alta | 2–3 |
| 6 | Marketing Automation Avanzato | 🟡 Media | 4–5 |
| 7 | Statistiche & Report Avanzati | 🟡 Media | 4–5 |
| 8 | Magazzino Prodotti | 🟢 Bassa | 3–4 |
| 9 | Agenda Settimanale + Drag & Drop + Lista d'Attesa | 🟡 Media | 4–5 |
| 10 | Scontrino Digitale PDF | 🟢 Bassa | 3–4 |

**Totale stimato: 35–45 giorni lavorativi (1 sviluppatore)**

---

---

# FASE 1 — Gestione Staff

## Idea
Consentire la gestione di più operatori/collaboratori del centro. Ogni appuntamento viene assegnato a un operatore specifico. Il sistema gestisce disponibilità, orari, turni, ferie e provvigioni. Il dashboard mostra colonne separate per operatore quando ce ne è più di uno.

## Perché è prioritaria
Senza gli operatori non è possibile costruire correttamente le statistiche per persona, la vista settimanale a colonne, né filtrare la disponibilità per slot. Blocca le fasi 7 e 9.

---

## Struttura Dati — Firestore

### Collection: `staff`
```
{
  id: string,
  name: string,                        // "Maria Rossi"
  role: string,                        // "Estetista" | "Parrucchiera" | "Nail Artist"
  color: string,                       // hex colore per distinguerla in agenda "#3B82F6"
  phone: string | null,
  email: string | null,
  active: boolean,
  commission_pct: number,              // % provvigione (es. 30)
  schedule: {                          // orari settimanali
    mon: [{ from: "09:00", to: "13:00" }, { from: "14:00", to: "18:00" }],
    tue: [...],
    wed: [...],
    thu: [...],
    fri: [...],
    sat: [...],
    sun: []
  },
  days_off: string[],                  // date ISO di ferie/assenze ["2026-08-10"]
  created_at: string,
  updated_at: string
}
```

### Modifica: `appointments`
Aggiungere campo `staff_id: string | null` — se null = "qualsiasi operatore disponibile"

---

## Modifiche a `src/types/database.ts`

```typescript
export interface StaffScheduleSlot {
  from: string   // "09:00"
  to: string     // "18:00"
}

export interface Staff {
  id: string
  name: string
  role: string
  color: string
  phone: string | null
  email: string | null
  active: boolean
  commission_pct: number
  schedule: Record<string, StaffScheduleSlot[]>
  days_off: string[]
  created_at: string
  updated_at: string
}

// Aggiungere in Appointment:
// staff_id: string | null
```

---

## File da Creare / Modificare

### Nuovi
- `src/app/(app)/staff/page.tsx` — lista operatori con card colorate
- `src/app/(app)/staff/new/page.tsx` — form creazione
- `src/app/(app)/staff/[id]/edit/page.tsx` — form modifica + gestione ferie
- `src/components/staff/StaffForm.tsx` — form condiviso con editor orari settimanali
- `src/components/staff/StaffCard.tsx` — card operatore con avatar colorato, ruolo, stato attivo
- `src/components/staff/WeekScheduleEditor.tsx` — editor grafico orari per giorno

### Modificati
- `src/types/database.ts` — aggiungere tipo `Staff`, campo `staff_id` in `Appointment`
- `src/components/appointments/AppointmentForm.tsx` — aggiungere dropdown "Operatore" con filtro disponibilità
- `src/app/(app)/dashboard/page.tsx` — aggiungere colonne per operatore in vista giornaliera
- `src/app/(app)/layout.tsx` / `src/components/layout/Sidebar.tsx` — aggiungere voce "Staff" nel menu

---

## Step di Sviluppo Dettagliati

### Step 1.1 — Types e Firestore
- Aggiungere `Staff` in `database.ts`
- Aggiungere `staff_id: string | null` a `Appointment` e `AppointmentWithRelations`
- Creare regola Firestore per la collection `staff`

### Step 1.2 — CRUD Staff
- Creare `StaffForm.tsx` con campi: nome, ruolo, colore (color picker), telefono, email, % provvigione
- `WeekScheduleEditor.tsx`: griglia con 7 giorni, per ognuno toggle attivo/inattivo + up a 2 slot orari add/remove
- Pagina lista `/staff`: card per ogni operatore con nome, ruolo, colore, badge "Attivo/Inattivo"
- Pagine new/edit con form completo

### Step 1.3 — Integrazione in Appuntamenti
- In `AppointmentForm.tsx`: aggiungere select "Operatore"
- Quando si seleziona data+ora+durata servizio, filtrare la lista operatori per mostrare solo quelli disponibili in quell'orario
- Logica disponibilità: controllare `staff.schedule` del giorno della settimana + `days_off` + appuntamenti già presenti in Firestore per quell'operatore in quell'ora

### Step 1.4 — Dashboard a Colonne
- Se ci sono 2+ operatori attivi, la vista giornaliera mostra una colonna per operatore
- Ogni colonna ha header colorato con nome operatore
- Appuntamenti mostrati nella colonna dell'operatore assegnato

### Step 1.5 — Gestione Ferie/Assenze
- Nella pagina edit dello staff: sezione "Ferie e Assenze" con mini calendario
- Click su un giorno → aggiunge/rimuove dalla lista `days_off`
- Quando si prenota un appuntamento, giorni off non sono selezionabili per quell'operatore

---

## Test

| Scenario | Verifica |
|---|---|
| Creare 2 operatori con orari diversi | Entrambi compaiono nel dropdown appuntamenti |
| Prenotare slot fuori orario di un operatore | Operatore non disponibile → non compare nel dropdown |
| Segnare ferie per un operatore | Il giorno di ferie non è selezionabile per quell'operatore |
| Dashboard con 2 operatori | Vista a 2 colonne con colori distinti |
| Creare appuntamento senza operatore (staff_id null) | Appuntamento visibile in colonna "Qualsiasi" |

---

---

# FASE 2 — CRM Avanzato

## Idea
Arricchire l'anagrafica clienti con: storico completo visite e acquisti, data ultima visita calcolata automaticamente, scontrino medio, badge VIP per i migliori clienti, lista clienti "a rischio" (non tornano da X giorni). Aggiungere campo data di nascita per le automazioni della fase 6.

## Perché è prioritaria
Il CRM avanzato sblocca le campagne marketing (fase 6), le statistiche (fase 7) e il sistema punti (fase 4). Senza `last_visit_at` e `total_spent` niente funziona.

---

## Struttura Dati — Firestore

### Modifiche a `clients`
Aggiungere campi:
```
{
  // ... campi esistenti ...
  birthday: string | null,             // "1985-03-15" (solo data, niente ora)
  gender: 'F' | 'M' | 'other' | null,
  last_visit_at: string | null,        // ISO timestamp ultima visita completata
  total_spent: number,                 // € totale speso (storico)
  visit_count: number,                 // numero visite totali
  avg_ticket: number,                  // media scontrino (total_spent / visit_count)
  preferred_service_id: string | null, // servizio più prenotato
  loyalty_points: number,              // punti fedeltà (usati in fase 4)
  is_vip: boolean,                     // calcolato automaticamente
  gdpr_consent: boolean,               // consenso marketing
  gdpr_consent_at: string | null
}
```

### Collection: `client_history` (opzionale, per storico dettagliato)
```
{
  id: string,
  client_id: string,
  appointment_id: string,
  service_name: string,
  staff_name: string,
  price: number,
  date: string,
  notes: string | null
}
```

---

## File da Creare / Modificare

### Nuovi
- `src/app/(app)/clients/[id]/page.tsx` — scheda cliente dettagliata (readonly)
- `src/components/clients/ClientStats.tsx` — widget con statistiche cliente (spesa totale, visite, media)
- `src/components/clients/ClientHistory.tsx` — lista storico appuntamenti del cliente
- `src/components/clients/VipBadge.tsx` — badge corona VIP
- `src/app/api/clients/recalculate/route.ts` — API ricalcolo statistiche da storico

### Modificati
- `src/types/database.ts` — campi aggiuntivi su `Client`
- `src/components/clients/ClientForm.tsx` — aggiungere: data nascita, genere, consenso GDPR
- `src/app/(app)/clients/page.tsx` — tab "Tutti" / "VIP" / "Inattivi" + filtro/ricerca
- `src/app/(app)/appointments/[id]/edit/page.tsx` — al cambio stato in `completed`: triggera ricalcolo cliente

---

## Step di Sviluppo Dettagliati

### Step 2.1 — Aggiornamento Form Cliente
- Aggiungere in `ClientForm.tsx`: campo `birthday` (date picker), `gender` (radio: F/M/Altro), `gdpr_consent` (checkbox con data)
- Aggiornare `Client` in `database.ts`
- Creare migration: ricalcola `last_visit_at`, `total_spent`, `visit_count` per tutti i clienti esistenti tramite API route

### Step 2.2 — API Ricalcolo Stats
- `POST /api/clients/recalculate?client_id=xxx` — legge tutti gli appuntamenti `completed` del cliente → calcola statistiche → aggiorna documento Firestore
- Chiamata automatica ogni volta che un appuntamento passa a `completed`
- Endpoint `POST /api/clients/recalculate-all` per ricalcolo bulk (da usare una tantum)

### Step 2.3 — Scheda Cliente
- Pagina `/clients/[id]` con:
  - Header: nome, telefono, email, birthday, badge VIP
  - Card statistiche: totale speso, numero visite, media scontrino, ultima visita
  - Barra progresso prossima ricompensa (punti fedeltà)
  - Tab "Storico Appuntamenti": lista servizi con data, operatore, importo
  - Tab "Pacchetti Attivi": carta con sessioni rimanenti
  - Tab "Messaggi Inviati": log WhatsApp/SMS ricevuti

### Step 2.4 — Lista Clienti Avanzata
- Tab **Tutti**: lista con ricerca per nome/telefono
- Tab **VIP**: clienti con `is_vip = true` (top 20% per spesa o soglia configurabile)
- Tab **Inattivi**: clienti con `last_visit_at < oggi - X giorni` (X configurabile in settings)
- Bottone "Invia Campagna" su tab Inattivi → apre modal invio rapido WhatsApp

### Step 2.5 — Calcolo VIP Automatico
- Dopo ogni ricalcolo statistiche: se `total_spent > soglia_vip` → `is_vip = true`
- Soglia VIP configurabile nelle impostazioni (default: 500€)
- Badge corona dorata visibile nella lista clienti e nella scheda

---

## Test

| Scenario | Verifica |
|---|---|
| Completare 5 appuntamenti per un cliente | `total_spent`, `visit_count`, `last_visit_at` aggiornati |
| Cliente con spesa > soglia VIP | Badge VIP appare in lista e scheda |
| Cliente non viene da 60+ giorni | Compare in tab "Inattivi" |
| Modificare birthday di un cliente | Campo salvato correttamente |
| Aprire scheda cliente | Tutti i tab mostrano dati corretti |

---

---

# FASE 3 — Pacchetti, Card Prepagate, Gift Card

## Idea
Tre strumenti di pre-pagamento e fidelizzazione:
1. **Pacchetti**: bundle di N sessioni dello stesso servizio a prezzo scontato, con scaler automatico
2. **Card Prepagate**: credito prepagato in euro, scalabile ad ogni visita
3. **Gift Card**: voucher regalo con importo fisso, opzionalmente con sblocco al compleanno

## Perché è prioritaria
Aumenta direttamente gli incassi anticipati e la fidelizzazione. Integra con SumUp (fase 5) per il pagamento e con Fidelity (fase 4) per i punti.

---

## Struttura Dati — Firestore

### Collection: `packages` (template pacchetti, configurati dal gestore)
```
{
  id: string,
  name: string,                        // "5 Trattamenti Viso"
  service_id: string,                  // servizio incluso
  sessions_count: number,              // numero sessioni (es. 5)
  price: number,                       // prezzo scontato totale
  original_price: number,              // prezzo pieno (sessions_count * prezzo_servizio)
  discount_pct: number,                // % sconto calcolata
  valid_days: number | null,           // giorni di validità (null = no scadenza)
  description: string | null,
  active: boolean,
  created_at: string
}
```

### Collection: `client_packages` (pacchetti acquistati dal cliente)
```
{
  id: string,
  client_id: string,
  package_id: string,
  package_name: string,                // snapshot nome al momento dell'acquisto
  service_id: string,
  sessions_total: number,
  sessions_used: number,
  sessions_remaining: number,          // calcolato: total - used
  price_paid: number,
  paid: boolean,
  paid_amount: number,                 // acconto versato
  balance_due: number,                 // saldo ancora da pagare
  payment_method: string | null,       // 'cash' | 'card' | 'sumup'
  sumup_payment_id: string | null,
  expires_at: string | null,           // ISO date scadenza
  status: 'active' | 'exhausted' | 'expired',
  created_at: string,
  updated_at: string
}
```

### Collection: `prepaid_cards` (credito prepagato)
```
{
  id: string,
  client_id: string,
  name: string,                        // "Card Benessere Maria"
  initial_balance: number,             // credito iniziale caricato
  balance: number,                     // credito residuo attuale
  transactions: [
    {
      date: string,
      type: 'load' | 'use',
      amount: number,
      appointment_id: string | null,
      note: string | null
    }
  ],
  barcode: string,                     // codice univoco (UUID corto)
  active: boolean,
  created_at: string,
  updated_at: string
}
```

### Collection: `gift_cards`
```
{
  id: string,
  code: string,                        // codice univoco alfanumerico es. "MAKI-A3X9"
  amount: number,                      // valore totale
  balance: number,                     // saldo residuo
  buyer_client_id: string | null,
  recipient_name: string,
  recipient_email: string | null,
  recipient_phone: string | null,
  is_birthday_gift: boolean,
  unlock_date: string | null,          // ISO date: mezzanotte del compleanno
  is_unlocked: boolean,                // true se unlock_date è passata o non è birthday gift
  used_at: string | null,
  expired_at: string | null,
  expires_at: string | null,           // scadenza gift card
  created_at: string
}
```

---

## File da Creare / Modificare

### Nuovi
- `src/app/(app)/packages/page.tsx` — lista template pacchetti
- `src/app/(app)/packages/new/page.tsx` — crea nuovo template pacchetto
- `src/app/(app)/packages/[id]/edit/page.tsx`
- `src/app/(app)/clients/[id]/packages/page.tsx` — pacchetti attivi di un cliente
- `src/components/packages/PackageForm.tsx`
- `src/components/packages/ClientPackageCard.tsx` — card con progress bar sessioni
- `src/app/(app)/prepaid-cards/page.tsx` — lista card prepagate
- `src/app/(app)/prepaid-cards/new/page.tsx`
- `src/components/prepaid-cards/PrepaidCardForm.tsx`
- `src/components/prepaid-cards/PrepaidCardDetail.tsx` — storico transazioni + saldo
- `src/app/(app)/gift-cards/page.tsx` — lista gift card
- `src/app/(app)/gift-cards/new/page.tsx`
- `src/components/gift-cards/GiftCardForm.tsx`
- `src/app/api/cron/gift-cards-unlock/route.ts` — cron job: sblocca gift card al compleanno
- `src/lib/barcode.ts` — generazione codici univoci

### Modificati
- `src/app/(app)/appointments/[id]/edit/page.tsx` — sezione checkout con opzione "Paga con Pacchetto / Card / Gift Card"
- `src/components/layout/Sidebar.tsx` — voci menu: Pacchetti, Card Prepagate, Gift Card
- `src/types/database.ts` — aggiungere tutti i nuovi tipi

---

## Step di Sviluppo Dettagliati

### Step 3.1 — Template Pacchetti (CRUD)
- Pagina `/packages` con lista template: nome, servizio, sessioni, prezzo, sconto %
- Form: seleziona servizio (dropdown), inserisci numero sessioni, prezzo scontato → calcola automaticamente `discount_pct`
- Toggle attivo/inattivo
- Badge "X sessioni • Y€ • sconto Z%"

### Step 3.2 — Vendita Pacchetto a Cliente
- Dalla scheda cliente (fase 2) o da `/clients/[id]/packages/new`:
  - Seleziona template pacchetto
  - Imposta importo acconto (se pagamento parziale)
  - Sceglie metodo pagamento (contanti / carta / SumUp)
  - Genera `client_packages` con `sessions_used = 0`
  - Genera scontrino (fase 10) opzionalmente

### Step 3.3 — Scalo Sessioni
- Nel form chiusura appuntamento: se il cliente ha pacchetti attivi compatibili con il servizio → mostrare opzione "Usa sessione da pacchetto [nome]"
- Al click: incrementa `sessions_used` → aggiorna `sessions_remaining`
- Se `sessions_remaining = 0` → aggiorna `status = 'exhausted'`
- Toast con conferma: "Sessione scalata. Rimanenti: X"

### Step 3.4 — Card Prepagate
- Form: seleziona cliente, inserisci importo iniziale, genera barcode (UUID corto)
- Pagina dettaglio: saldo attuale + lista transazioni con tipo (carico/uso), data, importo
- Ricarica: bottone "Ricarica" → aggiunge importo al saldo + transaction di tipo `load`
- Uso: nel checkout appuntamento → "Paga con Card Prepagata" → inserisci/scansiona barcode → scala importo

### Step 3.5 — Gift Card
- Form: destinatario nome, email/telefono, importo, scadenza, flag "Regalo di compleanno"
- Se "Regalo di compleanno": seleziona data nascita → `unlock_date = mezzanotte del giorno`
- Genera codice univoco (`GIFT-` + 8 char casuali uppercase)
- Invio automatico via WhatsApp/Email al destinatario con il codice
- Cron job giornaliero: trova gift card con `unlock_date <= oggi` e `is_unlocked = false` → sblocca

### Step 3.6 — Checkout Integrato
- Nella schermata chiusura appuntamento, sezione "Pagamento":
  ```
  [ ] Contanti
  [ ] Carta (SumUp)
  [ ] Pacchetto (mostra pacchetti attivi compatibili)
  [ ] Card Prepagata (inserisci codice)
  [ ] Gift Card (inserisci codice)
  ```
- Possibilità di pagamento misto (es. 30€ gift card + 20€ contanti)

---

## Test

| Scenario | Verifica |
|---|---|
| Creare template "5 Massaggi 200€" (prezzo pieno 250€) | Sconto 20% calcolato automaticamente |
| Vendere pacchetto a cliente con acconto 100€ | `paid_amount=100`, `balance_due=100` |
| Scalare 3 sessioni tramite appuntamenti | `sessions_used=3`, `sessions_remaining=2` |
| Scalare quinta sessione | `status=exhausted`, messaggio "Pacchetto esaurito" |
| Creare gift card compleanno per data futura | `is_unlocked=false` fino alla data |
| Cron notturno il giorno del compleanno | `is_unlocked=true` |
| Checkout con card prepagata saldo insufficiente | Errore "Saldo insufficiente, mancano X€" |

---

---

# FASE 4 — Fidelity / Raccolta Punti

## Idea
Ogni euro speso accumula punti. Il cliente può riscattare punti raggiunti la soglia configurata per ottenere uno sconto. I punti sono visibili nella scheda cliente. Messaggi automatici al raggiungimento delle soglie.

---

## Struttura Dati — Firestore

### Modifica `clients`
Campo già previsto in fase 2: `loyalty_points: number`

### Collection: `loyalty_transactions`
```
{
  id: string,
  client_id: string,
  type: 'earn' | 'redeem' | 'expire' | 'bonus',
  points: number,                      // positivo o negativo
  balance_after: number,
  ref_appointment_id: string | null,
  ref_campaign_id: string | null,
  note: string | null,
  created_at: string
}
```

### Settings — aggiungere in `settings/main`
```
loyalty_enabled: boolean,
points_per_euro: number,               // es. 1 punto per € speso
reward_threshold: number,              // es. 100 punti per ottenere la ricompensa
reward_value: number,                  // es. 5€ di sconto
welcome_bonus_points: number,          // punti regalati al primo accesso
birthday_bonus_points: number,         // punti bonus il giorno del compleanno
```

---

## File da Creare / Modificare

### Nuovi
- `src/app/(app)/fidelity/page.tsx` — classifica clienti per punti + configurazione programma
- `src/components/fidelity/LoyaltyWidget.tsx` — card con punti, barra progresso, prossima ricompensa
- `src/lib/loyalty.ts` — funzioni: `earnPoints()`, `redeemPoints()`, `getBalance()`
- `src/app/api/loyalty/earn/route.ts`
- `src/app/api/loyalty/redeem/route.ts`

### Modificati
- `src/app/(app)/settings/page.tsx` — sezione "Programma Fedeltà" con toggle e configurazione
- `src/app/(app)/clients/[id]/page.tsx` (fase 2) — aggiungere `LoyaltyWidget`
- `src/app/(app)/appointments/[id]/edit/page.tsx` — al completamento: chiama `earnPoints()`

---

## Step di Sviluppo Dettagliati

### Step 4.1 — Configurazione
- In Settings: sezione "Programma Fedeltà" con:
  - Toggle on/off
  - Punti per euro (slider 1–10)
  - Soglia ricompensa (input numerico)
  - Valore ricompensa in € (input numerico)
  - Bonus benvenuto, bonus compleanno

### Step 4.2 — Accumulo Punti
- `lib/loyalty.ts: earnPoints(clientId, amountSpent)`:
  - Legge configurazione da Firestore
  - Calcola `points = Math.floor(amount * points_per_euro)`
  - Aggiorna `clients.loyalty_points += points`
  - Crea `loyalty_transactions` con `type = 'earn'`
- Chiamata al termine di ogni appuntamento completato

### Step 4.3 — Riscatto
- Nel checkout appuntamento: se `loyalty_points >= reward_threshold` → mostrare "Usa punti per sconto di X€"
- `lib/loyalty.ts: redeemPoints(clientId, points)`:
  - Decrementa `clients.loyalty_points`
  - Crea `loyalty_transactions` con `type = 'redeem'`
  - Applica sconto al totale

### Step 4.4 — Widget Fedeltà
- Nella scheda cliente: card "Punti Fedeltà"
  - Numero punti attuali in grande
  - Barra progresso verso soglia (es. "85/100 punti")
  - "Ti mancano 15 punti per ottenere 5€ di sconto"
  - Storico movimenti: data, tipo, punti, note

### Step 4.5 — Bonus Automatici
- Cron giornaliero: clienti con birthday = oggi → aggiungi `birthday_bonus_points`
- Nuovi clienti (first_visit): aggiungi `welcome_bonus_points` al primo appuntamento completato

---

## Test

| Scenario | Verifica |
|---|---|
| Appuntamento da 50€ con 1pt/€ | `loyalty_points += 50` |
| Cliente con 100 punti soglia 100 | Opzione "Usa punti" visibile nel checkout |
| Riscatto punti | `loyalty_points` si azzera, sconto applicato |
| Compleanno cliente | `birthday_bonus_points` aggiunti automaticamente |
| Disattivare fidelity in settings | Opzione nascosta ovunque |

---

---

# FASE 5 — SumUp Integrazione Pagamenti

## Idea
Integrare SumUp per accettare pagamenti con carta direttamente dall'app. Flusso principale: **Payment Link** (nessun hardware richiesto) — si genera un link di checkout, il cliente o il gestore completa il pagamento da browser. Flusso secondario (opzionale): terminale fisico SumUp Air.

## Valutazione SumUp

| Aspetto | Dettaglio |
|---|---|
| Commissione | 1,69% per transazione (nessun canone mensile) |
| SDK | `@sumup/sdk` — Node.js ufficiale |
| Auth | API Key `sup_sk_...` + OAuth per merchant |
| Checkout link | Crea un URL di pagamento da inviare al cliente |
| Terminale | API sessione per terminale fisico (SumUp Air ~39€) |
| Webhook | Notifiche asincrone pagamento completato/fallito |
| Sandbox | Ambiente di test disponibile |
| Rimborsi | API rimborso transazione disponibile |

## Prerequisiti
1. Aprire account SumUp su `sumup.com`
2. Sezione "Sviluppatori" → generare API Key sandbox (`sup_sk_test_...`)
3. Configurare `WEBHOOK_URL` nel pannello SumUp = `https://tuodominio.com/api/sumup/webhook`
4. Aggiungere variabili ambiente

---

## Variabili Ambiente da Aggiungere in `.env.local`
```
SUMUP_API_KEY=sup_sk_...
SUMUP_MERCHANT_CODE=M...
SUMUP_WEBHOOK_SECRET=...
NEXT_PUBLIC_APP_URL=https://tuodominio.com
```

---

## Struttura Dati — Firestore

### Collection: `payments`
```
{
  id: string,
  sumup_checkout_id: string,
  sumup_transaction_id: string | null,
  appointment_id: string | null,
  client_package_id: string | null,
  gift_card_id: string | null,
  amount: number,
  currency: 'EUR',
  description: string,
  status: 'pending' | 'paid' | 'failed' | 'refunded',
  payment_url: string,
  paid_at: string | null,
  refunded_at: string | null,
  webhook_received_at: string | null,
  created_at: string
}
```

### Modifica `appointments`
Aggiungere: `payment_id: string | null`, `payment_status: string | null`, `payment_method: string | null`

---

## File da Creare / Modificare

### Nuovi
- `src/lib/sumup.ts` — wrapper SumUp SDK con funzioni: `createCheckout()`, `getTransaction()`, `refundTransaction()`
- `src/app/api/sumup/checkout/route.ts` — POST: crea checkout SumUp, salva su Firestore, restituisce URL
- `src/app/api/sumup/webhook/route.ts` — POST: riceve notifica SumUp, verifica firma, aggiorna stato pagamento
- `src/app/api/sumup/transactions/route.ts` — GET: storico transazioni
- `src/app/api/sumup/refund/route.ts` — POST: rimborso transazione
- `src/app/(app)/payments/page.tsx` — storico pagamenti con stato e importi
- `src/components/payments/SumUpCheckoutButton.tsx` — bottone "Paga con Carta" che apre modal/tab checkout
- `src/components/payments/PaymentStatusBadge.tsx` — badge stato pagamento (in attesa / pagato / rimborsato)

### Modificati
- `src/app/(app)/appointments/[id]/edit/page.tsx` — sezione pagamento con bottone SumUp
- `src/types/database.ts` — aggiungere tipo `Payment`, campi su `Appointment`
- `package.json` — aggiungere `@sumup/sdk`

---

## Step di Sviluppo Dettagliati

### Step 5.1 — Installazione e Configurazione
```bash
npm install @sumup/sdk
```
- Creare `src/lib/sumup.ts`:
```typescript
import { SumUp } from '@sumup/sdk'
export const sumup = new SumUp({ apiKey: process.env.SUMUP_API_KEY! })
```

### Step 5.2 — API Route Checkout
`POST /api/sumup/checkout`
```typescript
// Body: { amount, description, appointment_id?, return_url }
// 1. Crea checkout su SumUp
const checkout = await sumup.checkouts.create({
  checkout_reference: `APT-${appointmentId}-${Date.now()}`,
  amount,
  currency: 'EUR',
  merchant_code: process.env.SUMUP_MERCHANT_CODE!,
  description,
  return_url: `${process.env.NEXT_PUBLIC_APP_URL}/appointments/${appointmentId}/payment-result`,
})
// 2. Salva su Firestore collection `payments`
// 3. Restituisce { checkout_id, payment_url }
```

### Step 5.3 — Webhook
`POST /api/sumup/webhook`
- Verifica firma HMAC con `SUMUP_WEBHOOK_SECRET`
- In base a `event_type`:
  - `CHECKOUT_COMPLETED` → aggiorna `payments.status = 'paid'`, aggiorna `appointments.payment_status = 'paid'`
  - `CHECKOUT_FAILED` → aggiorna `status = 'failed'`
- Logga evento su Firestore collection `webhook_logs`

### Step 5.4 — UI Checkout
- In pagina modifica appuntamento, sezione "Pagamento":
  - Se non ancora pagato: bottone "Paga con Carta (SumUp)"
  - Click → POST `/api/sumup/checkout` → ottieni `payment_url`
  - Apri `payment_url` in nuova tab o modal iframe
  - Pagina `payment-result`: legge stato da Firestore e mostra esito
- Se già pagato: badge verde "Pagato — X€ il [data]"

### Step 5.5 — Storico Pagamenti
- Pagina `/payments`:
  - Lista tutti i pagamenti con: data, cliente, importo, stato, link appuntamento
  - Filtri: per data, per stato (pending/paid/failed/refunded)
  - Bottone "Rimborsa" su ogni pagamento `paid` → modale conferma → POST `/api/sumup/refund`
  - Totale incassato nel periodo selezionato

### Step 5.6 — Terminale Fisico (Fase Opzionale)
- Se il gestore ha SumUp Air collegato:
  - In checkout: opzione "Terminale fisico" invece di link
  - `POST /api/sumup/terminal-session` → crea sessione di checkout sul terminale
  - Il terminale si attiva e mostra l'importo
  - Webhook di conferma al completamento

---

## Test

| Scenario | Verifica |
|---|---|
| Creare checkout per appuntamento 80€ | URL payment generato e salvato su Firestore |
| Completare pagamento in sandbox | Webhook ricevuto, stato aggiornato a `paid` |
| Aprire pagina appuntamento dopo pagamento | Badge "Pagato 80€" visibile |
| Richiedere rimborso | `status = refunded`, importo registrato |
| Webhook con firma errata | 401 restituito, log errore |

---

---

# FASE 6 — Marketing Automation Avanzato

## Idea
Sistema di campagne automatizzate con segmentazione clienti. Trigger basati su eventi (compleanno, inattività, post-trattamento, benvenuto) o invio manuale a liste filtrate. Canali: WhatsApp, SMS, Push Notification.

---

## Struttura Dati — Firestore

### Collection: `marketing_campaigns`
```
{
  id: string,
  name: string,                        // "Richiamo clienti estate 2026"
  trigger_type: 'birthday' | 'inactive' | 'post_treatment' | 'welcome' | 'review_request' | 'manual',
  status: 'active' | 'paused' | 'draft' | 'completed',
  channel: 'whatsapp' | 'sms' | 'push' | 'all',
  message_template: string,            // testo con variabili {{nome}}, {{servizio}}, {{data}}
  filters: {
    gender: 'F' | 'M' | 'all',
    age_from: number | null,
    age_to: number | null,
    inactive_days: number | null,       // per trigger 'inactive'
    service_id: string | null,          // clienti che fanno quel servizio
    has_loyalty_points_min: number | null
  },
  delay_hours: number | null,          // per post_treatment: ore dopo appuntamento
  coupon_attached: boolean,
  coupon_discount_pct: number | null,
  coupon_valid_days: number | null,
  sent_count: number,
  open_count: number,                  // solo push
  last_run_at: string | null,
  created_at: string,
  updated_at: string
}
```

### Collection: `campaign_sends`
```
{
  id: string,
  campaign_id: string,
  client_id: string,
  channel: string,
  message_sent: string,                // testo effettivamente inviato
  status: 'sent' | 'failed' | 'delivered',
  coupon_code: string | null,
  sent_at: string
}
```

---

## File da Creare / Modificare

### Nuovi
- `src/app/(app)/marketing/page.tsx` — lista campagne con stats (inviate, aperte)
- `src/app/(app)/marketing/new/page.tsx` — wizard creazione campagna
- `src/app/(app)/marketing/[id]/page.tsx` — dettaglio campagna + report invii
- `src/components/marketing/CampaignForm.tsx` — form con step: trigger → filtri → messaggio → preview
- `src/components/marketing/MessageTemplateEditor.tsx` — editor testo con variabili suggerite
- `src/components/marketing/AudiencePreview.tsx` — mostra quanti clienti verranno raggiunti dai filtri
- `src/app/api/cron/marketing/route.ts` — cron giornaliero che esegue campagne automatiche
- `src/app/api/marketing/send-manual/route.ts` — invio manuale campagna
- `src/lib/marketing.ts` — logica segmentazione + invio

### Modificati
- `src/app/(app)/clients/page.tsx` — bottone "Invia campagna" su lista Inattivi
- `src/lib/twilio.ts` — aggiungere funzione `sendCampaignMessage()`
- `src/app/(app)/settings/page.tsx` — link recensione Google configurabile

---

## Step di Sviluppo Dettagliati

### Step 6.1 — Struttura Campagne
- Creare CRUD completo campagne su Firestore
- Pagina lista con: nome, trigger, stato, ultimo invio, n° inviati
- Toggle on/off per ogni campagna

### Step 6.2 — Editor Campagna (Wizard)
**Step A — Trigger**: seleziona tipo (compleanno / inattivi / post-trattamento / benvenuto / richiesta recensione / manuale)  
**Step B — Filtri**: genere, età min/max, giorni inattività, servizio specifico  
**Step C — Canale**: WhatsApp / SMS / Push (o combinazioni)  
**Step D — Messaggio**: editor con variabili disponibili:
  - `{{nome}}` — nome cliente
  - `{{servizio}}` — ultimo/prossimo servizio
  - `{{data_appuntamento}}` — data prossimo appuntamento
  - `{{punti}}` — punti fedeltà
  - `{{codice_coupon}}` — coupon generato automaticamente
**Step E — Preview**: esempio messaggio con dati cliente fittizi + stima audience

### Step 6.3 — Cron Marketing
`GET /api/cron/marketing` — eseguito ogni giorno alle 10:00:
1. **Birthday**: trova clienti con `birthday = oggi` + campagne `trigger_type = 'birthday'` attive → invia
2. **Inactive**: trova clienti con `last_visit_at < oggi - inactive_days` + campagne `trigger_type = 'inactive'` attive → invia (una volta sola, non ri-invia se già inviato negli ultimi 30 giorni)
3. **Welcome**: clienti con `visit_count = 1` e `created_at = oggi - 1 giorno` → messaggio benvenuto

### Step 6.4 — Post-Trattamento e Richiesta Recensione
- Trigger basato sull'evento appuntamento `completed`:
  - Schedula invio a `completed_at + delay_hours`
  - Cron ogni ora: trova appuntamenti completati nelle ultime ore che necessitano invio → invia
- Template richiesta recensione: include link Google My Business configurato in settings

### Step 6.5 — Coupon Allegati
- Se la campagna ha `coupon_attached = true`: genera codice univoco `CAMP-XXXX` per ogni cliente
- Salva codice in `campaign_sends.coupon_code`
- Al checkout appuntamento: campo "Codice sconto" → verifica su `campaign_sends` → applica sconto

### Step 6.6 — Report Campagna
- Pagina dettaglio campagna:
  - Totale inviati
  - Lista destinatari con stato (inviato/fallito) e timestamp
  - Grafico a barre invii per giorno

---

## Test

| Scenario | Verifica |
|---|---|
| Campagna compleanno attiva | Al cron del giorno del compleanno → WhatsApp inviato |
| Campagna inattivi >45 giorni | Solo clienti non venuti da 45+ giorni ricevono il messaggio |
| Invio manuale a lista "Donne > 40 anni" | Solo clientele con filtri corretti |
| Coupon allegato a campagna | Codice generato e applicabile al checkout |
| Template con variabili | `{{nome}}` sostituito con nome reale del cliente |

---

---

# FASE 7 — Statistiche & Report Avanzati

## Idea
Dashboard analytics completa consultabile per qualsiasi periodo. Metriche principali: ricavi, servizi più richiesti, performance staff, clienti a rischio abbandono, confronto periodi. Export CSV per contabilità esterna.

---

## File da Creare / Modificare

### Nuovi
- `src/app/(app)/stats/page.tsx` — dashboard statistiche principale
- `src/components/stats/RevenueChart.tsx` — grafico ricavi per giorno/settimana/mese
- `src/components/stats/TopServicesChart.tsx` — grafico a barre servizi più eseguiti
- `src/components/stats/StaffPerformanceTable.tsx` — tabella performance per operatore
- `src/components/stats/ClientsAtRiskList.tsx` — lista clienti che non tornano + bottone campagna
- `src/components/stats/PeriodComparison.tsx` — confronto periodo vs periodo precedente
- `src/app/api/stats/summary/route.ts` — API aggregazione dati periodo
- `src/lib/stats.ts` — funzioni calcolo metriche

### Modificati
- `src/components/layout/Sidebar.tsx` — voce "Statistiche"

---

## Step di Sviluppo Dettagliati

### Step 7.1 — Selezione Periodo
- Header pagina stats con:
  - Bottoni rapidi: Oggi / Settimana / Mese / Anno
  - Date picker custom: data inizio + data fine
  - Toggle "Confronta con periodo precedente" (mostra seconda colonna/barra)

### Step 7.2 — Metriche Principali (card in testa)
- **Ricavo Totale** nel periodo + variazione % vs precedente (verde/rosso)
- **N° Appuntamenti** nel periodo + variazione %
- **Nuovi Clienti** nel periodo + variazione %
- **Scontrino Medio** (ricavo / appuntamenti) + variazione %
- **Tasso Conferma** (confermati / totali) %

### Step 7.3 — Grafici
- `RevenueChart`: linea giornaliera dei ricavi. Se confronto attivo: due linee sovrapposta
- `TopServicesChart`: barre orizzontali, ordinate per: (A) esecuzioni, (B) ricavo. Toggle A/B
- Grafico a ciambella: split ricavo per categoria servizi

### Step 7.4 — Performance Staff
- Tabella: operatore | n° appuntamenti | ricavo generato | scontrino medio | % sul totale
- Provvigioni calcolate: `ricavo * commission_pct / 100`
- Ordinabile per colonna

### Step 7.5 — Report Clienti
- **Passaggi**: clienti che hanno visitato almeno una volta nel periodo
- **Nuovi**: clienti con `created_at` nel periodo
- **Inattivi**: clienti con `last_visit_at < inizio_periodo - 60 giorni` (a rischio)
- Per ogni inattivo: nome, ultima visita, telefono, bottone "Invia Richiamo"
- **Top 10 Clienti**: ordinati per spesa nel periodo

### Step 7.6 — Prodotti & Magazzino (collegamento fase 8)
- Lista prodotti più venduti nel periodo con quantità e ricavo
- Collegamento a dashboard magazzino per vedere giacenza attuale

### Step 7.7 — Export
- Bottone "Scarica CSV" su ogni sezione:
  - Appuntamenti del periodo (data, cliente, servizio, operatore, importo, stato)
  - Movimenti cassa (data, tipo, importo, metodo)
  - Report staff (operatore, appuntamenti, ricavo, provvigioni)

---

## Test

| Scenario | Verifica |
|---|---|
| Inserire 15 appuntamenti in 30 giorni | Ricavo totale e media corrispondono |
| Confronto mese corrente vs precedente | Variazioni % corrette |
| Filtrare per staff singolo | Solo appuntamenti di quell'operatore |
| Export CSV appuntamenti | File con tutte le colonne e righe corrette |
| Lista inattivi | Solo clienti non tornati nel periodo configurato |

---

---

# FASE 8 — Magazzino Prodotti

## Idea
Tracciamento completo delle giacenze prodotti: carico da fornitore, scarico per vendita diretta o uso in cabina, alert sottoscorta, storico movimenti per operatore, confronto prezzi acquisto.

---

## Struttura Dati — Firestore

### Collection: `products`
```
{
  id: string,
  name: string,
  brand: string | null,
  barcode: string | null,
  category: string,                    // "Colorazione" | "Trattamenti" | "Vendita"
  supplier: string | null,
  buy_price: number,                   // prezzo acquisto attuale
  last_buy_price: number | null,       // prezzo acquisto precedente (per confronto)
  avg_buy_price: number,               // media prezzi acquisto
  sell_price: number | null,           // prezzo vendita (se vendibile)
  stock_qty: number,                   // giacenza attuale
  min_stock: number,                   // soglia sottoscorta
  unit: string,                        // "pz" | "ml" | "kg"
  active: boolean,
  image_url: string | null,
  created_at: string,
  updated_at: string
}
```

### Collection: `stock_movements`
```
{
  id: string,
  product_id: string,
  product_name: string,                // snapshot
  type: 'load' | 'sale' | 'use_cabin' | 'adjustment' | 'waste',
  qty: number,                         // positivo (carico) o negativo (scarico)
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

---

## File da Creare / Modificare

### Nuovi
- `src/app/(app)/warehouse/page.tsx` — lista prodotti con filtri e alert sottoscorta
- `src/app/(app)/warehouse/new/page.tsx` — aggiungi prodotto
- `src/app/(app)/warehouse/[id]/page.tsx` — dettaglio prodotto + storico movimenti
- `src/app/(app)/warehouse/[id]/edit/page.tsx`
- `src/app/(app)/warehouse/load/page.tsx` — carico merce (ricevimento fornitore)
- `src/components/warehouse/ProductForm.tsx`
- `src/components/warehouse/StockMovementList.tsx`
- `src/components/warehouse/LowStockAlert.tsx` — banner alert sottoscorta
- `src/components/warehouse/StockBadge.tsx` — badge rosso/giallo/verde giacenza
- `src/app/api/warehouse/movement/route.ts` — registra movimento
- `src/app/api/warehouse/alerts/route.ts` — lista prodotti in sottoscorta

### Modificati
- `src/app/(app)/appointments/[id]/edit/page.tsx` — sezione "Prodotti usati" con scarico cabina
- `src/components/layout/Sidebar.tsx` — voce "Magazzino"
- `src/app/(app)/stats/page.tsx` — sezione prodotti più venduti

---

## Step di Sviluppo Dettagliati

### Step 8.1 — CRUD Prodotti
- Form: nome, brand, barcode, categoria (select + add custom), fornitore, prezzo acquisto, prezzo vendita, giacenza iniziale, giacenza minima, unità misura
- Lista con: immagine placeholder, nome, brand, giacenza con badge colore (verde ≥ min, giallo ≤ min*2, rosso ≤ min), prezzo
- Filtri: categoria, fornitore, "Solo sottoscorta"

### Step 8.2 — Carico Merce
- Pagina `/warehouse/load`:
  - Seleziona prodotti + quantità ricevuta + prezzo acquisto (aggiorna avg_buy_price)
  - Campo opzionale: numero fattura fornitore
  - Al salvataggio: crea movimento `type = 'load'` per ogni prodotto, aggiorna `stock_qty`

### Step 8.3 — Scarico
- **Vendita** (checkout appuntamento o vendita diretta):
  - Sezione "Prodotti venduti" nella schermata chiusura: aggiunge righe prodotto + quantità
  - Genera movimento `type = 'sale'`
  - Aggiunge importo al totale scontrino
- **Uso in cabina** (prodotti consumati durante il trattamento):
  - Sezione "Prodotti usati in trattamento": stessa UI ma movimento `type = 'use_cabin'`
  - Non aggiunge costo allo scontrino cliente

### Step 8.4 — Alert Sottoscorta
- Banner giallo/rosso in cima alla pagina magazzino se ci sono prodotti in sottoscorta
- Notifica push all'apertura dell'app se ci sono nuovi alert
- Lista "Da Ordinare" con quantità suggerita (es. doppio del `min_stock`)

### Step 8.5 — Dettaglio Prodotto
- Scheda prodotto con: info generali, grafico giacenza nel tempo, storico movimenti
- Confronto prezzi acquisto: `last_buy_price` vs `buy_price` → variazione %
- Chi ha usato/venduto il prodotto (filtro per staff)

---

## Test

| Scenario | Verifica |
|---|---|
| Caricare 10 pz prodotto | `stock_qty = 10`, movimento `load` creato |
| Scaricare 3 pz come vendita | `stock_qty = 7`, movimento `sale` |
| Scaricare 2 pz in cabina | `stock_qty = 5`, movimento `use_cabin` |
| Impostare `min_stock = 6` | Alert sottoscorta visibile con qty = 5 |
| Secondo carico a prezzo diverso | `avg_buy_price` aggiornato correttamente |

---

---

# FASE 9 — Agenda Settimanale + Drag & Drop + Lista d'Attesa

## Idea
Potenziare la visualizzazione dell'agenda con: vista settimanale a colonne (una per operatore), spostamento appuntamenti via drag & drop, vista "cartacea" stampabile, lista d'attesa con notifica automatica quando si libera uno slot.

---

## Dipendenze
- Fase 1 (Staff) — obbligatoria per vista a colonne operatori
- `@hello-pangea/dnd` per drag & drop (fork mantenuto di react-beautiful-dnd)

---

## Struttura Dati — Firestore

### Collection: `waitlist`
```
{
  id: string,
  client_id: string,
  service_id: string,
  staff_id: string | null,             // operatore preferito (null = qualsiasi)
  preferred_date: string | null,       // data preferita (null = prima disponibile)
  preferred_time_from: string | null,  // "09:00"
  preferred_time_to: string | null,    // "12:00"
  status: 'waiting' | 'notified' | 'booked' | 'cancelled',
  notified_at: string | null,
  notification_channel: 'whatsapp' | 'sms' | 'push',
  note: string | null,
  created_at: string
}
```

---

## File da Creare / Modificare

### Nuovi
- `src/components/agenda/WeeklyCalendar.tsx` — griglia settimanale con time slots
- `src/components/agenda/DayColumn.tsx` — colonna singola giornata/operatore
- `src/components/agenda/TimeSlot.tsx` — slot orario con drop target
- `src/components/agenda/DraggableAppointmentCard.tsx` — card draggabile
- `src/components/agenda/CurrentTimeIndicator.tsx` — linea rossa orario corrente
- `src/app/(app)/appointments/print/page.tsx` — vista stampa ottimizzata
- `src/app/(app)/waitlist/page.tsx` — gestione lista d'attesa
- `src/components/waitlist/WaitlistForm.tsx`
- `src/app/api/waitlist/notify/route.ts` — notifica cliente in lista d'attesa
- `src/app/api/cron/waitlist/route.ts` — cron che controlla slot liberi

### Modificati
- `src/app/(app)/dashboard/page.tsx` — aggiungere toggle Giorno / Settimana / Lista
- `src/app/(app)/appointments/page.tsx` — integra vista settimanale

---

## Step di Sviluppo Dettagliati

### Step 9.1 — Toggle Viste
- Header con 3 bottoni: "Giorno" | "Settimana" | "Lista"
- Vista Lista: elenco appuntamenti futuro ordinato per data + ora (tabella)
- Stato della vista persistito in localStorage

### Step 9.2 — Vista Settimanale
- Griglia: asse X = 7 giorni settimana, asse Y = slot orari (es. 08:00–20:00, step 15 min)
- Se staff attivi > 1: colonne duplicate per operatore (es. 3 staff × 7 giorni = 21 colonne, oppure una settimana per operatore con tab)
- Ogni appuntamento: box colorato che occupa gli slot corrispondenti alla durata
- Navigazione settimana: frecce prev/next, bottone "Oggi"
- Linea rossa orario corrente (solo giorno corrente visibile)

### Step 9.3 — Drag & Drop
- Installare: `npm install @hello-pangea/dnd`
- Ogni card appuntamento è un `Draggable`
- Ogni slot orario è un `Droppable`
- Al drop: calcolare nuovo `start_time` e `end_time` dallo slot di destinazione
- Modale conferma: "Sposta appuntamento di Mario Rossi a Martedì 14:00?"
- Se confermato: aggiorna Firestore, aggiorna UI ottimisticamente

### Step 9.4 — Vista Stampa
- Pagina `/appointments/print?date=YYYY-MM-DD`:
  - CSS `@media print`: nasconde nav/sidebar, mostra solo agenda
  - Layout a colonne (una per operatore) o lista se un solo operatore
  - Header con data e nome centro
  - Bottone "Stampa" nella UI normale che apre questa pagina

### Step 9.5 — Lista d'Attesa
- Pagina `/waitlist`: lista richieste con stato (in attesa / notificato / prenotato)
- Form: cerca cliente → seleziona servizio → data preferita (opzionale) → fascia oraria preferita → operatore preferito → canale notifica
- Cron ogni ora: per ogni richiesta `status = 'waiting'`, controlla se esiste uno slot libero compatibile:
  - Se trovato: invia WhatsApp/SMS/Push con il link di prenotazione → aggiorna `status = 'notified'`
- Dashboard: badge con numero richieste in attesa

---

## Test

| Scenario | Verifica |
|---|---|
| Passare a vista settimanale | Tutti gli appuntamenti della settimana visibili |
| Trascinare appuntamento di 2 ore | Occupa 2 slot, salvato su Firestore con nuovi orari |
| Drop su slot già occupato | Impedito (feedback visivo rosso) |
| Aprire vista stampa | Layout pulito senza elementi UI, stampabile |
| Cancellare appuntamento con cliente in lista d'attesa | Notifica automatica inviata |

---

---

# FASE 10 — Scontrino Digitale PDF

## Idea
Generare documento PDF con riepilogo servizi e prodotti al termine di ogni appuntamento. Invio automatico via WhatsApp al cliente. Storico scontrini consultabile. Annullamento con nota di credito. Integrazione opzionale con Agenzia delle Entrate (trasmissione telematica corrispettivi).

---

## Dipendenze
- `@react-pdf/renderer` — generazione PDF lato server
- Firebase Storage — archiviazione PDF
- Fase 5 (SumUp) — metodo di pagamento da includere nello scontrino
- Fase 8 (Magazzino) — prodotti venduti da includere nello scontrino

---

## Struttura Dati — Firestore

### Collection: `receipts`
```
{
  id: string,
  receipt_number: string,              // progressivo "2026-0042"
  appointment_id: string | null,
  client_id: string | null,
  client_name: string,                 // snapshot
  client_fiscal_code: string | null,
  items: [
    {
      type: 'service' | 'product' | 'package' | 'discount',
      description: string,
      qty: number,
      unit_price: number,
      total: number,
      vat_pct: number                  // es. 22
    }
  ],
  subtotal: number,
  discount_total: number,
  vat_total: number,
  total: number,
  payment_method: 'cash' | 'card' | 'sumup' | 'prepaid_card' | 'gift_card' | 'package' | 'mixed',
  payment_details: Record<string, number>,  // es. { cash: 30, sumup: 50 }
  sumup_transaction_id: string | null,
  pdf_url: string | null,              // link Firebase Storage
  sent_via: string[],                  // ['whatsapp', 'sms']
  sent_at: string | null,
  status: 'issued' | 'cancelled',
  cancellation_reason: string | null,
  cancelled_at: string | null,
  credit_note_id: string | null,       // se annullato, riferimento alla nota di credito
  ade_transmitted: boolean,            // trasmesso Agenzia delle Entrate
  ade_transmitted_at: string | null,
  created_at: string
}
```

---

## File da Creare / Modificare

### Nuovi
- `src/lib/pdf/receipt-template.tsx` — template React PDF per scontrino
- `src/lib/pdf/generate-receipt.ts` — funzione: genera PDF, carica su Firebase Storage, restituisce URL
- `src/app/api/receipts/create/route.ts` — crea scontrino (genera PDF + salva su Firestore)
- `src/app/api/receipts/send/route.ts` — invia PDF via WhatsApp/SMS
- `src/app/api/receipts/cancel/route.ts` — annulla scontrino e genera nota di credito
- `src/app/(app)/receipts/page.tsx` — storico scontrini
- `src/app/(app)/receipts/[id]/page.tsx` — dettaglio scontrino con download PDF
- `src/components/receipts/ReceiptPreview.tsx` — anteprima scontrino prima dell'invio
- `src/components/receipts/ReceiptList.tsx`

### Modificati
- `src/app/(app)/appointments/[id]/edit/page.tsx` — bottone "Emetti Scontrino" nella sezione pagamento
- `src/app/(app)/settings/page.tsx` — dati fiscali centro (partita IVA, indirizzo, nome azienda) per il PDF

---

## Step di Sviluppo Dettagliati

### Step 10.1 — Settings Fiscali
- In pagina settings: sezione "Dati Fiscali":
  - Ragione sociale / Nome centro
  - Partita IVA / Codice Fiscale
  - Indirizzo completo
  - Logo (upload immagine)
  - Aliquota IVA default (es. 22%)

### Step 10.2 — Template PDF
- `src/lib/pdf/receipt-template.tsx` con `@react-pdf/renderer`:
  ```
  ┌─────────────────────────────┐
  │  [LOGO]   Nome Centro       │
  │  Via Roma 1 — Frosinone     │
  │  P.IVA 01234567890          │
  ├─────────────────────────────┤
  │  SCONTRINO N. 2026-0042     │
  │  Data: 20/06/2026           │
  │  Cliente: Maria Rossi       │
  ├─────────────────────────────┤
  │  Servizio        1  50,00€  │
  │  Prodotto        2  18,00€  │
  │  Sconto 10%          -6,80€ │
  ├─────────────────────────────┤
  │  IVA 22%            11,19€  │
  │  TOTALE             61,20€  │
  ├─────────────────────────────┤
  │  Pagamento: Carta SumUp     │
  └─────────────────────────────┘
  ```

### Step 10.3 — Generazione e Archiviazione
- `lib/pdf/generate-receipt.ts`:
  1. Renderizza template con dati reali
  2. Converte in Buffer PDF
  3. Carica su Firebase Storage: `receipts/2026/06/2026-0042.pdf`
  4. Genera URL pubblico firmato (30 giorni)
  5. Salva URL su `receipts.pdf_url`

### Step 10.4 — Invio WhatsApp
- `POST /api/receipts/send`:
  - Usa Twilio: invia messaggio WhatsApp con testo + allegato PDF URL
  - Template: "Ciao {{nome}}, ecco il tuo scontrino per il trattamento di oggi. [link PDF]"
  - Aggiorna `receipt.sent_via` e `sent_at`

### Step 10.5 — Storico Scontrini
- Pagina `/receipts`:
  - Lista scontrini con: numero, data, cliente, totale, stato (emesso/annullato), metodo pagamento
  - Filtri: per periodo, per cliente, per stato
  - Totale periodo (somma)
  - Bottone download PDF per ognuno
  - Totale IVA per periodo (utile per dichiarazione)

### Step 10.6 — Annullamento
- Bottone "Annulla Scontrino" → modale con motivo obbligatorio
- Genera nuova `receipt` con `type = 'credit_note'` importo negativo (nota di credito)
- Collega i due documenti tramite `credit_note_id`

### Step 10.7 — ADE (Opzionale, Avanzato)
- Integrazione con provider di trasmissione telematica (es. Fatture in Cloud, Fiscozen)
- API call dopo ogni emissione scontrino → trasmette corrispettivo a ADE
- Campo `ade_transmitted` aggiornato a `true` al successo
- Badge "✓ Trasmesso ADE" nello storico

---

## Test

| Scenario | Verifica |
|---|---|
| Completare appuntamento con 2 servizi + 1 prodotto | PDF generato con righe corrette |
| Apertura PDF | Layout corrisponde al template, logo visibile |
| Invio WhatsApp | Cliente riceve messaggio con link PDF funzionante |
| Annullare scontrino | Nota di credito generata, scontrino mostra "Annullato" |
| Export storico CSV | File con tutti i campi, importi corretti |

---

---

# Dipendenze tra Fasi

```
FASE 1 (Staff)
    └──> FASE 2 (CRM) — scheda cliente mostra staff preferito
    └──> FASE 7 (Stats) — performance per operatore
    └──> FASE 9 (Agenda) — colonne per operatore

FASE 2 (CRM)
    └──> FASE 4 (Fidelity) — punti fedeltà nella scheda
    └──> FASE 6 (Marketing) — segmentazione su dati CRM
    └──> FASE 7 (Stats) — lista inattivi, top clienti

FASE 3 (Pacchetti/Card)
    └──> FASE 5 (SumUp) — pagamento pacchetti con carta
    └──> FASE 10 (Scontrino) — scontrino per vendita pacchetto

FASE 4 (Fidelity)
    └──> FASE 6 (Marketing) — filtro "clienti con X punti"

FASE 5 (SumUp)
    └──> FASE 7 (Stats) — ricavi da SumUp nel report
    └──> FASE 10 (Scontrino) — metodo pagamento sullo scontrino

FASE 6 (Marketing)
    └──> dipende da FASE 2 (dati CRM per segmentazione)

FASE 7 (Stats)
    └──> dipende da FASE 1, 2, 5, 8

FASE 8 (Magazzino)
    └──> FASE 7 (Stats) — prodotti più venduti
    └──> FASE 10 (Scontrino) — righe prodotti nello scontrino

FASE 9 (Agenda)
    └──> dipende da FASE 1 (Staff per colonne)

FASE 10 (Scontrino)
    └──> dipende da FASE 5 (SumUp) e FASE 8 (Magazzino)
```

---

# Ordine di Implementazione Consigliato

```
1 → 2 → 5 → 3 → 4 → 6 → 7 → 9 → 8 → 10
```

Questo ordine rispetta le dipendenze, porta valore incrementale ad ogni fase e permette di usare le funzionalità produttive (pagamenti, pacchetti) prima di quelle puramente analitiche.

---

# Riepilogo Globale

| Fase | Funzionalità | Priorità | Stima |
|---|---|---|---|
| 1 | Gestione Staff | 🔴 Alta | 3–4 gg |
| 2 | CRM Avanzato | 🔴 Alta | 3–4 gg |
| 3 | Pacchetti + Card + Gift Card | 🔴 Alta | 5–6 gg |
| 4 | Fidelity / Punti | 🟡 Media | 2–3 gg |
| 5 | SumUp Pagamenti | 🔴 Alta | 2–3 gg |
| 6 | Marketing Automation | 🟡 Media | 4–5 gg |
| 7 | Statistiche & Report | 🟡 Media | 4–5 gg |
| 8 | Magazzino | 🟢 Bassa | 3–4 gg |
| 9 | Agenda Settimanale + DnD | 🟡 Media | 4–5 gg |
| 10 | Scontrino Digitale PDF | 🟢 Bassa | 3–4 gg |
| **TOT** | | | **33–47 gg** |

---

*Piano redatto il 20/06/2026 — da aggiornare ad ogni fase completata.*
