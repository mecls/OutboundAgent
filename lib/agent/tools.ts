import type OpenAI from 'openai'
import {
  readSkill,
  readSkillFile,
  appendSkillFile,
  proposeOverwrite,
  SKILL_SLUG,
} from '@/lib/skills/store'
import { getSequenceByLead, updateSequence } from '@/lib/db/sequences'
import { regenerateSequence } from '@/lib/pipeline/regenerate'
import { buildDeliverable } from '@/lib/pipeline/deliverable'

export interface ToolContext {
  leadId: string
}

export interface ToolResult {
  result: string
  sequenceChanged?: boolean
  skillChanged?: boolean
}

export const REFINE_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_skill',
      description: 'Open the linkedin-cold-dms skill: returns SKILL.md and the list of reference files.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_skill_file',
      description: 'Read one skill reference file (e.g. references/dm-sequences.md).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_sequence',
      description: "Read the lead's current outreach (the message + follow-ups + competitors + any deliverable).",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'regenerate_sequence',
      description:
        'Re-run the outreach from scratch: re-find the two competitors (geo-scoped) and re-compose the message + follow-ups. Use when the competitors look wrong.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_sequence',
      description: 'Apply targeted edits to the message fields (keeps the rest). Use for small tweaks.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: ['string', 'null'] },
          follow_up_1: { type: ['string', 'null'] },
          follow_up_2: { type: ['string', 'null'] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'build_deliverable',
      description:
        'Build the deliverable (the finished chosen assistant for this prospect) — used after they reply positively. Returns the deliverable.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'append_skill_file',
      description:
        "Append a durable lesson/winning angle to a skill reference (the improvement loop — applies immediately). Append, don't overwrite.",
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'e.g. references/dm-sequences.md' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_skill_overwrite',
      description:
        'Propose overwriting existing skill content (becomes a pending proposal a human approves). Use only for corrections, not additions.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          rationale: { type: 'string' },
        },
        required: ['path', 'content', 'rationale'],
        additionalProperties: false,
      },
    },
  },
]

function parse(args: string): Record<string, unknown> {
  try {
    return JSON.parse(args || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function dispatchTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  const args = parse(rawArgs)
  try {
    switch (name) {
      case 'read_skill': {
        const s = await readSkill(SKILL_SLUG)
        return { result: JSON.stringify({ skill_md: s.skill_md, files: s.files }) }
      }
      case 'read_skill_file': {
        const content = await readSkillFile(SKILL_SLUG, String(args.path))
        return { result: content.slice(0, 6000) }
      }
      case 'get_current_sequence': {
        const seq = await getSequenceByLead(ctx.leadId)
        return { result: JSON.stringify(seq ?? { error: 'no sequence yet' }) }
      }
      case 'regenerate_sequence': {
        const composed = await regenerateSequence(ctx.leadId)
        return { result: JSON.stringify(composed), sequenceChanged: true }
      }
      case 'update_sequence': {
        const patch: Record<string, string | null> = {}
        for (const k of ['message', 'follow_up_1', 'follow_up_2'] as const) {
          if (k in args) patch[k] = args[k] == null ? null : String(args[k])
        }
        await updateSequence(ctx.leadId, { ...patch, status: 'edited' })
        return { result: JSON.stringify({ updated: Object.keys(patch) }), sequenceChanged: true }
      }
      case 'build_deliverable': {
        const d = await buildDeliverable(ctx.leadId)
        return { result: JSON.stringify(d), sequenceChanged: true }
      }
      case 'append_skill_file': {
        const res = await appendSkillFile(SKILL_SLUG, String(args.path), String(args.content), 'agent')
        return { result: JSON.stringify(res), skillChanged: true }
      }
      case 'propose_skill_overwrite': {
        const res = await proposeOverwrite(
          SKILL_SLUG,
          String(args.path),
          String(args.content),
          String(args.rationale ?? ''),
        )
        return { result: JSON.stringify(res), skillChanged: true }
      }
      default:
        return { result: `unknown tool: ${name}` }
    }
  } catch (err) {
    return { result: `error: ${err instanceof Error ? err.message : String(err)}` }
  }
}
