type SearchParams = Promise<{ next?: string; error?: string }>

export default async function GatePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { next = '/', error } = await searchParams
  return (
    <main className="flex min-h-[100dvh] items-center justify-center p-6">
      <form
        action="/api/gate"
        method="post"
        className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
      >
        <h1 className="font-[var(--font-serif-italic)] text-2xl italic">
          Miraside Outbound
        </h1>
        <p className="mt-1 text-sm text-black/60">Enter the access password.</p>
        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="password"
          autoFocus
          placeholder="Password"
          className="mt-4 w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[var(--brand-accent)]"
        />
        {error ? (
          <p className="mt-2 text-sm text-red-600">Incorrect password.</p>
        ) : null}
        <button
          type="submit"
          className="cta-shadow mt-4 w-full rounded-lg bg-[var(--brand-accent)] px-3 py-2 text-sm font-medium text-white"
        >
          Enter
        </button>
      </form>
    </main>
  )
}
