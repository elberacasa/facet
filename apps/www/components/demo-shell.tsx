// Component docs page shell: header, playground, install, props table, source.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getComponentSource, getRegistryEntry } from '@/lib/registry'
import { CodeBlock } from './code-block'
import { Playground } from './playground'

function pascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function propTypeLabel(prop: {
  type: string
  min?: number
  max?: number
}): string {
  if (prop.type === 'number' && prop.min !== undefined && prop.max !== undefined) {
    return `number ${prop.min}–${prop.max}`
  }
  return prop.type
}

function defaultLabel(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

export async function DemoShell({
  name,
  Demo,
}: {
  name: string
  Demo: React.ComponentType<Record<string, any>>
}) {
  const entry = await getRegistryEntry(name)
  if (!entry) notFound()
  const code = await getComponentSource(name)
  const schema = entry.props ?? []

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-8 py-10">
      <header className="animate-fade-up space-y-3 [animation-fill-mode:both]">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center text-xs text-neutral-500">
          <Link
            href="/#components"
            className="shrink-0 touch-manipulation rounded-sm transition-colors hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
          >
            Components
          </Link>
          <span aria-hidden="true" className="mx-1.5 shrink-0 text-neutral-700">
            /
          </span>
          <span aria-current="page" className="min-w-0 truncate text-neutral-400">
            {entry.title}
          </span>
        </nav>
        <h1 className="text-balance text-3xl font-semibold tracking-tight">{entry.title}</h1>
        <p className="text-pretty text-neutral-400">{entry.description}</p>
        <div className="flex flex-wrap gap-1.5">
          {entry.dependencies.map((dep) => (
            <span
              key={dep}
              className="rounded-md border border-neutral-800 bg-neutral-900/60 px-2 py-0.5 font-mono text-[11px] text-neutral-400"
            >
              {dep}
            </span>
          ))}
        </div>
      </header>

      <div
        className="relative animate-fade-up overflow-hidden rounded-xl border border-neutral-800 ring-1 ring-inset ring-white/5 [animation-fill-mode:both]"
        style={{ animationDelay: '80ms' }}
      >
        <Playground
          name={name}
          componentName={pascalCase(name)}
          schema={schema}
          Demo={Demo}
        />
      </div>

      <section className="scroll-mt-8 space-y-3">
        <h2 className="text-lg font-medium">Install</h2>
        <CodeBlock code={`npx facet3d add ${name}`} label="terminal" />
      </section>

      {schema.length > 0 && (
        <section className="scroll-mt-8 space-y-3">
          <h2 className="text-lg font-medium">Props</h2>
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-500">
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Prop</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Type</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Default</th>
                </tr>
              </thead>
              <tbody>
                {schema.map((prop) => (
                  <tr
                    key={prop.name}
                    className="border-b border-neutral-800/60 last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[13px] text-neutral-200">
                      {prop.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-neutral-400">
                      {propTypeLabel(prop)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[13px] tabular-nums text-neutral-400">
                      {defaultLabel(prop.default)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="scroll-mt-8 space-y-3">
        <h2 className="text-lg font-medium">Source</h2>
        <CodeBlock code={code} label={`components/facet/${name}.tsx`} />
      </section>
    </div>
  )
}
