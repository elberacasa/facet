// hero-blob — must be rendered inside a react-three-fiber <Canvas>.
'use client'

import { ElementRef, useRef } from 'react'
import { Group, Mesh } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Float, MeshDistortMaterial as DistortMaterial } from '@react-three/drei'

export interface HeroBlobProps {
  color?: string
  speed?: number
  distort?: number
  radius?: number
  wireframe?: boolean
}

export function HeroBlob({
  color = '#a3e635',
  speed = 2,
  distort = 0.4,
  radius = 1.5,
  wireframe = false,
}: HeroBlobProps) {
  const groupRef = useRef<Group>(null)
  const meshRef = useRef<Mesh>(null)
  const materialRef = useRef<ElementRef<typeof DistortMaterial>>(null)
  const { pointer } = useThree()

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime()

    if (groupRef.current) {
      groupRef.current.rotation.x += (pointer.y * 0.35 - groupRef.current.rotation.x) * 0.04
      groupRef.current.rotation.y += (pointer.x * 0.5 - groupRef.current.rotation.y) * 0.04
    }

    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.15
      meshRef.current.rotation.y += delta * 0.2
    }

    if (materialRef.current) {
      materialRef.current.distort = distort + Math.sin(t * speed * 0.5) * 0.12
    }
  })

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1.2}>
      <group ref={groupRef}>
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[radius, 64]} />
          <DistortMaterial
            ref={materialRef}
            color={color}
            speed={speed}
            distort={distort}
            wireframe={wireframe}
            roughness={0.25}
            metalness={0.15}
          />
        </mesh>
      </group>
    </Float>
  )
}
