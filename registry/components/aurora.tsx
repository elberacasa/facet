// aurora — animated aurora/mesh-gradient shader background. It fills the camera
// viewport; render it alone or behind your content. Must be rendered inside a
// react-three-fiber <Canvas>.
'use client'

import { useRef } from 'react'
import { Color, ShaderMaterial } from 'three'
import { extend, useFrame, useThree } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uOctaves;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uOctaves) break;
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = vUv;
  vec2 p = uv * 3.0;
  float t = uTime * 0.1;

  // domain-warped fbm: warp the field with a second fbm layer
  float warp = fbm(p + fbm(p + t));
  float field = fbm(p + warp + vec2(t * 0.5, -t * 0.3));

  vec3 color = mix(uColorA, uColorB, smoothstep(0.2, 0.8, field));
  color = mix(color, uColorC, smoothstep(0.4, 0.9, warp));

  // vertical gradient bias — darker toward the bottom
  color *= mix(0.35, 1.0, pow(uv.y, 0.8));

  // subtle vignette at the edges
  float d = distance(uv, vec2(0.5));
  color *= smoothstep(0.95, 0.35, d);

  gl_FragColor = vec4(color, 1.0);
}
`

const AuroraMaterial = shaderMaterial(
  {
    uTime: 0,
    uColorA: new Color('#a3e635'),
    uColorB: new Color('#22d3ee'),
    uColorC: new Color('#f97316'),
    uOctaves: 4,
  },
  vertexShader,
  fragmentShader
)

extend({ AuroraMaterial })

declare global {
  namespace JSX {
    interface IntrinsicElements {
      auroraMaterial: any
    }
  }
}

export interface AuroraProps {
  colorA?: string
  colorB?: string
  colorC?: string
  speed?: number
  complexity?: number
}

export function Aurora({
  colorA = '#a3e635',
  colorB = '#22d3ee',
  colorC = '#f97316',
  speed = 0.6,
  complexity = 4,
}: AuroraProps) {
  const materialRef = useRef<ShaderMaterial>(null)
  const viewport = useThree((s) => s.viewport)

  useFrame((_, delta) => {
    const material = materialRef.current
    if (!material) return
    material.uniforms.uTime.value += delta * speed
    ;(material.uniforms.uColorA.value as Color).set(colorA)
    ;(material.uniforms.uColorB.value as Color).set(colorB)
    ;(material.uniforms.uColorC.value as Color).set(colorC)
    material.uniforms.uOctaves.value = complexity
  })

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry />
      <auroraMaterial ref={materialRef} depthWrite={false} />
    </mesh>
  )
}
