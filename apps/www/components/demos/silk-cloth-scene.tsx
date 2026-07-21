// Demo scene for the SilkCloth registry component. Front-on with a slight
// angle; the cloth is self-lit and reacts to the pointer over the canvas.
'use client'

import { Canvas } from '@react-three/fiber'
import { SilkCloth } from '@registry/components/silk-cloth'
import type { SilkClothProps } from '@registry/components/silk-cloth'

export default function SilkClothScene(props: SilkClothProps) {
  return (
    <Canvas camera={{ position: [1.1, 1.7, 7.6], fov: 45 }} style={{ background: '#0a0a0a' }}>
      <color attach="background" args={['#0a0a0a']} />
      <SilkCloth {...props} />
    </Canvas>
  )
}
