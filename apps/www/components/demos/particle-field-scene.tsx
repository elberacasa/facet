// particle-field scene — camera/background shell, forwards playground props.
'use client'

import { Canvas } from '@react-three/fiber'
import { ParticleField } from '@registry/components/particle-field'
import type { ParticleFieldProps } from '@registry/components/particle-field'

export default function ParticleFieldScene(props: ParticleFieldProps) {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 60 }} style={{ background: '#000000' }}>
      <ParticleField {...props} />
    </Canvas>
  )
}
