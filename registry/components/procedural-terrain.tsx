// ProceduralTerrain — seeded island terrain with slope-based biomes, ridged
// mountain peaks, instanced vegetation (trees + rocks) and a surrounding sea.
// Self-contained: includes its own mulberry32 PRNG + 2D value noise + fbm and
// ridged multifractal. Zero extra deps.
// Must be rendered inside a react-three-fiber <Canvas>. Add your own lights
// (a castShadow directional light is recommended — the terrain and vegetation
// already cast/receive shadows):
//
//   <Canvas shadows camera={{ position: [30, 24, 30] }}>
//     <hemisphereLight args={['#bfdbfe', '#1c1917', 0.55]} />
//     <directionalLight position={[22, 32, 12]} intensity={2.2} color="#ffe3b3" castShadow />
//     <ProceduralTerrain seed={42} size={40} maxHeight={6} roughness={0.8} />
//   </Canvas>
'use client'

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

export interface ProceduralTerrainProps {
  seed?: number
  size?: number
  maxHeight?: number
  roughness?: number
  wireframe?: boolean
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) + seeded 2D value noise + fractal Brownian
// motion + ridged multifractal. Kept tiny and self-contained so the component
// stays copy-paste. Same seed always produces the same island.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 512-entry doubled permutation table shuffled by the seed. */
function buildPermutation(seed: number): Uint8Array {
  const rng = mulberry32(Math.floor(seed))
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = p[i]
    p[i] = p[j]
    p[j] = tmp
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  return perm
}

function fade(t: number) {
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/** clamped smoothstep with a < b (never reversed). */
function sstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Smooth 2D value noise in [-1, 1]. */
function valueNoise2D(perm: Uint8Array, x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi

  const X = xi & 255
  const Y = yi & 255

  // Hash each lattice corner to a pseudo-random value in [-1, 1].
  const v00 = (perm[perm[X] + Y] / 255) * 2 - 1
  const v10 = (perm[perm[X + 1] + Y] / 255) * 2 - 1
  const v01 = (perm[perm[X] + Y + 1] / 255) * 2 - 1
  const v11 = (perm[perm[X + 1] + Y + 1] / 255) * 2 - 1

  const u = fade(xf)
  const v = fade(yf)

  return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v)
}

/** 5-octave fbm, normalized back to roughly [-1, 1]. */
function fbm2D(perm: Uint8Array, x: number, y: number, octaves = 5): number {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  let max = 0
  for (let i = 0; i < octaves; i++) {
    value += valueNoise2D(perm, x * frequency, y * frequency) * amplitude
    max += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return value / max
}

/**
 * Ridged multifractal in [0, 1]: folds the noise (1 - |n|) and squares it so
 * crests sharpen into mountain ridges while valleys stay broad. Successive
 * octaves are weighted by the previous ridge, which is what gives the classic
 * "range" look instead of uniform dunes.
 */
function ridgedFbm2D(perm: Uint8Array, x: number, y: number, octaves = 5): number {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  let max = 0
  let weight = 1
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(valueNoise2D(perm, x * frequency, y * frequency))
    n = n * n
    value += n * amplitude * weight
    max += amplitude
    weight = Math.max(0, Math.min(1, n * 2))
    amplitude *= 0.5
    frequency *= 2
  }
  return value / max
}

type HeightSampler = (x: number, z: number) => number

/**
 * Builds the island height function. fbm base elevation blended toward a
 * ridged multifractal at higher elevations (rolling lowlands, jagged peaks),
 * multiplied by a radial falloff so every island meets the sea at its rim.
 */
function makeHeightSampler(
  seed: number,
  size: number,
  maxHeight: number,
  roughness: number
): HeightSampler {
  const perm = buildPermutation(seed)
  // Base frequency scales with roughness and inversely with world size so any
  // `size` still yields a full island, not a zoomed-in crop.
  const baseFrequency = (roughness * 6) / size
  const half = size / 2

  return (x, z) => {
    const base = fbm2D(perm, x * baseFrequency, z * baseFrequency, 5) * 0.5 + 0.5
    // Offset sampled far from the base field so ridges don't align with dunes.
    const ridge = ridgedFbm2D(
      perm,
      x * baseFrequency * 0.85 + 37.3,
      z * baseFrequency * 0.85 + 11.9,
      5
    )
    // Blend in the ridged field only above the lowlands.
    const ridgeMix = sstep(0.35, 0.7, base)
    const n = base + (ridge - base) * ridgeMix

    // Radial falloff: full height inside 55% of the radius, tapering to sea
    // level at the edges for the island feel.
    const d = Math.min(1, Math.sqrt(x * x + z * z) / half)
    const falloff = sstep(0, 1, (1 - d) / 0.45)

    return n * falloff * maxHeight
  }
}

