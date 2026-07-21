// floating-shapes — ambient drifting geometric primitives. Must be rendered inside a react-three-fiber <Canvas>.
'use client'

import { useMemo, useRef } from 'react'
import { Color, Group } from 'three'
import { useFrame } from '@react-three/fiber'
import { Float } from '@react-three/drei'

export interface FloatingShapesProps {
  count?: number
  colors?: string[]
  speed?: number
  spread?: number
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type GeometryKind = 'torusKnot' | 'icosahedron' | 'octahedron' | 'torus'

const GEOMETRIES: GeometryKind[] = ['torusKnot', 'icosahedron', 'octahedron', 'torus']

interface ShapeConfig {
  geometry: GeometryKind
  color: string
  wireframe: boolean
  position: [number, number, number]
  scale: number
  floatSpeed: number
  rotationIntensity: number
  floatIntensity: number
}

export function FloatingShapes({
  count = 12,
  colors = ['#a3e635', '#f97316', '#f5f5f5'],
  speed = 1,
  spread = 8,
}: FloatingShapesProps) {
  const group = useRef<Group>(null)

  const shapes = useMemo<ShapeConfig[]>(() => {
    return Array.from({ length: count }, (_, i) => {
      const rand = mulberry32(i * 1000 + 7)
      return {
        geometry: GEOMETRIES[i % GEOMETRIES.length],
        color: colors[i % colors.length],
        wireframe: rand() > 0.5,
        position: [(rand() - 0.5) * spread * 2, (rand() - 0.5) * spread, (rand() - 0.5) * spread],
        scale: 0.35 + rand() * 0.65,
        floatSpeed: 1 + rand() * 2,
        rotationIntensity: 0.5 + rand() * 1.5,
        floatIntensity: 0.5 + rand() * 1.5,
      }
    })
  }, [count, colors, spread])

  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.05 * speed
      group.current.rotation.x += delta * 0.02 * speed
    }
  })

  return (
    <group ref={group}>
      {shapes.map((shape, i) => (
        <Float
          key={i}
          speed={shape.floatSpeed * speed}
          rotationIntensity={shape.rotationIntensity}
          floatIntensity={shape.floatIntensity}
        >
          <mesh position={shape.position} scale={shape.scale}>
            {shape.geometry === 'torusKnot' && <torusKnotGeometry args={[0.4, 0.14, 96, 12]} />}
            {shape.geometry === 'icosahedron' && <icosahedronGeometry args={[0.6, 0]} />}
            {shape.geometry === 'octahedron' && <octahedronGeometry args={[0.65, 0]} />}
            {shape.geometry === 'torus' && <torusGeometry args={[0.5, 0.2, 24, 48]} />}
            <meshStandardMaterial
              color={new Color(shape.color)}
              wireframe={shape.wireframe}
              roughness={0.3}
              metalness={0.6}
            />
          </mesh>
        </Float>
      ))}
    </group>
  )
}
