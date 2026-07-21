// NodeNetwork — 3D plexus network of connected nodes, built for AI landing pages.
// Must be rendered inside a react-three-fiber <Canvas>.
'use client'

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

export interface NodeNetworkProps {
  nodeCount?: number
  color?: string
  maxDistance?: number
  speed?: number
}

// Deterministic PRNG so the layout is stable across reloads and nodeCount tweaks.
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SPHERE_RADIUS = 4.5
const HUB_RATIO = 0.15

export function NodeNetwork({
  nodeCount = 120,
  color = '#a3e635',
  maxDistance = 2,
  speed = 0.4,
}: NodeNetworkProps) {
  const spinRef = useRef<THREE.Group>(null)
  const parallaxRef = useRef<THREE.Group>(null)

  const { positions, hubPositions, edges } = useMemo(() => {
    const rand = mulberry32(42)
    const count = Math.max(2, Math.floor(nodeCount))

    // Uniform random points inside a sphere.
    const pts: THREE.Vector3[] = []
    const hubIdx: number[] = []
    for (let i = 0; i < count; i++) {
      // Rejection-free sphere sampling: random direction, radius scaled by cbrt.
      const u = rand() * 2 - 1
      const theta = rand() * Math.PI * 2
      const r = SPHERE_RADIUS * Math.cbrt(rand())
      const s = Math.sqrt(1 - u * u)
      pts.push(new THREE.Vector3(r * s * Math.cos(theta), r * s * Math.sin(theta), r * u))
      if (rand() < HUB_RATIO) hubIdx.push(i)
    }

    const positions = new Float32Array(count * 3)
    pts.forEach((p, i) => {
      positions[i * 3] = p.x
      positions[i * 3 + 1] = p.y
      positions[i * 3 + 2] = p.z
    })

    const hubPositions = new Float32Array(hubIdx.length * 3)
    hubIdx.forEach((idx, i) => {
      hubPositions[i * 3] = pts[idx].x
      hubPositions[i * 3 + 1] = pts[idx].y
      hubPositions[i * 3 + 2] = pts[idx].z
    })

    // Connect every pair closer than maxDistance.
    const edgeList: number[] = []
    const maxDistSq = maxDistance * maxDistance
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        if (pts[i].distanceToSquared(pts[j]) < maxDistSq) {
          edgeList.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z)
        }
      }
    }

    return { positions, hubPositions, edges: new Float32Array(edgeList) }
  }, [nodeCount, maxDistance])

  // Brighter tint for the larger "hub" nodes.
  const hubColor = useMemo(
    () => new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55),
    [color]
  )

  useFrame((state, delta) => {
    const spin = spinRef.current
    const parallax = parallaxRef.current
    if (!spin || !parallax) return

    spin.rotation.y += delta * speed * 0.2
    spin.rotation.x += delta * speed * 0.05

    // Pointer parallax on an outer group so it never fights the continuous spin.
    const targetY = state.pointer.x * 0.15
    const targetX = -state.pointer.y * 0.15
    parallax.rotation.y = THREE.MathUtils.damp(parallax.rotation.y, targetY, 3, delta)
    parallax.rotation.x = THREE.MathUtils.damp(parallax.rotation.x, targetX, 3, delta)
  })

  return (
    <group ref={parallaxRef}>
      <group ref={spinRef}>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            size={0.09}
            sizeAttenuation
            color={color}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>

        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[hubPositions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            size={0.16}
            sizeAttenuation
            color={hubColor}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>

        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[edges, 3]} />
          </bufferGeometry>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={0.3}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      </group>
    </group>
  )
}
