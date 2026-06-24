import { StaffForm } from '@/components/staff/StaffForm'

export default function NewStaffPage() {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-xl font-bold text-slate-800 mb-6">Nuova operatrice</h1>
      <StaffForm />
    </div>
  )
}
