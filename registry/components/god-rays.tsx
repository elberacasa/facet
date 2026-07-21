// GodRays — volumetric crepuscular light shafts with zero post-processing:
// a fan of additive beam planes with scrolling fbm mist, soft edges, radial
// falloff, and organic flicker, plus a fresnel-halo light source and drifting
// dust motes. Sits behind hero text — captures no pointer events.
// Must be rendered inside a react-three-fiber <Canvas>.
//
// Usage:
//   <Canvas camera={{ position: [0, 0.5, 9], fov: 50 }}>
//     <GodRays color="#fde68a" intensity={1} rayCount={12} density={0.7} />
//   </Canvas>
//
// Install:
//   npx facet3d add god-rays
//
// Dependencies: three, @react-three/fiber
'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

export interface GodRaysProps {
  /** Beam + source color. Warm "#fde68a" by default; lime "#a3e635" works great too. */
  color?: string
  /** Global brightness multiplier. Default 1. */
  intensity?: number
  /** Number of beam planes in the fan (clamped 1..32). Default 12. */
  rayCount?: number
  /** Mist coverage inside the beams, 0..1+. Default 0.7. */
  density?: number
  /** Global animation speed multiplier. Default 1. */
  speed?: number
  /** Flicker amount, 0 = perfectly steady. Default 0.35. */
  flicker?: number
  /** Drifting dust motes inside the fan. Default true. */
  dust?: boolean
  /** World position of the light source the beams emanate from. */
  sourcePosition?: [number, number, number]
}

const MAX_RAYS = 32
const DUST_COUNT = 180 // hard cap — preallocated, never grows
const DUST_RANGE = 7.5 // vertical span of the dust volume below the source

// Deterministic layout per rayCount — no layout shift between reloads.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = noise(p) * 0.55;
    v += noise(p * 2.13 + vec2(17.3, 9.1)) * 0.30;
    v += noise(p * 4.41 + vec2(-4.7, 3.9)) * 0.15;
    return v;
  }
`

// Unit plane, origin translated to the pivot (local y runs 0..1 along the beam),
// so each mesh is just position + rotation.z + scale — the shader does the rest.
const BEAM_VS = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    // Gentle sway around the pivot, growing toward the far end of the shaft.
    float sway = sin(uTime * 0.12 + uSeed * 9.0) * 0.05 * position.y;
    float c = cos(sway);
    float s = sin(sway);
    vec3 p = vec3(position.x * c - position.y * s, position.x * s + position.y * c, position.z);
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const BEAM_FS =
  NOISE_GLSL +
  /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uDensity;
  uniform float uFlicker;
  uniform float uSeed;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    // Mist/dust scrolling along the shaft, per-beam offsets via uSeed.
    float n = fbm(vec2(vUv.x * 2.5 + uSeed * 11.0, vUv.y * 5.0 - uTime * 0.55 + uSeed * 23.0));
    // Density lowers the mist threshold; hi stays strictly above lo (Metal NaN guard).
    float lo = clamp(0.85 - uDensity * 0.5, 0.05, 0.85);
    float mist = smoothstep(lo, lo + 0.35, n);

    // Soft lateral edges — smoothstep edges always ascending.
    float edge = smoothstep(0.0, 0.4, vUv.x) * (1.0 - smoothstep(0.6, 1.0, vUv.x));

    // Radial falloff from the source: long luminous shaft + a hot head at the
    // pivot. Exponent < 1 keeps the tail visible so beams read as shafts, not
    // short triangles dissolving a third of the way down.
    float head = clamp(1.0 - vUv.y, 0.0, 1.0);
    float radial = pow(head, 0.9) * 1.15 + pow(head, 8.0) * 1.5;

    // Organic flicker — two incommensurate sines, unique phase per beam.
    float f1 = sin(uTime * (0.9 + fract(uSeed * 0.371) * 1.3) + uSeed * 17.0);
    float f2 = sin(uTime * (2.3 + fract(uSeed * 0.717) * 2.1) + uSeed * 41.0);
    float flick = 1.0 - uFlicker * 0.5 * (0.5 + 0.5 * f1) * (0.5 + 0.5 * f2);

    // Fade out when the camera flies through the fan.
    float camDist = length(cameraPosition - vWorldPos);
    float camFade = smoothstep(0.6, 3.2, camDist);

    float a = mist * edge * radial * flick * camFade * uIntensity;
    // Ordered-hash dither breaks 8-bit banding in the long additive gradients.
    a = clamp(a + (hash(gl_FragCoord.xy) - 0.5) * (1.0 / 255.0), 0.0, 1.0);
    gl_FragColor = vec4(uColor * a, a);
  }
`

const SOURCE_VS = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const SOURCE_FS = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    float d = length(vUv - 0.5) * 2.0; // 0 center .. 1 rim
    float core = pow(clamp(1.0 - d, 0.0, 1.0), 2.0) * 2.4;
    float halo = (1.0 - smoothstep(0.25, 1.0, d)) * 0.55;
    // Fresnel halo — blooms when the source is viewed at a grazing angle.
    // The 1e-4 bias guards normalize() against the zero vector (Metal NaN).
    vec3 viewDir = normalize(cameraPosition - vWorldPos + vec3(1e-4));
    float fres = pow(1.0 - abs(dot(viewDir, vNormal)), 2.5);
    float pulse = 1.0 + 0.07 * sin(uTime * 1.6);
    vec3 col = uColor * (core + halo + fres * 0.9) * uIntensity * pulse;
    gl_FragColor = vec4(col, 1.0);
  }
