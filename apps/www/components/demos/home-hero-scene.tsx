// Facet homepage hero background. Rendered behind the hero copy, no input required.
'use client'

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Stars } from '@react-three/drei'

function Knot({
  position,
  scale,
  speed,
  color,
  opacity,
}: {
  position: [number, number, number]
  scale: number
  speed: number
  color: string
  opacity: number
}) {
  const mesh = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (!mesh.current) return
    mesh.current.rotation.x += delta * speed * 0.6
    mesh.current.rotation.y += delta * speed
  })
  return (
    <Float speed={1.4} rotationIntensity={0.4} floatIntensity={1.2}>
      <mesh ref={mesh} position={position} scale={scale}>
        <torusKnotGeometry args={[1, 0.3, 220, 32]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={opacity} />
      </mesh>
    </Float>
  )
}

function Ico({
  position,
  scale,
  color,
  opacity,
}: {
  position: [number, number, number]
  scale: number
  color: string
  opacity: number
}) {
  const mesh = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (!mesh.current) return
    mesh.current.rotation.y -= delta * 0.12
    mesh.current.rotation.z += delta * 0.05
  })
  return (
    <Float speed={1.1} rotationIntensity={0.3} floatIntensity={0.9}>
      <mesh ref={mesh} position={position} scale={scale}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={opacity} />
      </mesh>
    </Float>
  )
}

function CameraRig() {
  const target = useMemo(() => new THREE.Vector3(), [])
  useFrame((state) => {
    target.set(state.pointer.x * 0.6, state.pointer.y * 0.4, 8)
    state.camera.position.lerp(target, 0.03)
    state.camera.lookAt(0, 0, 0)
  })
  return null
}

export default function HomeHeroScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
      dpr={[1, 1.5]}
    >
      <CameraRig />
      <Stars radius={60} depth={40} count={2500} factor={3} saturation={0} fade speed={0.6} />
      <Knot position={[-3.4, 0.6, -1.5]} scale={1.5} speed={0.16} color="#a3e635" opacity={0.32} />
      <Knot position={[3.6, -1.2, -3]} scale={1.9} speed={0.1} color="#a3e635" opacity={0.22} />
      <Ico position={[2.2, 1.8, -1]} scale={0.9} color="#f5f5f5" opacity={0.16} />
      <Ico position={[-2.6, -1.9, -2.5]} scale={1.2} color="#f5f5f5" opacity={0.16} />
    </Canvas>
  )
}
