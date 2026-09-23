export default function QRScanLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#fdfcfa] p-8 text-center">
      <div className="text-5xl mb-6">🤰</div>
      <h1 className="text-2xl font-bold text-[#8a3c4a] font-serif mb-3">Maatru Setu</h1>

      <div className="bg-rose-50 rounded-2xl p-6 max-w-sm w-full shadow-sm border border-rose-100">
        <p className="text-slate-700 text-base leading-relaxed mb-4">
          Please scan the <strong>QR code sticker</strong> on your paper ANC file to access your health records.
        </p>
        <p className="text-sm text-slate-500 italic">
          Your doctor or nurse can print a new sticker for you if needed.
        </p>
      </div>

      <p className="mt-8 text-xs text-slate-400 italic">
        "Your care, in your hands." ❤
      </p>
    </div>
  )
}
