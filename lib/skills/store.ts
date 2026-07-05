import JSZip from 'jszip'
import { supabaseService } from '@/lib/supabase/service'

/**
 * CRUD + versioning for the skill stored in Supabase (single-tenant — one global
 * skill set, no account scoping). This is the only module that mutates skill
 * content; the agent reaches it through tools.
 *
 * Self-edit rule (per the skill's own improvement loop): appends are applied
 * immediately; overwrites of existing, non-empty content become a pending
 * proposal that a human approves in the UI. Every applied change is recorded as
 * an immutable version row for audit + rollback.
 */

/** The bundled Miraside cold-DM skill. There is only one skill in this app. */
export const SKILL_SLUG = 'linkedin-cold-dms'

export interface SkillRow {
  id: string
  slug: string
  name: string
  description: string
}

export interface SkillFileRow {
  id: string
  skill_id: string
  path: string
  content: string
  version: number
  updated_at: string
}

export interface ProposalRow {
  id: string
  skill_id: string
  path: string
  proposed_content: string
  base_version: number | null
  rationale: string
  status: string
  created_at: string
  resolved_at: string | null
}

export interface VersionRow {
  id: string
  skill_file_id: string
  content: string
  version: number
  change_type: string
  author: string
  created_at: string
}

// ── reads ────────────────────────────────────────────────────────────────────

export async function listSkills(): Promise<SkillRow[]> {
  const { data, error } = await supabaseService()
    .from('outbound_skills')
    .select('id, slug, name, description')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`listSkills failed: ${error.message}`)
  return (data ?? []) as SkillRow[]
}

async function getSkillBySlug(slug: string): Promise<SkillRow> {
  const { data, error } = await supabaseService()
    .from('outbound_skills')
    .select('id, slug, name, description')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`getSkill failed: ${error.message}`)
  if (!data) throw new Error(`skill not found: ${slug}`)
  return data as SkillRow
}

export async function listSkillFiles(slug: string): Promise<SkillFileRow[]> {
  const skill = await getSkillBySlug(slug)
  const { data, error } = await supabaseService()
    .from('outbound_skill_files')
    .select('id, skill_id, path, content, version, updated_at')
    .eq('skill_id', skill.id)
    .order('path', { ascending: true })
  if (error) throw new Error(`listSkillFiles failed: ${error.message}`)
  return (data ?? []) as SkillFileRow[]
}

/** SKILL.md content + the list of reference paths (for progressive disclosure). */
export async function readSkill(slug: string) {
  const skill = await getSkillBySlug(slug)
  const files = await listSkillFiles(slug)
  const skillMd = files.find((f) => f.path === 'SKILL.md')
  return {
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    skill_md: skillMd?.content ?? '',
    files: files.map((f) => f.path),
  }
}

async function getFile(
  slug: string,
  filePath: string,
): Promise<SkillFileRow | null> {
  const skill = await getSkillBySlug(slug)
  const { data, error } = await supabaseService()
    .from('outbound_skill_files')
    .select('id, skill_id, path, content, version, updated_at')
    .eq('skill_id', skill.id)
    .eq('path', filePath)
    .maybeSingle()
  if (error) throw new Error(`getFile failed: ${error.message}`)
  return (data as SkillFileRow | null) ?? null
}

export async function readSkillFile(
  slug: string,
  filePath: string,
): Promise<string> {
  const file = await getFile(slug, filePath)
  if (!file) throw new Error(`file not found: ${slug}/${filePath}`)
  return file.content
}

/**
 * Load the whole skill (SKILL.md + every reference) as one prompt-ready string.
 * The batch research/draft calls inject this directly (the skill is small enough)
 * rather than tool-calling for progressive disclosure on a deterministic job.
 */
export async function loadSkillBundle(slug: string = SKILL_SLUG): Promise<{
  version: number
  text: string
}> {
  const files = await listSkillFiles(slug)
  const ordered = [
    ...files.filter((f) => f.path === 'SKILL.md'),
    ...files.filter((f) => f.path !== 'SKILL.md'),
  ]
  const version = files.reduce((max, f) => Math.max(max, f.version), 1)
  const text = ordered
    .map((f) => `===== ${f.path} =====\n${f.content.trim()}`)
    .join('\n\n')
  return { version, text }
}

// ── version recording ──────────────────────────────────────────────────────────

async function recordVersion(
  file: { id: string; content: string; version: number },
  changeType: 'append' | 'overwrite' | 'create' | 'rollback',
  author: 'agent' | 'user',
): Promise<void> {
  const { error } = await supabaseService()
    .from('outbound_skill_file_versions')
    .insert({
      skill_file_id: file.id,
      content: file.content,
      version: file.version,
      change_type: changeType,
      author,
    })
  if (error) throw new Error(`recordVersion failed: ${error.message}`)
}

// ── writes ────────────────────────────────────────────────────────────────────

