// RipplePlane — touch-responsive water surface with interactive ripples.
// Must be rendered inside a react-three-fiber <Canvas>.
'use client'

import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, extend } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'

export interface RipplePlaneProps {
  color?: string
  waveHeight?: number
  speed?: number
}

const MAX_RIPPLES = 16

const RipplePlaneMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color('#38bdf8'),
    uWaveHeight: 0.35,
    uSpeed: 1,
    uRipples: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)),
  },
  /* glsl */ `
    uniform float uTime;
    uniform float uWaveHeight;
    uniform vec4 uRipples[${MAX_RIPPLES}];
    varying float vElevation;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vec3 pos = position;

      // Base ambient waves (2 layered sines, small)
      float h = sin(pos.x * 1.2 + uTime * 0.8) * 0.15;
      h += sin(pos.y * 1.7 - uTime * 0.6 + pos.x * 0.5) * 0.1;

      // Interactive ripples: xy = center (plane-local), z = start time
      for (int i = 0; i < ${MAX_RIPPLES}; i++) {
        vec4 r = uRipples[i];
        float t = uTime - r.z;
        if (t >= 0.0 && t <= 4.0) {
          float d = distance(pos.xy, r.xy);
          h += sin(d * 6.0 - t * 5.0) * exp(-d * 0.8) * exp(-t * 1.2) * smoothstep(0.0, 0.15, t);
        }
      }

      pos.z += h * uWaveHeight;
      vElevation = h;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  /* glsl */ `
    uniform vec3 uColor;
    varying float vElevation;
    varying vec2 vUv;

    void main() {
      // Shade by elevation: deep color in troughs, bright on crests
      float e = clamp(vElevation * 0.5 + 0.5, 0.0, 1.0);
      vec3 col = mix(uColor * 0.15, uColor, e);

      // Subtle fresnel-ish edge fade toward the plane borders
      float edge = smoothstep(0.85, 0.45, distance(vUv, vec2(0.5)));
      col *= mix(0.35, 1.0, edge);

      gl_FragColor = vec4(col, 1.0);
    }
  `
)

extend({ RipplePlaneMaterial })

declare global {
  namespace JSX {
    interface IntrinsicElements {
      ripplePlaneMaterial: any
    }
  }
}

export function RipplePlane({
  color = '#38bdf8',
  waveHeight = 0.35,
  speed = 1,
}: RipplePlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<any>(null)
  const rippleIndex = useRef(0)
  const lastRipple = useRef(new THREE.Vector2(1e9, 1e9))

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uTime += delta * speed
    }
  })

  const addRipple = (x: number, y: number) => {
    const mat = materialRef.current
    if (!mat) return
    mat.uRipples.value[rippleIndex.current].set(x, y, mat.uTime, 0)
    rippleIndex.current = (rippleIndex.current + 1) % MAX_RIPPLES
    lastRipple.current.set(x, y)
  }

  const toLocal = (e: ThreeEvent<PointerEvent>) => {
    if (!meshRef.current) return null
    return meshRef.current.worldToLocal(e.point.clone())
  }

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const p = toLocal(e)
    if (!p) return
    if (lastRipple.current.distanceTo(new THREE.Vector2(p.x, p.y)) > 0.5) {
      addRipple(p.x, p.y)
    }
  }

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    const p = toLocal(e)
    if (!p) return
    addRipple(p.x, p.y)
  }

  return (
    <mesh
      ref={meshRef}
      rotation-x={-Math.PI / 2}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
    >
      <planeGeometry args={[12, 12, 128, 128]} />
      <ripplePlaneMaterial
        ref={materialRef}
        uColor={new THREE.Color(color)}
        uWaveHeight={waveHeight}
        uSpeed={speed}
        transparent={false}
      />
    </mesh>
  )
}
