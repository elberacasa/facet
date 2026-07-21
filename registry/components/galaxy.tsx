// galaxy — procedural spiral galaxy. Must be rendered inside a react-three-fiber <Canvas>.
'use client'

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

export interface GalaxyProps {
  count?: number
  branches?: number
  spin?: number
  radius?: number
  randomness?: number
  insideColor?: string
  outsideColor?: string
}

export function Galaxy({
  count = 20000,
  branches = 3,
  spin = 1,
  radius = 8,
  randomness = 0.4,
  insideColor = '#ff6030',
  outsideColor = '#1b3984',
}: GalaxyProps) {
  const groupRef = useRef<THREE.Group>(null)

  const [positions, colors] = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)

    const colorInside = new THREE.Color(insideColor)
    const colorOutside = new THREE.Color(outsideColor)

    for (let i = 0; i < count; i++) {
      const i3 = i * 3

      const r = Math.random() * radius
      const branchAngle = ((i % branches) / branches) * Math.PI * 2
      const spinAngle = r * spin

      // gaussian-ish randomness, scaled by distance from the core
      const randomX = (Math.random() + Math.random() + Math.random() - 1.5) * randomness * r
      const randomY = (Math.random() + Math.random() + Math.random() - 1.5) * randomness * r
      const randomZ = (Math.random() + Math.random() + Math.random() - 1.5) * randomness * r

      positions[i3] = Math.cos(branchAngle + spinAngle) * r + randomX
      positions[i3 + 1] = randomY
      positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * r + randomZ

      const mixedColor = colorInside.clone().lerp(colorOutside, r / radius)
      // slight lightness jitter so stars don't look like a smooth gradient
      mixedColor.offsetHSL(0, 0, (Math.random() - 0.5) * 0.2)

      colors[i3] = mixedColor.r
      colors[i3 + 1] = mixedColor.g
      colors[i3 + 2] = mixedColor.b
    }

    return [positions, colors]
  }, [count, branches, spin, radius, randomness, insideColor, outsideColor])

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return
    group.rotation.y += delta * 0.05
    // subtle pointer parallax on the tilt axis
    const targetX = state.pointer.y * 0.15
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, targetX, 0.05)
  })

  return (
    // ~25° static tilt so the disc reads with depth
    <group rotation={[-0.4363, 0, 0]}>
      <group ref={groupRef}>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            <bufferAttribute attach="attributes-color" args={[colors, 3]} />
          </bufferGeometry>
          <pointsMaterial
            size={radius * 0.0025}
            vertexColors
            sizeAttenuation
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      </group>
    </group>
  )
}