/**
 * Append to a reference file (the skill's own "add, don't overwrite" rule —
 * applied immediately). Creates the file if it doesn't exist yet.
 */
export async function appendSkillFile(
  slug: string,
  filePath: string,
  content: string,
  author: 'agent' | 'user' = 'agent',
): Promise<{ applied: true; path: string; version: number }> {
  const skill = await getSkillBySlug(slug)
  const existing = await getFile(slug, filePath)
  const svc = supabaseService()

  if (!existing) {
    const { data, error } = await svc
      .from('outbound_skill_files')
      .insert({ skill_id: skill.id, path: filePath, content, version: 1 })
      .select('id, content, version')
      .single()
    if (error || !data) {
      throw new Error(`appendSkillFile create failed: ${error?.message ?? 'no data'}`)
    }
    await recordVersion(data as SkillFileRow, 'create', author)
    return { applied: true, path: filePath, version: 1 }
  }

  const merged = `${existing.content.replace(/\s*$/, '')}\n\n${content.trim()}\n`
  const nextVersion = existing.version + 1
  const { error } = await svc
    .from('outbound_skill_files')
    .update({ content: merged, version: nextVersion, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
  if (error) throw new Error(`appendSkillFile update failed: ${error.message}`)
  await recordVersion({ id: existing.id, content: merged, version: nextVersion }, 'append', author)
  return { applied: true, path: filePath, version: nextVersion }
}

/** Create a brand-new reference file (new content). Errors if the path exists. */
export async function createSkillFile(
  slug: string,
  filePath: string,
  content: string,
  author: 'agent' | 'user' = 'agent',
): Promise<{ applied: true; path: string }> {
  const existing = await getFile(slug, filePath)
  if (existing) throw new Error(`file already exists: ${slug}/${filePath}`)
  const skill = await getSkillBySlug(slug)
  const { data, error } = await supabaseService()
    .from('outbound_skill_files')
    .insert({ skill_id: skill.id, path: filePath, content, version: 1 })
    .select('id, content, version')
    .single()
  if (error || !data) {
    throw new Error(`createSkillFile failed: ${error?.message ?? 'no data'}`)
  }
  await recordVersion(data as SkillFileRow, 'create', author)
  return { applied: true, path: filePath }
}

/**
 * Directly overwrite a file's full content — for DELIBERATE human edits from the
 * UI. Applies immediately; still records a version. Creates if absent.
 */
export async function writeSkillFile(
  slug: string,
  filePath: string,
  content: string,
  author: 'agent' | 'user' = 'user',
): Promise<{ applied: true; path: string; version: number }> {
  const existing = await getFile(slug, filePath)
  if (!existing) {
    const res = await createSkillFile(slug, filePath, content, author)
    return { ...res, version: 1 }
  }
  const nextVersion = existing.version + 1
  const { error } = await supabaseService()
    .from('outbound_skill_files')
    .update({ content, version: nextVersion, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
  if (error) throw new Error(`writeSkillFile failed: ${error.message}`)
  await recordVersion({ id: existing.id, content, version: nextVersion }, 'overwrite', author)
  return { applied: true, path: filePath, version: nextVersion }
}

export async function createSkill(
  slug: string,
  name: string,
  description: string,
): Promise<{ applied: true; slug: string }> {
  const { error } = await supabaseService()
    .from('outbound_skills')
    .insert({ slug, name, description })
  if (error) throw new Error(`createSkill failed: ${error.message}`)
  return { applied: true, slug }
}

/**
 * Overwrite request. If the target file exists with non-empty content, this does
 * NOT write — it records a pending proposal for human approval. If the file is
 * new/empty, it writes directly (nothing destroyed).
 */
export async function proposeOverwrite(
  slug: string,
  filePath: string,
  content: string,
  rationale: string,
): Promise<
  | { applied: true; path: string }
  | { proposed: true; proposalId: string; path: string }
> {
  const skill = await getSkillBySlug(slug)
  const existing = await getFile(slug, filePath)

  if (!existing || existing.content.trim() === '') {
    if (!existing) {
      await createSkillFile(slug, filePath, content)
    } else {
      const nextVersion = existing.version + 1
      const { error } = await supabaseService()
        .from('outbound_skill_files')
        .update({ content, version: nextVersion, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) throw new Error(`proposeOverwrite apply failed: ${error.message}`)
      await recordVersion({ id: existing.id, content, version: nextVersion }, 'overwrite', 'agent')
    }
    return { applied: true, path: filePath }
  }

  const { data, error } = await supabaseService()
    .from('outbound_skill_edit_proposals')
    .insert({
      skill_id: skill.id,
      path: filePath,
      proposed_content: content,
      base_version: existing.version,
      rationale,
      status: 'pending',
    })
    .select('id')
    .single()
  if (error || !data) {
    throw new Error(`proposeOverwrite failed: ${error?.message ?? 'no data'}`)
  }
  return { proposed: true, proposalId: data.id as string, path: filePath }
}

// ── proposals ─────────────────────────────────────────────────────────────────

export async function listProposals(status = 'pending'): Promise<ProposalRow[]> {
  const { data, error } = await supabaseService()
    .from('outbound_skill_edit_proposals')
    .select('id, skill_id, path, proposed_content, base_version, rationale, status, created_at, resolved_at')
    .eq('status', status)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listProposals failed: ${error.message}`)
  return (data ?? []) as ProposalRow[]
}

async function getProposal(proposalId: string): Promise<ProposalRow | null> {
  const { data, error } = await supabaseService()
    .from('outbound_skill_edit_proposals')
    .select('id, skill_id, path, proposed_content, base_version, rationale, status, created_at, resolved_at')
    .eq('id', proposalId)
    .maybeSingle()
  if (error) throw new Error(`getProposal failed: ${error.message}`)
  return (data as ProposalRow | null) ?? null
}

/** Apply a pending proposal: overwrite (or create) the file, version it, mark approved. */
export async function approveProposal(proposalId: string): Promise<void> {
  const proposal = await getProposal(proposalId)
  if (!proposal) throw new Error('proposal not found')
  if (proposal.status !== 'pending') throw new Error('proposal already resolved')

  const svc = supabaseService()
  const { data: skill, error: sErr } = await svc
    .from('outbound_skills')
    .select('slug')
    .eq('id', proposal.skill_id)
    .single()
  if (sErr || !skill) throw new Error(`approveProposal skill lookup failed: ${sErr?.message}`)

  const existing = await getFile(skill.slug as string, proposal.path)
  if (existing) {
    const nextVersion = existing.version + 1
    const { error: uErr } = await svc
      .from('outbound_skill_files')
      .update({
        content: proposal.proposed_content,
        version: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (uErr) throw new Error(`approveProposal update failed: ${uErr.message}`)
    await recordVersion(
      { id: existing.id, content: proposal.proposed_content, version: nextVersion },
      'overwrite',
      'agent',
    )
  } else {
    await createSkillFile(skill.slug as string, proposal.path, proposal.proposed_content)
  }

  const { error: pErr } = await svc
    .from('outbound_skill_edit_proposals')
    .update({ status: 'approved', resolved_at: new Date().toISOString() })
    .eq('id', proposalId)
  if (pErr) throw new Error(`approveProposal resolve failed: ${pErr.message}`)
}

export async function rejectProposal(proposalId: string): Promise<void> {
  const { error } = await supabaseService()
    .from('outbound_skill_edit_proposals')
    .update({ status: 'rejected', resolved_at: new Date().toISOString() })
    .eq('id', proposalId)
    .eq('status', 'pending')
  if (error) throw new Error(`rejectProposal failed: ${error.message}`)
}

// ── version history + rollback ──────────────────────────────────────────────────

export async function listFileVersions(skillFileId: string): Promise<VersionRow[]> {
  const { data, error } = await supabaseService()
    .from('outbound_skill_file_versions')
    .select('id, skill_file_id, content, version, change_type, author, created_at')
    .eq('skill_file_id', skillFileId)
    .order('version', { ascending: false })
  if (error) throw new Error(`listFileVersions failed: ${error.message}`)
  return (data ?? []) as VersionRow[]
}

/** Roll a file back to the content captured in a prior version row. */
export async function rollbackToVersion(versionId: string): Promise<void> {
  const svc = supabaseService()
  const { data: ver, error: vErr } = await svc
    .from('outbound_skill_file_versions')
    .select('skill_file_id, content')
    .eq('id', versionId)
    .single()
  if (vErr || !ver) throw new Error(`rollback version lookup failed: ${vErr?.message}`)

  const { data: file, error: fErr } = await svc
    .from('outbound_skill_files')
    .select('id, version')
    .eq('id', ver.skill_file_id as string)
    .single()
  if (fErr || !file) throw new Error(`rollback file lookup failed: ${fErr?.message}`)

  const nextVersion = (file.version as number) + 1
  const { error: uErr } = await svc
    .from('outbound_skill_files')
    .update({
      content: ver.content as string,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', file.id)
  if (uErr) throw new Error(`rollback update failed: ${uErr.message}`)
  await recordVersion(
    { id: file.id as string, content: ver.content as string, version: nextVersion },
    'rollback',
    'user',
  )
}

// ── export ───────────────────────────────────────────────────────────────────────

/** Re-pack the skill's current files into a `.skill` (zip) buffer for download. */
export async function exportSkillToZip(slug: string): Promise<Uint8Array> {
  const files = await listSkillFiles(slug)
  const zip = new JSZip()
  const root = zip.folder(slug)!
  for (const f of files) root.file(f.path, f.content)
  return zip.generateAsync({ type: 'uint8array' })
}
