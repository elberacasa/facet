// ImageParticles — particles assemble into text and scatter under the cursor.
// Must be rendered inside a react-three-fiber <Canvas>.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { extend, useFrame } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'

export interface ImageParticlesProps {
  text?: string
  color?: string
  particleSize?: number
  density?: number
  scatter?: number
}

const ImageParticlesMaterial = shaderMaterial(
  {
    uProgress: 0,
    uMouse: new THREE.Vector3(9999, 9999, 0),
    uScatter: 1.5,
    uSize: 0.05,
    uScale: 1,
    uColor: new THREE.Color('#a3e635'),
    uTime: 0,
  },
  /* glsl */ `
    uniform float uProgress;
    uniform vec3 uMouse;
    uniform float uScatter;
    uniform float uSize;
    uniform float uScale;
    uniform float uTime;
    attribute vec3 aTarget;
    attribute float aRandom;

    void main() {
      float t = smoothstep(0.0, 1.0, clamp(uProgress * 1.5 - aRandom * 0.5, 0.0, 1.0));
      vec3 pos = mix(position, aTarget, t);
      pos.x += sin(uTime + aRandom * 6.28) * 0.05;
      pos.y += cos(uTime * 0.8 + aRandom * 6.28) * 0.05;
      vec2 toParticle = pos.xy - uMouse.xy;
      float d = length(toParticle);
      // Note: smoothstep edges must stay ascending — reversed edges are
      // undefined behavior in GLSL and return NaN on Metal (macOS/iOS),
      // which wipes out every vertex.
      float repel = 1.0 - smoothstep(0.0, max(uScatter, 0.001), d);
      pos.xy += (toParticle / max(d, 0.001)) * repel * 0.6;
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      // uSize is a world-space diameter; uScale converts world units to
      // device pixels at unit distance (set from viewport size + fov + dpr).
      gl_PointSize = uSize * uScale / max(-mvPosition.z, 0.1);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  /* glsl */ `
    uniform vec3 uColor;

    void main() {
      float d = distance(gl_PointCoord, vec2(0.5));
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.1, d);
      gl_FragColor = vec4(uColor, alpha);
    }
  `
)

extend({ ImageParticlesMaterial })

declare global {
  namespace JSX {
    interface IntrinsicElements {
      imageParticlesMaterial: any
    }
  }
}

interface ParticleData {
  start: Float32Array
  target: Float32Array
  random: Float32Array
}

export function ImageParticles({
  text = 'FACET',
  color = '#a3e635',
  particleSize = 0.05,
  density = 3,
  scatter = 1.5,
}: ImageParticlesProps) {
  const materialRef = useRef<any>(null)
  const [data, setData] = useState<ParticleData | null>(null)
  const tmpVec = useMemo(() => new THREE.Vector3(), [])
  const tmpDir = useMemo(() => new THREE.Vector3(), [])
  // Only scatter once the cursor has actually moved over the window —
  // state.pointer defaults to (0,0), which would dent the text's center.
  const pointerActive = useRef(false)

  useEffect(() => {
    const onMove = () => {
      pointerActive.current = true
    }
    const onLeave = () => {
      pointerActive.current = false
    }
    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  // Sample the text pixels offscreen (DOM access — must stay inside useEffect for SSR safety).
  useEffect(() => {
    const width = 400
    const height = 200
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx || !text) {
      setData(null)
      return
    }

    let fontSize = 200
    ctx.font = `bold ${fontSize}px sans-serif`
    const measured = ctx.measureText(text).width
    if (measured > width) {
      fontSize = Math.floor((fontSize * width) / measured)
      ctx.font = `bold ${fontSize}px sans-serif`
    }
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, width / 2, height / 2)

    const pixels = ctx.getImageData(0, 0, width, height).data
    const step = Math.max(1, Math.round(density))
    const coords: number[] = []
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        if (pixels[(y * width + x) * 4 + 3] > 128) coords.push(x, y)
      }
    }
    if (coords.length === 0) {
      setData(null)
      return
    }

    const count = coords.length / 2
    const start = new Float32Array(count * 3)
    const target = new Float32Array(count * 3)
    const random = new Float32Array(count)
    const scale = 6 / width
    for (let i = 0; i < count; i++) {
      target[i * 3] = (coords[i * 2] - width / 2) * scale
      target[i * 3 + 1] = -(coords[i * 2 + 1] - height / 2) * scale
      target[i * 3 + 2] = 0
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 5 + Math.random() * 5
      start[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      start[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      start[i * 3 + 2] = r * Math.cos(phi)
      random[i] = Math.random()
    }
    setData({ start, target, random })
    // Re-assemble from scratch on text/density change.
    if (materialRef.current) materialRef.current.uProgress = 0
  }, [text, density])

  useFrame((state, delta) => {
    const m = materialRef.current
    if (!m) return
    m.uTime += delta
    m.uProgress = THREE.MathUtils.damp(m.uProgress, 1, 3, delta)
    // Convert the world-space uSize to device pixels: pixels per world unit
    // at unit distance, from viewport height, camera fov and pixel ratio.
    const fov = (state.camera as THREE.PerspectiveCamera).fov ?? 50
    m.uScale =
      (state.size.height * state.viewport.dpr) /
      (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2))
    // Unproject the pointer onto the z=0 plane.
    if (pointerActive.current) {
      tmpVec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera)
      tmpDir.copy(tmpVec).sub(state.camera.position).normalize()
      const dist = -state.camera.position.z / tmpDir.z
      if (Number.isFinite(dist) && dist > 0) {
        m.uMouse.copy(tmpVec.copy(state.camera.position).add(tmpDir.multiplyScalar(dist)))
      }
    } else {
      m.uMouse.set(9999, 9999, 0)
    }
  })

  if (!data) return null

  return (
    <points key={`${text}-${density}-${data.start.length}`} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.start, 3]} />
        <bufferAttribute attach="attributes-aTarget" args={[data.target, 3]} />
        <bufferAttribute attach="attributes-aRandom" args={[data.random, 1]} />
      </bufferGeometry>
      <imageParticlesMaterial
        ref={materialRef}
        uColor={new THREE.Color(color)}
        uSize={particleSize}
        uScatter={scatter}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
