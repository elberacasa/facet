// galaxy scene — camera/background shell, forwards playground props.
'use client'

import { Canvas } from '@react-three/fiber'
import { Galaxy } from '@registry/components/galaxy'
import type { GalaxyProps } from '@registry/components/galaxy'

export default function GalaxyScene(props: GalaxyProps) {
  return (
    <Canvas camera={{ position: [2, 3, 8], fov: 60 }} style={{ background: '#000000' }}>
      <Galaxy {...props} />
    </Canvas>
  )
}
