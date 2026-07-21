// Portal — a standing portal frame revealing another world, rendered live from
// the main camera's perspective (true oblique parallax via a mirrored virtual
// camera + render target). Themes: "galaxy" and "ocean".
// Must be rendered inside a react-three-fiber <Canvas>.
//
// Usage:
//   <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
//     <Portal theme="galaxy" frameColor="#a3e635" wisps float />
//   </Canvas>
//
// Install:
//   npx facet3d add portal
//
// Dependencies: three, @react-three/fiber, @react-three/drei
'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createPortal, extend, useFrame } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'

export interface PortalProps {
  theme?: 'galaxy' | 'ocean'
  frameColor?: string
  glowIntensity?: number
  swirlSpeed?: number
  wisps?: boolean
  float?: boolean
  size?: number
}

// ---------------------------------------------------------------------------
// Shared GLSL — 2D value noise / fbm (ring, surface, ocean) and 3D (nebula).
// Note: smoothstep edges must stay ascending — reversed edges are undefined
// behavior in GLSL and return NaN on Metal (macOS/iOS).
// ---------------------------------------------------------------------------
const NOISE_2D = /* glsl */ `
  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
      mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm2(vec2 p) {
    float v = noise2(p) * 0.55;
    v += noise2(p * 2.13 + vec2(17.3, 9.1)) * 0.30;
    v += noise2(p * 4.41 + vec2(-4.7, 3.9)) * 0.15;
    return v;
  }
`

const NOISE_3D = /* glsl */ `
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x),
          mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x),
          mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }
  float fbm3(vec3 p) {
    float v = noise3(p) * 0.5;
    v += noise3(p * 2.07 + vec3(11.3, 5.1, 7.7)) * 0.28;
    v += noise3(p * 4.13 + vec3(-3.9, 8.2, 1.4)) * 0.15;
    v += noise3(p * 8.31 + vec3(2.2, -6.6, 9.9)) * 0.07;
    return v;
  }
`

// ---------------------------------------------------------------------------
// Portal surface — samples the inner-world render target. uViewProj is the
// virtual camera's view-projection matrix; projecting the fragment's
// portal-local position with it yields the exact texel the mirrored camera
// sees behind that point (correct planar UVs at any viewing angle).
// ---------------------------------------------------------------------------
const PortalSurfaceMaterial = shaderMaterial(
  {
    uMap: new THREE.Texture(), // replaced with the render target's texture via props
    uViewProj: new THREE.Matrix4(),
    uColor: new THREE.Color('#a3e635'),
    uGlow: 1,
    uTime: 0,
  },
  /* glsl */ `
    varying vec3 vLocal;

    void main() {
      vLocal = position; // geometry-local == portal-local (mesh sits unscaled at the group origin)
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform sampler2D uMap;
    uniform mat4 uViewProj;
    uniform vec3 uColor;
    uniform float uGlow;
    uniform float uTime;

    varying vec3 vLocal;

    ${NOISE_2D}

    void main() {
      vec4 clip = uViewProj * vec4(vLocal, 1.0);
      // Guard the perspective divide — never 0/0.
      float w = abs(clip.w) < 1e-4 ? 1e-4 : clip.w;
      vec2 uv = clip.xy / w * 0.5 + 0.5;

      float r = length(vLocal.xy);
      float mask = 1.0 - smoothstep(0.93, 0.995, r);

      // Liquid shimmer on the window, strongest toward the rim
      float n = fbm2(vLocal.xy * 3.0 + vec2(uTime * 0.35, -uTime * 0.27));
      uv += (n - 0.5) * 0.06 * smoothstep(0.55, 0.97, r);
      uv = clamp(uv, 0.001, 0.999);

      vec3 world = texture2D(uMap, uv).rgb;
      world *= step(0.0, clip.w); // camera slipped behind the portal plane — show nothing
      world *= mask;

      // Soft inner edge glow, gently pulsing
      float edge = smoothstep(0.72, 0.98, r) * mask;
      float pulse = 0.7 + 0.3 * sin(uTime * 2.1);
      vec3 glow = uColor * edge * pulse * uGlow * 0.9;

      gl_FragColor = vec4(world + glow, 1.0);
    }
  `
)

