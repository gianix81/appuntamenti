export const dynamic = 'force-dynamic'

import { ServiceForm } from '@/components/services/ServiceForm'

export default function NewServicePage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Nuovo Servizio</h1>
        <p className="text-slate-400 text-sm">Aggiungi un nuovo trattamento o servizio</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6">
        <ServiceForm />
      </div>
    </div>
  )
}
