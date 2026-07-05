import { NextResponse } from 'next/server'
import { seedSkills, resyncSkillsFromSeed } from '@/lib/skills/seed'
import { listSkills, listSkillFiles, SKILL_SLUG } from '@/lib/skills/store'

export const runtime = 'nodejs'

/**
 * Dev helper: import seed/skills/* into the DB, then report state.
 * - default: idempotent insert (only brand-new skills).
 * - `?resync=1`: overwrite the stored skill files from the repo seed (versioned),
 *   to push edits to seed/skills/* into an already-seeded DB.
 */
export async function POST(req: Request) {
  try {
    const resync = new URL(req.url).searchParams.get('resync') === '1'
    const imported = resync ? await resyncSkillsFromSeed() : await seedSkills()
    const skills = await listSkills()
    const files = skills.length ? await listSkillFiles(SKILL_SLUG) : []
    return NextResponse.json({
      ok: true,
      mode: resync ? 'resync' : 'insert',
      imported,
      skills: skills.map((s) => ({ slug: s.slug, name: s.name })),
      files: files.map((f) => ({ path: f.path, version: f.version })),
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

export async function GET(req: Request) {
  return POST(req)
}
