import { StaffForm } from '@/components/staff/StaffForm'

export default function NewStaffPage() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 md:p-5 max-w-3xl mx-auto w-full">
      <h1 className="text-lg font-bold text-slate-800 mb-3 shrink-0">Nuova operatrice</h1>
      <div className="flex-1 min-h-0 flex flex-col">
        <StaffForm />
      </div>
    </div>
  )
}
