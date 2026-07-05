import { promises as fs } from 'node:fs'
import path from 'node:path'
import { supabaseService } from '@/lib/supabase/service'
import { writeSkillFile } from '@/lib/skills/store'

/**
 * Canonical seed source: the unzipped `.skill` bundle committed under seed/skills/.
 * On first run we import these into the DB (outbound_skills / outbound_skill_files);
 * from then on the agent reads/edits the DB copy, so self-improvement persists and
 * the repo copy stays a clean seed. Single-tenant → no account scoping.
 */
const SEED_ROOT = path.join(process.cwd(), 'seed', 'skills')

interface ParsedFrontmatter {
  name: string
  description: string
}

/** Minimal YAML-frontmatter reader for `name:` and `description:` (single-line). */
function parseFrontmatter(md: string, fallbackName: string): ParsedFrontmatter {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/)
  let name = fallbackName
  let description = ''
  if (m) {
    const block = m[1]
    const nameM = block.match(/^name:\s*(.+)$/m)
    const descM = block.match(/^description:\s*(.+)$/m)
    if (nameM) name = nameM[1].trim()
    if (descM) description = descM[1].trim()
  }
  return { name, description }
}

/** Recursively collect file paths under `dir`, returned relative to `dir`. */
async function walk(dir: string, base = dir): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walk(full, base)))
    } else if (entry.isFile()) {
      out.push(path.relative(base, full))
    }
  }
  return out
}

/**
 * Idempotently seed every skill under seed/skills/ into the DB. Skips any skill
 * whose slug already exists, so it's safe to call repeatedly. Returns the slugs
 * that were newly imported.
 */
export async function seedSkills(): Promise<string[]> {
  const svc = supabaseService()
  const imported: string[] = []

  let skillDirs: string[]
  try {
    const entries = await fs.readdir(SEED_ROOT, { withFileTypes: true })
    skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return imported
  }

  for (const slug of skillDirs) {
    const { data: existing, error: existErr } = await svc
      .from('outbound_skills')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (existErr) throw new Error(`seed lookup failed: ${existErr.message}`)
    if (existing) continue

    const skillDir = path.join(SEED_ROOT, slug)
    const relPaths = (await walk(skillDir)).map((p) => p.split(path.sep).join('/'))

    const skillMd = relPaths.includes('SKILL.md')
      ? await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8')
      : ''
    const { name, description } = parseFrontmatter(skillMd, slug)

    const { data: skill, error: skillErr } = await svc
      .from('outbound_skills')
      .insert({ slug, name, description })
      .select('id')
      .single()
    if (skillErr || !skill) {
      throw new Error(`seed skill insert failed: ${skillErr?.message ?? 'no data'}`)
    }
    const skillId = skill.id as string

    const fileRows = await Promise.all(
      relPaths.map(async (rel) => ({
        skill_id: skillId,
        path: rel,
        content: await fs.readFile(path.join(skillDir, rel), 'utf8'),
        version: 1,
      })),
    )

    const { error: filesErr } = await svc
      .from('outbound_skill_files')
      .insert(fileRows)
    if (filesErr) throw new Error(`seed files insert failed: ${filesErr.message}`)
    imported.push(slug)
  }

  return imported
}

/**
 * Re-sync every seed file into the DB, overwriting the stored copy with the
 * current repo seed (each overwrite is versioned, so it's rollback-able on
 * /skills). Use this after editing seed/skills/* to push the changes into an
 * already-seeded DB — seedSkills() alone only inserts brand-new skills. Returns
 * the files written per skill.
 */
export async function resyncSkillsFromSeed(): Promise<
  { slug: string; files: string[] }[]
> {
  // Insert any brand-new skills first so writeSkillFile has a skill row to target.
  await seedSkills()

  let skillDirs: string[]
  try {
    const entries = await fs.readdir(SEED_ROOT, { withFileTypes: true })
    skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }

  const out: { slug: string; files: string[] }[] = []
  for (const slug of skillDirs) {
    const skillDir = path.join(SEED_ROOT, slug)
    const relPaths = (await walk(skillDir)).map((p) => p.split(path.sep).join('/'))
    const written: string[] = []
    for (const rel of relPaths) {
      const content = await fs.readFile(path.join(skillDir, rel), 'utf8')
      await writeSkillFile(slug, rel, content, 'user')
      written.push(rel)
    }
    out.push({ slug, files: written })
  }
  return out
}
