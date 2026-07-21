'use client'

// Must be rendered inside a react-three-fiber <Canvas>.

import { Center, Float, Text3D as DreiText3D } from '@react-three/drei'

export interface Text3DProps {
  text?: string
  size?: number
  color?: string
  font?: string
  bevelSize?: number
  floatIntensity?: number
}

export function Text3D({
  text = 'HELLO',
  size = 1,
  color = '#ffffff',
  font = 'https://unpkg.com/three@0.166.1/examples/fonts/helvetiker_bold.typeface.json',
  bevelSize = 0.02,
  floatIntensity = 1,
}: Text3DProps) {
  return (
    <Center>
      <Float
        speed={2}
        rotationIntensity={0.5 * floatIntensity}
        floatIntensity={floatIntensity}
      >
        <DreiText3D
          font={font}
          size={size}
          height={size * 0.25}
          curveSegments={12}
          bevelEnabled
          bevelThickness={bevelSize}
          bevelSize={bevelSize}
          bevelOffset={0}
          bevelSegments={5}
        >
          {text}
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
        </DreiText3D>
      </Float>
    </Center>
  )
}
