// LightningArcs — branching electric arcs between two endpoints, regenerated on
// a strike timer with recursive midpoint displacement. Additive shader ribbons
// with a white-hot core, colored glow falloff, per-branch alpha fade, intensity
// flicker, and a point-light flash with fast afterglow decay on every strike.
// Must be rendered inside a react-three-fiber <Canvas>.
//
// Usage:
//   <LightningArcs />
//   <LightningArcs color="#67e8f9" branches={4} strikeRate={2} followPointer />
//
// Install:
//   npx facet3d add lightning-arcs
//
// Dependencies: react, three, @react-three/fiber, @react-three/drei
'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, extend } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'

export interface LightningArcsProps {
  color?: string
  branches?: number
  strikeRate?: number
  thickness?: number
  flicker?: number
  followPointer?: boolean
  glowIntensity?: number
  from?: [number, number, number]
  to?: [number, number, number]
}

// Hard caps — every buffer below is preallocated once and never grows.
// A strike writes into these pools and sets the draw range; no per-strike
// allocation beyond bounded scratch reuse.
const MAX_QUADS = 1024 // ribbon segments (4 verts / 6 indices each)
const MAX_PATH_POINTS = 33 // 2^5 + 1 — deepest midpoint-displacement level
const MAX_BRANCHES = 128 // pending branch queue cap

const LightningArcsMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color('#a3e635'),
    uIntensity: 1,
    uGlow: 1.6,
  },
  /* glsl */ `
    uniform float uTime;
    attribute vec3 aDir;
    attribute float aSide;
    attribute float aWidth;
    attribute float aFade;
    attribute float aRand;
    varying float vSide;
    varying float vFade;
    varying float vRand;

    void main() {
      // Camera-facing ribbon expansion in view space: push each vertex
      // sideways along the perpendicular of (segment dir, view dir).
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 dirV = normalize((modelViewMatrix * vec4(aDir, 0.0)).xyz + vec3(1e-6));
      vec3 viewFwd = normalize(-mv.xyz + vec3(1e-6));
      vec3 c = cross(dirV, viewFwd);
      // Never divide by ~0: when the segment points at the camera the cross
      // length collapses and the quad simply degenerates instead of NaN-ing.
      vec3 perp = c / max(length(c), 0.001);
      mv.xyz += perp * aSide * aWidth;

      vSide = aSide;
      vFade = aFade;
      vRand = aRand;
      gl_Position = projectionMatrix * mv;
    }
  `,
  /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uGlow;
    varying float vSide;
    varying float vFade;
    varying float vRand;

    void main() {
      float d = abs(vSide);
      // The ribbon is expanded ~3x past the core width (see aWidth emit), so
      // the profile below splits it into: thin white-hot core, tight hot
      // sheath, and a wide soft halo — without the spread the glow is
      // subpixel and the bolt reads as a rope instead of an arc.
      float core = 1.0 - smoothstep(0.0, 0.1, d);
      float sheath = pow(max(1.0 - d, 0.0), 5.0);
      float glow = pow(max(1.0 - d, 0.0), 2.0);
      // Per-branch shimmer so each arc breathes on its own phase.
      float shimmer = 0.8 + 0.2 * sin(uTime * 21.0 + vRand * 40.0);
      vec3 hot = mix(uColor, vec3(1.0, 0.99, 0.96), 0.8);
      vec3 col = vec3(1.0, 0.99, 0.96) * core * 1.4 + hot * sheath * 0.9 + uColor * glow * uGlow;
      float alpha = (core + sheath * 0.8 + glow * 0.5) * vFade * uIntensity * shimmer;
      if (alpha < 0.003) discard;
      gl_FragColor = vec4(col * vFade * uIntensity * shimmer, alpha);
    }
  `
)

extend({ LightningArcsMaterial })

declare global {
  namespace JSX {
    interface IntrinsicElements {
      lightningArcsMaterial: any
    }
  }
}

export function LightningArcs({
  color = '#a3e635',
  branches = 3,
  strikeRate = 1.5,
  thickness = 0.04,
  flicker = 0.7,
  followPointer = false,
  glowIntensity = 1.6,
  from = [-3.4, 0.5, 0],
  to = [3.4, 0.5, 0],
}: LightningArcsProps) {
  const materialRef = useRef<any>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const timeRef = useRef(0)
  const nextStrikeRef = useRef(0)
  const lastStrikeRef = useRef(-100)
  const nextStepRef = useRef(0)
  const stepRef = useRef(1)
  const pointerTargetRef = useRef(new THREE.Vector3())
  const pointerCurRef = useRef(new THREE.Vector3())
  const pointerInitRef = useRef(false)
  const lastColorRef = useRef('')

  // Preallocated buffer pools (fixed size, created once).
  const pools = useMemo(() => {
    const quadVerts = MAX_QUADS * 4
    const position = new Float32Array(quadVerts * 3)
    const aDir = new Float32Array(quadVerts * 3)
    const aSide = new Float32Array(quadVerts)
    const aWidth = new Float32Array(quadVerts)
    const aFade = new Float32Array(quadVerts)
    const aRand = new Float32Array(quadVerts)

    const index = new Uint32Array(MAX_QUADS * 6)
    for (let q = 0; q < MAX_QUADS; q++) {
      const v = q * 4
      const i = q * 6
      index[i] = v
      index[i + 1] = v + 2
      index[i + 2] = v + 1
      index[i + 3] = v + 1
      index[i + 4] = v + 2
      index[i + 5] = v + 3
    }

    const geometry = new THREE.BufferGeometry()
    const setAttr = (name: string, arr: Float32Array, size: number) => {
      const attr = new THREE.BufferAttribute(arr, size)
      attr.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute(name, attr)
    }
    setAttr('position', position, 3)
    setAttr('aDir', aDir, 3)
    setAttr('aSide', aSide, 1)
    setAttr('aWidth', aWidth, 1)
    setAttr('aFade', aFade, 1)
    setAttr('aRand', aRand, 1)
    geometry.setIndex(new THREE.BufferAttribute(index, 1))
    geometry.setDrawRange(0, 0)

    return {
      geometry,
      position,
      aDir,
      aSide,
      aWidth,
      aFade,
      aRand,
      // generation scratch: current bolt polyline + branch queue
      path: new Float32Array(MAX_PATH_POINTS * 3),
      queue: new Float32Array(MAX_BRANCHES * 8), // ax ay az bx by bz depth seed
    }
  }, [])

  // Dispose GPU resources on unmount.
  useEffect(() => {
    const { geometry } = pools
    return () => {
      geometry.dispose()
      materialRef.current?.dispose()
    }
  }, [pools])

  // Rebuild the whole arc system into the pooled buffers. Bounded by
  // MAX_QUADS / MAX_BRANCHES — safe to call as often as needed.
  const regenerate = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    const p = pools
    const maxDepth = Math.max(1, Math.min(4, Math.round(branches)))
    let quadCursor = 0
    let qHead = 0
    let qTail = 0

    const pushBranch = (
      sax: number, say: number, saz: number,
      sbx: number, sby: number, sbz: number,
      depth: number, seed: number
    ) => {
      if (qTail >= MAX_BRANCHES) return
      const o = qTail * 8
      p.queue[o] = sax; p.queue[o + 1] = say; p.queue[o + 2] = saz
      p.queue[o + 3] = sbx; p.queue[o + 4] = sby; p.queue[o + 5] = sbz
      p.queue[o + 6] = depth; p.queue[o + 7] = seed
      qTail++
    }

    // Midpoint displacement between path[i0] and path[i1], recursive.
    const subdivide = (i0: number, i1: number, disp: number) => {
      if (i1 - i0 <= 1 || disp < 1e-5) return
      const mid = (i0 + i1) >> 1
      const a3 = i0 * 3
      const b3 = i1 * 3
      const m3 = mid * 3
      const dx = p.path[b3] - p.path[a3]
      const dy = p.path[b3 + 1] - p.path[a3 + 1]
      const dz = p.path[b3 + 2] - p.path[a3 + 2]
      // Random direction, projected perpendicular to the segment.
      let rx = Math.random() - 0.5
      let ry = Math.random() - 0.5
      let rz = Math.random() - 0.5
      const lenSq = dx * dx + dy * dy + dz * dz
      if (lenSq > 1e-10) {
        const dot = (rx * dx + ry * dy + rz * dz) / lenSq
        rx -= dx * dot; ry -= dy * dot; rz -= dz * dot
      }
      const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz)
      const scale = rLen > 1e-6 ? disp / rLen : 0
      p.path[m3] = (p.path[a3] + p.path[b3]) * 0.5 + rx * scale
      p.path[m3 + 1] = (p.path[a3 + 1] + p.path[b3 + 1]) * 0.5 + ry * scale
      p.path[m3 + 2] = (p.path[a3 + 2] + p.path[b3 + 2]) * 0.5 + rz * scale
      subdivide(i0, mid, disp * 0.55)
      subdivide(mid, i1, disp * 0.55)
    }

    pushBranch(ax, ay, az, bx, by, bz, 0, Math.random())

    while (qHead < qTail && quadCursor < MAX_QUADS) {
      const o = qHead * 8
      qHead++
      const depth = p.queue[o + 6]
      const seed = p.queue[o + 7]
      const fax = p.queue[o]; const fay = p.queue[o + 1]; const faz = p.queue[o + 2]
      const fbx = p.queue[o + 3]; const fby = p.queue[o + 4]; const fbz = p.queue[o + 5]

      // Fewer displacement levels on deeper branches (thinner, simpler arcs).
      const sub = Math.max(2, 5 - depth)
      const count = (1 << sub) + 1
      p.path[0] = fax; p.path[1] = fay; p.path[2] = faz
      const last3 = (count - 1) * 3
      p.path[last3] = fbx; p.path[last3 + 1] = fby; p.path[last3 + 2] = fbz
      const boltLen = Math.hypot(fbx - fax, fby - fay, fbz - faz)
      subdivide(0, count - 1, boltLen * 0.22)

      const depthScale = Math.pow(0.62, depth)
      const pathFade = (0.7 + 0.3 * seed) * depthScale

      // Emit ribbon quads for this bolt path.
      const segs = Math.min(count - 1, MAX_QUADS - quadCursor)
      for (let i = 0; i < segs; i++) {
        const a3 = i * 3
        const b3 = (i + 1) * 3
        let dx = p.path[b3] - p.path[a3]
        let dy = p.path[b3 + 1] - p.path[a3 + 1]
        let dz = p.path[b3 + 2] - p.path[a3 + 2]
        const dLen = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dLen > 1e-8) { dx /= dLen; dy /= dLen; dz /= dLen } else { dx = 1; dy = 0; dz = 0 }

        const v = (quadCursor + i) * 4
        for (let corner = 0; corner < 4; corner++) {
          const src = corner < 2 ? a3 : b3
          const t = (i + (corner >= 2 ? 1 : 0)) / (count - 1)
          // Main bolt: pinched at both ends. Branches: taper toward the tip.
          const taper =
            depth === 0
              ? 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * Math.min(Math.max(t, 0.02), 0.98)), 0.6)
              : (1 - 0.65 * t) * 0.9
          const idx = v + corner
          p.position[idx * 3] = p.path[src]
          p.position[idx * 3 + 1] = p.path[src + 1]
          p.position[idx * 3 + 2] = p.path[src + 2]
          p.aDir[idx * 3] = dx; p.aDir[idx * 3 + 1] = dy; p.aDir[idx * 3 + 2] = dz
          p.aSide[idx] = corner % 2 === 0 ? -1 : 1
          // Ribbon spans ~3x the core width so the fragment profile has
          // room for the outer glow halo (core lives in the inner ~10%).
          p.aWidth[idx] = thickness * depthScale * taper * 3.0
          p.aFade[idx] = pathFade
          p.aRand[idx] = seed
        }
      }
      quadCursor += segs

      // Spawn child branches from interior points of this path.
      if (depth < maxDepth) {
        const kids = depth === 0 ? 3 : depth === 1 ? 2 : 1
        for (let k = 0; k < kids; k++) {
          const at = 1 + Math.floor(Math.random() * (count - 2))
          const s3 = at * 3
          // Rotate the remaining direction by a random angle off-axis.
          const e3 = last3
          let bdx = p.path[e3] - p.path[s3]
          let bdy = p.path[e3 + 1] - p.path[s3 + 1]
          let bdz = p.path[e3 + 2] - p.path[s3 + 2]
          const bLen = Math.sqrt(bdx * bdx + bdy * bdy + bdz * bdz)
          if (bLen < 1e-6) continue
          bdx /= bLen; bdy /= bLen; bdz /= bLen
          // Random perpendicular kick.
          let kx = Math.random() - 0.5
          let ky = Math.random() - 0.5
          let kz = Math.random() - 0.5
          const kdot = kx * bdx + ky * bdy + kz * bdz
          kx -= bdx * kdot; ky -= bdy * kdot; kz -= bdz * kdot
          const kLen = Math.sqrt(kx * kx + ky * ky + kz * kz)
          if (kLen < 1e-6) continue
          const spread = 0.5 + Math.random() * 0.7
          const branchLen = boltLen * (0.3 + Math.random() * 0.25)
          const inv = 1 / kLen
          const ex = (bdx + kx * inv * spread) * branchLen
          const ey = (bdy + ky * inv * spread) * branchLen
          const ez = (bdz + kz * inv * spread) * branchLen
          pushBranch(
            p.path[s3], p.path[s3 + 1], p.path[s3 + 2],
            p.path[s3] + ex, p.path[s3 + 1] + ey, p.path[s3 + 2] + ez,
            depth + 1, Math.random()
          )
        }
      }
    }

    p.geometry.setDrawRange(0, quadCursor * 6)
    for (const name of ['position', 'aDir', 'aSide', 'aWidth', 'aFade', 'aRand']) {
      const attr = p.geometry.getAttribute(name) as THREE.BufferAttribute
      attr.needsUpdate = true
    }
  }

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    timeRef.current += dt
    const t = timeRef.current
    const mat = materialRef.current
    if (!mat) return

    // followPointer: the `to` endpoint chases the cursor with a slight lag,
    // unprojected onto the plane halfway between from and to.
    let tx = to[0]; let ty = to[1]; let tz = to[2]
    if (followPointer) {
      const { camera, pointer } = state
      const target = pointerTargetRef.current
      target.set(pointer.x, pointer.y, 0.5).unproject(camera)
      const dir = target.sub(camera.position)
      const dirLen = dir.length()
      if (dirLen > 1e-6) {
        dir.divideScalar(dirLen)
        const planeZ = (from[2] + to[2]) * 0.5
        if (Math.abs(dir.z) > 1e-6) {
          const dist = (planeZ - camera.position.z) / dir.z
          if (dist > 0) {
            target.copy(camera.position).addScaledVector(dir, dist)
            if (!pointerInitRef.current) {
              pointerCurRef.current.copy(target)
              pointerInitRef.current = true
            }
          }
        }
      }
      // Damped chase — the arc lags behind the cursor.
      const lag = 1 - Math.exp(-8 * dt)
      pointerCurRef.current.lerp(target, lag)
      tx = pointerCurRef.current.x; ty = pointerCurRef.current.y; tz = pointerCurRef.current.z
    }

    // Strike scheduling. followPointer re-strikes fast so arcs chase the mouse.
    const interval = followPointer
      ? 1 / 24
      : 1 / Math.max(strikeRate, 0.05) * (0.7 + Math.random() * 0.6)
    if (t >= nextStrikeRef.current) {
      regenerate(from[0], from[1], from[2], tx, ty, tz)
      lastStrikeRef.current = t
      nextStrikeRef.current = t + interval
    }

    // Intensity flicker: stepped random values + time noise.
    if (t >= nextStepRef.current) {
      stepRef.current = 0.55 + Math.random() * 0.45
      nextStepRef.current = t + 0.04 + Math.random() * 0.09
    }
    const sinceStrike = t - lastStrikeRef.current
    const flash = Math.exp(-sinceStrike * 10)
    const noise =
      0.5 + 0.3 * Math.sin(t * 39.0 + Math.sin(t * 17.0)) + 0.2 * Math.sin(t * 83.0)
    const flickAmt = 1 - flicker * 0.45 + flicker * (0.45 * stepRef.current + 0.3 * noise)
    mat.uTime = t
    mat.uIntensity = Math.max(flickAmt * (1 + flash * 1.5), 0.05)
    mat.uGlow = glowIntensity
    // Parse the color string only when it actually changes.
    const colorDirty = lastColorRef.current !== color
    if (colorDirty) {
      lastColorRef.current = color
      mat.uColor.set(color)
    }

    // Flash light at the arc midpoint: spikes on strike, fast afterglow decay.
    const light = lightRef.current
    if (light) {
      light.position.set((from[0] + tx) * 0.5, (from[1] + ty) * 0.5, (from[2] + tz) * 0.5)
      light.intensity = glowIntensity * 8 * Math.exp(-sinceStrike * 7)
      if (colorDirty) light.color.set(color)
    }
  })

  return (
    <group>
      <mesh geometry={pools.geometry} frustumCulled={false}>
        <lightningArcsMaterial
          ref={materialRef}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* strike flash light — lights surroundings with fast afterglow decay */}
      <pointLight ref={lightRef} intensity={0} distance={20} decay={2} />
    </group>
  )
}
