// VfxBurst — game juice: GPU particle bursts with presets (explosion, fire, smoke, magic).
// Must be rendered inside a react-three-fiber <Canvas>. Click anywhere on the canvas
// to trigger a burst; with auto=true it also re-triggers on a loop.
//
// The explosion preset is a multi-layer effect: core flash + radial fireball +
// debris streaks + an expanding ground shockwave ring + a colored flash point
// light that spikes on every trigger and lights the surroundings.
'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree, extend } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'

export interface VfxBurstProps {
  preset?: 'explosion' | 'fire' | 'smoke' | 'magic'
  color?: string
  count?: number
  size?: number
  auto?: boolean
}

const PRESET_INDEX: Record<string, number> = {
  explosion: 0,
  fire: 1,
  smoke: 2,
  magic: 3,
}

// flash-light peak intensity per preset
const FLASH_PEAK: Record<string, number> = {
  explosion: 40,
  fire: 10,
  smoke: 3,
  magic: 18,
}

// layer ids encoded in the aLayer attribute
const LAYER_CORE = 0 // core flash (explosion) / inner core (fire)
const LAYER_MAIN = 1 // main body of the effect
const LAYER_SPARK = 2 // debris (explosion) / embers (fire) / orbit sparkles (magic)

const VfxBurstMaterial = shaderMaterial(
  {
    uTime: 0,
    uStart: -100,
    uColor: new THREE.Color('#f97316'),
    uSize: 0.08,
    uPreset: 0,
  },
  /* glsl */ `
    uniform float uTime;
    uniform float uStart;
    uniform float uSize;
    uniform int uPreset;
    attribute vec3 aVelocity;
    attribute float aSeed;
    attribute vec3 aOffset;
    attribute float aLayer;
    varying float vLife;
    varying float vSeed;
    varying float vLayer;

    void main() {
      vec3 dir = normalize(aVelocity);
      float mag = length(aVelocity);
      float elapsed = uTime - uStart;

      // per-particle lifetime, varied by seed; layers override per preset
      float lifetime = mix(0.8, 2.0, aSeed);
      if (uPreset == 0) {
        if (aLayer < 0.5) {
          lifetime = 0.15; // core flash dies fast
        } else if (aLayer > 1.5) {
          lifetime = 1.0 + aSeed * 1.0; // debris lingers
        }
      } else if (uPreset == 1) {
        if (aLayer < 0.5) {
          lifetime = mix(0.5, 1.0, aSeed); // inner core burns fast
        } else if (aLayer > 1.5) {
          lifetime = 1.4 + aSeed * 1.2; // embers linger
        }
      }
      float t = elapsed / lifetime;
      float life = clamp(t, 0.0, 1.0);

      vec3 pos = vec3(0.0);
      float sizeCurve = 1.0;

      if (uPreset == 0) {
        if (aLayer < 0.5) {
          // core flash — huge white bloom, slow expand, gone in 0.15s
          pos = dir * mag * life * 0.8;
          sizeCurve = 3.0 + 7.0 * pow(life, 0.4);
        } else if (aLayer > 1.5) {
          // debris streaks — fast, tiny, gravity drops them
          float speed = 4.5 + aSeed * 5.0;
          pos = dir * speed * elapsed;
          pos.y -= 1.8 * elapsed * elapsed;
          sizeCurve = 0.28;
        } else {
          // main fireball — decelerating radial burst + gravity sag
          float ease = 1.0 - pow(1.0 - life, 3.0);
          pos = dir * mag * ease * 3.0;
          pos.y -= life * life * 1.2;
          sizeCurve = (1.0 - life) * 1.6 + 0.3;
        }
      } else if (uPreset == 1) {
        if (aLayer < 0.5) {
          // inner core — brighter, smaller, faster rise, tight column
          float rise = life * (2.4 + aSeed * 1.2);
          float spread = life * mag * 0.22;
          float flick = sin(uTime * 12.0 + aSeed * 40.0) * 0.06 * life;
          pos = vec3(dir.x * spread + flick, rise, dir.z * spread + flick * 0.6);
          sizeCurve = 0.55 - life * 0.3;
        } else if (aLayer > 1.5) {
          // ember sparks — detach sideways with wiggle, then fall
          float rise = life * (1.2 + aSeed * 0.8) - life * life * 1.6;
          vec3 outDir = dir * life * (1.4 + aSeed * 1.2);
          float wig = sin(uTime * 11.0 + aSeed * 60.0) * 0.18 * life;
          pos = vec3(
            outDir.x + wig,
            rise,
            outDir.z + cos(uTime * 9.0 + aSeed * 45.0) * 0.18 * life
          );
          sizeCurve = 0.32 - life * 0.18;
        } else {
          // main flame — upward cone with sideways flicker
          float rise = life * (1.6 + aSeed * 1.4);
          float spread = life * mag * 0.55;
          float flick = sin(uTime * 9.0 + aSeed * 40.0) * 0.12 * life;
          pos = vec3(dir.x * spread + flick, rise, dir.z * spread + flick * 0.6);
          sizeCurve = 1.0 - life * 0.75;
        }
      } else if (uPreset == 2) {
        // smoke — slow rise, expand, drift
        float rise = life * (0.9 + aSeed * 0.6);
        vec3 drift = vec3(
          sin(uTime * 0.8 + aSeed * 20.0),
          0.0,
          cos(uTime * 0.6 + aSeed * 17.0)
        ) * 0.25 * life;
        pos = dir * mag * life * 0.7 + vec3(0.0, rise, 0.0) + drift;
        sizeCurve = 0.4 + life * 2.4;
      } else {
        // magic — implosion phase, then spiral orbit with rise
        float spin = (aLayer > 1.5) ? 5.5 : 3.0;
        float ang = uTime * spin + aSeed * 6.2831;
        vec2 rotated = vec2(
          dir.x * cos(ang) - dir.z * sin(ang),
          dir.x * sin(ang) + dir.z * cos(ang)
        );
        float radius;
        if (life < 0.15) {
          // first 15% of life pulls INWARD before spiraling out
          radius = mag * mix(1.6, 0.12, life / 0.15);
        } else {
          radius = mag * mix(0.12, 1.15, (life - 0.15) / 0.85);
        }
        pos = vec3(rotated.x * radius, life * (1.0 + aSeed * 0.8), rotated.y * radius);
        if (aLayer > 1.5) {
          // orbiting sparkles — smaller, pulsing
          sizeCurve = 0.35 + 0.25 * sin(uTime * 8.0 + aSeed * 30.0);
        } else {
          sizeCurve = 0.6 + 0.4 * sin(uTime * 6.0 + aSeed * 30.0);
        }
      }

      pos += aOffset;

      vLife = life;
      vSeed = aSeed;
      vLayer = aLayer;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      // dead particles collapse to zero size
      float alive = (t >= 0.0 && t < 1.0) ? 1.0 : 0.0;
      gl_PointSize = uSize * 500.0 * sizeCurve * alive / max(-mvPosition.z, 0.1);
    }
  `,
  /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime;
    uniform int uPreset;
    varying float vLife;
    varying float vSeed;
    varying float vLayer;

    void main() {
      if (vLife >= 1.0) discard;

      // soft round point
      float d = length(gl_PointCoord - 0.5);
      float alpha = 1.0 - smoothstep(0.0, 0.5, d);

      vec3 col;
      if (uPreset == 0) {
        if (vLayer < 0.5) {
          // core flash — blinding white
          col = vec3(1.0, 1.0, 0.97);
          alpha *= 1.0 - smoothstep(0.3, 1.0, vLife);
        } else if (vLayer > 1.5) {
          // debris — hot sparks cooling into the preset color
          col = mix(vec3(1.0, 0.95, 0.8), uColor, smoothstep(0.0, 0.4, vLife));
          alpha *= 1.0 - smoothstep(0.6, 1.0, vLife);
        } else {
          // main fireball ramp: white -> color -> deep ember #7c2d12 -> gone
          col = mix(vec3(1.0, 0.98, 0.9), uColor, smoothstep(0.0, 0.25, vLife));
          col = mix(col, vec3(0.486, 0.176, 0.071), smoothstep(0.3, 0.75, vLife));
          alpha *= 1.0 - smoothstep(0.55, 1.0, vLife);
        }
      } else if (uPreset == 1) {
        if (vLayer < 0.5) {
          // inner core — near white-hot
          col = mix(vec3(1.0, 0.99, 0.92), uColor, smoothstep(0.2, 0.9, vLife));
          alpha *= 1.0 - smoothstep(0.5, 1.0, vLife);
        } else if (vLayer > 1.5) {
          // embers — bright and flickering
          col = mix(vec3(1.0, 0.9, 0.6), uColor, smoothstep(0.0, 0.5, vLife));
          float flicker = 0.55 + 0.45 * sin(uTime * 18.0 + vSeed * 80.0);
          alpha *= flicker * (1.0 - smoothstep(0.5, 1.0, vLife));
        } else {
          // main flame ramp: white-hot -> color -> fade
          col = mix(vec3(1.0, 0.98, 0.9), uColor, smoothstep(0.0, 0.3, vLife));
          alpha *= 1.0 - smoothstep(0.55, 1.0, vLife);
        }
      } else if (uPreset == 2) {
        // smoke — gray ramp by life (#404040 -> #a3a3a3), alpha peaks mid-life
        col = mix(vec3(0.251), vec3(0.639), smoothstep(0.0, 0.7, vLife));
        alpha *= 0.32 * smoothstep(0.0, 0.3, vLife) * (1.0 - smoothstep(0.5, 1.0, vLife));
      } else {
        // magic — per-particle hue twinkle toward white
        float tw = 0.5 + 0.5 * sin(vSeed * 40.0 + vLife * 25.0);
        float twAmt = (vLayer > 1.5) ? 0.75 : 0.35;
        col = mix(uColor, vec3(1.0), tw * twAmt);
        alpha *= 1.0 - smoothstep(0.6, 1.0, vLife);
      }

      gl_FragColor = vec4(col, alpha);
    }
  `
)

const VfxShockwaveMaterial = shaderMaterial(
  {
    uOpacity: 0,
    uColor: new THREE.Color('#f97316'),
  },
  /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uOpacity;
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      float d = length(vUv - 0.5) * 2.0;
      // soft ring band near the rim of the disc
      float band = smoothstep(0.55, 0.8, d) * (1.0 - smoothstep(0.85, 1.0, d));
      vec3 col = mix(uColor, vec3(1.0), 0.6 * band);
      float alpha = band * uOpacity;
      if (alpha < 0.003) discard;
      gl_FragColor = vec4(col, alpha);
    }
  `
)

