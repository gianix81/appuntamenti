export const dynamic = 'force-dynamic'

import { ServiceForm } from '@/components/services/ServiceForm'

export default function NewServicePage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">Nuovo Servizio</h1>
        <p className="text-gray-400 text-sm">Aggiungi un nuovo trattamento o servizio</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <ServiceForm />
      </div>
    </div>
  )
}
