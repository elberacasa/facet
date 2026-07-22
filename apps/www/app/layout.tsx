import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { getRegistry } from '@/lib/registry'
import { MobileNav, SidebarNav } from '@/components/sidebar-nav'
import { Logo } from '@/components/logo'
import './globals.css'

export const metadata: Metadata = {
  title: 'Facet · Copy-paste 3D components for React',
  description: 'Production-ready React Three Fiber components you copy into your project.',
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const entries = await getRegistry()
  const nav = entries.map((e) => ({
    name: e.name,
    title: e.title,
    category: (e as { category?: string }).category,
  }))

  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://unpkg.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://threejs.org" crossOrigin="anonymous" />
      </head>
      <body>
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-lime-400 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-neutral-950"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen flex-col lg:flex-row">
          <MobileNav entries={nav} />
          <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-neutral-800 px-5 py-8 lg:flex">
            <Link
              href="/"
              className="mb-1 flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              <Logo size={22} className="text-lime-400" />
              <span className="text-lg font-semibold tracking-tight">Facet</span>
            </Link>
            <p className="mb-8 text-xs text-neutral-500">copy-paste 3D components</p>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SidebarNav entries={nav} />
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-neutral-800 pt-4 text-xs text-neutral-600">
              <span>v0.1 · MIT</span>
              <a
                href="https://github.com/elberacasa/facet"
                target="_blank"
                rel="noreferrer"
                aria-label="Facet on GitHub"
                className="rounded text-neutral-500 transition-colors hover:text-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
              </a>
            </div>
          </aside>
          <main id="content" className="w-full min-w-0 flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
