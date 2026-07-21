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
            <p className="mt-6 border-t border-neutral-800 pt-4 text-xs text-neutral-600">
              v0.1 · MIT
            </p>
          </aside>
          <main id="content" className="w-full min-w-0 flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
