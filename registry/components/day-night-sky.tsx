// day-night-sky — procedural sky dome with a full sun cycle: gradient sky,
// sun disc + halo, a moon, twinkling stars and drifting fbm clouds, all driven
// by a 0–24 hour clock. Must be rendered inside a react-three-fiber <Canvas>.
'use client'

import { useRef } from 'react'
import { BackSide, ShaderMaterial } from 'three'
import { extend, useFrame } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'

const vertexShader = /* glsl */ `
varying vec3 vDir;

void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform float uTime;       // time of day in hours, 0-24
uniform float uClock;      // seconds, drives star twinkle + cloud scroll
uniform float uCloudCover; // 0-1
varying vec3 vDir;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise2(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 dir = normalize(vDir);

  // sun path: rises +x at 6h, peaks at noon, sets -x at 18h
  float sunAngle = (uTime - 6.0) / 12.0 * 3.14159265;
  vec3 sunDir = normalize(vec3(cos(sunAngle), sin(sunAngle), 0.35));
  float se = sunDir.y;

  // phase weights from sun elevation
  float dayF = smoothstep(0.06, 0.30, se);
  float nightF = 1.0 - smoothstep(-0.30, -0.08, se);
  float duskF = clamp(1.0 - dayF - nightF, 0.0, 1.0);

  // sky gradient (zenith / horizon per phase)
  vec3 dayZen = vec3(0.231, 0.510, 0.769);   // #3b82c4
  vec3 dayHor = vec3(0.749, 0.851, 0.910);   // #bfd9e8
  vec3 duskZen = vec3(0.110, 0.150, 0.290);
  vec3 duskHor = vec3(0.980, 0.420, 0.160);
  vec3 nightZen = vec3(0.020, 0.031, 0.063); // #050810
  vec3 nightHor = vec3(0.055, 0.090, 0.160);

  vec3 zen = nightZen;
  zen = mix(zen, duskZen, duskF);
  zen = mix(zen, dayZen, dayF);
  vec3 hor = nightHor;
  hor = mix(hor, duskHor, duskF);
  hor = mix(hor, dayHor, dayF);

  float grad = pow(1.0 - clamp(dir.y, 0.0, 1.0), 1.6);
  vec3 sky = mix(zen, hor, grad);

  // warm band hugging the horizon on the sun's side at dawn/dusk
  vec3 sunFlat = normalize(vec3(sunDir.x, 0.0, sunDir.z));
  float sunAz = max(dot(dir, sunFlat), 0.0);
  float band = pow(sunAz, 3.0) * exp(-max(dir.y, 0.0) * 5.0) * duskF;
  sky += vec3(1.0, 0.38, 0.14) * band * 0.85;
  sky += vec3(1.0, 0.16, 0.34) * band * band * 0.45;

  // darken the below-horizon dome
  float above = smoothstep(-0.20, 0.0, dir.y);
  sky *= mix(0.30, 1.0, above);

  // sun disc + halo, fading as it dips below the horizon
  float sunDot = dot(dir, sunDir);
  float sunVis = smoothstep(-0.10, 0.02, se);
  float sunDisc = smoothstep(0.99935, 0.99965, sunDot);
  float halo = pow(max(sunDot, 0.0), 600.0) * 0.55
             + pow(max(sunDot, 0.0), 60.0) * 0.16;
  vec3 sunCol = mix(vec3(1.0, 0.55, 0.20), vec3(1.0, 0.98, 0.90), dayF);
  sky += sunCol * (sunDisc * 2.2 + halo) * sunVis;

  // moon: pale disc riding the opposite arc, visible at night
  vec3 moonDir = normalize(-sunDir + vec3(0.0, 0.10, -0.15));
  float moonDot = dot(dir, moonDir);
  float moonVis = smoothstep(0.02, 0.12, moonDir.y);
  float moonDisc = smoothstep(0.99965, 0.99985, moonDot);
  vec3 mu = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0)));
  vec3 mv = cross(mu, moonDir);
  vec2 muv = vec2(dot(dir, mu), dot(dir, mv)) * 60.0;
  float crater = fbm(muv);
  vec3 moonCol = vec3(0.92, 0.94, 0.97) * (0.72 + 0.36 * crater);
  float moonGlow = pow(max(moonDot, 0.0), 800.0) * 0.35;
  sky += (moonCol * moonDisc + vec3(0.60, 0.70, 0.90) * moonGlow) * moonVis;

  // stars: hashed 3D grid on the dome, twinkling, night only
  vec3 sp = dir * 60.0;
  vec3 cell = floor(sp);
  vec3 f3 = fract(sp) - 0.5;
  float h1 = hash13(cell);
  vec3 offs = vec3(
    hash13(cell + 11.3),
    hash13(cell + 27.7),
    hash13(cell + 43.1)
  ) - 0.5;
  float sd = length(f3 - offs * 0.7);
  float star = (1.0 - smoothstep(0.0, 0.06 + h1 * 0.05, sd)) * step(0.92, h1);
  float twinkle = 0.55 + 0.45 * sin(uClock * (1.5 + h1 * 4.0) + h1 * 40.0);
  float starVis = (1.0 - smoothstep(-0.10, 0.04, se))
                * smoothstep(-0.05, 0.12, dir.y);
  sky += vec3(0.90, 0.93, 1.0) * star * twinkle * starVis;

  // clouds: fbm on a plane projection of the upper hemisphere
  float cloudMask = smoothstep(0.03, 0.18, dir.y);
  vec2 cp = dir.xz / max(dir.y, 0.05) * 1.4;
  cp += vec2(uClock * 0.008, uClock * 0.004);
  float cn = fbm(cp * 0.9);
  float cov = 1.0 - uCloudCover * 0.9;
  float cdens = smoothstep(cov, cov + 0.35, cn);
  vec3 cloudCol = vec3(0.10, 0.12, 0.17);
  cloudCol = mix(cloudCol, vec3(1.0, 0.55, 0.35), duskF);
  cloudCol = mix(cloudCol, vec3(1.0, 1.0, 1.0), dayF);
  cloudCol += vec3(1.0, 0.6, 0.3) * band * 0.6;
  cloudCol *= 0.75 + 0.25 * smoothstep(cov, cov + 0.6, cn);
  sky = mix(sky, cloudCol, cdens * cloudMask * 0.9);

  gl_FragColor = vec4(sky, 1.0);
}
`

