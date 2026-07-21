// Demo scene for the LightningArcs registry component. Wide hero framing to
// fit the default [-3.4, 0.5, 0] → [3.4, 0.5, 0] strike span; enable
// followPointer in the playground to chase the cursor.
'use client'

import { Canvas } from '@react-three/fiber'
import { LightningArcs } from '@registry/components/lightning-arcs'
import type { LightningArcsProps } from '@registry/components/lightning-arcs'

export default function LightningArcsScene(props: LightningArcsProps) {
  return (
    <Canvas camera={{ position: [0, 0.5, 8], fov: 50 }} style={{ background: '#0a0a0a' }}>
      <color attach="background" args={['#0a0a0a']} />
      <LightningArcs {...props} />
    </Canvas>
  )
}
