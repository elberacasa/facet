// hero-blob demo scene
'use client'

import { Canvas } from '@react-three/fiber'
import { HeroBlob, HeroBlobProps } from '@registry/components/hero-blob'

export default function HeroBlobScene(props: HeroBlobProps) {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 45 }} style={{ background: '#000000' }}>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.4} />
      <pointLight position={[6, 4, 6]} intensity={60} color="#bef264" />
      <pointLight position={[-6, -3, -4]} intensity={30} color="#365314" />
      <HeroBlob {...props} />
    </Canvas>
  )
}
