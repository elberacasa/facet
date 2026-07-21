// Demo scene for the DriftCar registry component. The component is fully
// self-contained: it renders its own rapier Physics world, lighting, and
// playground (plane, ramps, cones), and owns the chase camera — so no
// OrbitControls and no extra scene dressing here.
'use client'

import { Canvas } from '@react-three/fiber'
import { DriftCar } from '@registry/components/drift-car'
import type { DriftCarProps } from '@registry/components/drift-car'

export default function DriftCarScene(props: DriftCarProps) {
  return (
    <Canvas camera={{ fov: 58, position: [0, 3.2, -7.5] }} style={{ background: '#0a0a0a' }}>
      <color attach="background" args={['#0a0a0a']} />
      <DriftCar {...props} />
    </Canvas>
  )
}
