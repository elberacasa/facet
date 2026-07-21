// globe-arcs — dotted globe with animated connection arcs. Must be rendered inside a react-three-fiber <Canvas>.
'use client'

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'

export interface GlobeArcsProps {
  color?: string
  arcColor?: string
  arcCount?: number
  speed?: number
}

const RADIUS = 2.5
const DOT_COUNT = 900
const ARC_SAMPLES = 64

// Deterministic PRNG so arc pairs don't reshuffle between renders.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function GlobeArcs({
  color = '#a3e635',
  arcColor = '#f97316',
  arcCount = 10,
  speed = 0.3,
}: GlobeArcsProps) {
  const groupRef = useRef<THREE.Group>(null)
  const markerRefs = useRef<(THREE.Mesh | null)[]>([])

  // Fibonacci-distributed dots on the sphere.
  const { positions, points } = useMemo(() => {
    const positions = new Float32Array(DOT_COUNT * 3)
    const points: THREE.Vector3[] = []
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < DOT_COUNT; i++) {
      const y = 1 - (i / (DOT_COUNT - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = goldenAngle * i
      const p = new THREE.Vector3(
        Math.cos(theta) * r * RADIUS,
        y * RADIUS,
        Math.sin(theta) * r * RADIUS
      )
      points.push(p)
      positions[i * 3] = p.x
      positions[i * 3 + 1] = p.y
      positions[i * 3 + 2] = p.z
    }
    return { positions, points }
  }, [])

  // Arcs between random dot pairs (seeded → stable across renders).
  const arcs = useMemo(() => {
    const rand = mulberry32(1337)
    const result: { curve: THREE.QuadraticBezierCurve3; samples: THREE.Vector3[] }[] = []
    for (let i = 0; i < arcCount; i++) {
      const a = points[Math.floor(rand() * points.length)]
      const b = points[Math.floor(rand() * points.length)]
      if (a === b) continue
      const dist = a.distanceTo(b)
      const mid = a
        .clone()
        .add(b)
        .multiplyScalar(0.5)
        .normalize()
        .multiplyScalar(RADIUS * (1.4 + dist * 0.15))
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
      result.push({ curve, samples: curve.getPoints(ARC_SAMPLES) })
    }
    return result
  }, [arcCount, points])

  useFrame((state, delta) => {
    const group = groupRef.current
    if (group) {
      group.rotation.y += delta * speed
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, state.pointer.y * 0.3, 0.05)
    }
    const t0 = state.clock.elapsedTime
    for (let i = 0; i < arcs.length; i++) {
      const marker = markerRefs.current[i]
      if (!marker) continue
      const t = (t0 * 0.15 + i * 0.37) % 1
      marker.position.copy(arcs[i].curve.getPoint(t))
    }
  })

  return (
    <group ref={groupRef}>
      {/* Occlusion core */}
      <mesh>
        <sphereGeometry args={[RADIUS * 0.98, 32, 32]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      {/* Dotted globe */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.035}
          color={color}
          sizeAttenuation
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Arcs, endpoints, and travelling markers */}
      {arcs.map((arc, i) => (
        <group key={i}>
          <Line
            points={arc.samples}
            color={arcColor}
            lineWidth={1}
            transparent
            opacity={0.85}
          />
          <mesh position={arc.curve.getPoint(0)}>
            <sphereGeometry args={[0.04, 12, 12]} />
            <meshBasicMaterial color={arcColor} />
          </mesh>
          <mesh position={arc.curve.getPoint(1)}>
            <sphereGeometry args={[0.04, 12, 12]} />
            <meshBasicMaterial color={arcColor} />
          </mesh>
          <mesh
            ref={(m) => {
              markerRefs.current[i] = m
            }}
          >
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshBasicMaterial color={arcColor} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
