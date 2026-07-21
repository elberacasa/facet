// Demo scene for the FacePuppet registry component. No OrbitControls — the
// puppet tracks your face (webcam) or the mouse. Materials are analytic
// shaders, so no scene lights are needed.
'use client'

import { Canvas } from '@react-three/fiber'
import { FacePuppet } from '@registry/components/face-puppet'
import type { FacePuppetProps } from '@registry/components/face-puppet'

export default function FacePuppetScene(props: FacePuppetProps) {
  return (
    <Canvas camera={{ position: [0, 0, 3.4], fov: 40 }} style={{ background: '#0a0a0a' }}>
      <color attach="background" args={['#0a0a0a']} />
      <FacePuppet {...props} />
    </Canvas>
  )
}
