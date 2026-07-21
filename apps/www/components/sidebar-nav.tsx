'use client'

// Component nav links (desktop sidebar + mobile top bar) with pathname-based active state.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Logo } from '@/components/logo'

type Entry = { name: string; title: string; category?: string }

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950'

// Category groups, in display order. Entries without a category fall into
// 'Visuals'; unknown categories land after these, sorted alphabetically.
const GROUP_ORDER = ['Game', 'Visuals']

function groupEntries(entries: Entry[]): [string, Entry[]][] {
  const groups = new Map<string, Entry[]>()
  for (const e of entries) {
    const key = e.category ?? 'Visuals'
    const list = groups.get(key)
    if (list) list.push(e)
    else groups.set(key, [e])
  }
  const ordered = GROUP_ORDER.filter((g) => groups.has(g)).map(
    (g) => [g, groups.get(g)!] as [string, Entry[]]
  )
  const rest = Array.from(groups.keys())
    .filter((g) => !GROUP_ORDER.includes(g))
    .sort()
    .map((g) => [g, groups.get(g)!] as [string, Entry[]])
  return [...ordered, ...rest]
}

export function SidebarNav({ entries }: { entries: Entry[] }) {
  const pathname = usePathname()
  const groups = groupEntries(entries)
  // Running index so the staggered fade-up continues across group boundaries.
  let i = 0

  return (
    <nav aria-label="Components" className="flex flex-col gap-1">
      {groups.map(([label, items]) => (
        <div key={label} className="mb-4 flex flex-col gap-1 last:mb-0">
          <span className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
            {label}
          </span>
          {items.map((e) => {
            const active = pathname === `/${e.name}`
            const delay = i++ * 20
            return (
              <Link
                key={e.name}
                href={`/${e.name}`}
                aria-current={active ? 'page' : undefined}
                style={{ animationDelay: `${delay}ms` }}
                className={`animate-fade-up rounded-md px-2 py-1.5 text-sm transition-colors ${focusRing} ${
                  active
                    ? 'bg-neutral-900 text-lime-300'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
                }`}
              >
                {e.title}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

// Mobile top bar with a slide-down nav panel (hidden on lg+).
export function MobileNav({ entries }: { entries: Entry[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Close the panel on route change.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <header className="safe-top sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur lg:hidden">
      <div className="relative">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" className={`flex items-center gap-2 rounded-md ${focusRing}`}>
            <Logo size={20} className="text-lime-400" />
            <span className="text-base font-semibold tracking-tight">Facet</span>
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setOpen((v) => !v)}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-400 transition-[transform,color,background-color] hover:bg-neutral-900 hover:text-white active:scale-95 ${focusRing}`}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {open ? (
                <>
                  <path d="M5 5 L15 15" />
                  <path d="M15 5 L5 15" />
                </>
              ) : (
                <>
                  <path d="M3 6 H17" />
                  <path d="M3 10 H17" />
                  <path d="M3 14 H17" />
                </>
              )}
            </svg>
          </button>
        </div>
        {open && (
          <div
            id="mobile-nav"
            onClick={(event) => {
              // Close when any link is tapped — covers links to the current
              // page, which don't trigger a pathname change.
              if ((event.target as HTMLElement).closest('a')) setOpen(false)
            }}
            className="animate-fade-up absolute inset-x-0 top-full max-h-[70vh] overflow-y-auto overscroll-contain border-b border-neutral-800 bg-neutral-950/95 px-3 py-3 shadow-2xl backdrop-blur"
          >
            <SidebarNav entries={entries} />
          </div>
        )}
      </div>
    </header>
  )
}
