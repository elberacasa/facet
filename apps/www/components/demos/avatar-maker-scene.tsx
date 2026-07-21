'use client'

import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Group } from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Html, Environment, ContactShadows } from '@react-three/drei'
import { AvatarMaker, downloadAvatarGLB } from '@registry/components/avatar-maker'
import type { AvatarMakerProps } from '@registry/components/avatar-maker'

// Subtle radial lime glow on the floor behind the character. Client-only
// (this module is loaded with ssr:false), so drawing to a canvas is safe.
function FloorGlow() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    gradient.addColorStop(0, 'rgba(163, 230, 83, 0.09)')
    gradient.addColorStop(0.5, 'rgba(163, 230, 83, 0.035)')
    gradient.addColorStop(1, 'rgba(163, 230, 83, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(canvas)
  }, [])
  if (!texture) return null
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
      <planeGeometry args={[8, 8]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

// Scene for the avatar-maker demo: studio presentation — image-based
// lighting, soft contact shadows, slow turntable. Forwards playground props
// to the registry component and wires Export to the outer group ref.
export default function AvatarMakerScene(props: AvatarMakerProps) {
  const avatarRef = useRef<Group>(null)

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 1.5, 4.2], fov: 45 }}
      style={{ background: '#050505' }}
    >
      {/* Image-based studio lighting for the vinyl clearcoat; in its own
          Suspense so the character still renders if the HDR fetch stalls. */}
      <Suspense fallback={null}>
        <Environment preset="studio" />
      </Suspense>
      {/* Key + fill + lime rim, tuned to complement the IBL. */}
      <directionalLight position={[3.5, 6, 4]} intensity={1.1} color="#fff4e0" />
      <hemisphereLight args={['#3d3d3d', '#0a0a0a', 0.5]} />
      <directionalLight position={[-4, 3, -5]} intensity={0.7} color="#a3e635" />

      <FloorGlow />
      {/* Soft studio contact shadow, re-rendered each frame for the idle anim */}
      <ContactShadows position={[0, 0, 0]} opacity={0.65} scale={7} blur={2.4} far={2.4} resolution={512} color="#000000" />

      <AvatarMaker {...props} ref={avatarRef} />

      <OrbitControls
        autoRotate
        autoRotateSpeed={0.5}
        enablePan={false}
        minDistance={2.5}
        maxDistance={8}
        maxPolarAngle={1.52}
        target={[0, 1.05, 0]}
        makeDefault
      />

      <Html center position={[0, -0.35, 0]} wrapperClass="pointer-events-none">
        <button
          type="button"
          className="pointer-events-auto rounded-full bg-lime-400 px-5 py-2 text-sm font-medium text-neutral-950 transition-transform hover:scale-105"
          onClick={() => {
            if (avatarRef.current) void downloadAvatarGLB(avatarRef.current)
          }}
        >
          Export .glb
        </button>
      </Html>
    </Canvas>
  )
}
