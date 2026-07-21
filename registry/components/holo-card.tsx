'use client'

// HoloCard — holographic fresnel card. Must be rendered inside a react-three-fiber <Canvas>.

import * as THREE from 'three'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox, shaderMaterial } from '@react-three/drei'
import { extend } from '@react-three/fiber'

export interface HoloCardProps {
  colorA?: string
  colorB?: string
  intensity?: number
  speed?: number
  size?: [number, number, number]
}

const HoloCardMaterial = shaderMaterial(
  {
    uTime: 0,
    uColorA: new THREE.Color('#a3e635'),
    uColorB: new THREE.Color('#f97316'),
    uIntensity: 1.2,
  },
  /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vNormal = normalize(mat3(modelMatrix) * normal);
      vViewDir = normalize(cameraPosition - worldPosition.xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uIntensity;

    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewDir);

      float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 2.0);

      float bands = 0.5 + 0.5 * sin(fresnel * 10.0 + uTime);
      float drift = 0.5 + 0.5 * sin(uTime * 0.4 + normal.y * 2.0);

      vec3 base = mix(uColorA, uColorB, drift);
      vec3 iridescent = mix(uColorA, uColorB, bands);

      vec3 color = mix(base, iridescent, fresnel) * (0.15 + fresnel * uIntensity);
      float alpha = clamp(0.35 + fresnel * 0.65, 0.0, 1.0);

      gl_FragColor = vec4(color, alpha);
    }
  `
)

extend({ HoloCardMaterial })

declare global {
  namespace JSX {
    interface IntrinsicElements {
      holoCardMaterial: any
    }
  }
}

export function HoloCard({
  colorA = '#a3e635',
  colorB = '#f97316',
  intensity = 1.2,
  speed = 1,
  size = [2, 2.8, 0.08],
}: HoloCardProps) {
  const groupRef = useRef<THREE.Group>(null)
  const materialRef = useRef<any>(null)

  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.uTime += delta * speed
    }

    const group = groupRef.current
    if (group) {
      const { x, y } = state.pointer
      const targetY = x * 0.5
      const targetX = -y * 0.35
      group.rotation.y = THREE.MathUtils.damp(group.rotation.y, targetY, 4, delta)
      group.rotation.x = THREE.MathUtils.damp(group.rotation.x, targetX, 4, delta)
    }
  })

  return (
    <group ref={groupRef}>
      <RoundedBox args={size} radius={0.08} smoothness={8}>
        <holoCardMaterial
          ref={materialRef}
          uColorA={new THREE.Color(colorA)}
          uColorB={new THREE.Color(colorB)}
          uIntensity={intensity}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </RoundedBox>
    </group>
  )
}
