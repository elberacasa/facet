import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { callTool } from '../src/tools.mjs'

const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url))

const ALPHA_SOURCE = `export function AlphaWave() {
  return <mesh />
}
`

const INDEX = {
  components: [
    {
      name: 'alpha-wave',
      title: 'Alpha Wave',
      description: 'A wavy test component.',
      dependencies: ['three', '@react-three/fiber'],
      file: 'components/alpha-wave.tsx',
      category: 'Visuals',
      props: [
        { name: 'color', type: 'color', default: '#ff0000' },
        { name: 'speed', type: 'number', min: 0, max: 5, step: 0.1, default: 1 },
        { name: 'mode', type: 'select', options: ['a', 'b'], default: 'a' },
      ],
    },
    {
      name: 'beta-spin',
      title: 'Beta Spin',
      description: 'A spinny test component.',
      file: 'components/beta-spin.tsx',
      category: 'Motion',
    },
  ],
}

async function makeFixtureRegistry(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'facet-mcp-test-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  await fs.mkdir(path.join(dir, 'components'), { recursive: true })
  await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify(INDEX))
  await fs.writeFile(path.join(dir, 'components', 'alpha-wave.tsx'), ALPHA_SOURCE)
  await fs.writeFile(
    path.join(dir, 'components', 'beta-spin.tsx'),
    `export function BetaSpin() { return null }\n`
  )
  return dir
}

test('facet_list shows name, category, title, description', async (t) => {
  const registry = await makeFixtureRegistry(t)
  const text = await callTool(registry, 'facet_list')
  assert.match(text, /alpha-wave \[Visuals\] — Alpha Wave/)
  assert.match(text, /A wavy test component\./)
  assert.match(text, /beta-spin \[Motion\] — Beta Spin/)
  assert.match(text, /A spinny test component\./)
  assert.ok(text.indexOf('alpha-wave') < text.indexOf('beta-spin'))
})

test('facet_docs formats dependencies, props and usage', async (t) => {
  const registry = await makeFixtureRegistry(t)
  const text = await callTool(registry, 'facet_docs', { name: 'alpha-wave' })
  assert.match(text, /^Alpha Wave\nA wavy test component\./)
  assert.match(text, /Dependencies\n {2}three @react-three\/fiber/)
  assert.match(text, /Props\n/)
  assert.match(text, /color {2,}color {2,}"#ff0000"/)
  assert.match(text, /speed {2,}number \(0\.\.5, step 0\.1\) {2,}1/)
  assert.match(text, /mode {2,}select \(a \| b\) {2,}"a"/)
  assert.match(text, /Usage\n/)
  assert.match(text, /import \{ Canvas \} from '@react-three\/fiber'/)
  assert.match(text, /import \{ AlphaWave \} from '@\/components\/facet\/alpha-wave'/)
  assert.match(text, /<AlphaWave color="#ff0000" speed=\{1\} mode="a" \/>/)
  assert.match(text, /<Canvas>/)
})

test('facet_docs falls back to runtime deps when entry has none', async (t) => {
  const registry = await makeFixtureRegistry(t)
  const text = await callTool(registry, 'facet_docs', { name: 'beta-spin' })
  assert.match(text, /three @react-three\/fiber @react-three\/drei/)
  assert.match(text, /<BetaSpin \/>/)
})

test('facet_source returns exact component bytes', async (t) => {
  const registry = await makeFixtureRegistry(t)
  const text = await callTool(registry, 'facet_source', { name: 'alpha-wave' })
  assert.equal(text, ALPHA_SOURCE)
})

test('facet_add writes file, refuses overwrite, honors overwrite', async (t) => {
  const registry = await makeFixtureRegistry(t)
  const target = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), 'facet-mcp-target-')),
    'project'
  )
  t.after(() => fs.rm(target, { recursive: true, force: true }))

  const result = await callTool(registry, 'facet_add', {
    name: 'alpha-wave',
    targetDir: target,
  })
  const file = path.join(target, 'components', 'facet', 'alpha-wave.tsx')
  assert.ok(existsSync(file))
  assert.equal(await fs.readFile(file, 'utf8'), ALPHA_SOURCE)
  assert.match(result, new RegExp(`added alpha-wave → ${file.replace(/[/.]/g, '\\$&')}`))
  assert.match(result, /dependencies: three @react-three\/fiber/)

  // second add without overwrite fails, file untouched
  await fs.writeFile(file, 'custom edits')
  await assert.rejects(
    callTool(registry, 'facet_add', { name: 'alpha-wave', targetDir: target }),
    /already exists.*overwrite: true/
  )
  assert.equal(await fs.readFile(file, 'utf8'), 'custom edits')

  // with overwrite it replaces
  await callTool(registry, 'facet_add', {
    name: 'alpha-wave',
    targetDir: target,
    overwrite: true,
  })
  assert.equal(await fs.readFile(file, 'utf8'), ALPHA_SOURCE)
})

test('unknown component errors list valid names', async (t) => {
  const registry = await makeFixtureRegistry(t)
  for (const tool of ['facet_docs', 'facet_source', 'facet_add']) {
    await assert.rejects(
      callTool(registry, tool, { name: 'nope' }),
      /unknown component: "nope"\. available components: alpha-wave, beta-spin/
    )
  }
})

test('unknown tool errors list valid tools', async (t) => {
  const registry = await makeFixtureRegistry(t)
  await assert.rejects(
    callTool(registry, 'facet_nope'),
    /unknown tool: facet_nope\. available tools: facet_list, facet_docs, facet_source, facet_add/
  )
})

test('stdio server answers initialize, tools/list and tools/call', async (t) => {
  const registry = await makeFixtureRegistry(t)
  const child = spawn(
    process.execPath,
    [path.join(PKG_ROOT, 'bin', 'mcp.js'), '--registry', registry],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  )
  t.after(() => child.kill())

  // MCP stdio framing (SDK ReadBuffer): one JSON-RPC message per line.
  const pending = new Map()
  let buffer = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => (stderr += chunk))
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (!line) continue
      const message = JSON.parse(line)
      if (message.id !== undefined && pending.has(message.id)) {
        pending.get(message.id)(message)
        pending.delete(message.id)
      }
    }
  })

  let nextId = 1
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      const timer = setTimeout(
        () => reject(new Error(`timeout waiting for ${method}. stderr: ${stderr}`)),
        10000
      )
      pending.set(id, (message) => {
        clearTimeout(timer)
        resolve(message)
      })
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  const notify = (method) =>
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`)

  const init = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '0.0.0' },
  })
  assert.equal(init.jsonrpc, '2.0')
  assert.deepEqual(init.result.serverInfo, { name: 'facet', version: '0.1.0' })
  assert.ok(init.result.capabilities.tools)

  notify('notifications/initialized')

  const list = await request('tools/list', {})
  const toolNames = list.result.tools.map((tool) => tool.name).sort()
  assert.deepEqual(toolNames, [
    'facet_add',
    'facet_docs',
    'facet_list',
    'facet_source',
  ])

  const call = await request('tools/call', {
    name: 'facet_list',
    arguments: {},
  })
  assert.equal(call.result.isError, undefined)
  assert.equal(call.result.content[0].type, 'text')
  assert.match(call.result.content[0].text, /alpha-wave \[Visuals\] — Alpha Wave/)

  const failing = await request('tools/call', {
    name: 'facet_docs',
    arguments: { name: 'nope' },
  })
  assert.equal(failing.result.isError, true)
  assert.match(
    failing.result.content[0].text,
    /unknown component: "nope"\. available components: alpha-wave, beta-spin/
  )

  child.kill()
})