// ---------------------------------------------------------------------------
// Energy ring — polar fbm swirl, additive. Sampling noise on (cos a, sin a)
// keeps the field periodic, so there is no seam where atan wraps.
// ---------------------------------------------------------------------------
const PortalRingMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color('#a3e635'),
    uGlow: 1,
    uSwirl: 1,
  },
  /* glsl */ `
    varying vec2 vPos;

    void main() {
      vPos = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uGlow;
    uniform float uSwirl;

    varying vec2 vPos;

    ${NOISE_2D}

    void main() {
      float r = length(vPos); // ring spans 1.0 .. 1.45
      float a = atan(vPos.y, vPos.x);
      vec2 pol = vec2(cos(a), sin(a));

      float t = uTime * uSwirl;
      float n1 = fbm2(pol * 2.3 + vec2(t * 0.40, -t * 0.26) + r * 2.0);
      float n2 = fbm2(pol * 4.7 - vec2(t * 0.31, t * 0.22) + vec2(r * 5.0, 1.7));
      float energy = pow(clamp(n1 * 0.7 + n2 * 0.55, 0.0, 1.2), 2.4);

      float width = smoothstep(1.0, 1.05, r) * (1.0 - smoothstep(1.18, 1.44, r));
      float core = smoothstep(1.0, 1.03, r) * (1.0 - smoothstep(1.02, 1.16, r));

      vec3 col = uColor * (energy * width * 1.7 + core * 1.1) * uGlow;
      col += vec3(1.0) * pow(energy, 3.0) * width * 0.35 * uGlow; // white-hot flickers
      gl_FragColor = vec4(col, 1.0);
    }
  `
)

// ---------------------------------------------------------------------------
// Wisps — pooled point sprites orbiting the rim. Motion is 100% GPU-side from
// a preallocated seed attribute; no buffer growth, no CPU updates.
// ---------------------------------------------------------------------------
const PortalWispsMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color('#a3e635'),
    uScale: 1,
    uSwirl: 1,
  },
  /* glsl */ `
    attribute vec4 aSeed; // x: radius jitter, y: angle0, z: speed, w: size
    uniform float uTime;
    uniform float uScale;
    uniform float uSwirl;
    varying float vAlpha;

    void main() {
      float ang = aSeed.y + uTime * aSeed.z * uSwirl * 0.55;
      float rad = 1.14 + aSeed.x * 0.36;
      vec3 pos = vec3(cos(ang) * rad, sin(ang) * rad, sin(uTime * 0.6 + aSeed.y * 7.0) * 0.12);
      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      // uScale converts a world-space diameter to device pixels (set from viewport + fov + dpr)
      gl_PointSize = aSeed.w * uScale / max(-mv.z, 0.1);
      vAlpha = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.7 + aSeed.y * 11.0));
      gl_Position = projectionMatrix * mv;
    }
  `,
  /* glsl */ `
    uniform vec3 uColor;
    varying float vAlpha;

    void main() {
      float d = distance(gl_PointCoord, vec2(0.5));
      if (d > 0.5) discard;
      float soft = 1.0 - smoothstep(0.08, 0.5, d);
      vec3 col = mix(vec3(1.0), uColor, 0.72);
      gl_FragColor = vec4(col, soft * vAlpha * 0.8);
    }
  `
)

// ---------------------------------------------------------------------------
// Galaxy world — star dome (3D fbm nebula + twinkling cell stars) and
// floating fresnel crystals. Rendered into the portal's inner scene.
// ---------------------------------------------------------------------------
const PortalStarDomeMaterial = shaderMaterial(
  { uTime: 0 },
  /* glsl */ `
    varying vec3 vDir;

    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uTime;
    varying vec3 vDir;

    ${NOISE_3D}

    // One star per noise cell: point-sprite falloff around a hashed cell
    // position, gated by a density hash, twinkled over time.
    float stars(vec3 d, float scale, float t) {
      vec3 p = d * scale;
      vec3 i = floor(p);
      vec3 f = fract(p);
      vec3 sp = vec3(hash3(i + 11.1), hash3(i + 27.7), hash3(i + 43.3));
      float dist = length(f - sp);
      float m = (1.0 - smoothstep(0.0, 0.12, dist)) * step(0.92, hash3(i));
      float tw = 0.6 + 0.4 * sin(t * 2.0 + hash3(i + 5.5) * 40.0);
      return m * tw;
    }

    void main() {
      vec3 d = normalize(vDir);
      float neb = fbm3(d * 2.6 + vec3(0.0, uTime * 0.015, uTime * 0.01));
      float neb2 = fbm3(d * 5.1 - vec3(uTime * 0.02, 0.0, 0.0));

      vec3 col = vec3(0.012, 0.008, 0.030);
      col += vec3(0.10, 0.30, 0.62) * pow(neb, 1.9) * 1.30;   // cobalt clouds (brand: no purple)
      col += vec3(0.05, 0.45, 0.40) * pow(neb2, 3.0) * 0.85;  // teal wisps
      col += vec3(0.55, 0.80, 0.20) * pow(neb * neb2, 3.0);   // lime dust lanes
      col += vec3(0.90, 0.95, 1.00) * stars(d, 40.0, uTime) * 0.9;
      col += vec3(1.00) * stars(d + 3.7, 90.0, uTime * 1.3) * 0.5;

      gl_FragColor = vec4(col, 1.0);
    }
  `
)

