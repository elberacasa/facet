// Tool implementations for the Facet MCP server.
// Formatting mirrors the facet3d CLI (packages/cli/src/cli.mjs).

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  componentNames,
  findComponent,
  loadComponentSource,
  loadIndex,
} from './registry.mjs'

const RUNTIME_DEPS = ['three', '@react-three/fiber', '@react-three/drei']

function pascalCase(name) {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('')
}

function formatPropType(prop) {
  if (prop.type === 'number') {
    const hasMin = typeof prop.min === 'number'
    const hasMax = typeof prop.max === 'number'
    let detail = ''
    if (hasMin || hasMax) {
      detail = ` (${hasMin ? prop.min : ''}..${hasMax ? prop.max : ''}`
      if (typeof prop.step === 'number') detail += `, step ${prop.step}`
      detail += ')'
    }
    return `number${detail}`
  }
  if (prop.type === 'select' && Array.isArray(prop.options)) {
    return `select (${prop.options.join(' | ')})`
  }
  return String(prop.type ?? 'any')
}

function formatDefault(value) {
  return value === undefined ? '-' : JSON.stringify(value)
}

function formatPropsTable(props) {
  const headers = ['name', 'type', 'default']
  const rows = props.map((p) => [
    String(p.name),
    formatPropType(p),
    formatDefault(p.default),
  ])
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length))
  )
  const line = (cells) =>
    `  ${cells.map((c, i) => c.padEnd(widths[i])).join('  ')}`.trimEnd()
  return [line(headers), ...rows.map(line)]
}

function usageExample(entry) {
  const componentName = pascalCase(entry.name)
  const props = Array.isArray(entry.props) ? entry.props : []
  const attrs = props
    .filter((p) => p.default !== undefined)
    .map((p) =>
      typeof p.default === 'string'
        ? `${p.name}=${JSON.stringify(p.default)}`
        : `${p.name}={${JSON.stringify(p.default)}}`
    )
  const usage = attrs.length
    ? `<${componentName} ${attrs.join(' ')} />`
    : `<${componentName} />`
  return [
    `import { Canvas } from '@react-three/fiber'`,
    `import { ${componentName} } from '@/components/facet/${entry.name}'`,
    '',
    `export function Scene() {`,
    `  return (`,
    `    <Canvas>`,
    `      ${usage}`,
    `    </Canvas>`,
    `  )`,
    `}`,
  ]
}

function entryDependencies(entry) {
  return Array.isArray(entry.dependencies) && entry.dependencies.length > 0
    ? entry.dependencies
    : RUNTIME_DEPS
}

function requireComponent(index, name) {
  const entry = typeof name === 'string' ? findComponent(index, name) : undefined
  if (!entry) {
    throw new Error(
      `unknown component: ${JSON.stringify(name)}. available components: ${componentNames(index).join(', ')}`
    )
  }
  return entry
}

async function listText(location) {
  const index = await loadIndex(location)
  const components = [...index.components].sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  const lines = ['Facet components', '']
  for (const c of components) {
    const category = c.category ? ` [${c.category}]` : ''
    lines.push(`- ${c.name}${category} — ${c.title || c.name}`)
    if (c.description) lines.push(`  ${c.description}`)
  }
  lines.push('', 'Install one with the facet_add tool.')
  return lines.join('\n')
}

async function docsText(location, name) {
  const index = await loadIndex(location)
  const entry = requireComponent(index, name)
  const props = Array.isArray(entry.props) ? entry.props : []
  const lines = []
  lines.push(entry.title || entry.name)
  if (entry.description) lines.push(entry.description)
  lines.push('')
  lines.push('Dependencies')
  lines.push(`  ${entryDependencies(entry).join(' ')}`)
  if (props.length > 0) {
    lines.push('')
    lines.push('Props')
    lines.push(...formatPropsTable(props))
  }
  lines.push('')
  lines.push('Usage')
  lines.push(...usageExample(entry).map((l) => (l ? `  ${l}` : l)))
  return lines.join('\n')
}

async function sourceText(location, name) {
  const index = await loadIndex(location)
  const entry = requireComponent(index, name)
  return loadComponentSource(location, entry)
}

async function addText(location, name, args = {}) {
  const index = await loadIndex(location)
  const entry = requireComponent(index, name)
  const base =
    typeof args.targetDir === 'string' && args.targetDir
      ? path.resolve(args.targetDir)
      : process.cwd()
  const targetDir = path.join(base, 'components', 'facet')
  const target = path.join(targetDir, `${entry.name}.tsx`)
  if (existsSync(target) && !args.overwrite) {
    throw new Error(
      `${entry.name} already exists at ${target} (pass overwrite: true to replace)`
    )
  }
  const source = await loadComponentSource(location, entry)
  await fs.mkdir(targetDir, { recursive: true })
  await fs.writeFile(target, source)
  const deps = entryDependencies(entry)
  return [
    `added ${entry.name} → ${target}`,
    `dependencies: ${deps.join(' ')}. Install any that are missing (e.g. npm install ${deps.join(' ')}).`,
  ].join('\n')
}

export const TOOLS = [
  {
    name: 'facet_list',
    description:
      'List all components in the Facet 3D registry: name, category, title, description.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'facet_docs',
    description:
      'Agent-friendly docs for one Facet component: description, dependencies, props table, and a React Three Fiber usage example.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name (see facet_list).' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'facet_source',
    description: 'Full .tsx source of one Facet component.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name (see facet_list).' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'facet_add',
    description:
      'Copy a Facet component into the project at <targetDir or cwd>/components/facet/<name>.tsx and report the dependencies to install.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name (see facet_list).' },
        targetDir: {
          type: 'string',
          description:
            'Project root to install into. Defaults to the server working directory.',
        },
        overwrite: {
          type: 'boolean',
          description: 'Replace the file if it already exists. Default false.',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
]

export async function callTool(location, name, args = {}) {
  switch (name) {
    case 'facet_list':
      return listText(location)
    case 'facet_docs':
      return docsText(location, args.name)
    case 'facet_source':
      return sourceText(location, args.name)
    case 'facet_add':
      return addText(location, args.name, args)
    default:
      throw new Error(
        `unknown tool: ${name}. available tools: ${TOOLS.map((t) => t.name).join(', ')}`
      )
  }
}
