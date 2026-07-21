// globe-arcs scene — camera/background shell, forwards playground props.
'use client'

import { Canvas } from '@react-three/fiber'
import { GlobeArcs } from '@registry/components/globe-arcs'
import type { GlobeArcsProps } from '@registry/components/globe-arcs'

export default function GlobeArcsScene(props: GlobeArcsProps) {
  return (
    <Canvas camera={{ position: [0, 0, 7], fov: 60 }} style={{ background: '#000000' }}>
      <GlobeArcs {...props} />
    </Canvas>
  )
}
