// Demo scene for the Ocean registry component.
'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Ocean } from '@registry/components/ocean'
import type { OceanProps } from '@registry/components/ocean'

export default function OceanScene(props: OceanProps) {
  return (
    <Canvas camera={{ position: [0, 5, 16], fov: 50 }} style={{ background: '#000000' }}>
      <color attach="background" args={['#000000']} />
      <fog attach="fog" args={['#000000', 18, 58]} />
      <hemisphereLight args={['#16283c', '#04060a', 0.35]} />
      <Ocean {...props} />
      <OrbitControls enablePan={false} maxPolarAngle={1.5} />
    </Canvas>
  )
}
