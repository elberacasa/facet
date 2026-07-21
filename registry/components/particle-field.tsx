// particle-field — interactive particle cloud. Must be rendered inside a react-three-fiber <Canvas>.
'use client'

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

export interface ParticleFieldProps {
  count?: number
  color?: string
  radius?: number
  size?: number
  speed?: number
}

export function ParticleField({
  count = 3000,
  color = '#a3e635',
  radius = 4,
  size = 0.02,
  speed = 0.1,
}: ParticleFieldProps) {
  const groupRef = useRef<THREE.Group>(null)

  const positions = useMemo(() => {
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = radius * Math.cbrt(Math.random())
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)
    }
    return positions
  }, [count, radius])

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return
    const targetY = group.rotation.y + delta * speed
    const { x, y } = state.pointer
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetY + x * 0.4, 0.05)
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, y * 0.4, 0.05)
  })

  return (
    <group ref={groupRef}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={size}
          color={color}
          sizeAttenuation
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}
