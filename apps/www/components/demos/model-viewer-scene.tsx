'use client'

// Playground scene for model-viewer — keeps camera/black bg, forwards props.

import { Canvas } from '@react-three/fiber'
import { ModelViewer } from '@registry/components/model-viewer'
import type { ModelViewerProps } from '@registry/components/model-viewer'

export default function ModelViewerScene(props: ModelViewerProps) {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 45 }} gl={{ antialias: true }}>
      <color attach="background" args={['#000000']} />
      <ModelViewer {...props} />
    </Canvas>
  )
}
