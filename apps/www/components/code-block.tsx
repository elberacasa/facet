// Code block with a lightweight regex tokenizer — no deps, never throws.
import React from 'react'
import { CopyButton } from './copy-button'

const TOKEN_RE =
  /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(import|export|from|const|function|return|type|interface|default|new|extends)\b|(\b\d+(?:\.\d+)?\b)|(<\/?[A-Za-z][\w.]*|\/?>)|(\b[A-Z][A-Za-z0-9]*\b)/gm

const SHELL_RE = /^\s*(npx|npm|node)\b/

function highlightLine(line: string, lineIdx: number): React.ReactNode {
  // Shell commands stay plain.
  if (SHELL_RE.test(line)) return line

  const nodes: React.ReactNode[] = []
  let last = 0
  let key = 0
  TOKEN_RE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = TOKEN_RE.exec(line)) !== null) {
    if (match.index > last) nodes.push(line.slice(last, match.index))

    const [text, comment, str, keyword, num, jsxTag, component] = match
    let className = 'text-neutral-200'
    if (comment) className = 'italic text-neutral-500'
    else if (str) className = 'text-amber-300'
    else if (keyword) className = 'text-lime-300'
    else if (num) className = 'text-orange-300'
    else if (jsxTag || component) className = 'text-sky-300'

    nodes.push(
      <span key={`${lineIdx}-${key++}`} className={className}>
        {text}
      </span>
    )
    last = match.index + text.length
    if (text.length === 0) TOKEN_RE.lastIndex++ // guard against empty matches
  }
  if (last < line.length) nodes.push(line.slice(last))
  return nodes
}

function highlight(code: string): React.ReactNode {
  try {
    return code.split('\n').map((line, i) => (
      <React.Fragment key={i}>
        {highlightLine(line, i)}
        {'\n'}
      </React.Fragment>
    ))
  } catch {
    return code
  }
}

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60">
      <div className="flex items-center justify-between gap-4 border-b border-neutral-800 px-4 py-2">
        <span className="min-w-0 truncate font-mono text-[11px] uppercase tracking-wider text-neutral-500">
          {label ?? 'code'}
        </span>
        <CopyButton text={code} label={`Copy ${label ?? 'code'} to clipboard`} />
      </div>
      <pre
        tabIndex={0}
        role="region"
        aria-label={label ?? 'code'}
        className="max-h-[480px] overflow-auto p-4 text-[13px] leading-relaxed text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime-400/70"
      >
        <code>{highlight(code)}</code>
      </pre>
    </div>
  )
}
