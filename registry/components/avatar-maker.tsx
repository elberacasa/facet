'use client'

// AvatarMaker — parametric stylized chibi character generator with GLB export.
// Designer-vinyl-toy aesthetic: sculpted layered hair, expressive faces
// (happy / neutral / surprised / sleepy), physical clearcoat materials.
//
// Usage:
//   <Canvas shadows camera={{ position: [0, 1.5, 4.2], fov: 45 }}>
//     <AvatarMaker ref={avatarRef} expression="happy" hairStyle="messy" accessory="cap" />
//   </Canvas>
//
// The forwarded ref points at the outer THREE.Group (feet at y=0, total
// standing height ~2.2 * `height` units). Pass that group to the export
// helper to download a binary glTF of the character:
//
//   import { downloadAvatarGLB } from './avatar-maker'
//   <button onClick={() => avatarRef.current && downloadAvatarGLB(avatarRef.current)}>
//     Export .glb
//   </button>
//
// downloadAvatarGLB is client-only: it no-ops on the server.

import { forwardRef, useRef } from 'react'
import type { RefObject } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

export interface AvatarMakerProps {
  skinColor?: string
  hairColor?: string
  hairStyle?: 'bowl' | 'buzz' | 'spiky' | 'ponytail' | 'messy'
  shirtColor?: string
  pantsColor?: string
  accessory?: 'none' | 'glasses' | 'cap'
  expression?: 'happy' | 'neutral' | 'surprised' | 'sleepy'
  headSize?: number
  height?: number
  animate?: boolean
}

type Expression = NonNullable<AvatarMakerProps['expression']>
type HairStyle = NonNullable<AvatarMakerProps['hairStyle']>

const DARK = '#1c1c20'
const MOUTH = '#5b3a2e'
const IRIS = '#5a4632'
const BLUSH = '#f0a8b0'

// Vinyl-toy material: soft diffuse base with a clearcoat sheen.
function Vinyl({ color, roughness = 0.55 }: { color: string; roughness?: number }) {
  return (
    <meshPhysicalMaterial
      color={color}
      roughness={roughness}
      metalness={0}
      clearcoat={0.32}
      clearcoatRoughness={0.6}
    />
  )
}

// Mix a hex color toward white (for two-tone hair tips). Deterministic.
function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

// Deterministic PRNG so sculpted hair detail is identical on every render.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Bowl fringe: 4 segmented bang pieces across the forehead hairline.
const FRINGE: { position: [number, number, number]; scale: [number, number, number]; rotationZ: number }[] = [
  { position: [-0.26, 0.24, 0.36], scale: [1.15, 1, 0.85], rotationZ: 0.25 },
  { position: [-0.09, 0.26, 0.38], scale: [1.1, 0.95, 0.8], rotationZ: 0.08 },
  { position: [0.09, 0.26, 0.38], scale: [1.1, 0.95, 0.8], rotationZ: -0.08 },
  { position: [0.26, 0.24, 0.36], scale: [1.15, 1, 0.85], rotationZ: -0.25 },
]

// Temple/side pieces framing the face.
const SIDES: { position: [number, number, number]; scale: [number, number, number] }[] = [
  { position: [-0.4, 0.04, 0.2], scale: [0.5, 1.35, 0.75] },
  { position: [0.4, 0.04, 0.2], scale: [0.5, 1.35, 0.75] },
]

// Spiky: 9 finer cones with seeded tilt/height variance across the crown.
const SPIKES = (() => {
  const rand = mulberry32(77)
  return Array.from({ length: 9 }, (_, i) => {
    const a = -1.05 + i * 0.2625
    const r = 0.3 + rand() * 0.06
    return {
      position: [Math.sin(a) * r, Math.cos(a) * 0.4 + 0.07, (rand() - 0.5) * 0.12] as [
        number,
        number,
        number,
      ],
      rotation: [(rand() - 0.5) * 0.3, 0, -a + (rand() - 0.5) * 0.3] as [number, number, number],
      height: 0.2 + rand() * 0.12,
      radius: 0.055 + rand() * 0.02,
      isTip: i % 2 === 0,
    }
  })
})()

// Messy: 8 overlapping ellipsoid tufts sculpted onto the bowl shell
// (sphere r=0.475 centered at y=0.1), so they read as lumps, not bumps.
const MESSY_TUFTS = (() => {
  const rand = mulberry32(1337)
  return Array.from({ length: 8 }, (_, i) => {
    const theta = 0.15 + rand() * 0.7
    const phi = rand() * Math.PI * 2
    const r = 0.46
    return {
      position: [
        Math.sin(theta) * Math.cos(phi) * r,
        0.1 + Math.cos(theta) * r,
        Math.sin(theta) * Math.sin(phi) * r,
      ] as [number, number, number],
      scale: [1.1 + rand() * 0.4, 0.8 + rand() * 0.3, 1 + rand() * 0.3] as [number, number, number],
      radius: 0.11 + rand() * 0.05,
      isTip: i % 2 === 0,
    }
  })
})()

