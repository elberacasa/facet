// WaveGrid — shader-driven undulating wireframe terrain.
// Must be rendered inside a react-three-fiber <Canvas>.
'use client'

import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'
import { extend } from '@react-three/fiber'

export interface WaveGridProps {
  color?: string
  speed?: number
  amplitude?: number
  frequency?: number
  size?: number
  segments?: number
}

const WaveGridMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color('#22d3ee'),
    uAmplitude: 0.6,
    uFrequency: 2,
  },
  /* glsl */ `
    uniform float uTime;
    uniform float uAmplitude;
    uniform float uFrequency;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vec3 pos = position;
      float f = uFrequency;
      float t = uTime;
      float wave = sin(pos.x * f + t) * 0.5;
      wave += sin(pos.y * f * 1.3 + t * 1.2) * 0.3;
      wave += sin((pos.x + pos.y) * f * 0.6 + t * 0.8) * 0.2;
      pos.z += wave * uAmplitude;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  /* glsl */ `
    uniform vec3 uColor;
    varying vec2 vUv;

    void main() {
      float dist = distance(vUv, vec2(0.5));
      float alpha = smoothstep(0.5, 0.15, dist);
      gl_FragColor = vec4(uColor, alpha);
    }
  `
)

extend({ WaveGridMaterial })

declare global {
  namespace JSX {
    interface IntrinsicElements {
      waveGridMaterial: any
    }
  }
}

export function WaveGrid({
  color = '#22d3ee',
  speed = 1,
  amplitude = 0.6,
  frequency = 2,
  size = 10,
  segments = 80,
}: WaveGridProps) {
  const materialRef = useRef<any>(null)

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uTime += delta * speed
    }
  })

  return (
    <mesh rotation-x={-Math.PI / 2}>
      <planeGeometry args={[size, size, segments, segments]} />
      <waveGridMaterial
        ref={materialRef}
        uColor={new THREE.Color(color)}
        uAmplitude={amplitude}
        uFrequency={frequency}
        wireframe
        transparent
      />
    </mesh>
  )
}
