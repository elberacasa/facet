// Full LLM-facing docs (llms-full.txt convention). Same index as llms.txt plus complete component sources.
import { getRegistry, getComponentSource } from '@/lib/registry'

interface RegistryProp {
  name: string
  type: 'number' | 'color' | 'boolean' | 'text' | 'select'
  default: unknown
  min?: number
  max?: number
  options?: string[]
}

interface RegistryEntryWithProps {
  name: string
  title: string
  description: string
  dependencies: string[]
  file: string
  props?: RegistryProp[]
}

function formatDefault(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value)
}

function formatProp(prop: RegistryProp): string {
  let type: string = prop.type
  if (prop.type === 'number' && prop.min !== undefined && prop.max !== undefined) {
    type = `number (${prop.min}–${prop.max})`
  } else if (prop.type === 'select' && prop.options) {
    type = `one of ${prop.options.join('|')}`
  }
  return `- ${prop.name}: ${type} = ${formatDefault(prop.default)}`
}

export async function GET() {
  const components = (await getRegistry()) as RegistryEntryWithProps[]

  const lines: string[] = [
    '# Facet',
    '',
    '> Facet is a copy-paste registry of production-ready React Three Fiber components. Components are installed as source files into your project. No runtime dependency, no lock-in.',
    '',
    '## Install',
    '',
    '```bash',
    'npx facet3d init',
    'npx facet3d add <name>',
    '```',
    '',
    '## Usage',
    '',
    'Components render inside a react-three-fiber Canvas:',
    '',
    '```tsx',
    "import { Canvas } from '@react-three/fiber'",
    "import { HeroBlob } from '@/components/facet/hero-blob'",
    '',
    'export default function Page() {',
    '  return (',
    '    <Canvas camera={{ position: [0, 0, 5] }}>',
    '      <ambientLight intensity={0.5} />',
    '      <HeroBlob color="#a3e635" speed={2} />',
    '    </Canvas>',
    '  )',
    '}',
    '```',
    '',
    '## Components',
    '',
  ]

  for (const entry of components) {
    lines.push(`### ${entry.name}`)
    lines.push('')
    lines.push(`${entry.title}: ${entry.description}`)
    lines.push('')
    if (entry.props && entry.props.length > 0) {
      lines.push('Props:')
      for (const prop of entry.props) {
        lines.push(formatProp(prop))
      }
      lines.push('')
    }
    lines.push(`Install: \`npx facet3d add ${entry.name}\``)
    lines.push('')
    lines.push('Source:')
    lines.push('')
    lines.push('```tsx')
    const source = await getComponentSource(entry.name)
    lines.push(source.trimEnd())
    lines.push('```')
    lines.push('')
  }

  lines.push('## CLI')
  lines.push('')
  lines.push('- `npx facet3d init`: set up the components directory in your project')
  lines.push('- `npx facet3d add <name>`: copy a component into your project as source')
  lines.push('- `npx facet3d list`: list all available components')
  lines.push('- `npx facet3d docs <name>`: print usage docs for a component')
  lines.push('')

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
