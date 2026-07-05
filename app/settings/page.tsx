import { TopNav } from '@/components/app/top-nav'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-black/5 py-2 text-sm last:border-0">
      <span className="text-black/60">{label}</span>
      <span className="font-mono text-xs text-black/80">{value}</span>
    </div>
  )
}

export default function SettingsPage() {
  const apify = process.env.APIFY_TOKEN ? 'configured' : 'missing'
  const llm = process.env.LLM_API_KEY ? 'configured' : 'missing'
  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-2xl flex-1 p-6">
        <h1 className="font-[var(--font-serif-italic)] text-2xl italic">Settings</h1>
        <div className="mt-4 rounded-xl border border-black/10 bg-white p-4">
          <Row label="LLM endpoint" value={process.env.LLM_BASE_URL ?? '—'} />
          <Row label="LLM key" value={llm} />
          <Row label="Apify token" value={apify} />
          <Row label="LinkedIn profile actor" value={env.apifyProfileActor()} />
          <Row label="Batch cap" value={String(env.batchCap())} />
          <Row label="Access gate" value={env.accessPassword() ? 'on' : 'off'} />
        </div>
        <p className="mt-4 text-xs text-black/40">
          Sender profile + ICP overrides land here in a later pass.
        </p>
      </main>
    </>
  )
}
