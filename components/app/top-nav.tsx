import Link from 'next/link'

const LINKS = [
  { href: '/batches', label: 'Batches' },
  { href: '/skills', label: 'Skill' },
  { href: '/settings', label: 'Settings' },
]

export function TopNav() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-black/10 bg-[var(--background)]/85 px-6 py-3 backdrop-blur">
      <Link href="/" className="font-[var(--font-serif-italic)] text-lg italic">
        Miraside Outbound
      </Link>
      <nav className="flex gap-1 text-sm">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-md px-3 py-1.5 text-black/70 hover:bg-black/5 hover:text-black"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
