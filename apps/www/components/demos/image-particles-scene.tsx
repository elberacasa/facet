// image-particles scene — camera/background shell, forwards playground props.
'use client'

import { Canvas } from '@react-three/fiber'
import { ImageParticles } from '@registry/components/image-particles'
import type { ImageParticlesProps } from '@registry/components/image-particles'

export default function ImageParticlesScene(props: ImageParticlesProps) {
  return (
    <Canvas camera={{ position: [0, 0, 7], fov: 50 }} style={{ background: '#000000' }}>
      <ImageParticles {...props} />
    </Canvas>
  )
}
