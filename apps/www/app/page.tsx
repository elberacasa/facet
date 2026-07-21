// Facet landing page. Hero scene fills the viewport behind the copy.
import Link from 'next/link'
import { getRegistry } from '@/lib/registry'
import { Logo } from '@/components/logo'
import { CopyButton } from '@/components/copy-button'
import { CodeBlock } from '@/components/code-block'
import HeroDemo from '@/components/demos/home-hero-demo'

const FEATURES = [
  {
    title: "Copy, don't install",
    body: 'Components land in your repo as source. Tweak anything.',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="8 6 3 12 8 18" />
        <polyline points="16 6 21 12 16 18" />
        <line x1="13.5" y1="4" x2="10.5" y2="20" />
      </svg>
    ),
  },
  {
    title: 'A playground for every prop',
    body: 'Tune color, speed, geometry live, then copy the exact config.',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="4" y1="7" x2="20" y2="7" />
        <circle cx="9" cy="7" r="2.2" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <circle cx="15" cy="12" r="2.2" />
        <line x1="4" y1="17" x2="20" y2="17" />
        <circle cx="7" cy="17" r="2.2" />
      </svg>
    ),
  },
  {
    title: 'Built for AI agents',
    body: 'llms.txt, machine-readable registry, and a CLI your agent can drive.',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="5 7 9 11 5 15" />
        <line x1="12" y1="17" x2="19" y2="17" />
        <rect x="2.5" y="3.5" width="19" height="17" rx="3" />
      </svg>
    ),
  },
]

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950'

const CARD_CLASS =
  'group flex min-w-0 flex-col rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-lime-400/50 hover:shadow-[0_0_30px_-12px_rgba(163,230,53,0.25)]'

const FLAGSHIP = 'image-particles'

