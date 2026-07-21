// aurora demo scene
'use client'

import { Canvas } from '@react-three/fiber'
import { Aurora, AuroraProps } from '@registry/components/aurora'

export default function AuroraScene(props: AuroraProps) {
  return (
    <Canvas style={{ background: '#000000' }}>
      <color attach="background" args={['#000000']} />
      <Aurora {...props} />
    </Canvas>
  )
}
