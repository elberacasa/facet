// Demo scene for the Portal registry component. OrbitControls let you swing
// around the frame to see the perspective-correct parallax of the inner world.
'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Portal } from '@registry/components/portal'
import type { PortalProps } from '@registry/components/portal'

export default function PortalScene(props: PortalProps) {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 50 }} style={{ background: '#0a0a0a' }}>
      <color attach="background" args={['#0a0a0a']} />
      <Portal {...props} />
      <OrbitControls enablePan={false} />
    </Canvas>
  )
}
