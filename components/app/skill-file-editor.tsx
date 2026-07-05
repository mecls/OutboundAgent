'use client'

import { useState } from 'react'
import { saveSkillFileAction } from '@/app/skills/actions'

export function SkillFileEditor({
  path,
  content,
  version,
}: {
  path: string
  content: string
  version: number
}) {
  const [open, setOpen] = useState(path === 'SKILL.md')
  const [value, setValue] = useState(content)
  const dirty = value !== content

  return (
    <div className="rounded-xl border border-black/10 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-mono text-sm">{path}</span>
        <span className="text-xs text-black/40">
          v{version} {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <form action={saveSkillFileAction} className="border-t border-black/10 p-3">
          <input type="hidden" name="path" value={path} />
          <textarea
            name="content"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
            className="h-80 w-full resize-y rounded-lg border border-black/10 bg-[var(--background)] p-3 font-mono text-xs leading-relaxed outline-none focus:border-[var(--brand-accent)]"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-black/40">
              {dirty ? 'Unsaved changes' : 'Saved'}
            </span>
            <button
              type="submit"
              disabled={!dirty}
              className="cta-shadow rounded-lg bg-[var(--brand-accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
