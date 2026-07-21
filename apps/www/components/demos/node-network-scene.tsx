// node-network scene — camera/background shell, forwards playground props.
'use client'

import { Canvas } from '@react-three/fiber'
import { NodeNetwork } from '@registry/components/node-network'
import type { NodeNetworkProps } from '@registry/components/node-network'

export default function NodeNetworkScene(props: NodeNetworkProps) {
  return (
    <Canvas camera={{ position: [0, 0, 9], fov: 60 }} style={{ background: '#000000' }}>
      <NodeNetwork {...props} />
    </Canvas>
  )
}