extend({ VfxBurstMaterial, VfxShockwaveMaterial })

declare global {
  namespace JSX {
    interface IntrinsicElements {
      vfxBurstMaterial: any
      vfxShockwaveMaterial: any
    }
  }
}

export function VfxBurst({
  preset = 'explosion',
  color = '#f97316',
  count = 800,
  size = 0.08,
  auto = true,
}: VfxBurstProps) {
  const materialRef = useRef<any>(null)
  const shockwaveRef = useRef<THREE.Mesh>(null)
  const shockwaveMatRef = useRef<any>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const timeRef = useRef(0)
  const lastTriggerRef = useRef(-100)
  const gl = useThree((state) => state.gl)

  const [positions, velocities, seeds, offsets, layers] = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const offsets = new Float32Array(count * 3)
    const layers = new Float32Array(count)

    // first 10% = core layer, next 15% = spark/debris layer, rest = main body
    const coreCount = Math.max(1, Math.floor(count * 0.1))
    const sparkCount = Math.floor(count * 0.15)

    for (let i = 0; i < count; i++) {
      const i3 = i * 3

      // random direction on a sphere, varied magnitude — the shader
      // interprets this per preset (radial burst / cone / orbit basis)
      const theta = Math.random() * Math.PI * 2
      const z = Math.random() * 2 - 1
      const r = Math.sqrt(1 - z * z)
      const mag = 0.5 + Math.random()
      velocities[i3] = r * Math.cos(theta) * mag
      velocities[i3 + 1] = z * mag
      velocities[i3 + 2] = r * Math.sin(theta) * mag

      seeds[i] = Math.random()

      layers[i] = i < coreCount ? LAYER_CORE : i < coreCount + sparkCount ? LAYER_SPARK : LAYER_MAIN

      // small origin jitter so the burst core isn't a single point
      offsets[i3] = (Math.random() - 0.5) * 0.15
      offsets[i3 + 1] = (Math.random() - 0.5) * 0.15
      offsets[i3 + 2] = (Math.random() - 0.5) * 0.15
    }

    return [positions, velocities, seeds, offsets, layers]
  }, [count])

  const trigger = () => {
    if (!materialRef.current) return
    materialRef.current.uStart = timeRef.current
    lastTriggerRef.current = timeRef.current
  }

  // click anywhere on the canvas to burst
  useEffect(() => {
    const el = gl.domElement
    el.addEventListener('pointerdown', trigger)
    return () => el.removeEventListener('pointerdown', trigger)
  }, [gl])

  // preset change re-triggers
  useEffect(() => {
    trigger()
  }, [preset])

  useFrame((_, delta) => {
    timeRef.current += delta
    if (!materialRef.current) return
    materialRef.current.uTime = timeRef.current
    if (auto && timeRef.current - lastTriggerRef.current >= 2.5) {
      trigger()
    }

    const sinceTrigger = timeRef.current - lastTriggerRef.current

    // shockwave ring — expands 0 -> 8 over 0.5s while fading out (explosion only)
    const shock = shockwaveRef.current
    if (shock && shockwaveMatRef.current) {
      const st = sinceTrigger / 0.5
      const active = preset === 'explosion' && st >= 0 && st < 1
      shock.visible = active
      if (active) {
        const ease = 1 - Math.pow(1 - st, 3)
        // plane is rotated flat, so its local XY maps to world XZ
        const s = Math.max(8 * ease, 0.001)
        shock.scale.set(s, s, 1)
        shockwaveMatRef.current.uOpacity = (1 - st) * 0.9
      }
    }

    // flash light — intensity spikes on trigger, exponential decay
    const light = lightRef.current
    if (light) {
      const peak = FLASH_PEAK[preset] ?? 20
      light.intensity = sinceTrigger >= 0 ? peak * Math.exp(-sinceTrigger * 4.5) : 0
      light.color.set(color)
    }
  })

  return (
    <group>
      <points frustumCulled={false} key={count} position={[0, 1, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aVelocity" args={[velocities, 3]} />
          <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} />
          <bufferAttribute attach="attributes-aOffset" args={[offsets, 3]} />
          <bufferAttribute attach="attributes-aLayer" args={[layers, 1]} />
        </bufferGeometry>
        <vfxBurstMaterial
          ref={materialRef}
          uColor={new THREE.Color(color)}
          uSize={size}
          uPreset={PRESET_INDEX[preset] ?? 0}
          transparent
          depthWrite={false}
          blending={preset === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending}
        />
      </points>

      {/* ground shockwave ring (explosion only, visibility toggled per frame) */}
      <mesh
        ref={shockwaveRef}
        rotation-x={-Math.PI / 2}
        position={[0, 0.03, 0]}
        visible={false}
        frustumCulled={false}
      >
        <planeGeometry args={[2, 2]} />
        <vfxShockwaveMaterial
          ref={shockwaveMatRef}
          uColor={new THREE.Color(color)}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* flash light — lights the surroundings on each trigger */}
      <pointLight ref={lightRef} position={[0, 1.5, 0]} intensity={0} distance={30} decay={2} />
    </group>
  )
}
