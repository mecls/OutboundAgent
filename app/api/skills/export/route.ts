import { exportSkillToZip, SKILL_SLUG } from '@/lib/skills/store'

export const runtime = 'nodejs'

/** Download the current skill (DB copy) re-packed as a `.skill` zip. */
export async function GET() {
  const bytes = await exportSkillToZip(SKILL_SLUG)
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${SKILL_SLUG}.skill"`,
    },
  })
}