// ---------------------------------------------------------------------------
// Slope-based biomes
// ---------------------------------------------------------------------------

const SAND = new THREE.Color('#d9c99a')
const GRASS_A = new THREE.Color('#4d7c0f') // deep meadow green
const GRASS_B = new THREE.Color('#84cc16') // bright acid-leaning green
const ROCK = new THREE.Color('#78716c')
const SNOW = new THREE.Color('#fafaf9')
const WATER_Y = 0.15

/**
 * Vertex color from world height + slope (1 - normal.y) + a low-frequency
 * grass-patch noise. Rock takes over steep slopes regardless of height, sand
 * only hugs the waterline, and snow only settles on high AND flat ground.
 */
function biomeColor(
  y: number,
  slope: number,
  grassMix: number,
  maxHeight: number,
  target: THREE.Color
) {
  const sandTop = WATER_Y + maxHeight * 0.05
  const grassTop = maxHeight * 0.5

  // Elevation bands first.
  if (y < sandTop) {
    target.copy(SAND)
  } else if (y < sandTop + maxHeight * 0.05) {
    target.lerpColors(SAND, GRASS_A, (y - sandTop) / (maxHeight * 0.05))
  } else if (y < grassTop) {
    // Subtle hue-variation patches across the grassland.
    target.lerpColors(GRASS_A, GRASS_B, grassMix)
  } else if (y < grassTop + maxHeight * 0.08) {
    const t = (y - grassTop) / (maxHeight * 0.08)
    target.lerpColors(GRASS_A, ROCK, t)
  } else {
    target.copy(ROCK)
  }

  // Slope override: cliffs read as rock even inside the grass/snow bands.
  if (y > WATER_Y) {
    const rockAmt = sstep(0.1, 0.24, slope) * 0.95
    target.lerp(ROCK, rockAmt)
  }

  // Snow only on high AND flat areas — steep peaks stay rocky.
  const hNorm = y / maxHeight
  const highAmt = sstep(0.72, 0.8, hNorm)
  const flatAmt = 1 - sstep(0.06, 0.14, slope)
  target.lerp(SNOW, highAmt * flatAmt)
}

// ---------------------------------------------------------------------------
// Vegetation scattering (seeded rejection sampling on the height function)
// ---------------------------------------------------------------------------

interface ScatterItem {
  x: number
  y: number
  z: number
  rot: number
  scale: number
  color: THREE.Color
}

/** World-space gradient magnitude of the height field via finite differences. */
function heightGradient(sample: HeightSampler, x: number, z: number, eps: number) {
  const dx = (sample(x + eps, z) - sample(x - eps, z)) / (2 * eps)
  const dz = (sample(x, z + eps) - sample(x, z - eps)) / (2 * eps)
  return Math.sqrt(dx * dx + dz * dz)
}

