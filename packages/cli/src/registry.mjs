// Registry resolution and loading: local directory or HTTP(S) base URL.

import fs from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_REGISTRY =
  'https://raw.githubusercontent.com/elberacasa/facet/main/registry'

export function resolveRegistryLocation(flags = {}) {
  return flags.registry || process.env.FACET_REGISTRY || DEFAULT_REGISTRY
}

export function isUrl(location) {
  return /^https?:\/\//.test(location)
}

function joinUrl(base, file) {
  return `${base.replace(/\/+$/, '')}/${file.replace(/^\/+/, '')}`
}

async function readText(location, file) {
  if (isUrl(location)) {
    const url = joinUrl(location, file)
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`failed to fetch ${url} (HTTP ${res.status})`)
    }
    return res.text()
  }
  const filePath = path.join(path.resolve(location), file)
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    throw new Error(`failed to read ${filePath}`)
  }
}

export async function loadIndex(location) {
  let raw
  try {
    raw = await readText(location, 'index.json')
  } catch (err) {
    throw new Error(
      `could not load registry index from ${location}: ${err.message}`
    )
  }
  let index
  try {
    index = JSON.parse(raw)
  } catch {
    throw new Error(`registry index at ${location} is not valid JSON`)
  }
  if (!index || !Array.isArray(index.components)) {
    throw new Error(`registry index at ${location} has no "components" array`)
  }
  return index
}

export async function loadComponentSource(location, entry) {
  const file = entry.file || `components/${entry.name}.tsx`
  try {
    return await readText(location, file)
  } catch (err) {
    throw new Error(
      `could not load component "${entry.name}" (${file}): ${err.message}`
    )
  }
}

export function findComponent(index, name) {
  return index.components.find((c) => c && c.name === name)
}

export function componentNames(index) {
  return index.components.map((c) => c.name).sort()
}
