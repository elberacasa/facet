'use client'

// Scene: forwards playground props to the registry Text3D component.
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { Text3D } from '@registry/components/text-3d'
import type { Text3DProps } from '@registry/components/text-3d'

export default function Text3DScene(props: Text3DProps) {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 45 }} gl={{ antialias: true }}>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} />
      <Suspense fallback={null}>
        <Text3D {...props} />
        <Environment preset="city" />
      </Suspense>
    </Canvas>
  )
}
