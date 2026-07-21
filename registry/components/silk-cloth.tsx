// SilkCloth — an elegant silk banner: CPU verlet cloth billowing in fbm-gusted
// wind, with smooth pointer push/drag interaction (no tearing).
// Must be rendered inside a react-three-fiber <Canvas>.
//
// Usage:
//   <Canvas camera={{ position: [0, 0, 5.5] }}>
//     <SilkCloth color="#a3e635" windStrength={1} gustiness={1} pinMode="top" />
//   </Canvas>
//
// Install:
//   npx facet3d add silk-cloth
//
// Dependencies: react, three, @react-three/fiber
//
// The simulation runs on a fixed-timestep accumulator (verlet integration +
// 5 constraint-relaxation iterations), writes directly into the geometry's
// position attribute and recomputes vertex normals every frame. All buffers
// are preallocated — zero per-frame allocations in the hot loop.
// Sheen-rich double-sided MeshPhysicalMaterial + baked vertical-gradient
// vertex colors give the soft self-shadowed silk look, and self-contained
// lights mean no scene lighting is required.
'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

export interface SilkClothProps {
  color?: string
  windStrength?: number
  gustiness?: number
  segments?: number
  pointerRadius?: number
  pointerStrength?: number
  pinMode?: 'top' | 'corners'
  sheen?: number
}

const CLOTH_W = 3.4
const CLOTH_H = 2.4
const STEP = 1 / 60 // fixed simulation timestep
const MAX_STEPS = 4 // per-frame substep cap (tab-switch spiral guard)
const DAMPING = 0.985
const GRAVITY = -2.2 // silk is light — wind dominates
const RELAX_ITERS = 5 // keeps hem stretch under ~5% — silk, not rubber
const POINTER_ACCEL = 15 // u/s² at the cursor's center — a firm dent, not a launch
const POINTER_DRAG = 4 // extra shove from fast cursor movement (per u/s of cursor vel)

// --- tiny deterministic value-noise fbm (CPU) --------------------------------
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return s - Math.floor(s)
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

function fbm(x: number, y: number): number {
  let v = valueNoise(x, y) * 0.55
  v += valueNoise(x * 2.13 + 17.3, y * 2.13 + 9.1) * 0.3
  v += valueNoise(x * 4.41 - 4.7, y * 4.41 + 3.9) * 0.15
  return v // ~0..1
}

// --- cloth buffers ------------------------------------------------------------
interface ClothSim {
  geometry: THREE.BufferGeometry
  pos: Float32Array // live positions — IS the geometry position attribute array
  prev: Float32Array
  rest: Float32Array
  pinned: Uint8Array
  linksA: Int32Array
  linksB: Int32Array
  linksRest: Float32Array
  count: number
}

