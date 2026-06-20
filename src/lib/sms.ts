// Utilità SMS native (nessun servizio esterno — apre l'app Messaggi del telefono)

export function buildSmsUrl(phone: string, body: string): string {
  const clean = phone.replace(/[^\d+]/g, '')
  return `sms:${clean}?body=${encodeURIComponent(body)}`
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

function buildQuando(intervalMinutes: number): string {
  if (intervalMinutes >= 2880) { const d = Math.round(intervalMinutes / 1440); return `tra ${d} ${d === 1 ? 'giorno' : 'giorni'}` }
  if (intervalMinutes >= 1440) return 'domani'
  if (intervalMinutes >= 60)   { const h = Math.round(intervalMinutes / 60); return `tra ${h} ${h === 1 ? 'ora' : 'ore'}` }
  return `tra ${intervalMinutes} minuti`
}

export function buildSmsBody(
  type: 'confirmation' | 'reminder',
  params: {
    firstName: string
    lastName: string
    serviceName: string
    startTime: string
    centerName: string
    intervalMinutes?: number
  },
  templates?: { confirmation?: string; reminder?: string },
): string {
  const time    = new Date(params.startTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const data    = new Date(params.startTime).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  const quando  = params.intervalMinutes !== undefined ? buildQuando(params.intervalMinutes) : ''

  const vars: Record<string, string> = {
    nome:     params.firstName,
    cognome:  params.lastName,
    servizio: params.serviceName,
    ora:      time,
    data,
    centro:   params.centerName || 'il centro',
    quando,
  }

  if (type === 'confirmation') {
    const tmpl = templates?.confirmation
      || 'Ciao {nome}! Abbiamo fissato il tuo appuntamento per {servizio} il {data} alle {ora} presso {centro}. Rispondi SI per confermare o NO per annullare.'
    return applyTemplate(tmpl, vars)
  }
  const tmpl = templates?.reminder
    || 'Ciao {nome}! Ti ricordiamo il tuo appuntamento per {servizio} {quando} alle {ora} presso {centro}. Per annullare rispondi NO.'
  return applyTemplate(tmpl, vars)
}
