import { promises as fs } from 'fs'
import path from 'path'

export interface PropSchema {
  name: string
  type: 'number' | 'color' | 'boolean' | 'text' | 'select'
  default: unknown
  min?: number
  max?: number
  step?: number
  options?: string[]
}

export interface RegistryEntry {
  name: string
  title: string
  description: string
  dependencies: string[]
  file: string
  props?: PropSchema[]
}

const REGISTRY_DIR = path.join(process.cwd(), '..', '..', 'registry')

export async function getRegistry(): Promise<RegistryEntry[]> {
  const raw = await fs.readFile(path.join(REGISTRY_DIR, 'index.json'), 'utf8')
  return (JSON.parse(raw) as { components: RegistryEntry[] }).components
}

export async function getRegistryEntry(name: string): Promise<RegistryEntry | undefined> {
  const entries = await getRegistry()
  return entries.find((e) => e.name === name)
}

export async function getComponentSource(name: string): Promise<string> {
  const entry = await getRegistryEntry(name)
  if (!entry) throw new Error(`Unknown registry component: ${name}`)
  return fs.readFile(path.join(REGISTRY_DIR, entry.file), 'utf8')
}