const DayNightSkyMaterial = shaderMaterial(
  {
    uTime: 10,
    uClock: 0,
    uCloudCover: 0.4,
  },
  vertexShader,
  fragmentShader
)

extend({ DayNightSkyMaterial })

declare global {
  namespace JSX {
    interface IntrinsicElements {
      dayNightSkyMaterial: any
    }
  }
}

export interface DayNightSkyProps {
  timeOfDay?: number
  speed?: number
  cloudCover?: number
}

export function DayNightSky({
  timeOfDay = 10,
  speed = 0.5,
  cloudCover = 0.4,
}: DayNightSkyProps) {
  const materialRef = useRef<ShaderMaterial>(null)
  const timeRef = useRef(timeOfDay)
  const lastPropRef = useRef(timeOfDay)

  useFrame((_, delta) => {
    const material = materialRef.current
    if (!material) return
    // resync when the playground slider moves, then keep advancing
    if (timeOfDay !== lastPropRef.current) {
      timeRef.current = timeOfDay
      lastPropRef.current = timeOfDay
    }
    timeRef.current = (timeRef.current + delta * speed) % 24
    material.uniforms.uTime.value = timeRef.current
    material.uniforms.uClock.value += delta
    material.uniforms.uCloudCover.value = cloudCover
  })

  return (
    <mesh>
      <sphereGeometry args={[200, 48, 32]} />
      <dayNightSkyMaterial
        ref={materialRef}
        side={BackSide}
        depthWrite={false}
      />
    </mesh>
  )
}
