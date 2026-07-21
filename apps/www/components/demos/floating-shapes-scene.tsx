'use client'

import { Canvas } from '@react-three/fiber'
import { FloatingShapes } from '@registry/components/floating-shapes'
import type { FloatingShapesProps } from '@registry/components/floating-shapes'

// Scene for the floating-shapes demo; forwards playground props to the registry component.
export default function FloatingShapesScene(props: FloatingShapesProps) {
  return (
    <Canvas camera={{ position: [0, 0, 10], fov: 50 }} style={{ background: '#000000' }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} />
      <directionalLight position={[-5, -3, -5]} intensity={0.5} color="#22d3ee" />
      <FloatingShapes {...props} />
    </Canvas>
  )
}