export default async function HomePage() {
  const components = await getRegistry()
  const installCmd = 'npx facet3d add image-particles'
  const flagship = components.find((entry) => entry.name === FLAGSHIP)
  const rest = components.filter((entry) => entry.name !== FLAGSHIP)

  return (
    <div className="bg-neutral-950 text-neutral-100">
      <section className="relative flex min-h-[calc(100svh-3.5rem)] flex-col overflow-hidden lg:min-h-[100svh]">
        <div className="absolute inset-0">
          <HeroDemo />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-neutral-950/70 via-neutral-950/30 to-neutral-950" />

        <header className="animate-fade-up relative z-10 mx-auto hidden w-full max-w-6xl items-center gap-2.5 px-8 pt-8 lg:flex">
          <Logo size={28} className="text-lime-400" />
          <span className="text-lg font-semibold tracking-tight">Facet</span>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-24 sm:px-8">
          <div className="relative min-w-0">
            <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-lime-400/10 blur-[120px]" />

            <p
              className="animate-fade-up mb-6 inline-block rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-lime-300 sm:text-xs"
              style={{ animationDelay: '80ms' }}
            >
              Open source · MIT ·{' '}
              <span className="tabular-nums">{components.length}</span>{' '}
              components
            </p>
            <h1
              className="animate-fade-up max-w-3xl text-balance text-[2.6rem] font-semibold leading-[1.02] tracking-tighter sm:text-6xl lg:text-8xl"
              style={{ animationDelay: '160ms' }}
            >
              Ship 3D that{' '}
              <span className="text-lime-400">
                stops the scroll.
              </span>
            </h1>
            <p
              className="animate-fade-up mt-6 max-w-xl text-lg leading-relaxed text-neutral-400"
              style={{ animationDelay: '240ms' }}
            >
              Production-ready React Three Fiber components you copy into your
              project. No dependency. No lock-in. Own every line.
            </p>

            <div
              className="animate-fade-up mt-10 flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center"
              style={{ animationDelay: '320ms' }}
            >
              <div className="flex w-full max-w-full items-center gap-3 rounded-full border border-neutral-800 bg-neutral-900/80 py-2 pl-5 pr-2 font-mono text-sm text-neutral-200 backdrop-blur sm:w-auto">
                <span className="shrink-0 text-neutral-500">$</span>
                <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">
                  {installCmd}
                </span>
                <span className="shrink-0">
                  <CopyButton text={installCmd} />
                </span>
              </div>
              <a
                href="#components"
                className={`animate-fade-up w-full rounded-full bg-lime-400 px-5 py-2.5 text-center text-sm font-medium text-neutral-950 transition-[background-color,transform] duration-200 [touch-action:manipulation] hover:bg-lime-300 active:scale-[0.98] sm:w-auto ${FOCUS_RING}`}
                style={{ animationDelay: '400ms' }}
              >
                Browse components
              </a>
              <a
                href="#agents"
                className={`animate-fade-up w-full rounded-full border border-neutral-800 px-5 py-2.5 text-center text-sm font-medium text-neutral-300 transition-[color,border-color,transform] duration-200 [touch-action:manipulation] hover:border-lime-400/50 hover:text-lime-300 active:scale-[0.98] sm:w-auto ${FOCUS_RING}`}
                style={{ animationDelay: '400ms' }}
              >
                For AI agents
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <p className="text-xs font-medium uppercase tracking-widest text-lime-400">
          Why Facet
        </p>
        <h2 className="mt-3 max-w-2xl text-balance text-2xl font-semibold tracking-tight">
          Source you own, not a dependency you rent
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6 transition-[border-color] duration-200 hover:border-neutral-700"
            >
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-lime-400/20 bg-lime-400/10 text-lime-300">
                {feature.icon}
              </div>
              <h3 className="mt-4 font-medium tracking-tight">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="components"
        className="mx-auto max-w-6xl scroll-mt-8 px-5 py-24 sm:px-8"
      >
        <p className="text-xs font-medium uppercase tracking-widest text-lime-400">
          The registry
        </p>
        <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight">
          Components
        </h2>
        <p className="mt-2 text-neutral-400">
          Production-ready 3D building blocks. Install one, own the source.
        </p>
        <p className="mt-1 text-sm tabular-nums text-neutral-600">
          {components.length} components
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flagship && (
            <Link
              href={`/${flagship.name}`}
              className={`${CARD_CLASS} sm:col-span-2 ${FOCUS_RING} [touch-action:manipulation]`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs tabular-nums text-neutral-600">
                  01
                </span>
                <span className="rounded-full border border-lime-400/30 bg-lime-400/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-lime-300">
                  Flagship
                </span>
              </div>
              <h3 className="mt-3 text-lg font-medium tracking-tight group-hover:text-white">
                {flagship.title}
              </h3>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-neutral-400">
                {flagship.description}
              </p>
              <p className="mt-4 font-mono text-xs text-neutral-600">
                {flagship.name}
              </p>
            </Link>
          )}
          {rest.map((entry, index) => (
            <Link
              key={entry.name}
              href={`/${entry.name}`}
              className={`${CARD_CLASS} ${FOCUS_RING} [touch-action:manipulation]`}
            >
              <span className="font-mono text-xs tabular-nums text-neutral-600">
                {String(index + 2).padStart(2, '0')}
              </span>
              <h3 className="mt-3 min-w-0 truncate font-medium tracking-tight group-hover:text-white">
                {entry.title}
              </h3>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-neutral-400">
                {entry.description}
              </p>
              <p className="mt-4 font-mono text-xs text-neutral-600">
                {entry.name}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section
        id="agents"
        className="mx-auto max-w-6xl scroll-mt-8 px-5 py-24 sm:px-8"
      >
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-lime-400">
              Agent-native
            </p>
            <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight">
              Made for AI agents
            </h2>
            <p className="mt-4 leading-relaxed text-neutral-400">
              Any coding agent, like Claude Code, Cursor, or Copilot, can
              consume the Facet registry directly. The CLI reads and writes
              plain source files, so your agent can list components, pull their
              docs, and add them to your project without ever leaving the
              terminal.
            </p>
            <div className="mt-8 flex gap-6 text-sm">
              <a
                href="/llms.txt"
                className={`rounded text-neutral-400 underline decoration-neutral-700 underline-offset-4 transition-colors [touch-action:manipulation] hover:text-lime-300 hover:decoration-lime-400 ${FOCUS_RING}`}
              >
                /llms.txt
              </a>
              <a
                href="/llms-full.txt"
                className={`rounded text-neutral-400 underline decoration-neutral-700 underline-offset-4 transition-colors [touch-action:manipulation] hover:text-lime-300 hover:decoration-lime-400 ${FOCUS_RING}`}
              >
                /llms-full.txt
              </a>
            </div>
          </div>
          <div className="min-w-0">
            <CodeBlock
              code={'npx facet3d docs image-particles\nnpx facet3d add image-particles'}
              label="terminal"
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-900">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 sm:grid-cols-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Logo size={20} className="text-lime-400" />
              <span className="font-semibold tracking-tight">Facet</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-neutral-500">
              Copy-paste React Three Fiber components. MIT licensed.
            </p>
          </div>
          <nav aria-label="Components" className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-600">
              Components
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {components.slice(0, 5).map((entry) => (
                <li key={entry.name}>
                  <Link
                    href={`/${entry.name}`}
                    className={`rounded text-neutral-400 transition-colors [touch-action:manipulation] hover:text-lime-300 ${FOCUS_RING}`}
                  >
                    {entry.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Agents" className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-600">
              Agents
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a
                  href="/llms.txt"
                  className={`rounded text-neutral-400 transition-colors [touch-action:manipulation] hover:text-lime-300 ${FOCUS_RING}`}
                >
                  /llms.txt
                </a>
              </li>
              <li>
                <a
                  href="/llms-full.txt"
                  className={`rounded text-neutral-400 transition-colors [touch-action:manipulation] hover:text-lime-300 ${FOCUS_RING}`}
                >
                  /llms-full.txt
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/elberacasa/facet"
                  className={`rounded text-neutral-400 transition-colors [touch-action:manipulation] hover:text-lime-300 ${FOCUS_RING}`}
                >
                  GitHub
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-neutral-900 py-6 text-center text-sm text-neutral-600">
          MIT · Built with React Three Fiber
        </div>
      </footer>
    </div>
  )
}
