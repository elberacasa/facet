'use client'

// HoloCard demo scene — forwards playground props to the registry component.

import { Canvas } from '@react-three/fiber'
import { HoloCard } from '@registry/components/holo-card'
import type { HoloCardProps } from '@registry/components/holo-card'

export default function HoloCardScene(props: HoloCardProps) {
  return (
    <Canvas camera={{ position: [0, 0, 4], fov: 45 }} style={{ background: '#000' }}>
      <ambientLight intensity={0.5} />
      <HoloCard {...props} />
    </Canvas>
  )
}
