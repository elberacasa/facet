// vfx-burst scene — dark reflective ground + neutral boxes so the burst's
// flash light is visible on the surroundings. Click anywhere to trigger.
'use client'

import { Canvas } from '@react-three/fiber'
import { VfxBurst } from '@registry/components/vfx-burst'
import type { VfxBurstProps } from '@registry/components/vfx-burst'

const BOXES: Array<{ position: [number, number, number]; size: [number, number, number] }> = [
  { position: [-3, 0.75, -1.5], size: [1.5, 1.5, 1.5] },
  { position: [2.8, 0.5, -2.2], size: [1, 1, 1] },
  { position: [0.6, 0.4, -4], size: [0.8, 0.8, 0.8] },
]

export default function VfxBurstScene(props: VfxBurstProps) {
  return (
    <Canvas camera={{ position: [0, 3, 9], fov: 55 }} style={{ background: '#000000' }}>
      {/* dim base lighting so the set is readable between flashes */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 8, 4]} intensity={0.3} />

      {/* dark reflective ground */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0a0a0a" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* neutral set dressing for the flash light to catch */}
      {BOXES.map((box, i) => (
        <mesh key={i} position={box.position}>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color="#262626" metalness={0.2} roughness={0.7} />
        </mesh>
      ))}

      <VfxBurst {...props} />
    </Canvas>
  )
}