function Hair({
  style,
  color,
  tieColor,
}: {
  style: HairStyle
  color: string
  tieColor: string
}) {
  const main = <Vinyl color={color} roughness={0.6} />
  const tip = <Vinyl color={lighten(color, 0.22)} roughness={0.6} />

  const baseCap = (
    <mesh castShadow position={[0, 0.1, 0]} rotation={[-0.08, 0, 0]}>
      <sphereGeometry args={[0.475, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
      {main}
    </mesh>
  )
  const fringe = FRINGE.map((f, i) => (
    <mesh key={`fringe${i}`} castShadow position={f.position} scale={f.scale} rotation={[0, 0, f.rotationZ]}>
      <sphereGeometry args={[0.1, 16, 16]} />
      {i % 2 === 0 ? tip : main}
    </mesh>
  ))
  const sides = SIDES.map((s, i) => (
    <mesh key={`side${i}`} castShadow position={s.position} scale={s.scale}>
      <sphereGeometry args={[0.11, 16, 16]} />
      {main}
    </mesh>
  ))

  switch (style) {
    case 'bowl':
      return (
        <group>
          {baseCap}
          {fringe}
          {sides}
        </group>
      )
    case 'buzz':
      return (
        <mesh castShadow position={[0, 0.27, 0]} scale={[1, 0.4, 1]}>
          <sphereGeometry args={[0.46, 32, 16]} />
          {main}
        </mesh>
      )
    case 'spiky':
      return (
        <group>
          {baseCap}
          {SPIKES.map((s, i) => (
            <mesh key={i} castShadow position={s.position} rotation={s.rotation}>
              <coneGeometry args={[s.radius, s.height, 8]} />
              {s.isTip ? tip : main}
            </mesh>
          ))}
        </group>
      )
    case 'ponytail':
      return (
        <group>
          {baseCap}
          {fringe}
          {sides}
          {/* Two-segment curved tail: kicks back off the crown, then hangs */}
          <mesh castShadow position={[0, 0.14, -0.5]} rotation={[-0.85, 0, 0]}>
            <capsuleGeometry args={[0.11, 0.18, 8, 16]} />
            {main}
          </mesh>
          <mesh castShadow position={[0, -0.1, -0.6]} rotation={[-0.25, 0, 0]}>
            <capsuleGeometry args={[0.095, 0.22, 8, 16]} />
            {tip}
          </mesh>
          {/* Tie */}
          <mesh castShadow position={[0, 0.1, -0.47]}>
            <sphereGeometry args={[0.07, 16, 16]} />
            <Vinyl color={tieColor} />
          </mesh>
        </group>
      )
    case 'messy':
      return (
        <group>
          {baseCap}
          {MESSY_TUFTS.map((t, i) => (
            <mesh key={i} castShadow position={t.position} scale={t.scale}>
              <sphereGeometry args={[t.radius, 16, 16]} />
              {t.isTip ? tip : main}
            </mesh>
          ))}
          {fringe}
        </group>
      )
  }
}

// One eye. The inner group is the blink target: useFrame scales its y.
// Positioned on the head sphere and yawed/pitched so local +z is the
// surface normal — iris/pupil/highlight stack along local z.
function Eye({
  side,
  expression,
  skinColor,
  eyeRef,
}: {
  side: 1 | -1
  expression: Expression
  skinColor: string
  eyeRef: RefObject<THREE.Group>
}) {
  const dark = (
    <meshPhysicalMaterial color={DARK} roughness={0.35} metalness={0} clearcoat={0.3} clearcoatRoughness={0.5} />
  )
  return (
    <group position={[side * 0.155, 0.03, 0.372]} rotation={[-0.07, side * 0.39, 0]}>
      <group ref={eyeRef} scale={expression === 'surprised' ? 1.15 : 1}>
        {expression === 'happy' ? (
          // Happy closed eye: downward-curved arc (⌒)
          <mesh position={[0, 0, 0.055]} rotation={[0, 0, Math.PI / 2 - 1]}>
            <torusGeometry args={[0.07, 0.02, 8, 24, 2]} />
            {dark}
          </mesh>
        ) : (
          <>
            {/* Sclera */}
            <mesh castShadow>
              <sphereGeometry args={[0.1, 24, 24]} />
              <meshPhysicalMaterial
                color="#ffffff"
                roughness={0.25}
                metalness={0}
                clearcoat={0.5}
                clearcoatRoughness={0.4}
              />
            </mesh>
            {/* Iris */}
            <mesh position={[0, 0, 0.078]} scale={[1, 1, 0.45]}>
              <sphereGeometry args={[0.055, 20, 20]} />
              <meshPhysicalMaterial
                color={IRIS}
                roughness={0.3}
                metalness={0}
                clearcoat={0.5}
                clearcoatRoughness={0.4}
              />
            </mesh>
            {/* Pupil */}
            <mesh position={[0, 0, 0.095]}>
              <sphereGeometry args={[expression === 'surprised' ? 0.024 : 0.028, 16, 16]} />
              {dark}
            </mesh>
            {/* Specular highlight, up-left */}
            <mesh position={[-0.018, 0.02, 0.105]}>
              <sphereGeometry args={[0.012, 10, 10]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            {/* Upper lash line */}
            <mesh position={[0, 0, 0.05]} rotation={[0, 0, Math.PI / 2 - 0.75]}>
              <torusGeometry args={[0.105, 0.013, 8, 24, 1.5]} />
              {dark}
            </mesh>
            {/* Sleepy drooping lid: skin-colored cap over the upper eye */}
            {expression === 'sleepy' && (
              <mesh position={[0, 0.012, 0.004]} rotation={[-0.55, 0, 0]}>
                <sphereGeometry args={[0.108, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
                <Vinyl color={skinColor} />
              </mesh>
            )}
          </>
        )}
      </group>
    </group>
  )
}

// Brow placement per expression: height + tilt (outer end down = positive).
const BROWS: Record<Expression, { y: number; tilt: number }> = {
  happy: { y: 0.165, tilt: 0.12 },
  neutral: { y: 0.16, tilt: 0.04 },
  surprised: { y: 0.21, tilt: -0.15 },
  sleepy: { y: 0.13, tilt: 0.35 },
}

function Brows({ expression }: { expression: Expression }) {
  const { y, tilt } = BROWS[expression]
  return (
    <>
      {([-1, 1] as const).map((side) => (
        <mesh
          key={side}
          castShadow
          position={[side * 0.155, y, 0.385]}
          rotation={[-0.1, side * 0.35, Math.PI / 2 + side * tilt]}
        >
          <capsuleGeometry args={[0.018, 0.09, 4, 8]} />
          <meshPhysicalMaterial color={DARK} roughness={0.5} metalness={0} clearcoat={0.2} clearcoatRoughness={0.6} />
        </mesh>
      ))}
    </>
  )
}

function Mouth({ expression }: { expression: Expression }) {
  const mat = (
    <meshPhysicalMaterial color={MOUTH} roughness={0.5} metalness={0} clearcoat={0.25} clearcoatRoughness={0.6} />
  )
  switch (expression) {
    case 'happy':
      // Upturned smile: torus arc centered on the bottom
      return (
        <mesh position={[0, -0.1, 0.405]} rotation={[-0.15, 0, -Math.PI / 2 - 0.85]}>
          <torusGeometry args={[0.115, 0.02, 8, 24, 1.7]} />
          {mat}
        </mesh>
      )
    case 'neutral':
      // Flat relaxed bar — thick enough and seated proud of the face surface
      // (head sphere surface at this height is z≈0.434).
      return (
        <mesh position={[0, -0.125, 0.428]} rotation={[-0.08, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.024, 0.11, 4, 12]} />
          {mat}
        </mesh>
      )
    case 'surprised':
      // Small 'o' ring
      return (
        <mesh position={[0, -0.13, 0.42]} rotation={[-0.1, 0, 0]}>
          <torusGeometry args={[0.05, 0.02, 8, 24]} />
          {mat}
        </mesh>
      )
    case 'sleepy':
      return (
        <mesh position={[0, -0.12, 0.428]} rotation={[-0.08, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.02, 0.07, 4, 12]} />
          {mat}
        </mesh>
      )
  }
}

function Accessory({ kind, color }: { kind: NonNullable<AvatarMakerProps['accessory']>; color: string }) {
  if (kind === 'none') return null
  if (kind === 'glasses') {
    const mat = (
      <meshPhysicalMaterial color="#1a1a1a" roughness={0.3} metalness={0} clearcoat={0.6} clearcoatRoughness={0.35} />
    )
    // Rims sit slightly proud of the eye surface, yawed/pitched to follow the
    // head sphere normal at the eye position (same orientation as the eyes).
    return (
      <group>
        {([-1, 1] as const).map((side) => (
          <group key={side} position={[side * 0.155, 0.03, 0.43]} rotation={[-0.07, side * 0.35, 0]}>
            {/* Thick rim */}
            <mesh castShadow>
              <torusGeometry args={[0.13, 0.028, 10, 32]} />
              {mat}
            </mesh>
            {/* Temple arm: angles back and outward to reach the head side */}
            <mesh castShadow position={[side * 0.19, 0.01, -0.2]} rotation={[0, -side * 0.35, 0]}>
              <boxGeometry args={[0.03, 0.03, 0.44]} />
              {mat}
            </mesh>
          </group>
        ))}
        {/* Bridge connecting the rims */}
        <mesh castShadow position={[0, 0.055, 0.44]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.024, 0.07, 4, 12]} />
          {mat}
        </mesh>
      </group>
    )
  }
  // cap — uses the shirt color
  const mat = <Vinyl color={color} />
  return (
    <group>
      <mesh castShadow position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.42, 0.5, 0.24, 24]} />
        {mat}
      </mesh>
      <mesh castShadow position={[0, 0.28, 0.5]} rotation={[0.2, 0, 0]} scale={[1, 1, 1.7]}>
        <cylinderGeometry args={[0.28, 0.28, 0.035, 24]} />
        {mat}
      </mesh>
    </group>
  )
}

export const AvatarMaker = forwardRef<THREE.Group, AvatarMakerProps>(function AvatarMaker(
  {
    skinColor = '#f2c89b',
    hairColor = '#3f3f46',
    hairStyle = 'bowl',
    shirtColor = '#a3e635',
    pantsColor = '#262626',
    accessory = 'none',
    expression = 'happy',
    headSize = 1.1,
    height = 1,
    animate = true,
  },
  ref
) {
  const bodyRef = useRef<THREE.Group>(null)
  const headRef = useRef<THREE.Group>(null)
  const eyeLRef = useRef<THREE.Group>(null)
  const eyeRRef = useRef<THREE.Group>(null)
  const armLRef = useRef<THREE.Group>(null)
  const armRRef = useRef<THREE.Group>(null)
  // Blink scheduler: next blink time + blink start, deterministic jitter via LCG.
  const blink = useRef({ next: 2.2, start: -1, seed: 7 })

  useFrame(({ clock }) => {
    const body = bodyRef.current
    const head = headRef.current
    const eyeL = eyeLRef.current
    const eyeR = eyeRRef.current
    const armL = armLRef.current
    const armR = armRRef.current
    if (!body || !head || !eyeL || !eyeR || !armL || !armR) return

    const eyeScale = expression === 'surprised' ? 1.15 : 1

    if (!animate) {
      body.scale.y = 1
      head.rotation.set(0, 0, 0)
      eyeL.scale.y = eyeScale
      eyeR.scale.y = eyeScale
      armL.rotation.x = 0
      armR.rotation.x = 0
      return
    }

    const t = clock.getElapsedTime()

    // Breathing: ~1.5Hz, ±0.02 on the torso group.
    body.scale.y = 1 + Math.sin(t * Math.PI * 2 * 1.5) * 0.02

    // Blink: both eyes dip to 0.05 for ~0.12s every 2.5–4s.
    const b = blink.current
    if (t >= b.next) {
      b.start = t
      b.seed = (b.seed * 16807) % 2147483647
      b.next = t + 2.5 + (b.seed / 2147483647) * 1.5
    }
    const phase = (t - b.start) / 0.12
    const lid = phase >= 0 && phase <= 1 ? 1 - 0.95 * Math.sin(Math.PI * phase) : 1
    eyeL.scale.y = lid * eyeScale
    eyeR.scale.y = lid * eyeScale

    // Subtle head sway.
    head.rotation.z = Math.sin(t * 0.6) * 0.03
    head.rotation.y = Math.sin(t * 0.43) * 0.05

    // Arm sway, counter-phase.
    armL.rotation.x = Math.sin(t * 1.9) * 0.04
    armR.rotation.x = -Math.sin(t * 1.9) * 0.04
  })

  return (
    <group ref={ref} scale={height}>
      {/* Legs: thigh + shin segments */}
      {[-1, 1].map((side) => (
        <group key={`leg${side}`} position={[side * 0.16, 0, 0]}>
          <mesh castShadow position={[0, 0.44, 0]}>
            <capsuleGeometry args={[0.105, 0.12, 8, 16]} />
            <Vinyl color={pantsColor} roughness={0.65} />
          </mesh>
          <mesh castShadow position={[0, 0.26, 0]}>
            <capsuleGeometry args={[0.09, 0.14, 8, 16]} />
            <Vinyl color={pantsColor} roughness={0.65} />
          </mesh>
          {/* Sneaker: rounded body + lighter sole */}
          <RoundedBox castShadow args={[0.2, 0.13, 0.36]} radius={0.055} smoothness={4} position={[0, 0.085, 0.05]}>
            <Vinyl color="#e8e8e8" roughness={0.5} />
          </RoundedBox>
          <RoundedBox castShadow args={[0.21, 0.05, 0.38]} radius={0.02} smoothness={4} position={[0, 0.025, 0.06]}>
            <Vinyl color="#fafafa" roughness={0.45} />
          </RoundedBox>
        </group>
      ))}

      {/* Pelvis: slight hip taper bridging pants and shirt */}
      <mesh castShadow position={[0, 0.58, 0]} scale={[1.08, 0.72, 0.95]}>
        <sphereGeometry args={[0.27, 24, 24]} />
        <Vinyl color={pantsColor} roughness={0.65} />
      </mesh>

      {/* Torso + shoulders + arms (breathing group, origin at torso center) */}
      <group ref={bodyRef} position={[0, 0.9, 0]}>
        <mesh castShadow scale={[1.06, 1, 0.9]}>
          <capsuleGeometry args={[0.31, 0.3, 8, 24]} />
          <Vinyl color={shirtColor} />
        </mesh>
        {/* Shoulders */}
        {[-1, 1].map((side) => (
          <mesh key={`shoulder${side}`} castShadow position={[side * 0.3, 0.22, 0]}>
            <sphereGeometry args={[0.125, 16, 16]} />
            <Vinyl color={shirtColor} />
          </mesh>
        ))}
        {/* Arms: upper + forearm with elbow bend, mitten hands */}
        {[-1, 1].map((side) => (
          <group
            key={`arm${side}`}
            ref={side < 0 ? armLRef : armRRef}
            position={[side * 0.33, 0.22, 0]}
            rotation={[0, 0, side * 0.22]}
          >
            <mesh castShadow position={[0, -0.13, 0]}>
              <capsuleGeometry args={[0.075, 0.14, 8, 16]} />
              <Vinyl color={shirtColor} />
            </mesh>
            <group position={[0, -0.26, 0]} rotation={[-0.3, 0, 0]}>
              <mesh castShadow position={[0, -0.11, 0]}>
                <capsuleGeometry args={[0.068, 0.12, 8, 16]} />
                <Vinyl color={shirtColor} />
              </mesh>
              {/* Mitten hand: flattened sphere */}
              <mesh castShadow position={[0, -0.24, 0.01]} scale={[0.92, 1.05, 0.72]}>
                <sphereGeometry args={[0.095, 16, 16]} />
                <Vinyl color={skinColor} />
              </mesh>
            </group>
          </group>
        ))}
      </group>

      {/* Head: everything inside scales with headSize so hair/glasses stay seated */}
      <group ref={headRef} position={[0, 1.53, 0]} scale={headSize}>
        <mesh castShadow>
          <sphereGeometry args={[0.45, 32, 32]} />
          <Vinyl color={skinColor} />
        </mesh>

        <Eye side={-1} expression={expression} skinColor={skinColor} eyeRef={eyeLRef} />
        <Eye side={1} expression={expression} skinColor={skinColor} eyeRef={eyeRRef} />
        <Brows expression={expression} />
        <Mouth expression={expression} />

        {/* Nose: tiny rounded bump */}
        <mesh castShadow position={[0, -0.04, 0.443]}>
          <sphereGeometry args={[0.032, 16, 16]} />
          <Vinyl color={skinColor} />
        </mesh>

        {/* Blush */}
        {[-1, 1].map((side) => (
          <mesh key={`blush${side}`} position={[side * 0.28, -0.075, 0.352]} rotation={[0, side * 0.65, 0]}>
            <circleGeometry args={[0.05, 16]} />
            <meshPhysicalMaterial color={BLUSH} roughness={0.7} metalness={0} clearcoat={0.15} clearcoatRoughness={0.7} />
          </mesh>
        ))}

        <Hair style={hairStyle} color={hairColor} tieColor={shirtColor} />
        <Accessory kind={accessory} color={shirtColor} />
      </group>
    </group>
  )
})

/**
 * Export the avatar group as a binary glTF (.glb) and trigger a browser
 * download. Client-only: no-ops on the server or when `group` is null.
 */
export async function downloadAvatarGLB(group: THREE.Group | null, filename = 'avatar.glb') {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !group) return
  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(group, { binary: true })
  const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
