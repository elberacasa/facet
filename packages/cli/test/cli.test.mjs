// CLI tests: spins up a fixture registry in a temp dir and drives the bin.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const BIN = fileURLToPath(new URL('../bin/facet3d.js', import.meta.url))

const GLOW_ORB_SOURCE = `'use client'\n\nexport function GlowOrb() {\n  return null\n}\n`
const STAR_FIELD_SOURCE = `'use client'\n\nexport function StarField() {\n  return null\n}\n`

let registryDir
let projectDir

async function run(args, { cwd = os.tmpdir(), env = {} } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [BIN, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1', ...env },
    })
    return { code: 0, stdout, stderr }
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

before(async () => {
  registryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'facet-registry-'))
  await fs.mkdir(path.join(registryDir, 'components'), { recursive: true })
  await fs.writeFile(
    path.join(registryDir, 'index.json'),
    JSON.stringify(
      {
        components: [
          {
            name: 'glow-orb',
            title: 'Glow Orb',
            description: 'A glowing orb.',
            dependencies: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/rapier'],
            file: 'components/glow-orb.tsx',
            props: [
              { name: 'color', type: 'color', default: '#7c3aed' },
              { name: 'speed', type: 'number', min: 0, max: 10, step: 0.1, default: 2 },
              { name: 'pulsing', type: 'boolean', default: true },
            ],
          },
          {
            name: 'star-field',
            title: 'Star Field',
            description: 'A field of stars.',
            dependencies: ['three', '@react-three/fiber', '@react-three/drei'],
            file: 'components/star-field.tsx',
            props: [
              {
                name: 'density',
                type: 'select',
                options: ['sparse', 'normal', 'dense'],
                default: 'normal',
              },
            ],
          },
        ],
      },
      null,
      2
    )
  )
  await fs.writeFile(path.join(registryDir, 'components/glow-orb.tsx'), GLOW_ORB_SOURCE)
  await fs.writeFile(path.join(registryDir, 'components/star-field.tsx'), STAR_FIELD_SOURCE)
})

after(async () => {
  await fs.rm(registryDir, { recursive: true, force: true })
})

test('init --no-install --yes writes facet.json', async (t) => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'facet-project-'))
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }))

  const res = await run(['init', '--no-install', '--yes'], { cwd: projectDir })
  assert.equal(res.code, 0, res.stderr)

  const config = JSON.parse(
    await fs.readFile(path.join(projectDir, 'facet.json'), 'utf8')
  )
  assert.deepEqual(config, { componentsDir: 'components/facet' })
})

test('init does not overwrite an existing facet.json', async (t) => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'facet-project-'))
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }))
  await fs.writeFile(
    path.join(projectDir, 'facet.json'),
    JSON.stringify({ componentsDir: 'src/three' })
  )

  const res = await run(['init', '--no-install', '--yes'], { cwd: projectDir })
  assert.equal(res.code, 0, res.stderr)

  const config = JSON.parse(
    await fs.readFile(path.join(projectDir, 'facet.json'), 'utf8')
  )
  assert.deepEqual(config, { componentsDir: 'src/three' })
})

test('add copies the component source into componentsDir', async (t) => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'facet-project-'))
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }))

  const res = await run(['add', 'glow-orb', '--registry', registryDir], { cwd: projectDir })
  assert.equal(res.code, 0, res.stderr)

  const written = await fs.readFile(
    path.join(projectDir, 'components/facet/glow-orb.tsx'),
    'utf8'
  )
  assert.equal(written, GLOW_ORB_SOURCE)
})

test("add prints the entry's dependencies, including extra ones", async (t) => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'facet-project-'))
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }))

  const res = await run(['add', 'glow-orb', '--registry', registryDir], { cwd: projectDir })
  assert.equal(res.code, 0, res.stderr)
  assert.match(
    res.stdout,
    /dependencies: three @react-three\/fiber @react-three\/drei @react-three\/rapier/
  )

  const second = await run(['add', 'star-field', '--registry', registryDir], { cwd: projectDir })
  assert.equal(second.code, 0, second.stderr)
  assert.match(
    second.stdout,
    /dependencies: three @react-three\/fiber @react-three\/drei\./
  )
  assert.doesNotMatch(second.stdout, /@react-three\/rapier/)
})

test('add honors componentsDir from facet.json', async (t) => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'facet-project-'))
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }))
  await fs.writeFile(
    path.join(projectDir, 'facet.json'),
    JSON.stringify({ componentsDir: 'src/three' })
  )

  const res = await run(['add', 'star-field', '--registry', registryDir], { cwd: projectDir })
  assert.equal(res.code, 0, res.stderr)

  const written = await fs.readFile(
    path.join(projectDir, 'src/three/star-field.tsx'),
    'utf8'
  )
  assert.equal(written, STAR_FIELD_SOURCE)
})

test('add refuses to overwrite without --overwrite, succeeds with it', async (t) => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'facet-project-'))
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }))

  const target = path.join(projectDir, 'components/facet/glow-orb.tsx')

  const first = await run(['add', 'glow-orb', '--registry', registryDir], { cwd: projectDir })
  assert.equal(first.code, 0, first.stderr)

  const sentinel = '// user edits\n'
  await fs.writeFile(target, sentinel)

  const second = await run(['add', 'glow-orb', '--registry', registryDir], { cwd: projectDir })
  assert.notEqual(second.code, 0)
  assert.match(second.stderr, /already exists/)
  assert.match(second.stderr, /--overwrite/)
  assert.equal(await fs.readFile(target, 'utf8'), sentinel)

  const third = await run(['add', 'glow-orb', '--registry', registryDir, '--overwrite'], { cwd: projectDir })
  assert.equal(third.code, 0, third.stderr)
  assert.equal(await fs.readFile(target, 'utf8'), GLOW_ORB_SOURCE)
})

