'use client'

// Clipboard copy button: check-icon feedback, stable width, screen-reader announcement.
import { useState } from 'react'

export function CopyButton({
  text,
  label = 'Copy to clipboard',
  className = '',
}: {
  text: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // Clipboard unavailable (e.g. insecure context) — no-op.
        }
      }}
      className={`inline-flex min-w-[72px] touch-manipulation items-center justify-center gap-1.5 rounded-md border ${
        copied ? 'border-lime-400/50' : 'border-neutral-700'
      } px-2.5 py-1 text-xs text-neutral-300 transition-[color,background-color,transform] hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-950 active:scale-95 ${className}`}
    >
      {copied ? (
        <>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="h-3.5 w-3.5 text-lime-400"
          >
            <path
              d="M3 8.5l3.5 3.5L13 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-lime-400">Copied</span>
        </>
      ) : (
        'Copy'
      )}
      <span aria-live="polite" className="sr-only">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </button>
  )
}
