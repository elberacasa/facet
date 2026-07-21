// audio-visualizer scene — camera/background shell, forwards playground props.
'use client'

import { Canvas } from '@react-three/fiber'
import { AudioVisualizer } from '@registry/components/audio-visualizer'
import type { AudioVisualizerProps } from '@registry/components/audio-visualizer'

export default function AudioVisualizerScene(props: AudioVisualizerProps) {
  return (
    <Canvas camera={{ position: [0, 3.5, 7], fov: 50 }} style={{ background: '#000000' }}>
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 5, 0]} intensity={20} color={props.color ?? '#a3e635'} />
      <AudioVisualizer {...props} />
    </Canvas>
  )
}
