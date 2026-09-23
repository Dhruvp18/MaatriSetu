import { BottomNav } from './bottom-nav'

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-[100dvh] bg-[#fdfcfa] font-sans max-w-md mx-auto">
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
