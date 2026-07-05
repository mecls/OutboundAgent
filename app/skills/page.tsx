import Link from 'next/link'
import { TopNav } from '@/components/app/top-nav'
import { SkillFileEditor } from '@/components/app/skill-file-editor'
import { listSkills, listSkillFiles, listProposals, SKILL_SLUG } from '@/lib/skills/store'
import { approveProposalAction, rejectProposalAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function SkillsPage() {
  const skills = await listSkills()
  const seeded = skills.some((s) => s.slug === SKILL_SLUG)
  const files = seeded ? await listSkillFiles(SKILL_SLUG) : []
  const proposals = seeded ? await listProposals('pending') : []

  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <h1 className="font-[var(--font-serif-italic)] text-2xl italic">Skill</h1>
        <p className="mt-1 text-sm text-black/60">
          The <span className="font-mono">{SKILL_SLUG}</span> skill the agent follows when
          drafting cold DMs. Edits here are the source of truth; the agent appends winners and
          proposes overwrites that you approve below.
        </p>

        {!seeded ? (
          <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
            No skill in the database yet. Seed it:{' '}
            <code className="rounded bg-black/5 px-1.5 py-0.5">POST /api/dev/seed</code>
            <form action="/api/dev/seed" method="post" className="mt-3">
              <button
                type="submit"
                className="cta-shadow rounded-lg bg-[var(--brand-accent)] px-4 py-1.5 text-sm font-medium text-white"
              >
                Seed now
              </button>
            </form>
          </div>
        ) : (
          <>
            {proposals.length > 0 ? (
              <section className="mt-6">
                <h2 className="text-sm font-semibold text-black/70">
                  Pending overwrite proposals ({proposals.length})
                </h2>
                <div className="mt-2 space-y-3">
                  {proposals.map((p) => (
                    <div key={p.id} className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm">{p.path}</span>
                        <span className="text-xs text-black/40">
                          base v{p.base_version ?? '—'}
                        </span>
                      </div>
                      {p.rationale ? (
                        <p className="mt-1 text-sm text-black/70">{p.rationale}</p>
                      ) : null}
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-xs">
                        {p.proposed_content.slice(0, 1200)}
                      </pre>
                      <div className="mt-2 flex gap-2">
                        <form action={approveProposalAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="rounded-lg bg-green-700 px-3 py-1 text-sm text-white">
                            Approve
                          </button>
                        </form>
                        <form action={rejectProposalAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="rounded-lg border border-black/15 px-3 py-1 text-sm">
                            Reject
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-6 space-y-3">
              {files.map((f) => (
                <SkillFileEditor
                  key={f.id}
                  path={f.path}
                  content={f.content}
                  version={f.version}
                />
              ))}
            </section>

            <p className="mt-6 text-xs text-black/40">
              <Link href="/api/skills/export" className="underline">
                Export skill as .skill (zip)
              </Link>
            </p>
          </>
        )}
      </main>
    </>
  )
}
