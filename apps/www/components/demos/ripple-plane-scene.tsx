// Demo scene for the RipplePlane registry component.
'use client'

import { Canvas } from '@react-three/fiber'
import { RipplePlane } from '@registry/components/ripple-plane'
import type { RipplePlaneProps } from '@registry/components/ripple-plane'

export default function RipplePlaneScene(props: RipplePlaneProps) {
  return (
    <Canvas
      camera={{ position: [0, 4, 6], fov: 50 }}
      style={{ background: '#000000' }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
    >
      <color attach="background" args={['#000000']} />
      <RipplePlane {...props} />
    </Canvas>
  )
}
