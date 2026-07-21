'use client'

import { Canvas } from '@react-three/fiber'
import { ScrollCamera } from '@registry/components/scroll-camera'
import type { ScrollCameraProps } from '@registry/components/scroll-camera'

export default function Scene(props: ScrollCameraProps) {
  return (
    <Canvas camera={{ position: [0, 0.4, 10], fov: 60 }} style={{ background: '#000000' }}>
      <ScrollCamera {...props} />
    </Canvas>
  )
}
