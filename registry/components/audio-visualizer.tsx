// audio-visualizer — audio-reactive frequency rings. Must be rendered inside a react-three-fiber <Canvas>.
// mode="microphone" requires a user gesture + mic permission in the browser; on any failure it silently falls back to "simulated".
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

export interface AudioVisualizerProps {
  color?: string
  bars?: number
  sensitivity?: number
  mode?: 'simulated' | 'microphone'
}

const RADIUS = 3

export function AudioVisualizer({
  color = '#a3e635',
  bars = 64,
  sensitivity = 2,
  mode = 'simulated',
}: AudioVisualizerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const meshesRef = useRef<(THREE.Mesh | null)[]>([])
  const valuesRef = useRef<Float32Array>(new Float32Array(0))
  const analyserRef = useRef<AnalyserNode | null>(null)
  const freqDataRef = useRef<Uint8Array | null>(null)
  const [micFailed, setMicFailed] = useState(false)

  const geometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(0.16, 1, 0.16)
    geo.translate(0, 0.5, 0) // grow upward from the disc
    return geo
  }, [])

  const indices = useMemo(() => Array.from({ length: bars }, (_, i) => i), [bars])

  // Microphone capture: AudioContext + AnalyserNode. Any failure (denied
  // permission, no user gesture, unsupported API) falls back to simulated.
  useEffect(() => {
    if (mode !== 'microphone' || micFailed) return
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioContext === 'undefined'
    ) {
      setMicFailed(true)
      return
    }

    let cancelled = false
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        ctx = new AudioContext()
        const source = ctx.createMediaStreamSource(s)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8
        source.connect(analyser)
        analyserRef.current = analyser
        freqDataRef.current = new Uint8Array(analyser.frequencyBinCount)
      })
      .catch(() => {
        if (!cancelled) setMicFailed(true)
      })

    return () => {
      cancelled = true
      analyserRef.current = null
      freqDataRef.current = null
      stream?.getTracks().forEach((t) => t.stop())
      ctx?.close().catch(() => {})
    }
  }, [mode, micFailed])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const values = valuesRef.current
    if (values.length !== bars) valuesRef.current = new Float32Array(bars)
    const vals = valuesRef.current

    const analyser = mode === 'microphone' && !micFailed ? analyserRef.current : null
    const freqData = freqDataRef.current
    if (analyser && freqData) analyser.getByteFrequencyData(freqData)

    for (let i = 0; i < bars; i++) {
      let v: number
      if (analyser && freqData) {
        const bin = Math.floor((i / bars) * freqData.length)
        v = freqData[bin] / 255
      } else {
        v = Math.abs(
          Math.sin(t * 2 + i * 0.3) * 0.5 +
            Math.sin(t * 3.7 + i * 1.7) * 0.3 +
            Math.sin(t * 0.9 + i) * 0.2
        )
        v = v * v // squared for punch
      }

      vals[i] = THREE.MathUtils.damp(vals[i], v, 10, delta)
      const mesh = meshesRef.current[i]
      if (!mesh) continue
      mesh.scale.y = 0.1 + vals[i] * sensitivity
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.3 + vals[i] * 2
    }

    if (groupRef.current) groupRef.current.rotation.y += delta * 0.15
  })

  return (
    <group ref={groupRef}>
      {indices.map((i) => {
        const angle = (i / bars) * Math.PI * 2
        return (
          <mesh
            key={i}
            ref={(m) => {
              meshesRef.current[i] = m
            }}
            geometry={geometry}
            position={[Math.cos(angle) * RADIUS, 0, Math.sin(angle) * RADIUS]}
            rotation={[0, -angle, 0]}
          >
            <meshStandardMaterial
              color="#111111"
              emissive={color}
              emissiveIntensity={0.3}
              toneMapped={false}
            />
          </mesh>
        )
      })}
      {/* dark reflective disc under the ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[RADIUS + 1.4, 64]} />
        <meshStandardMaterial color="#050505" metalness={1} roughness={0.4} />
      </mesh>
    </group>
  )
}