function scatterVegetation(
  seed: number,
  size: number,
  maxHeight: number,
  sample: HeightSampler
): { trees: ScatterItem[]; rocks: ScatterItem[] } {
  const rng = mulberry32(Math.floor(seed) * 2654435761 + 97)
  const half = size / 2
  const eps = size / 256
  const sandTop = WATER_Y + maxHeight * 0.05

  // Tree scale follows the island so a tiny/flat map never gets giant trees.
  const worldScale = Math.max(0.2, Math.min(1, maxHeight / 6, size / 40))

  // Slope tests must be scale-invariant: normalize the world-space gradient
  // against this island's relief so a small-but-tall map (naturally steep in
  // world units) still gets vegetation on its relatively-gentle spots.
  const slopeScale = (6 / 40) / (maxHeight / size)

  const treeTarget = Math.round(Math.max(80, Math.min(150, (size * size) / 18)))
  const trees: ScatterItem[] = []
  const color = new THREE.Color()
  for (let attempt = 0; attempt < treeTarget * 60 && trees.length < treeTarget; attempt++) {
    const x = (rng() * 2 - 1) * half
    const z = (rng() * 2 - 1) * half
    const y = sample(x, z)
    // Grass band only: above the beach, below the rockline, on gentle slopes.
    if (y < sandTop + 0.05 || y > maxHeight * 0.5) continue
    if (heightGradient(sample, x, z, eps) * slopeScale > 0.45) continue
    const hue = 0.23 + rng() * 0.06 // per-instance hue jitter, deep green → lime
    color.setHSL(hue, 0.55 + rng() * 0.15, 0.26 + rng() * 0.1)
    trees.push({
      x,
      y: y - 0.04, // seat the trunk slightly into the ground
      z,
      rot: rng() * Math.PI * 2,
      scale: (0.55 + rng() * 0.65) * worldScale,
      color: color.clone(),
    })
  }

  const rockTarget = Math.round(Math.max(20, Math.min(60, size)))
  const rocks: ScatterItem[] = []
  for (let attempt = 0; attempt < rockTarget * 60 && rocks.length < rockTarget; attempt++) {
    const x = (rng() * 2 - 1) * half
    const z = (rng() * 2 - 1) * half
    const y = sample(x, z)
    if (y < WATER_Y + 0.1) continue
    // Rock band: high ground or steep cliff faces.
    if (y < maxHeight * 0.45 && heightGradient(sample, x, z, eps) * slopeScale < 0.55) continue
    const shade = 0.4 + rng() * 0.3 // gray jitter
    color.setHSL(0.08 + rng() * 0.03, 0.04 + rng() * 0.05, shade)
    rocks.push({
      x,
      y: y - 0.08, // partially buried
      z,
      rot: rng() * Math.PI * 2,
      scale: (0.5 + rng() * 1.1) * worldScale,
      color: color.clone(),
    })
  }

  return { trees, rocks }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProceduralTerrain({
  seed = 42,
  size = 40,
  maxHeight = 6,
  roughness = 0.8,
  wireframe = false,
}: ProceduralTerrainProps) {
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const canopyRef = useRef<THREE.InstancedMesh>(null)
  const rockRef = useRef<THREE.InstancedMesh>(null)

  const geometry = useMemo(() => {
    const segments = Math.min(256, Math.max(1, Math.round(size * 5)))
    const geo = new THREE.PlaneGeometry(size, size, segments, segments)
    geo.rotateX(-Math.PI / 2)

    const sample = makeHeightSampler(seed, size, maxHeight, roughness)
    const perm = buildPermutation(seed)
    const jitterRng = mulberry32(Math.floor(seed) * 7919 + 13)

    const positions = geo.attributes.position as THREE.BufferAttribute
    const vertexCount = positions.count

    for (let i = 0; i < vertexCount; i++) {
      positions.setY(i, sample(positions.getX(i), positions.getZ(i)))
    }
    positions.needsUpdate = true
    geo.computeVertexNormals()

    // Color pass needs the normals for slope-based biomes.
    const normals = geo.attributes.normal as THREE.BufferAttribute
    const colors = new Float32Array(vertexCount * 3)
    const color = new THREE.Color()
    const grassFreq = (roughness * 6) / size / 3.5 // low-frequency patchiness
    for (let i = 0; i < vertexCount; i++) {
      const x = positions.getX(i)
      const z = positions.getZ(i)
      const y = positions.getY(i)
      const slope = 1 - normals.getY(i)
      const grassMix =
        fbm2D(perm, x * grassFreq + 213.7, z * grassFreq + 91.3, 3) * 0.5 + 0.5
      biomeColor(y, slope, grassMix, maxHeight, color)
      const jitter = (jitterRng() - 0.5) * 0.05
      colors[i * 3] = Math.max(0, Math.min(1, color.r + jitter))
      colors[i * 3 + 1] = Math.max(0, Math.min(1, color.g + jitter))
      colors[i * 3 + 2] = Math.max(0, Math.min(1, color.b + jitter))
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    return geo
  }, [seed, size, maxHeight, roughness])

  // Vegetation placement re-uses the same height function as the mesh, so
  // trees and rocks always sit exactly on the terrain surface.
  const { trees, rocks } = useMemo(() => {
    const sample = makeHeightSampler(seed, size, maxHeight, roughness)
    return scatterVegetation(seed, size, maxHeight, sample)
  }, [seed, size, maxHeight, roughness])

  // Pre-translated geometries so instance transforms put bases on the ground.
  const trunkGeometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.08, 0.13, 0.7, 5)
    g.translate(0, 0.35, 0)
    return g
  }, [])
  const canopyGeometry = useMemo(() => {
    const g = new THREE.ConeGeometry(0.5, 1.5, 6)
    g.translate(0, 1.25, 0)
    return g
  }, [])
  const rockGeometry = useMemo(() => new THREE.DodecahedronGeometry(0.4, 0), [])
  const waterGeometry = useMemo(() => new THREE.CircleGeometry(size * 0.75, 48), [size])

  // Apply instance transforms + per-instance colors before first paint.
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D()
    const trunk = trunkRef.current
    const canopy = canopyRef.current
    if (trunk && canopy) {
      trees.forEach((t, i) => {
        dummy.position.set(t.x, t.y, t.z)
        dummy.rotation.set(0, t.rot, 0)
        dummy.scale.setScalar(t.scale)
        dummy.updateMatrix()
        trunk.setMatrixAt(i, dummy.matrix)
        canopy.setMatrixAt(i, dummy.matrix)
        canopy.setColorAt(i, t.color)
      })
      trunk.instanceMatrix.needsUpdate = true
      canopy.instanceMatrix.needsUpdate = true
      if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true
    }
    const rockMesh = rockRef.current
    if (rockMesh) {
      rocks.forEach((r, i) => {
        dummy.position.set(r.x, r.y, r.z)
        dummy.rotation.set(r.rot * 0.7, r.rot, r.rot * 1.3) // tumble the boulders
        dummy.scale.set(r.scale, r.scale * 0.75, r.scale)
        dummy.updateMatrix()
        rockMesh.setMatrixAt(i, dummy.matrix)
        rockMesh.setColorAt(i, r.color)
      })
      rockMesh.instanceMatrix.needsUpdate = true
      if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true
    }
  }, [trees, rocks])

  // Dispose geometries whenever the terrain rebuilds or unmounts.
  useEffect(() => {
    return () => {
      geometry.dispose()
      waterGeometry.dispose()
    }
  }, [geometry, waterGeometry])
  useEffect(() => {
    return () => {
      trunkGeometry.dispose()
      canopyGeometry.dispose()
      rockGeometry.dispose()
    }
  }, [trunkGeometry, canopyGeometry, rockGeometry])

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial vertexColors flatShading wireframe={wireframe} />
      </mesh>

      {/* Sea: transparent deep teal with a sky-glint metalness kick. */}
      <mesh
        geometry={waterGeometry}
        rotation-x={-Math.PI / 2}
        position-y={WATER_Y}
        receiveShadow
      >
        <meshStandardMaterial
          color="#0c4a6e"
          transparent
          opacity={0.85}
          metalness={0.6}
          roughness={0.15}
        />
      </mesh>

      {/* Vegetation is hidden (not unmounted) in wireframe mode so instance
          matrices survive the toggle. */}
      {trees.length > 0 && (
        <group visible={!wireframe}>
          <instancedMesh
            key={`trunks-${trees.length}`}
            ref={trunkRef}
            args={[undefined, undefined, trees.length]}
            geometry={trunkGeometry}
            castShadow
            frustumCulled={false}
          >
            <meshStandardMaterial color="#78350f" flatShading roughness={0.9} />
          </instancedMesh>
          <instancedMesh
            key={`canopies-${trees.length}`}
            ref={canopyRef}
            args={[undefined, undefined, trees.length]}
            geometry={canopyGeometry}
            castShadow
            frustumCulled={false}
          >
            <meshStandardMaterial color="#ffffff" flatShading roughness={0.85} />
          </instancedMesh>
        </group>
      )}
      {rocks.length > 0 && (
        <instancedMesh
          key={`rocks-${rocks.length}`}
          ref={rockRef}
          args={[undefined, undefined, rocks.length]}
          geometry={rockGeometry}
          castShadow
          frustumCulled={false}
          visible={!wireframe}
        >
          <meshStandardMaterial color="#ffffff" flatShading roughness={0.95} />
        </instancedMesh>
      )}
    </group>
  )
}
