// Demo scene for the WaveGrid registry component.
'use client'

import { Canvas } from '@react-three/fiber'
import { WaveGrid } from '@registry/components/wave-grid'
import type { WaveGridProps } from '@registry/components/wave-grid'

export default function WaveGridScene(props: WaveGridProps) {
  return (
    <Canvas camera={{ position: [0, 3, 6], fov: 50 }} style={{ background: '#000000' }}>
      <color attach="background" args={['#000000']} />
      <fog attach="fog" args={['#000000', 8, 14]} />
      <WaveGrid {...props} />
    </Canvas>
  )
}
