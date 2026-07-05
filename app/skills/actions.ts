'use server'

import { revalidatePath } from 'next/cache'
import {
  writeSkillFile,
  approveProposal,
  rejectProposal,
  rollbackToVersion,
  SKILL_SLUG,
} from '@/lib/skills/store'

export async function saveSkillFileAction(formData: FormData) {
  const path = String(formData.get('path') ?? '')
  const content = String(formData.get('content') ?? '')
  if (!path) throw new Error('missing path')
  await writeSkillFile(SKILL_SLUG, path, content, 'user')
  revalidatePath('/skills')
}

export async function approveProposalAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('missing id')
  await approveProposal(id)
  revalidatePath('/skills')
}

export async function rejectProposalAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('missing id')
  await rejectProposal(id)
  revalidatePath('/skills')
}

export async function rollbackAction(formData: FormData) {
  const versionId = String(formData.get('versionId') ?? '')
  if (!versionId) throw new Error('missing versionId')
  await rollbackToVersion(versionId)
  revalidatePath('/skills')
}
