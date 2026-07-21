// Ocean — AAA Gerstner-wave water: 6 wave trains, procedural sky reflection,
// scrolling detail normals, subsurface backscatter, and two-band foam.
// Must be rendered inside a react-three-fiber <Canvas>.
//
// Usage:
//   <Canvas camera={{ position: [0, 5, 16] }}>
//     <Ocean color="#075985" waveHeight={0.8} choppiness={1} speed={1} />
//   </Canvas>
//
// The water shading is fully self-contained in the shader (procedural sky,
// sun glint, subsurface, foam) — no scene lights required.
'use client'

import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, extend } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'

export interface OceanProps {
  color?: string
  waveHeight?: number
  choppiness?: number
  speed?: number
}

const OceanMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color('#075985'),
    uWaveHeight: 0.8,
    uChoppiness: 1,
  },
  /* glsl */ `
    uniform float uTime;
    uniform float uWaveHeight;
    uniform float uChoppiness;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vCrest;

    // Accumulate one Gerstner wave train (local space: xy horizontal, z up).
    // binormal = dP/dx, tangent = dP/dy — summed partial derivatives give
    // the exact analytic normal, no finite differences needed.
    void gerstner(
      vec2 dir, float wavelength, float ampScale, float steepScale,
      vec2 p,
      inout vec2 horiz, inout float height,
      inout vec3 binormal, inout vec3 tangent
    ) {
      float k = 6.28318530718 / wavelength;
      float c = sqrt(9.8 / k); // deep-water dispersion: long waves travel faster
      float a = uWaveHeight * ampScale;
      // Per-wave steepness Q, clamped so the surface never self-intersects (Q*k*a <= 1)
      float q = min(uChoppiness * steepScale / (k * a * 4.0 + 1e-4), 1.0 / (k * a + 1e-4));
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

      // Primary swell trains
      gerstner(normalize(vec2( 1.00,  0.20)), 30.0, 1.00, 1.00, p, horiz, height, binormal, tangent);
      gerstner(normalize(vec2( 0.70,  0.70)), 18.0, 0.60, 0.90, p, horiz, height, binormal, tangent);
      gerstner(normalize(vec2(-0.40,  0.90)), 12.0, 0.40, 0.80, p, horiz, height, binormal, tangent);
      gerstner(normalize(vec2( 0.30, -0.95)),  8.0, 0.25, 0.70, p, horiz, height, binormal, tangent);
      // Short chop trains — tiny amplitudes, just surface detail
      gerstner(normalize(vec2( 0.90, -0.45)),  5.0, 0.12, 0.60, p, horiz, height, binormal, tangent);
      gerstner(normalize(vec2(-0.80, -0.60)),  3.0, 0.07, 0.50, p, horiz, height, binormal, tangent);

      vec3 pos = vec3(position.xy + horiz, height);
      vec3 n = normalize(cross(binormal, tangent));

      vCrest = height / (uWaveHeight * 2.44 + 1e-4); // normalized -1..1 (sum of ampScales = 2.44)
      vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
      vNormal = normalize(mat3(modelMatrix) * n); // uniform rotation only — safe

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uWaveHeight;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vCrest;

    // Low dusk sun, ahead of the default camera — drives glint, sky, subsurface.
    const vec3 SUN_DIR = vec3(0.24214, 0.28250, -0.92820); // normalize(vec3(0.3, 0.35, -1.15))

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

    // Procedural dusk sky: warm gray-blue horizon -> deep blue zenith,
    // sun disc + halo along SUN_DIR. Below-horizon clamps to the horizon tone.
    vec3 sky(vec3 d) {
      float h = pow(clamp(d.y, 0.0, 1.0), 0.55);
      vec3 col = mix(vec3(0.52, 0.46, 0.42), vec3(0.03, 0.09, 0.24), h);
      float sd = max(dot(d, SUN_DIR), 0.0);
      col += vec3(1.00, 0.85, 0.55) * pow(sd, 800.0) * 4.0;  // disc
      col += vec3(1.00, 0.70, 0.40) * pow(sd, 32.0) * 0.30;  // halo
      col += vec3(0.90, 0.55, 0.30) * pow(sd, 6.0) * 0.12;   // broad dusk glow
      return col;
    }

    // Finite-difference gradient of scrolling fbm — feeds detail normals.
    vec2 detailGrad(vec2 p) {
      float e = 0.35;
      float h0 = fbm(p);
      float hx = fbm(p + vec2(e, 0.0));
      float hy = fbm(p + vec2(0.0, e));
      return vec2(hx - h0, hy - h0) / e;
    }

    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      vec2 xz = vWorldPos.xz;

      // Two scrolling detail-normal layers (fine + coarse) — what sells water up close
      vec2 g1 = detailGrad(xz * 1.15 + vec2(uTime * 0.32, uTime * 0.18));
      vec2 g2 = detailGrad(xz * 0.30 - vec2(uTime * 0.11, -uTime * 0.07));
      vec3 n = normalize(vNormal + vec3(g1.x + g2.x * 1.6, 0.0, g1.y + g2.y * 1.6) * 0.15);

      // Base water body color: deep absorption head-on
      vec3 deep = uColor * 0.22;
      vec3 body = uColor * 0.9;

      // Fresnel-weighted procedural sky reflection
      float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(viewDir, n), 0.0), 5.0);
      vec3 refl = sky(reflect(-viewDir, n));
      vec3 col = mix(mix(deep, body, clamp(n.z, 0.0, 1.0) * 0.5), refl, fresnel);

      // Subsurface backscatter: turquoise glow on flanks facing away from the sun
      float transmit = pow(max(dot(viewDir, -SUN_DIR), 0.0), 3.0);
      float flank = clamp(vCrest * 0.5 + 0.5, 0.0, 1.0);
      vec3 sss = vec3(0.05, 0.55, 0.50) * transmit * flank * min(uWaveHeight, 2.0) * 0.55;
      col += sss;

      // Foam band 1 — soft crest foam, broken up with 2-octave value noise
      float crest01 = clamp(vCrest * 0.5 + 0.5, 0.0, 1.0);
      float foamN = noise(xz * 1.5) * 0.6 + noise(xz * 5.0) * 0.4;
      float foam = smoothstep(0.42, 0.98, crest01 + (foamN - 0.5) * 0.35);

      // Foam band 2 — streaky whitecaps on the highest third of crests
      float streak = fbm(vec2(xz.x * 0.35 + uTime * 0.15, xz.y * 2.6 - uTime * 0.4));
      float caps = smoothstep(0.66, 0.88, crest01) * smoothstep(0.45, 0.75, streak);

      float foamAll = clamp(foam * 0.7 + caps * 0.9, 0.0, 1.0);
      col = mix(col, vec3(0.88, 0.93, 0.95), foamAll * 0.85);

      // Sun glint: Blinn-Phong specular
      vec3 h = normalize(SUN_DIR + viewDir);
      float spec = pow(max(dot(n, h), 0.0), 240.0);
      col += vec3(1.0, 0.9, 0.75) * spec * 1.2 * (1.0 - foamAll);

      // Manual distance fade to black (custom shaders ignore scene fog)
      float dist = length(cameraPosition - vWorldPos);
      col = mix(col, vec3(0.0), smoothstep(18.0, 58.0, dist));

      gl_FragColor = vec4(col, 0.94);
    }
  `
)

extend({ OceanMaterial })

declare global {
  namespace JSX {
    interface IntrinsicElements {
      oceanMaterial: any
    }
  }
}

export function Ocean({
  color = '#075985',
  waveHeight = 0.8,
  choppiness = 1,
  speed = 1,
}: OceanProps) {
  const materialRef = useRef<any>(null)

  useFrame((_, delta) => {
    const mat = materialRef.current
    if (!mat) return
    mat.uTime += delta * speed
    mat.uColor.set(color)
    mat.uWaveHeight = waveHeight
    mat.uChoppiness = choppiness
  })

  return (
    <mesh rotation-x={-Math.PI / 2}>
      <planeGeometry args={[80, 80, 256, 256]} />
      <oceanMaterial ref={materialRef} transparent />
    </mesh>
  )
}
