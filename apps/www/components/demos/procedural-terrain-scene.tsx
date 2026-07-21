// Demo scene for the ProceduralTerrain registry component.
'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { ProceduralTerrain } from '@registry/components/procedural-terrain'
import type { ProceduralTerrainProps } from '@registry/components/procedural-terrain'

export default function ProceduralTerrainScene(props: ProceduralTerrainProps) {
  const size = props.size ?? 40
  const half = size / 2

  return (
    <Canvas
      shadows
      camera={{ position: [size * 0.75, size * 0.55, size * 0.75], fov: 50 }}
      style={{ background: '#000000' }}
    >
      <color attach="background" args={['#000000']} />
      {/* Subtle distance haze matched to the backdrop so the sea melts away. */}
      <fog attach="fog" args={['#000000', size * 1.7, size * 3.6]} />

      {/* Soft sky/ground fill so shadowed faces never crush to black. */}
      <hemisphereLight args={['#bfdbfe', '#1c1917', 0.55]} />

      {/* Key sun light. Orthographic shadow frustum covers the whole island
          (scales with `size`); 2048 map + normalBias keep flat-shaded faces
          free of acne and peter-panning. */}
      <directionalLight
        position={[half * 1.1, half * 1.6, half * 0.6]}
        intensity={2.2}
        color="#ffe3b3"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-half * 1.15}
        shadow-camera-right={half * 1.15}
        shadow-camera-top={half * 1.15}
        shadow-camera-bottom={-half * 1.15}
        shadow-camera-near={1}
        shadow-camera-far={size * 4}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05 * (size / 40)}
      />

      <ProceduralTerrain {...props} />
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.5}
        enableZoom
        enablePan={false}
        maxPolarAngle={Math.PI / 2.05}
      />
    </Canvas>
  )
}
