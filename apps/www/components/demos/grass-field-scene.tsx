// Demo scene for the Grass Field registry component.
'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { GrassField } from '@registry/components/grass-field'
import type { GrassFieldProps } from '@registry/components/grass-field'

export default function GrassFieldScene(props: GrassFieldProps) {
  return (
    <Canvas camera={{ position: [6, 4, 8], fov: 50 }} style={{ background: '#000000' }}>
      <color attach="background" args={['#000000']} />
      <hemisphereLight args={['#3f6212', '#0c0a09', 0.6]} />
      <directionalLight position={[5, 8, 3]} intensity={1.4} color="#fde68a" />
      <GrassField {...props} />
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.3} maxPolarAngle={1.5} />
    </Canvas>
  )
}
