// cursor-trail scene — camera/background shell, forwards playground props.
'use client'

import { Canvas } from '@react-three/fiber'
import { CursorTrail } from '@registry/components/cursor-trail'
import type { CursorTrailProps } from '@registry/components/cursor-trail'

export default function CursorTrailScene(props: CursorTrailProps) {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 60 }} style={{ background: '#000000' }}>
      <CursorTrail {...props} />
    </Canvas>
  )
}