`

const DUST_VS = /* glsl */ `
  uniform float uTime;
  uniform float uMinY;
  uniform float uRange;
  uniform float uPixelRatio;

  attribute float aRand;
  varying float vRand;

  void main() {
    vRand = aRand;
    vec3 p = position;
    // Sideways sway + endless downward drift wrapped inside the fan volume.
    p.x += sin(uTime * (0.15 + aRand * 0.25) + aRand * 40.0) * 0.35;
    p.y = uMinY + mod(position.y - uMinY - uTime * (0.08 + aRand * 0.18) + uRange * 8.0, uRange);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (2.0 + aRand * 4.0) * uPixelRatio * (10.0 / max(-mv.z, 0.1));
    gl_Position = projectionMatrix * mv;
  }
`

const DUST_FS = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;

  varying float vRand;

  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;
    float a = 1.0 - smoothstep(0.05, 0.5, d);
    float tw = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.8 + vRand * 2.0) + vRand * 30.0));
    gl_FragColor = vec4(uColor * a * tw * uIntensity * 0.5, a * tw * 0.5);
  }
`

interface Beam {
  angle: number
  width: number
  length: number
  zOff: number
  material: THREE.ShaderMaterial
}

export function GodRays({
  color = '#fde68a',
  intensity = 1,
  rayCount = 12,
  density = 0.7,
  speed = 1,
  flicker = 0.35,
  dust = true,
  sourcePosition = [1.8, 4.2, -3],
}: GodRaysProps) {
  const [sx, sy, sz] = sourcePosition
  const dpr = useThree((s) => s.viewport.dpr)
  const timeRef = useRef(0)

  // Shared beam geometry: unit plane with the origin at the pivot (y 0..1).
  const beamGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 8)
    geo.translate(0, 0.5, 0)
    return geo
  }, [])

  // Fan layout + one shader material per beam (per-beam seed uniform).
  const beams = useMemo<Beam[]>(() => {
    const count = Math.max(1, Math.min(MAX_RAYS, Math.floor(rayCount)))
    const rng = mulberry32(count * 7919)
    const spread = 1.15 // ~66 degrees, fanning downward from the source
    const arr: Beam[] = []
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) - 0.5 : 0
      const seed = rng() * 100
      arr.push({
        angle: Math.PI + t * spread + (rng() - 0.5) * 0.08,
        width: 0.5 + rng() * 0.9,
        length: 7 + rng() * 4,
        zOff: (rng() - 0.5) * 0.6,
        material: new THREE.ShaderMaterial({
          vertexShader: BEAM_VS,
          fragmentShader: BEAM_FS,
          uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(color) },
            uIntensity: { value: intensity },
            uDensity: { value: density },
            uFlicker: { value: flicker },
            uSeed: { value: seed },
          },
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      })
    }
    return arr
    // Props baked into uniforms at construction are re-synced every frame below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rayCount])

  const sourceMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SOURCE_VS,
        fragmentShader: SOURCE_FS,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(color) },
          uIntensity: { value: intensity },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Dust motes: one Points draw call, positions preallocated inside the fan volume.
  const dustGeo = useMemo(() => {
    const rng = mulberry32(1234)
    const positions = new Float32Array(DUST_COUNT * 3)
    const randoms = new Float32Array(DUST_COUNT)
    for (let i = 0; i < DUST_COUNT; i++) {
      positions[i * 3] = sx + (rng() - 0.5) * 9
      positions[i * 3 + 1] = sy - 0.3 - rng() * DUST_RANGE
      positions[i * 3 + 2] = sz + (rng() - 0.5) * 1.6
      randoms[i] = rng()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aRand', new THREE.BufferAttribute(randoms, 1))
    return geo
  }, [sx, sy, sz])

  const dustMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: DUST_VS,
        fragmentShader: DUST_FS,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(color) },
          uIntensity: { value: intensity },
          uMinY: { value: 0 }, // synced every frame from sourcePosition
          uRange: { value: DUST_RANGE },
          uPixelRatio: { value: 1 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    // Uniforms are re-synced every frame; only the shell is memoized once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Dispose everything imperatively created. One effect per resource so a
  // rayCount change can't dispose the still-shared beam geometry.
  useEffect(() => () => beamGeo.dispose(), [beamGeo])
  useEffect(() => () => beams.forEach((b) => b.material.dispose()), [beams])
  useEffect(() => () => sourceMat.dispose(), [sourceMat])
  useEffect(
    () => () => {
      dustGeo.dispose()
      dustMat.dispose()
    },
    [dustGeo, dustMat]
  )

  useFrame((_, delta) => {
    timeRef.current += delta * speed
    const t = timeRef.current
    for (const b of beams) {
      const u = b.material.uniforms
      u.uTime.value = t
      ;(u.uColor.value as THREE.Color).set(color)
      u.uIntensity.value = intensity
      u.uDensity.value = density
      u.uFlicker.value = flicker
    }
    const su = sourceMat.uniforms
    su.uTime.value = t
    ;(su.uColor.value as THREE.Color).set(color)
    su.uIntensity.value = intensity
    const du = dustMat.uniforms
    du.uTime.value = t
    ;(du.uColor.value as THREE.Color).set(color)
    du.uIntensity.value = intensity
    du.uPixelRatio.value = dpr
    du.uMinY.value = sy - 0.3 - DUST_RANGE
  })

  return (
    <group>
      {beams.map((b, i) => (
        <mesh
          key={i}
          geometry={beamGeo}
          material={b.material}
          position={[sx, sy, sz + b.zOff]}
          rotation-z={b.angle}
          scale={[b.width, b.length, 1]}
        />
      ))}
      <mesh material={sourceMat} position={[sx, sy, sz]}>
        <circleGeometry args={[1.15, 48]} />
      </mesh>
      {dust && (
        <points
          geometry={dustGeo}
          material={dustMat}
          frustumCulled={false} // drift pushes points past the static bounding sphere
        />
      )}
    </group>
  )
}
