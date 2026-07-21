'use client'

import { Canvas } from '@react-three/fiber'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { CharacterController } from '@registry/components/character-controller'
import type { CharacterControllerProps } from '@registry/components/character-controller'

// Fixed physics block: cuboid collider matching the box mesh.
function Block({
  position,
  size,
  color,
  rotation = [0, 0, 0],
  emissive,
  emissiveIntensity = 1,
}: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  rotation?: [number, number, number]
  emissive?: string
  emissiveIntensity?: number
}) {
  return (
    <RigidBody type="fixed" colliders={false} position={position} rotation={rotation}>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          roughness={0.7}
          metalness={0.05}
          emissive={emissive ?? '#000000'}
          emissiveIntensity={emissive ? emissiveIntensity : 0}
        />
      </mesh>
    </RigidBody>
  )
}

// Distant dark pillar backdrop. Sits past the ground edge (15m) so the player
// never reaches it, but it catches the fog and gives the scene depth. Kept as
// fixed colliders so the camera boom never clips through.
const PILLARS: { position: [number, number, number]; size: [number, number, number] }[] = [
  { position: [20, 4.5, 4], size: [2.6, 9, 2.6] },
  { position: [17, 6.5, 13], size: [3.2, 13, 3.2] },
  { position: [8, 3.5, 21], size: [2.2, 7, 2.2] },
  { position: [-4, 7.5, 22], size: [3.6, 15, 3.6] },
  { position: [-15, 5, 17], size: [2.8, 10, 2.8] },
  { position: [-22, 4, 8], size: [3, 8, 3] },
  { position: [-21, 7, -6], size: [3.4, 14, 3.4] },
  { position: [-14, 3.5, -18], size: [2.4, 7, 2.4] },
  { position: [-4, 6, -21], size: [3.2, 12, 3.2] },
  { position: [7, 4, -20], size: [2.6, 8, 2.6] },
  { position: [16, 6.5, -14], size: [3, 13, 3] },
  { position: [23, 3.5, -4], size: [2.2, 7, 2.2] },
]

// Tiny platformer playground. Jump apex with default props is ~1.45m, so the
// floating platforms step up in 1.1m increments.
function Level() {
  return (
    <group>
      {/* 30x30 ground, top surface at y=0 */}
      <Block position={[0, -0.5, 0]} size={[30, 1, 30]} color="#171717" />

      {/* Scattered obstacles */}
      <Block position={[-4, 0.5, -3]} size={[1.5, 1, 1.5]} color="#a3e635" />
      <Block position={[3.5, 0.75, -4]} size={[1.5, 1.5, 1.5]} color="#f5f5f5" />
      <Block position={[-6.5, 0.4, 1]} size={[2, 0.8, 1]} color="#404040" />
      <Block position={[5.5, 0.5, 0.5]} size={[1, 1, 3]} color="#262626" />
      <Block position={[-2, 0.5, -7.5]} size={[2.5, 1, 1]} color="#f5f5f5" />
      <Block position={[1, 0.3, -9]} size={[1, 0.6, 1]} color="#a3e635" />
      <Block position={[7, 0.6, -6]} size={[1.2, 1.2, 1.2]} color="#404040" />
      <Block position={[-8, 0.5, -6]} size={[1, 1, 2]} color="#262626" />
      <Block position={[0.5, 0.25, -5]} size={[0.8, 0.5, 0.8]} color="#a3e635" />
      <Block position={[8, 0.4, 3]} size={[1.6, 0.8, 1.6]} color="#f5f5f5" />
      <Block position={[-5, 0.3, 5]} size={[1, 0.6, 1]} color="#404040" />
      <Block position={[4, 0.5, 6]} size={[2, 1, 1]} color="#262626" />

      {/* Glowing lime accent markers */}
      <Block
        position={[-4, 1.25, -3]}
        size={[0.35, 0.35, 0.35]}
        color="#a3e635"
        emissive="#a3e635"
        emissiveIntensity={1.6}
      />
      <Block
        position={[8.5, 3.85, -10.5]}
        size={[0.35, 0.35, 0.35]}
        color="#a3e635"
        emissive="#a3e635"
        emissiveIntensity={1.6}
      />
      <Block
        position={[8, 1.15, 3]}
        size={[0.35, 0.35, 0.35]}
        color="#a3e635"
        emissive="#a3e635"
        emissiveIntensity={1.6}
      />

      {/* Ramps */}
      <Block position={[-3, 0.72, 5.5]} size={[4, 0.3, 2.5]} rotation={[0, 0, 0.36]} color="#262626" />
      <Block position={[7.5, 0.72, -2.5]} size={[4, 0.3, 2.5]} rotation={[0.36, 0, 0]} color="#404040" />

      {/* Floating platforms: 1.1m steps, chainable with the default jump */}
      <Block position={[2.5, 1.1, -11]} size={[2.5, 0.3, 2.5]} color="#a3e635" />
      <Block position={[5.5, 2.2, -12.5]} size={[2.5, 0.3, 2.5]} color="#f5f5f5" />
      <Block position={[8.5, 3.3, -10.5]} size={[2.5, 0.3, 2.5]} color="#a3e635" />

      {/* Backdrop pillars */}
      {PILLARS.map((p, i) => (
        <Block key={i} position={p.position} size={p.size} color={i % 2 === 0 ? '#101010' : '#161616'} />
      ))}
    </group>
  )
}

// Scene for the character-controller demo; forwards playground props to the
// registry component. No OrbitControls — the controller owns the camera.
export default function CharacterControllerScene(props: CharacterControllerProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 3.5, 6.5], fov: 55 }}
      style={{ background: '#050505' }}
    >
      <fog attach="fog" args={['#050505', 16, 58]} />
      {/* Fill: dim lime-tinted sky over near-black ground bounce. */}
      <hemisphereLight args={['#4a5a33', '#0a0a0a', 0.85]} />
      {/* Key light with a tuned shadow frustum covering the playfield. */}
      <directionalLight
        position={[10, 16, 7]}
        intensity={2.6}
        color="#fff6e6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={2}
        shadow-camera-far={45}
        shadow-bias={-0.0002}
        shadow-normalBias={0.025}
      />
      {/* Lime rim light from behind-left, no shadows. */}
      <directionalLight position={[-8, 6, -12]} intensity={0.7} color="#a3e635" />
      {/* Warm accent glow near the spawn area. */}
      <pointLight position={[-4, 2.5, -3]} intensity={5} distance={11} decay={2} color="#a3e635" />
      <CharacterController {...props}>
        <Level />
      </CharacterController>
    </Canvas>
  )
}
