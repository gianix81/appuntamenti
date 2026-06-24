export const dynamic = 'force-dynamic'

import { ClientForm } from '@/components/clients/ClientForm'

export default function NewClientPage() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Nuovo Cliente</h1>
        <p className="text-slate-400 text-sm">Inserisci i dati della cliente</p>
      </div>
      <ClientForm />
    </div>
  )
}
