'use client'

// Live prop playground: preview + generated controls from the registry prop schema.
import { useId, useMemo, useState } from 'react'
import type { PropSchema } from '@/lib/registry'
import { CopyButton } from './copy-button'

type Values = Record<string, unknown>

function defaultsFrom(schema: PropSchema[]): Values {
  const values: Values = {}
  for (const prop of schema) values[prop.name] = prop.default
  return values
}

function configSnippet(componentName: string, schema: PropSchema[], values: Values): string {
  const changed = schema.filter((p) => values[p.name] !== p.default)
  if (changed.length === 0) return `<${componentName} />`
  const props = changed
    .map((p) => {
      const v = values[p.name]
      return typeof v === 'string' ? `${p.name}="${v}"` : `${p.name}={${String(v)}}`
    })
    .join(' ')
  return `<${componentName} ${props} />`
}

// Trim float noise and trailing zeros for compact readouts.
function formatNumber(n: number): string {
  return String(parseFloat(n.toFixed(4)))
}

export function Playground({
  name,
  componentName,
  schema,
  Demo,
}: {
  name: string
  componentName: string
  schema: PropSchema[]
  Demo: React.ComponentType<Record<string, any>>
}) {
  const defaults = useMemo(() => defaultsFrom(schema), [schema])
  const [values, setValues] = useState<Values>(defaults)
  const [open, setOpen] = useState(false)
  const controlsId = useId()

  const set = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="flex flex-col lg:flex-row" data-component={name}>
      <div className="relative aspect-[4/3] flex-1 overflow-hidden bg-black lg:aspect-video lg:min-h-[420px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-lime-400/5 motion-safe:animate-pulse"
        >
          <span className="font-mono text-[11px] uppercase tracking-widest text-neutral-600">
            Booting WebGL…
          </span>
        </div>
        <Demo {...values} />
      </div>

      <div className="w-full shrink-0 border-t border-neutral-800 bg-neutral-900/40 lg:w-80 lg:border-l lg:border-t-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={controlsId}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full touch-manipulation items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-neutral-400 transition-colors hover:text-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime-400/70 lg:hidden"
        >
          Customize
          <svg
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div
          id={controlsId}
          className={`${open ? 'block' : 'hidden'} space-y-4 p-4 pt-0 lg:block lg:pt-4`}
        >
          <div className="flex items-center justify-between border-b border-neutral-800/60 pb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Playground
            </span>
            <button
              type="button"
              onClick={() => setValues(defaults)}
              className="touch-manipulation rounded-md px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
            >
              Reset
            </button>
          </div>

          {schema.map((prop) => (
            <Control
              key={prop.name}
              prop={prop}
              value={values[prop.name]}
              onChange={(v) => set(prop.name, v)}
            />
          ))}

          <div className="border-t border-neutral-800 pt-4">
            <CopyButton
              text={configSnippet(componentName, schema, values)}
              label="Copy config to clipboard"
              className="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Control({
  prop,
  value,
  onChange,
}: {
  prop: PropSchema
  value: unknown
  onChange: (value: unknown) => void
}) {
  const id = useId()
  const name = prop.name.charAt(0).toUpperCase() + prop.name.slice(1)

  const label = (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={id} className="font-mono text-xs text-neutral-300">
        {name}
      </label>
      {prop.type === 'number' && (
        <output
          htmlFor={id}
          className="font-mono text-xs tabular-nums text-neutral-500"
        >
          {formatNumber(Number(value))}
        </output>
      )}
    </div>
  )

  switch (prop.type) {
    case 'number':
      return (
        <div>
          {label}
          <input
            id={id}
            type="range"
            aria-label={name}
            min={prop.min ?? 0}
            max={prop.max ?? 100}
            step={prop.step ?? 1}
            value={Number(value)}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full touch-manipulation accent-lime-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
          />
        </div>
      )

    case 'color':
      return (
        <div>
          {label}
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`${name} picker`}
              value={String(value)}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-10 shrink-0 cursor-pointer touch-manipulation rounded border border-neutral-700 bg-neutral-900 p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70"
            />
            <input
              id={id}
              type="text"
              value={String(value)}
              onChange={(e) => onChange(e.target.value)}
              spellCheck={false}
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-200 outline-none focus:border-lime-400 focus-visible:ring-1 focus-visible:ring-lime-400/70"
            />
          </div>
        </div>
      )

    case 'boolean':
      return (
        <div className="flex items-center justify-between gap-2">
          <span id={`${id}-label`} className="font-mono text-xs text-neutral-300">
            {name}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(value)}
            aria-labelledby={`${id}-label`}
            onClick={() => onChange(!value)}
            className={`relative h-5 w-9 shrink-0 touch-manipulation rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-950 ${
              value ? 'bg-lime-400' : 'bg-neutral-700'
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                value ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )

    case 'text':
      return (
        <div>
          {label}
          <input
            id={id}
            type="text"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-lime-400 focus-visible:ring-1 focus-visible:ring-lime-400/70"
          />
        </div>
      )

    case 'select':
      return (
        <div>
          {label}
          <select
            id={id}
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-full touch-manipulation rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-lime-400 focus-visible:ring-1 focus-visible:ring-lime-400/70"
          >
            {(prop.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      )

    default:
      return null
  }
}