const PortalCrystalMaterial = shaderMaterial(
  {
    uTime: 0,
    uColorA: new THREE.Color('#22d3ee'), // brand: no purple — cyan into lime
    uColorB: new THREE.Color('#a3e635'),
  },
  /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vNormal = normalize(mat3(modelMatrix) * normal); // uniform scale only — safe
      vViewDir = normalize(cameraPosition - worldPosition.xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vec3 n = normalize(vNormal);
      vec3 v = normalize(vViewDir);
      float fresnel = pow(1.0 - abs(dot(v, n)), 2.5);
      float bands = 0.5 + 0.5 * sin(fresnel * 14.0 + uTime * 1.2);
      vec3 col = mix(uColorA, uColorB, fresnel * 0.85 + bands * 0.15);
      col *= 0.22 + fresnel * 1.7;
      float alpha = clamp(0.30 + fresnel * 0.70, 0.0, 1.0);
      gl_FragColor = vec4(col, alpha);
    }
  `
)

// ---------------------------------------------------------------------------
// Ocean world — procedural dusk sky dome (gradient + sun + drifting clouds)
// and a compact 4-train Gerstner sea with analytic normals and sun glint.
// ---------------------------------------------------------------------------
const OCEAN_SUN = 'vec3(0.1186, 0.0988, -0.9882)' // normalize(vec3(0.12, 0.10, -1.0)) — low sun near the window center

const SKY_GLSL = /* glsl */ `
  const vec3 SUN_DIR = ${OCEAN_SUN};

  vec3 sky(vec3 d) {
    float sd = max(dot(d, SUN_DIR), 0.0);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(vec3(0.34, 0.47, 0.60), vec3(0.04, 0.13, 0.32), pow(h, 0.55));
    // warm dusk band hugging the horizon on the sun side
    col += vec3(1.00, 0.45, 0.18) * pow(sd, 4.0) * exp(-h * 7.0) * 0.30;
    vec2 cuv = d.xz / max(d.y, 0.06); // guard: near-horizon division
    float cl = fbm2(cuv * 1.3 + vec2(uTime * 0.012, 0.0));
    col += vec3(0.95, 0.92, 0.88) * smoothstep(0.55, 0.85, cl) * 0.28 * smoothstep(0.04, 0.25, d.y);
    col += vec3(1.00, 0.92, 0.70) * pow(sd, 900.0) * 2.5;  // disc
    col += vec3(1.00, 0.85, 0.55) * pow(sd, 24.0) * 0.28;  // halo
    col += vec3(1.00, 0.75, 0.45) * pow(sd, 5.0) * 0.08;   // broad warmth
    // below the horizon, fall back to deep sea tone so reflections stay sane
    col = mix(vec3(0.02, 0.10, 0.16), col, smoothstep(-0.08, 0.02, d.y));
    return col;
  }
`

const PortalSkyMaterial = shaderMaterial(
  { uTime: 0 },
  /* glsl */ `
    varying vec3 vDir;

    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uTime;
    varying vec3 vDir;

    ${NOISE_2D}
    ${SKY_GLSL}

    void main() {
      gl_FragColor = vec4(sky(normalize(vDir)), 1.0);
    }
  `
)

const PortalWaterMaterial = shaderMaterial(
  { uTime: 0, uWaveHeight: 0.38 },
  /* glsl */ `
    uniform float uTime;
    uniform float uWaveHeight;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vCrest;

    // One Gerstner train (local space: xy horizontal, z up); binormal/tangent
    // accumulate exact partial derivatives for an analytic normal.
    void gerstner(
      vec2 dir, float wavelength, float ampScale, float steepScale,
      vec2 p,
      inout vec2 horiz, inout float height,
      inout vec3 binormal, inout vec3 tangent
    ) {
      float k = 6.28318530718 / wavelength;
      float c = sqrt(9.8 / k);
      float a = uWaveHeight * ampScale;
      float q = min(steepScale / (k * a * 4.0 + 1e-4), 1.0 / (k * a + 1e-4));
      float f = k * (dot(dir, p) - c * uTime);
      float sf = sin(f);
      float cf = cos(f);

      horiz += q * a * dir * cf;
      height += a * sf;

      float wa = k * a;
      binormal.x -= q * wa * dir.x * dir.x * sf;
      binormal.y -= q * wa * dir.x * dir.y * sf;
      binormal.z += wa * dir.x * cf;
      tangent.x  -= q * wa * dir.x * dir.y * sf;
      tangent.y  -= q * wa * dir.y * dir.y * sf;
      tangent.z  += wa * dir.y * cf;
    }

    void main() {
      vec2 p = position.xy;
      vec2 horiz = vec2(0.0);
      float height = 0.0;
      vec3 binormal = vec3(1.0, 0.0, 0.0);
      vec3 tangent = vec3(0.0, 1.0, 0.0);

      gerstner(normalize(vec2( 1.00,  0.20)), 26.0, 1.00, 1.00, p, horiz, height, binormal, tangent);
      gerstner(normalize(vec2( 0.60,  0.80)), 13.0, 0.55, 0.90, p, horiz, height, binormal, tangent);
      gerstner(normalize(vec2(-0.50,  0.85)),  7.0, 0.30, 0.75, p, horiz, height, binormal, tangent);
      gerstner(normalize(vec2( 0.90, -0.45)),  3.5, 0.12, 0.55, p, horiz, height, binormal, tangent);

      vec3 pos = vec3(position.xy + horiz, height);
      vec3 n = normalize(cross(binormal, tangent));

      vCrest = height / (uWaveHeight * 1.97 + 1e-4); // sum of ampScales = 1.97
      vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
      vNormal = normalize(mat3(modelMatrix) * n); // uniform rotation only — safe

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uTime;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vCrest;

    ${NOISE_2D}
    ${SKY_GLSL}

    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      vec3 n = normalize(vNormal);

      // Fresnel-weighted procedural sky reflection over a deep teal body
      float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(viewDir, n), 0.0), 5.0);
      vec3 refl = sky(reflect(-viewDir, n));
      vec3 body = mix(vec3(0.004, 0.05, 0.08), vec3(0.02, 0.22, 0.28), clamp(n.z, 0.0, 1.0));
      vec3 col = mix(body, refl, fresnel);

      // Soft crest foam, broken up with value noise
      float crest01 = clamp(vCrest * 0.5 + 0.5, 0.0, 1.0);
      float foamN = noise2(vWorldPos.xz * 1.4) * 0.6 + noise2(vWorldPos.xz * 4.5) * 0.4;
      float foam = smoothstep(0.52, 0.96, crest01 + (foamN - 0.5) * 0.35);
      col = mix(col, vec3(0.85, 0.92, 0.94), foam * 0.7);

      // Sun glint: Blinn-Phong specular
      vec3 h = normalize(SUN_DIR + viewDir);
      float spec = pow(max(dot(n, h), 0.0), 260.0);
      col += vec3(1.0, 0.9, 0.7) * spec * 1.0 * (1.0 - foam);

      // Fade into the sky's actual horizon tone with distance — sells the
      // horizon line and keeps the dusk warmth instead of going flat grey.
      float dist = length(cameraPosition - vWorldPos);
      vec2 dxz = vWorldPos.xz - cameraPosition.xz;
      float dl = max(length(dxz), 1e-3);
      vec3 horizonCol = sky(normalize(vec3(dxz.x / dl, 0.035, dxz.y / dl)));
      col = mix(col, horizonCol, smoothstep(28.0, 62.0, dist));

      gl_FragColor = vec4(col, 1.0);
    }
  `
)

extend({
  PortalSurfaceMaterial,
  PortalRingMaterial,
  PortalWispsMaterial,
  PortalStarDomeMaterial,
  PortalCrystalMaterial,
  PortalSkyMaterial,
  PortalWaterMaterial,
})

declare global {
  namespace JSX {
    interface IntrinsicElements {
      portalSurfaceMaterial: any
      portalRingMaterial: any
      portalWispsMaterial: any
      portalStarDomeMaterial: any
      portalCrystalMaterial: any
      portalSkyMaterial: any
      portalWaterMaterial: any
    }
  }
}

// Inner worlds live behind the virtual portal: scene origin, facing +z, world at z < 0.

function GalaxyWorld() {
  const domeRef = useRef<any>(null)
  const crystalMatsRef = useRef<any[]>([])
  const crystalsRef = useRef<THREE.Group>(null)

  const crystals = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        position: [
          (Math.random() - 0.5) * 3.4,
          (Math.random() - 0.5) * 2.8,
          -2.2 - Math.random() * 6.5,
        ] as [number, number, number],
        scale: 0.35 + Math.random() * 0.75,
        phase: Math.random() * Math.PI * 2,
        spin: 0.25 + Math.random() * 0.6,
        key: i,
      })),
    []
  )

  useFrame((state, delta) => {
    if (domeRef.current) domeRef.current.uTime += delta
    for (let i = 0; i < crystalMatsRef.current.length; i++) {
      const m = crystalMatsRef.current[i]
      if (m) m.uTime += delta
    }
    const g = crystalsRef.current
    if (g) {
      const t = state.clock.elapsedTime
      for (let i = 0; i < g.children.length; i++) {
        const m = g.children[i]
        const c = crystals[i]
        m.rotation.x = t * c.spin * 0.7 + c.phase
        m.rotation.y = t * c.spin + c.phase
        m.position.y = c.position[1] + Math.sin(t * 0.6 + c.phase) * 0.18
      }
    }
  }, -2) // run before the portal's render-target pass (priority -1)

  return (
    <group>
      <mesh>
        <sphereGeometry args={[60, 32, 32]} />
        <portalStarDomeMaterial ref={domeRef} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <group ref={crystalsRef}>
        {crystals.map((c) => (
          <mesh key={c.key} position={c.position} scale={c.scale}>
            <icosahedronGeometry args={[0.5, 0]} />
            <portalCrystalMaterial
              ref={(el: any) => {
                crystalMatsRef.current[c.key] = el
              }}
              transparent
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function OceanWorld() {
  const skyRef = useRef<any>(null)
  const waterRef = useRef<any>(null)

  useFrame((_, delta) => {
    if (skyRef.current) skyRef.current.uTime += delta
    if (waterRef.current) waterRef.current.uTime += delta
  }, -2)

  return (
    <group>
      <mesh>
        <sphereGeometry args={[60, 32, 32]} />
        <portalSkyMaterial ref={skyRef} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, -1.25, -28]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[60, 60, 128, 128]} />
        <portalWaterMaterial ref={waterRef} />
      </mesh>
    </group>
  )
}

export function Portal({
  theme = 'galaxy',
  frameColor = '#a3e635',
  glowIntensity = 1,
  swirlSpeed = 1,
  wisps = true,
  float = true,
  size = 1,
}: PortalProps) {
  const groupRef = useRef<THREE.Group>(null)
  const surfaceRef = useRef<any>(null)
  const ringRef = useRef<any>(null)
  const wispsRef = useRef<any>(null)
  const timeRef = useRef(0)

  // The inner world lives in its own scene; a mirrored virtual camera renders
  // it to a target that the portal surface samples.
  const innerScene = useMemo(() => new THREE.Scene(), [])
  const rt = useMemo(
    () =>
      new THREE.WebGLRenderTarget(1024, 1024, {
        depthBuffer: true,
        samples: 4,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      }),
    []
  )
  const vCam = useMemo(() => new THREE.PerspectiveCamera(50, 1, 0.05, 200), [])

  // Scratch objects — allocated once, never in the frame loop.
  const tmp = useMemo(
    () => ({
      inv: new THREE.Matrix4(),
      viewProj: new THREE.Matrix4(),
      camPos: new THREE.Vector3(),
      camQuat: new THREE.Quaternion(),
      portalQuat: new THREE.Quaternion(),
    }),
    []
  )

  // Pooled wisp seeds: position attribute is a dummy (motion is GPU-side).
  const wispGeo = useMemo(() => {
    const count = 130
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = Math.random()
      seeds[i * 4 + 1] = Math.random() * Math.PI * 2
      seeds[i * 4 + 2] = (0.3 + Math.random() * 0.9) * (Math.random() > 0.5 ? 1 : -1)
      seeds[i * 4 + 3] = 0.02 + Math.random() * 0.05
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    return geo
  }, [])

  useEffect(() => {
    return () => {
      rt.dispose()
      wispGeo.dispose()
      innerScene.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach((m: any) => m.dispose())
        }
      })
    }
  }, [rt, wispGeo, innerScene])

  // Priority -1: runs before the default render, so the target is fresh when
  // the portal surface samples it. Inner-world animators run at -2, earlier still.
  useFrame((state, delta) => {
    timeRef.current += delta
    const t = timeRef.current
    const group = groupRef.current
    if (!group) return

    if (float) {
      group.position.y = Math.sin(t * 0.8) * 0.06
      group.rotation.y = Math.sin(t * 0.35) * 0.05
      group.rotation.z = Math.sin(t * 0.5) * 0.012
    } else if (group.position.y !== 0 || group.rotation.y !== 0 || group.rotation.z !== 0) {
      // Toggled off mid-float: settle back to the neutral pose.
      group.position.y = 0
      group.rotation.set(0, 0, 0)
    }

    // Match the target to the viewport (clamped) so the window stays sharp at
    // any DPR without paying for a fixed oversize buffer. Only reallocates on
    // resize.
    const dpr = state.viewport.dpr
    const rtW = Math.min(2048, Math.round(state.size.width * dpr))
    const rtH = Math.min(2048, Math.round(state.size.height * dpr))
    if (rt.width !== rtW || rt.height !== rtH) rt.setSize(rtW, rtH)

    // Place the virtual camera exactly where the main camera sits in
    // portal-local space — that's what makes the view through the frame
    // perspective-correct from any angle.
    group.updateWorldMatrix(true, false)
    tmp.inv.copy(group.matrixWorld).invert()
    state.camera.getWorldPosition(tmp.camPos).applyMatrix4(tmp.inv)
    state.camera.getWorldQuaternion(tmp.camQuat)
    group.getWorldQuaternion(tmp.portalQuat).invert()
    vCam.position.copy(tmp.camPos)
    vCam.quaternion.copy(tmp.portalQuat).multiply(tmp.camQuat)

    const pc = state.camera as THREE.PerspectiveCamera
    if (pc.isPerspectiveCamera) {
      vCam.fov = pc.fov
      vCam.aspect = pc.aspect
      vCam.updateProjectionMatrix()
    }
    vCam.updateMatrixWorld(true)
    vCam.matrixWorldInverse.copy(vCam.matrixWorld).invert()
    tmp.viewProj.multiplyMatrices(vCam.projectionMatrix, vCam.matrixWorldInverse)

    const surface = surfaceRef.current
    if (surface) {
      surface.uTime = t
      surface.uColor.set(frameColor)
      surface.uGlow = glowIntensity
      surface.uViewProj.copy(tmp.viewProj)
    }
    const ring = ringRef.current
    if (ring) {
      ring.uTime = t
      ring.uColor.set(frameColor)
      ring.uGlow = glowIntensity
      ring.uSwirl = swirlSpeed
    }
    const wispsMat = wispsRef.current
    if (wispsMat) {
      wispsMat.uTime = t
      wispsMat.uColor.set(frameColor)
      wispsMat.uSwirl = swirlSpeed
      const fov = pc.isPerspectiveCamera ? pc.fov : 50
      wispsMat.uScale =
        (state.size.height * state.viewport.dpr) /
        (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2))
    }

    // Render the inner world into the target with the mirrored camera.
    state.gl.setRenderTarget(rt)
    state.gl.render(innerScene, vCam)
    state.gl.setRenderTarget(null)
  }, -1)

  return (
    <group scale={size}>
      {createPortal(theme === 'ocean' ? <OceanWorld /> : <GalaxyWorld />, innerScene)}

      <group ref={groupRef}>
        {/* Window into the inner world */}
        <mesh>
          <circleGeometry args={[1, 96]} />
          <portalSurfaceMaterial ref={surfaceRef} uMap={rt.texture} />
        </mesh>

        {/* Dark structural rim behind the energy ring */}
        <mesh position={[0, 0, -0.01]}>
          <ringGeometry args={[1.0, 1.5, 96]} />
          <meshBasicMaterial color="#16161a" side={THREE.DoubleSide} />
        </mesh>

        {/* Swirling energy ring */}
        <mesh position={[0, 0, 0.005]}>
          <ringGeometry args={[1.0, 1.45, 128]} />
          <portalRingMaterial
            ref={ringRef}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Particle wisps orbiting the rim */}
        {wisps && (
          <points geometry={wispGeo} frustumCulled={false}>
            <portalWispsMaterial
              ref={wispsRef}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </points>
        )}
      </group>
    </group>
  )
}
