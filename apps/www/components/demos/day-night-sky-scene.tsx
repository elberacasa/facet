// Demo scene for the DayNightSky registry component.
'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { DayNightSky } from '@registry/components/day-night-sky'
import type { DayNightSkyProps } from '@registry/components/day-night-sky'

export default function DayNightSkyScene(props: DayNightSkyProps) {
  return (
    <Canvas
      camera={{ position: [0, 4, 12], fov: 55 }}
      style={{ background: '#000000' }}
      onCreated={({ camera }) => camera.lookAt(0, 14, 0)}
    >
      <color attach="background" args={['#000000']} />
      <DayNightSky {...props} />

      {/* dark ground + silhouettes so the horizon has context */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[180, 48]} />
        <meshBasicMaterial color="#111111" />
      </mesh>
      <mesh position={[-14, 2.5, -30]}>
        <boxGeometry args={[10, 5, 8]} />
        <meshBasicMaterial color="#0d0d0d" />
      </mesh>
      <mesh position={[10, 4, -42]}>
        <boxGeometry args={[16, 8, 10]} />
        <meshBasicMaterial color="#0d0d0d" />
      </mesh>
      <mesh position={[30, 1.5, -24]}>
        <boxGeometry args={[7, 3, 7]} />
        <meshBasicMaterial color="#0d0d0d" />
      </mesh>

      <OrbitControls enablePan={false} maxPolarAngle={Math.PI * 0.55} target={[0, 12, 0]} />
    </Canvas>
  )
}
