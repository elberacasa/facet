// Demo scene for the GodRays registry component — a background piece, framed
// like the aurora demo: bare canvas, black backdrop, no controls.
'use client'

import { Canvas } from '@react-three/fiber'
import { GodRays } from '@registry/components/god-rays'
import type { GodRaysProps } from '@registry/components/god-rays'

export default function GodRaysScene(props: GodRaysProps) {
  return (
    <Canvas camera={{ position: [0, 0.5, 9], fov: 50 }} style={{ background: '#000000' }}>
      <color attach="background" args={['#000000']} />
      <GodRays {...props} />
    </Canvas>
  )
}
