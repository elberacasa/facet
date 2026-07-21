// Demo scene for the GlassPrism registry component.
'use client'

import { Canvas } from '@react-three/fiber'
import { GlassPrism } from '@registry/components/glass-prism'
import type { GlassPrismProps } from '@registry/components/glass-prism'

export default function GlassPrismScene(props: GlassPrismProps) {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 40 }} style={{ background: '#0a0a0a' }}>
      <color attach="background" args={['#0a0a0a']} />
      <GlassPrism {...props} />
    </Canvas>
  )
}