function buildCloth(segments: number, pinMode: 'top' | 'corners'): ClothSim {
  const seg = Math.max(4, Math.min(64, Math.floor(segments))) // hard cap: 64
  const n = seg + 1
  const count = n * n
  const pos = new Float32Array(count * 3)
  const rest = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  const pinned = new Uint8Array(count)

  // Grid hangs in the local XY plane, top edge at +CLOTH_H/2.
  for (let iy = 0; iy < n; iy++) {
    const v = iy / seg
    const y = CLOTH_H / 2 - v * CLOTH_H
    for (let ix = 0; ix < n; ix++) {
      const u = ix / seg
      const x = -CLOTH_W / 2 + u * CLOTH_W
      const i = iy * n + ix
      rest[i * 3] = x
      rest[i * 3 + 1] = y
      rest[i * 3 + 2] = 0
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = 0
      uvs[i * 2] = u
      uvs[i * 2 + 1] = 1 - v
      // Baked vertical gradient — bright at the pinned edge, softly shadowed
      // toward the free hem. Reads as gentle self-shadowing under any light.
      const b = 1.04 - 0.36 * v
      colors[i * 3] = b
      colors[i * 3 + 1] = b
      colors[i * 3 + 2] = b
    }
  }

  if (pinMode === 'top') {
    for (let ix = 0; ix < n; ix++) pinned[ix] = 1
  } else {
    pinned[0] = 1 // top-left
    pinned[n - 1] = 1 // top-right
  }

  // Winding gives front faces toward +z (verified: cross(c-a, b-a) = +z).
  const indices = new Uint32Array(seg * seg * 6)
  let k = 0
  for (let iy = 0; iy < seg; iy++) {
    for (let ix = 0; ix < seg; ix++) {
      const a = iy * n + ix
      const b = a + 1
      const c = a + n
      const d = c + 1
      indices[k++] = a
      indices[k++] = c
      indices[k++] = b
      indices[k++] = b
      indices[k++] = c
      indices[k++] = d
    }
  }

  // Structural links only (horizontal + vertical) — silk stays drapey.
  const linkCount = 2 * seg * n
  const linksA = new Int32Array(linkCount)
  const linksB = new Int32Array(linkCount)
  const linksRest = new Float32Array(linkCount)
  let l = 0
  const dx = CLOTH_W / seg
  const dy = CLOTH_H / seg
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < seg; ix++) {
      linksA[l] = iy * n + ix
      linksB[l] = iy * n + ix + 1
      linksRest[l] = dx
      l++
    }
  }
  for (let iy = 0; iy < seg; iy++) {
    for (let ix = 0; ix < n; ix++) {
      linksA[l] = iy * n + ix
      linksB[l] = (iy + 1) * n + ix
      linksRest[l] = dy
      l++
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()

  return {
    geometry,
    pos,
    prev: pos.slice(),
    rest,
    pinned,
    linksA,
    linksB,
    linksRest,
    count,
  }
}

// One fixed-timestep substep: integrate → pointer impulse → constraint relax.
// Everything writes in place into preallocated typed arrays.
function stepCloth(
  sim: ClothSim,
  time: number,
  windStrength: number,
  gustiness: number,
  px: number,
  py: number,
  pvx: number,
  pvy: number,
  pointerRadius: number,
  pointerStrength: number,
  pointerInfluence: number
): void {
  const { pos, prev, rest, pinned, linksA, linksB, linksRest, count } = sim
  const h2 = STEP * STEP
  const windBase = 6 * windStrength

  // Verlet integration with an fbm gust field drifting over the cloth.
  for (let i = 0; i < count; i++) {
    if (pinned[i]) continue
    const i3 = i * 3
    const x = pos[i3]
    const y = pos[i3 + 1]
    const z = pos[i3 + 2]
    const nse = fbm(x * 0.55 + time * 0.45, y * 0.55 - time * 0.3)
    // Peak-clamped so max windStrength × max gustiness flaps hard but never
    // knots the cloth into creases it can't unfold from.
    const gust = Math.min(windBase * (0.35 + gustiness * 1.5 * nse), 22)
    const ax = Math.sin(time * 0.6 + y * 0.8) * gust * 0.25
    const ay = GRAVITY + Math.cos(time * 0.5 + x * 0.7) * gust * 0.12
    const az = gust * (0.75 + 0.25 * Math.sin(time * 0.9 + x * 1.3 + y * 0.6))
    pos[i3] = x + (x - prev[i3]) * DAMPING + ax * h2
    pos[i3 + 1] = y + (y - prev[i3 + 1]) * DAMPING + ay * h2
    pos[i3 + 2] = z + (z - prev[i3 + 2]) * DAMPING + az * h2
    prev[i3] = x
    prev[i3 + 1] = y
    prev[i3 + 2] = z
  }

  // Pointer impulse: smooth quadratic radial falloff, push along +z plus a
  // slight radial shove and a drag term from the cursor's world velocity.
  // Only `pos` moves — verlet reads the displacement as velocity, and the
  // constraint pass below absorbs the stretch, so the cloth never tears.
  // The push is an acceleration scaled by h² (like gravity/wind above), so it
  // dents the cloth instead of launching it; the drag term scales with STEP
  // for the same reason.
  if (pointerInfluence > 0.001) {
    const r = Math.max(pointerRadius, 1e-3)
    const r2 = r * r
    const push = pointerStrength * pointerInfluence
    for (let i = 0; i < count; i++) {
      if (pinned[i]) continue
      const i3 = i * 3
      const ddx = pos[i3] - px
      const ddy = pos[i3 + 1] - py
      const d2 = ddx * ddx + ddy * ddy
      if (d2 > r2) continue
      const d = Math.sqrt(d2)
      const fall = 1 - d / r
      const f = fall * fall * push
      const inv = 1 / Math.max(d, 1e-4) // guarded — never normalize(0)
      pos[i3] += (ddx * inv * POINTER_ACCEL * 0.45 + pvx * POINTER_DRAG) * f * h2
      pos[i3 + 1] += (ddy * inv * POINTER_ACCEL * 0.45 + pvy * POINTER_DRAG) * f * h2
      pos[i3 + 2] += f * POINTER_ACCEL * h2
    }
  }

  // Constraint relaxation; pinned verts are hard-reset every iteration so the
  // pinned edge never accumulates drift.
  for (let iter = 0; iter < RELAX_ITERS; iter++) {
    for (let li = 0; li < linksA.length; li++) {
      const a = linksA[li]
      const b = linksB[li]
      const a3 = a * 3
      const b3 = b * 3
      const dxv = pos[b3] - pos[a3]
      const dyv = pos[b3 + 1] - pos[a3 + 1]
      const dzv = pos[b3 + 2] - pos[a3 + 2]
      const dist = Math.sqrt(dxv * dxv + dyv * dyv + dzv * dzv)
      if (dist < 1e-7) continue
      const diff = (dist - linksRest[li]) / dist
      const pa = pinned[a]
      const pb = pinned[b]
      if (pa && pb) continue
      const wa = pa ? 0 : pb ? 1 : 0.5
      const wb = pb ? 0 : pa ? 1 : 0.5
      pos[a3] += dxv * diff * wa
      pos[a3 + 1] += dyv * diff * wa
      pos[a3 + 2] += dzv * diff * wa
      pos[b3] -= dxv * diff * wb
      pos[b3 + 1] -= dyv * diff * wb
      pos[b3 + 2] -= dzv * diff * wb
    }
    for (let i = 0; i < count; i++) {
      if (pinned[i]) {
        const i3 = i * 3
        pos[i3] = rest[i3]
        pos[i3 + 1] = rest[i3 + 1]
        pos[i3 + 2] = rest[i3 + 2]
      }
    }
  }
}

export function SilkCloth({
  color = '#a3e635',
  windStrength = 1,
  gustiness = 1,
  segments = 36,
  pointerRadius = 0.9,
  pointerStrength = 1,
  pinMode = 'top',
  sheen = 1,
}: SilkClothProps) {
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null)
  const sim = useMemo(() => buildCloth(segments, pinMode), [segments, pinMode])

  // Simulation clock + fixed-timestep accumulator.
  const timeRef = useRef(0)
  const accRef = useRef(0)
  // Pointer state in world space on the z=0 plane (the cloth's rest plane).
  const pointerActive = useRef(false)
  const hadPointer = useRef(false)
  const influence = useRef(0) // eased 0..1 so engagement never pops
  const pointerPos = useRef(new THREE.Vector2(9999, 9999))
  const pointerVel = useRef(new THREE.Vector2(0, 0))
  const scratch = useMemo(() => ({ point: new THREE.Vector3(), dir: new THREE.Vector3() }), [])

  // Sheen tint: base color lifted toward white — reads as silk highlights.
  const sheenColor = useMemo(
    () => new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.45),
    [color]
  )
  const rimColor = useMemo(() => new THREE.Color(color), [color])

  // Only push the cloth once the cursor has actually moved over the window —
  // state.pointer defaults to (0,0), which would dent the banner's center.
  useEffect(() => {
    const onMove = () => {
      pointerActive.current = true
    }
    const onLeave = () => {
      pointerActive.current = false
    }
    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  // Dispose GPU resources on unmount / rebuild (material is disposed too —
  // R3F would auto-dispose the JSX material, this just makes it explicit).
  useEffect(() => () => sim.geometry.dispose(), [sim])
  useEffect(
    () => () => {
      materialRef.current?.dispose()
    },
    []
  )

  useFrame((state, delta) => {
    // Unproject the pointer onto the z=0 world plane (camera ray / plane hit).
    let targetInfluence = 0
    if (pointerActive.current) {
      const { camera, pointer } = state
      const { point, dir } = scratch
      point.set(pointer.x, pointer.y, 0.5).unproject(camera)
      dir.copy(point).sub(camera.position)
      const len = dir.length()
      if (len > 1e-6) {
        dir.multiplyScalar(1 / len)
        if (Math.abs(dir.z) > 1e-6) {
          const t = -camera.position.z / dir.z
          if (t > 0) {
            const wx = camera.position.x + dir.x * t
            const wy = camera.position.y + dir.y * t
            if (hadPointer.current) {
              const dt = Math.max(delta, 1e-4)
              let pvx = (wx - pointerPos.current.x) / dt
              let pvy = (wy - pointerPos.current.y) / dt
              const vmag = Math.hypot(pvx, pvy)
              if (vmag > 18) {
                pvx = (pvx / vmag) * 18
                pvy = (pvy / vmag) * 18
              }
              // Smoothed cursor velocity drives the drag term.
              pointerVel.current.x += (pvx - pointerVel.current.x) * 0.35
              pointerVel.current.y += (pvy - pointerVel.current.y) * 0.35
            } else {
              pointerVel.current.set(0, 0) // re-entry: no velocity spike
              hadPointer.current = true
            }
            pointerPos.current.set(wx, wy)
            targetInfluence = 1
          }
        }
      }
    }
    if (targetInfluence === 0) {
      hadPointer.current = false
      pointerVel.current.multiplyScalar(Math.max(0, 1 - delta * 8))
    }
    influence.current += (targetInfluence - influence.current) * Math.min(1, delta * 6)

    // Fixed-timestep accumulator, clamped against tab-switch spirals.
    accRef.current = Math.min(accRef.current + Math.min(delta, 0.1), STEP * MAX_STEPS)
    let stepped = false
    while (accRef.current >= STEP) {
      timeRef.current += STEP
      stepCloth(
        sim,
        timeRef.current,
        windStrength,
        gustiness,
        pointerPos.current.x,
        pointerPos.current.y,
        pointerVel.current.x,
        pointerVel.current.y,
        pointerRadius,
        pointerStrength,
        influence.current
      )
      accRef.current -= STEP
      stepped = true
    }

    if (stepped) {
      sim.geometry.getAttribute('position').needsUpdate = true
      sim.geometry.computeVertexNormals()
    }
  })

  return (
    <group>
      {/* Self-contained lighting: cool ambient, neutral key, colored rim. */}
      <ambientLight intensity={0.32} />
      <directionalLight position={[3, 4, 5]} intensity={1.9} />
      <pointLight position={[-3.5, -2, 3]} intensity={14} distance={14} decay={2} color={rimColor} />
      <mesh geometry={sim.geometry} frustumCulled={false}>
        <meshPhysicalMaterial
          ref={materialRef}
          color={color}
          side={THREE.DoubleSide}
          roughness={0.52}
          metalness={0}
          sheen={sheen}
          sheenRoughness={0.38}
          sheenColor={sheenColor}
          clearcoat={0.12}
          clearcoatRoughness={0.6}
          vertexColors
        />
      </mesh>
    </group>
  )
}
