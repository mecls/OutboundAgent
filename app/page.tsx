import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <header>
        <h1 className="font-[var(--font-serif-italic)] text-3xl italic">
          Miraside Outbound
        </h1>
        <p className="mt-1 text-sm text-black/60">
          Upload CRM leads → auto-research each lead&apos;s website + LinkedIn →
          draft personalized cold DMs that follow the linkedin-cold-dms skill.
        </p>
      </header>
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/batches"
          className="rounded-lg border border-black/10 bg-white px-4 py-2 hover:border-[var(--brand-accent)]"
        >
          Batches
        </Link>
        <Link
          href="/skills"
          className="rounded-lg border border-black/10 bg-white px-4 py-2 hover:border-[var(--brand-accent)]"
        >
          Skill
        </Link>
        <Link
          href="/settings"
          className="rounded-lg border border-black/10 bg-white px-4 py-2 hover:border-[var(--brand-accent)]"
        >
          Settings
        </Link>
      </nav>
      <p className="text-xs text-black/40">Scaffold ready — pipeline wiring in progress.</p>
    </main>
  )
}