test('add reports unknown components and lists valid names', async (t) => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'facet-project-'))
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }))

  const res = await run(['add', 'not-a-thing', '--registry', registryDir], { cwd: projectDir })
  assert.notEqual(res.code, 0)
  assert.match(res.stderr, /unknown component/)
  assert.match(res.stderr, /not-a-thing/)
  const output = res.stdout + res.stderr
  assert.match(output, /glow-orb/)
  assert.match(output, /star-field/)

  const dirExists = await fs
    .stat(path.join(projectDir, 'components'))
    .then(() => true)
    .catch(() => false)
  assert.equal(dirExists, false)
})

test('list prints fixture names and descriptions', async () => {
  const res = await run(['list', '--registry', registryDir])
  assert.equal(res.code, 0, res.stderr)
  assert.match(res.stdout, /glow-orb/)
  assert.match(res.stdout, /A glowing orb\./)
  assert.match(res.stdout, /star-field/)
  assert.match(res.stdout, /A field of stars\./)
})

test('registry can be set via FACET_REGISTRY env var', async (t) => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'facet-project-'))
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }))

  const res = await run(['add', 'glow-orb'], {
    cwd: projectDir,
    env: { FACET_REGISTRY: registryDir },
  })
  assert.equal(res.code, 0, res.stderr)

  const written = await fs.readFile(
    path.join(projectDir, 'components/facet/glow-orb.tsx'),
    'utf8'
  )
  assert.equal(written, GLOW_ORB_SOURCE)
})

test('--registry flag beats FACET_REGISTRY env var', async (t) => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'facet-project-'))
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }))

  const res = await run(['add', 'glow-orb', '--registry', registryDir], {
    cwd: projectDir,
    env: { FACET_REGISTRY: '/nonexistent/path' },
  })
  assert.equal(res.code, 0, res.stderr)
})

test('bad registry location produces a clean error', async () => {
  const res = await run(['list', '--registry', '/nonexistent/path'])
  assert.notEqual(res.code, 0)
  assert.match(res.stderr, /could not load registry index/)
})

test('docs prints title, install command, props table and usage example', async () => {
  const res = await run(['docs', 'glow-orb', '--registry', registryDir])
  assert.equal(res.code, 0, res.stderr)
  assert.match(res.stdout, /Glow Orb/)
  assert.match(res.stdout, /A glowing orb\./)
  assert.match(res.stdout, /facet3d add glow-orb/)
  assert.match(res.stdout, /name\s+type\s+default/)
  assert.match(res.stdout, /color\s+color\s+"#7c3aed"/)
  assert.match(res.stdout, /speed\s+number \(0\.\.10, step 0\.1\)\s+2/)
  assert.match(res.stdout, /pulsing\s+boolean\s+true/)
  assert.match(res.stdout, /<Canvas>/)
  assert.match(res.stdout, /<GlowOrb color="#7c3aed" speed=\{2\} pulsing=\{true\} \/>/)
  assert.match(res.stdout, /from '@react-three\/fiber'/)
})

test('docs renders select options in the props table', async () => {
  const res = await run(['docs', 'star-field', '--registry', registryDir])
  assert.equal(res.code, 0, res.stderr)
  assert.match(res.stdout, /density\s+select \(sparse \| normal \| dense\)\s+"normal"/)
})

test('docs shows a Dependencies section before Props', async () => {
  const res = await run(['docs', 'glow-orb', '--registry', registryDir])
  assert.equal(res.code, 0, res.stderr)
  assert.match(res.stdout, /Dependencies\n/)
  assert.match(
    res.stdout,
    /Dependencies\n\s+three @react-three\/fiber @react-three\/drei @react-three\/rapier/
  )
  assert.ok(
    res.stdout.indexOf('Dependencies') < res.stdout.indexOf('Props'),
    'Dependencies section should appear before Props'
  )

  const second = await run(['docs', 'star-field', '--registry', registryDir])
  assert.equal(second.code, 0, second.stderr)
  assert.match(
    second.stdout,
    /Dependencies\n\s+three @react-three\/fiber @react-three\/drei\n/
  )
})

test('docs --source appends the component source', async () => {
  const res = await run(['docs', 'glow-orb', '--registry', registryDir, '--source'])
  assert.equal(res.code, 0, res.stderr)
  assert.match(res.stdout, /Source/)
  assert.ok(res.stdout.includes(GLOW_ORB_SOURCE), 'output should include the full fixture source')
})

test('docs without a name errors with usage', async () => {
  const res = await run(['docs', '--registry', registryDir])
  assert.notEqual(res.code, 0)
  assert.match(res.stderr, /no component specified/)
  assert.match(res.stdout, /usage: facet3d docs/)
})

test('docs reports an unknown component and lists valid names', async () => {
  const res = await run(['docs', 'not-a-thing', '--registry', registryDir])
  assert.notEqual(res.code, 0)
  assert.match(res.stderr, /unknown component/)
  assert.match(res.stderr, /not-a-thing/)
  const output = res.stdout + res.stderr
  assert.match(output, /glow-orb/)
  assert.match(output, /star-field/)
})

test('--help and --version work', async () => {
  const help = await run(['--help'])
  assert.equal(help.code, 0)
  assert.match(help.stdout, /facet3d add/)
  assert.match(help.stdout, /facet3d docs/)

  const version = await run(['--version'])
  assert.equal(version.code, 0)
  assert.match(version.stdout, /facet3d\/\d+\.\d+\.\d+/)
})
