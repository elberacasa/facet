// facet3d CLI: init, add, list, docs.

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { bold, cyan, dim, error, info, success, warn } from './log.mjs'
import {
  componentNames,
  findComponent,
  loadComponentSource,
  loadIndex,
  resolveRegistryLocation,
} from './registry.mjs'

const DEFAULT_COMPONENTS_DIR = 'components/facet'
const CONFIG_FILE = 'facet.json'
const RUNTIME_DEPS = ['three', '@react-three/fiber', '@react-three/drei']

function parseArgs(argv) {
  const flags = {}
  const positionals = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') flags.help = true
    else if (arg === '--version' || arg === '-v') flags.version = true
    else if (arg === '--yes' || arg === '-y') flags.yes = true
    else if (arg === '--no-install') flags.install = false
    else if (arg === '--overwrite') flags.overwrite = true
    else if (arg === '--source') flags.source = true
    else if (arg === '--registry') {
      const value = argv[++i]
      if (!value) throw new Error('--registry requires a value')
      flags.registry = value
    } else if (arg.startsWith('--registry=')) {
      flags.registry = arg.slice('--registry='.length)
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown flag: ${arg}`)
    } else {
      positionals.push(arg)
    }
  }
  return { command: positionals[0], args: positionals.slice(1), flags }
}

async function cliVersion() {
  const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url))
  return JSON.parse(await fs.readFile(pkgPath, 'utf8')).version
}

function printHelp() {
  console.log(`
${bold('facet3d')} — copy-paste 3D components for React Three Fiber

${bold('Usage')}
  facet3d init [--yes] [--no-install]
  facet3d add <component...> [--overwrite] [--registry <path-or-url>]
  facet3d list [--registry <path-or-url>]
  facet3d docs <name> [--source] [--registry <path-or-url>]

${bold('Commands')}
  ${cyan('init')}              Set up facet.json and install three/fiber/drei
  ${cyan('add')} <name...>     Copy components into your project
  ${cyan('list')}              List available components
  ${cyan('docs')} <name>       Print agent-friendly docs for a component

${bold('Options')}
  --registry <loc>   Registry location (dir or URL). Overrides
                     FACET_REGISTRY. Default: official registry on GitHub
  --yes, -y          Skip prompts
  --no-install       init: skip installing dependencies
  --overwrite        add: overwrite existing files
  --source           docs: also print the component source
  --help, -h         Show this help
  --version, -v      Show version
`)
}

function detectPackageManager(cwd) {
  if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(path.join(cwd, 'bun.lockb'))) return 'bun'
  return 'npm'
}

function installCommand(pm) {
  return pm === 'npm'
    ? { cmd: 'npm', args: ['install', ...RUNTIME_DEPS] }
    : { cmd: pm, args: ['add', ...RUNTIME_DEPS] }
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await new Promise((resolve) =>
      rl.question(`${question} ${dim('(Y/n)')} `, resolve)
    )
    return !/^n(o)?$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}

async function readConfig(cwd) {
  const file = path.join(cwd, CONFIG_FILE)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    warn(`could not parse ${CONFIG_FILE}, using defaults`)
    return null
  }
}

function resolveComponentsDir(cwd, config) {
  const dir =
    typeof config?.componentsDir === 'string' && config.componentsDir
      ? config.componentsDir
      : DEFAULT_COMPONENTS_DIR
  return path.resolve(cwd, dir)
}

async function cmdInit(flags, cwd) {
  const configPath = path.join(cwd, CONFIG_FILE)
  if (existsSync(configPath)) {
    info(`${CONFIG_FILE} already exists, leaving it untouched`)
  } else {
    const config = { componentsDir: DEFAULT_COMPONENTS_DIR }
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
    success(`created ${CONFIG_FILE}`)
  }

  if (flags.install === false) {
    info(`skipping dependency install (--no-install)`)
    info(`add these to your project: ${RUNTIME_DEPS.join(' ')}`)
    return 0
  }

  const pm = detectPackageManager(cwd)
  const { cmd, args } = installCommand(pm)
  const shouldInstall =
    flags.yes ||
    !process.stdout.isTTY ||
    (await confirm(`Install ${RUNTIME_DEPS.join(', ')} with ${pm}?`))

  if (!shouldInstall) {
    info(`skipped install — run ${dim(`${cmd} ${args.join(' ')}`)} yourself`)
    return 0
  }

  info(`installing dependencies with ${pm}...`)
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (result.error) {
    error(`failed to run ${cmd}: ${result.error.message}`)
    return 1
  }
  if (result.status !== 0) {
    error(`${cmd} ${args[0]} exited with code ${result.status}`)
    return result.status ?? 1
  }
  success(`installed ${RUNTIME_DEPS.join(', ')}`)
  return 0
}

async function cmdAdd(names, flags, cwd) {
  if (names.length === 0) {
    error('no components specified')
    console.log(`usage: facet3d add <component...>`)
    return 1
  }

  const location = resolveRegistryLocation(flags)
  let index
  try {
    index = await loadIndex(location)
  } catch (err) {
    error(err.message)
    return 1
  }

  const unknown = names.filter((name) => !findComponent(index, name))
  if (unknown.length > 0) {
    error(`unknown component${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`)
    console.log(`available components: ${componentNames(index).join(', ')}`)
    return 1
  }

  const config = await readConfig(cwd)
  const targetDir = resolveComponentsDir(cwd, config)
  await fs.mkdir(targetDir, { recursive: true })

  let failed = false
  for (const name of names) {
    const entry = findComponent(index, name)
    const target = path.join(targetDir, `${name}.tsx`)
    if (existsSync(target) && !flags.overwrite) {
      error(`${name} already exists at ${path.relative(cwd, target)} (use --overwrite to replace)`)
      failed = true
      continue
    }
    let source
    try {
      source = await loadComponentSource(location, entry)
    } catch (err) {
      error(err.message)
      failed = true
      continue
    }
    await fs.writeFile(target, source)
    success(`added ${bold(name)} → ${path.relative(cwd, target)}`)
    const deps = Array.isArray(entry.dependencies) && entry.dependencies.length > 0
      ? entry.dependencies
      : RUNTIME_DEPS
    info(`dependencies: ${deps.join(' ')}. Install any that are missing.`)
  }
  return failed ? 1 : 0
}

async function cmdList(flags) {
  const location = resolveRegistryLocation(flags)
  let index
  try {
    index = await loadIndex(location)
  } catch (err) {
    error(err.message)
    return 1
  }
  const components = [...index.components].sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  const width = Math.max(...components.map((c) => c.name.length), 0)
  console.log(`\n${bold('Facet components')}\n`)
  for (const c of components) {
    console.log(`  ${cyan(c.name.padEnd(width))}  ${dim(c.description ?? '')}`)
  }
  console.log(`\nadd one with: ${dim('facet3d add <name>')}\n`)
  return 0
}

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

async function cmdDocs(names, flags) {
  if (names.length === 0) {
    error('no component specified')
    console.log(`usage: facet3d docs <name> [--source]`)
    return 1
  }
  const name = names[0]

  const location = resolveRegistryLocation(flags)
  let index
  try {
    index = await loadIndex(location)
  } catch (err) {
    error(err.message)
    return 1
  }

  const entry = findComponent(index, name)
  if (!entry) {
    error(`unknown component: ${name}`)
    console.log(`available components: ${componentNames(index).join(', ')}`)
    return 1
  }

  const props = Array.isArray(entry.props) ? entry.props : []
  const lines = []
  lines.push(bold(entry.title || entry.name))
  if (entry.description) lines.push(entry.description)
  lines.push('')
  lines.push(bold('Install'))
  lines.push(`  facet3d add ${entry.name}`)
  const deps =
    Array.isArray(entry.dependencies) && entry.dependencies.length > 0
      ? entry.dependencies
      : RUNTIME_DEPS
  lines.push('')
  lines.push(bold('Dependencies'))
  lines.push(`  ${deps.join(' ')}`)
  if (props.length > 0) {
    lines.push('')
    lines.push(bold('Props'))
    lines.push(...formatPropsTable(props))
  }
  lines.push('')
  lines.push(bold('Usage'))
  lines.push(...usageExample(entry).map((l) => (l ? `  ${l}` : l)))
  console.log(lines.join('\n'))

  if (flags.source) {
    let source
    try {
      source = await loadComponentSource(location, entry)
    } catch (err) {
      error(err.message)
      return 1
    }
    console.log(`\n${bold('Source')}\n`)
    process.stdout.write(source.endsWith('\n') ? source : `${source}\n`)
  }
  return 0
}

export async function run(argv) {
  let parsed
  try {
    parsed = parseArgs(argv)
  } catch (err) {
    error(err.message)
    return 1
  }
  const { command, args, flags } = parsed
  const cwd = process.cwd()

  if (flags.version) {
    console.log(`facet3d/${await cliVersion()}`)
    return 0
  }
  if (flags.help || command === 'help') {
    printHelp()
    return 0
  }

  switch (command) {
    case 'init':
      return cmdInit(flags, cwd)
    case 'add':
      return cmdAdd(args, flags, cwd)
    case 'list':
      return cmdList(flags)
    case 'docs':
      return cmdDocs(args, flags)
    case undefined:
      printHelp()
      return 0
    default:
      error(`unknown command: ${command}`)
      console.log(`run ${dim('facet3d --help')} for usage`)
      return 1
  }
}
