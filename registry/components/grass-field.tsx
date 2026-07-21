// Grass Field — tens of thousands of instanced, wind-blown grass blades.
// Must be rendered inside a react-three-fiber <Canvas>.
//
// Usage:
//   <Canvas camera={{ position: [6, 4, 8] }}>
//     <GrassField count={30000} color="#65a30d" windStrength={1} windSpeed={1.5} area={20} />
//   </Canvas>
//
// All blades live in a single THREE.InstancedBufferGeometry drawn with one
// custom shader — one draw call for the whole field. Wind, per-blade lean
// and the root→tip color ramp are computed in the vertex shader, so no
// scene lights are required for the grass itself (the soil disc is lit).
'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, extend } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'

export interface GrassFieldProps {
  count?: number
  color?: string
  windStrength?: number
  windSpeed?: number
  area?: number
}

const GrassFieldMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color('#65a30d'),
    uWindStrength: 1,
    uWindSpeed: 1.5,
  },
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uWindStrength;
    uniform float uWindSpeed;

    attribute vec3 aOffset;
    attribute float aScale;
    attribute float aRotation;
    attribute float aPhase;
    attribute float aColorJitter;

    varying vec3 vColor;
    varying float vT;

    void main() {
      vec3 pos = position * aScale;

      // Yaw the blade around its own base
      float c = cos(aRotation);
      float s = sin(aRotation);
      pos = vec3(pos.x * c - pos.z * s, pos.y, pos.x * s + pos.z * c);

      // Progressive bend: nothing at the root, full sway at the tip
      float t = uv.y * uv.y;

      // Traveling wave across the field (aOffset.x phase) + per-blade flutter
      float wave = (
        sin(uTime * uWindSpeed + aPhase + aOffset.x * 0.3) +
        0.5 * sin(uTime * uWindSpeed * 2.7 + aPhase * 1.3)
      ) * uWindStrength * 0.15;

      vec2 windDir = vec2(0.94, 0.34); // pre-normalized main wind direction
      vec2 leanDir = vec2(cos(aRotation * 1.7), sin(aRotation * 1.7));
      vec2 bend = windDir * wave + leanDir * 0.06;
      pos.xz += bend * t * aScale;

      // Root → tip color ramp, jittered blades lean toward pale lime
      vec3 root = uColor * 0.5;
      vec3 tip = mix(uColor * 1.3, vec3(0.851, 0.976, 0.616), aColorJitter * 0.6);
      vColor = mix(root, tip, uv.y);
      vT = uv.y;

      vec3 world = aOffset + pos;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
    }
  `,
  /* glsl */ `
    varying vec3 vColor;
    varying float vT;

    void main() {
      // Fake lambert: blades face the sky more as they rise, fixed warm sun
      vec3 n = normalize(mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 0.0), vT));
      vec3 lightDir = normalize(vec3(0.5, 0.8, 0.3));
      float diff = max(dot(n, lightDir), 0.0);

      vec3 col = vColor * (0.55 + 0.5 * diff);

      // Slight translucency glow toward the tip (sun shining through blades)
      col += vec3(0.35, 0.45, 0.12) * vT * vT * 0.35;

      gl_FragColor = vec4(col, 1.0);
    }
  `
)

extend({ GrassFieldMaterial })

declare global {
  namespace JSX {
    interface IntrinsicElements {
      grassFieldMaterial: any
    }
  }
}

// Single blade: 3-segment tapered strip, ~0.06 wide at the root, ~0.5 tall,
// single tip vertex, slight forward curve baked into the z coordinate.
function buildBladeGeometry(): THREE.BufferGeometry {
  const halfWidths = [0.03, 0.024, 0.014]
  const heights = [0, 0.166, 0.333, 0.5]
  const positions: number[] = []
  const uvs: number[] = []

  for (let i = 0; i < 3; i++) {
    const t = heights[i] / 0.5
    const z = t * t * 0.12 // gentle forward arc
    const w = halfWidths[i]
    positions.push(-w, heights[i], z, w, heights[i], z)
    uvs.push(0, t, 1, t)
  }
  // Tip vertex
  positions.push(0, 0.5, 0.12)
  uvs.push(0.5, 1)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6])
  return geo
}

export function GrassField({
  count = 30000,
  color = '#65a30d',
  windStrength = 1,
  windSpeed = 1.5,
  area = 20,
}: GrassFieldProps) {
  const materialRef = useRef<any>(null)

  const geometry = useMemo(() => {
    const base = buildBladeGeometry()
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = base.index
    geo.setAttribute('position', base.getAttribute('position'))
    geo.setAttribute('uv', base.getAttribute('uv'))

    const offsets = new Float32Array(count * 3)
    const scales = new Float32Array(count)
    const rotations = new Float32Array(count)
    const phases = new Float32Array(count)
    const jitters = new Float32Array(count)
    const radius = area / 2

    for (let i = 0; i < count; i++) {
      // Uniform disc distribution
      const r = radius * Math.sqrt(Math.random())
      const theta = Math.random() * Math.PI * 2
      offsets[i * 3] = Math.cos(theta) * r
      offsets[i * 3 + 1] = 0
      offsets[i * 3 + 2] = Math.sin(theta) * r
      scales[i] = 0.7 + Math.random() * 0.7
      rotations[i] = Math.random() * Math.PI * 2
      phases[i] = Math.random() * 6.28
      jitters[i] = Math.random()
    }

    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3))
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1))
    geo.setAttribute('aRotation', new THREE.InstancedBufferAttribute(rotations, 1))
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))
    geo.setAttribute('aColorJitter', new THREE.InstancedBufferAttribute(jitters, 1))
    geo.instanceCount = count
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), radius + 1)
    return geo
  }, [count, area])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((_, delta) => {
    const mat = materialRef.current
    if (!mat) return
    mat.uTime += delta
    mat.uColor.set(color)
    mat.uWindStrength = windStrength
    mat.uWindSpeed = windSpeed
  })

  return (
    <group>
      <mesh geometry={geometry} frustumCulled={false}>
        <grassFieldMaterial ref={materialRef} side={THREE.DoubleSide} />
      </mesh>
      {/* Dark soil disc under the blades */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <circleGeometry args={[area / 2 + 0.5, 48]} />
        <meshStandardMaterial color="#1c1917" roughness={1} metalness={0} />
      </mesh>
    </group>
  )
}
