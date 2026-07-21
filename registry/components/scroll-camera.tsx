// scroll-camera — cinematic scroll-driven camera flythrough. Must be rendered inside a react-three-fiber <Canvas>.
'use client'

import { useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { ScrollControls, Scroll, Stars, useScroll } from '@react-three/drei'

export interface ScrollCameraProps {
  pages?: number
  color?: string
  damping?: number
}

// Gentle S-curve: descends from z=10 to z=-35 with lateral sway.
const WAYPOINTS: [number, number, number][] = [
  [0, 0.4, 10],
  [2.4, -0.6, 2],
  [-2.2, 0.8, -8],
  [1.8, -0.5, -20],
  [0, 0.2, -35],
]

const COPY = ['Scroll to fly.', 'The camera follows the curve.', 'Copy it. Ship it.']

function usePathCurve() {
  return useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        WAYPOINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
        false,
        'centripetal'
      ),
    []
  )
}

function usePalette(color: string) {
  return useMemo(() => {
    const base = new THREE.Color(color)
    return [
      base.clone(),
      base.clone().offsetHSL(0.08, 0, 0.15),
      base.clone().offsetHSL(-0.06, 0.05, 0.22),
      base.clone().offsetHSL(0.5, -0.1, 0.1),
    ]
  }, [color])
}

function FlythroughCamera({
  curve,
  damping,
}: {
  curve: THREE.CatmullRomCurve3
  damping: number
}) {
  const scroll = useScroll()
  const progress = useRef(0)
  const curveLength = useMemo(() => curve.getLength(), [curve])
  const lookTarget = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, delta) => {
    // frame-rate-independent damping toward the scroll offset
    progress.current = THREE.MathUtils.damp(progress.current, scroll.offset, damping * 12, delta)
    const t = THREE.MathUtils.clamp(progress.current, 0, 1)

    curve.getPointAt(t, state.camera.position)
    // aim ~6 units further along the path
    curve.getPointAt(Math.min(t + 6 / curveLength, 1), lookTarget)
    state.camera.lookAt(lookTarget)
  })

  return null
}

interface PathObject {
  position: [number, number, number]
  kind: 'torusKnot' | 'icosahedron' | 'ring'
  wireframe: boolean
  scale: number
  color: THREE.Color
  spin: number
}

function PathMesh({ object }: { object: PathObject }) {
  const ref = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    const mesh = ref.current
    if (!mesh) return
    mesh.rotation.x += delta * object.spin
    mesh.rotation.y += delta * object.spin * 0.7
  })

  return (
    <mesh ref={ref} position={object.position} scale={object.scale}>
      {object.kind === 'torusKnot' && <torusKnotGeometry args={[0.7, 0.22, 160, 24]} />}
      {object.kind === 'icosahedron' && <icosahedronGeometry args={[0.9, 0]} />}
      {object.kind === 'ring' && <torusGeometry args={[1, 0.05, 16, 100]} />}
      {object.wireframe ? (
        <meshStandardMaterial
          color={object.color}
          emissive={object.color}
          emissiveIntensity={0.6}
          wireframe
        />
      ) : (
        <meshStandardMaterial
          color="#101016"
          emissive={object.color}
          emissiveIntensity={0.3}
          roughness={0.3}
          metalness={0.6}
        />
      )}
    </mesh>
  )
}

function PathScene({ curve, palette }: { curve: THREE.CatmullRomCurve3; palette: THREE.Color[] }) {
  const objects = useMemo<PathObject[]>(() => {
    const kinds: PathObject['kind'][] = ['torusKnot', 'icosahedron', 'ring']
    const point = new THREE.Vector3()
    return Array.from({ length: 10 }, (_, i) => {
      curve.getPointAt((i + 0.5) / 10, point)
      const side = i % 2 === 0 ? 1 : -1
      return {
        position: [
          point.x + side * (2.4 + (i % 3) * 0.9),
          point.y + ((i % 3) - 1) * 1.3,
          point.z,
        ],
        kind: kinds[i % 3],
        wireframe: i % 2 === 1,
        scale: 0.8 + (i % 4) * 0.3,
        color: palette[i % palette.length],
        spin: 0.12 + (i % 3) * 0.08,
      }
    })
  }, [curve, palette])

  return (
    <group>
      {objects.map((object, i) => (
        <PathMesh key={i} object={object} />
      ))}
    </group>
  )
}

function PathLights({ curve, palette }: { curve: THREE.CatmullRomCurve3; palette: THREE.Color[] }) {
  const positions = useMemo(() => {
    return [0.12, 0.7].map((t) => {
      const p = curve.getPointAt(t)
      return [p.x, p.y + 2.5, p.z] as [number, number, number]
    })
  }, [curve])

  return (
    <>
      <pointLight position={positions[0]} intensity={120} distance={26} color={palette[1]} />
      <pointLight position={positions[1]} intensity={90} distance={26} color={palette[2]} />
    </>
  )
}

const sectionStyle: CSSProperties = {
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  pointerEvents: 'none',
  userSelect: 'none',
}

const numeralStyle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(6rem, 20vw, 16rem)',
  fontWeight: 100,
  lineHeight: 1,
  letterSpacing: '0.12em',
  color: 'rgba(255,255,255,0.7)',
}

const lineStyle: CSSProperties = {
  margin: '1.75rem 0 0',
  fontSize: 'clamp(0.7rem, 1.4vw, 0.95rem)',
  fontWeight: 400,
  letterSpacing: '0.42em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.45)',
}

export function ScrollCamera({ pages = 3, color = '#a3e635', damping = 0.2 }: ScrollCameraProps) {
  const curve = usePathCurve()
  const palette = usePalette(color)
  const pageCount = Math.max(1, Math.round(pages))

  return (
    <ScrollControls pages={pageCount} damping={damping}>
      <fog attach="fog" args={['#000000', 9, 42]} />
      <ambientLight intensity={0.15} />
      <PathLights curve={curve} palette={palette} />
      <Stars radius={70} depth={50} count={4000} factor={3} saturation={0} fade speed={0.6} />
      <PathScene curve={curve} palette={palette} />
      <FlythroughCamera curve={curve} damping={damping} />
      <Scroll html>
        <div style={{ width: '100vw', pointerEvents: 'none' }}>
          {Array.from({ length: pageCount }, (_, i) => (
            <section key={i} style={sectionStyle}>
              <h1 style={numeralStyle}>{String(i + 1).padStart(2, '0')}</h1>
              <p style={lineStyle}>{COPY[i % COPY.length]}</p>
            </section>
          ))}
        </div>
      </Scroll>
    </ScrollControls>
  )
}
