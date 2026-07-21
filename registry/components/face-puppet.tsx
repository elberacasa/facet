// face-puppet — webcam face-tracked stylized spirit head. Uses the
// @mediapipe/tasks-vision FaceLandmarker (dynamically imported at runtime) to
// drive head pose, eyelids, jaw and brows; falls back smoothly to mouse-follow
// when the camera is unavailable, then to a gentle autopilot when no face is
// in frame. Must be rendered inside a react-three-fiber <Canvas>.
//
//   <Canvas camera={{ position: [0, 0, 3.4], fov: 40 }}>
//     <FacePuppet />
//   </Canvas>
//
// Install: npx facet3d add face-puppet
// Dependencies: three, @react-three/fiber, @react-three/drei
//               + npm i @mediapipe/tasks-vision
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { extend, useFrame } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'

export interface FacePuppetProps {
  color?: string // spirit body / rim accent color
  smoothing?: number // higher = smoother (slower) head response; 1 buttery, 2 dreamy
  trackingSensitivity?: number // multiplies tracked head rotation and jaw range
  followMouse?: boolean // follow the mouse when webcam tracking is unavailable
  showPreview?: boolean // corner picture-in-picture webcam preview plane
  pupilScale?: number // scales the glowing pupils
  floatIntensity?: number // amplitude of idle breathing / bob / sway
}

// Glossy "spirit" skin: wrap diffuse for a soft subsurface feel, fresnel rim
// in the accent color, a hot top-left specular and a gentle vertical shimmer.
// No scene lights required — everything is analytic.
// Both materials share this vertex stage (vLocalY is unused by the aura).
const SHARED_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying float vLocalY;

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = cameraPosition - wp.xyz;
    vLocalY = position.y;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const SpiritMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color('#a3e635'),
    uRimColor: new THREE.Color('#d9f99d'),
  },
  SHARED_VERTEX,
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform vec3 uRimColor;

    varying vec3 vNormalW;
    varying vec3 vViewW;
    varying float vLocalY;

    void main() {
      vec3 n = normalize(vNormalW);
      vec3 v = normalize(vViewW);
      vec3 lightDir = normalize(vec3(0.45, 0.85, 0.6));

      // Wrap diffuse: light bleeds around the terminator -> waxy subsurface.
      float wrap = clamp((dot(n, lightDir) + 0.55) / 1.55, 0.0, 1.0);
      wrap = wrap * wrap * (3.0 - 2.0 * wrap);

      // Vertical tint: deeper color low, brighter crown.
      float grad = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 base = uColor * mix(0.45, 1.05, grad);

      // Backlight bleed: silhouette glows faintly when lit from behind.
      float back = pow(clamp(dot(v, -lightDir) * 0.5 + 0.5, 0.0, 1.0), 2.0);

      vec3 col = base * (0.3 + wrap * 0.85) + uColor * back * 0.35;

      // Fresnel rim.
      float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
      col += uRimColor * fres * 1.15;

      // Glossy key highlight.
      vec3 h = normalize(lightDir + v);
      float spec = pow(clamp(dot(n, h), 0.0, 1.0), 64.0);
      col += vec3(1.0) * spec * 0.55;

      // Slow shimmer traveling up the body.
      col += uRimColor * 0.04 * (0.5 + 0.5 * sin(uTime * 1.7 + vLocalY * 5.0));

      gl_FragColor = vec4(col, 1.0);
    }
  `
)

// Backside additive halo slightly larger than the skull — sells the spirit.
const AuraMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color('#a3e635'),
    uIntensity: 0.55,
  },
  SHARED_VERTEX,
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uIntensity;

    varying vec3 vNormalW;
    varying vec3 vViewW;

    void main() {
      vec3 n = normalize(vNormalW);
      vec3 v = normalize(vViewW);
      // abs(): safe for BackSide where the geometric normal faces away.
      float fres = pow(1.0 - abs(dot(n, v)), 2.2);
      float pulse = 0.85 + 0.15 * sin(uTime * 1.3);
      gl_FragColor = vec4(uColor * fres * uIntensity * pulse, fres);
    }
  `
)

extend({ SpiritMaterial, AuraMaterial })

declare global {
  namespace JSX {
    interface IntrinsicElements {
      spiritMaterial: any
      auraMaterial: any
    }
  }
}

// Face tracking plumbing (browser-only, everything created inside an effect).

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

// Minimal structural types so the dynamically imported module stays untyped
// at build time — the package is an optional peer of this component.
interface BlendshapeCategory {
  categoryName: string
  score: number
}
interface FaceLandmarkerResult {
  faceBlendshapes?: { categories: BlendshapeCategory[] }[]
  facialTransformationMatrixes?: { data: ArrayLike<number> }[]
}
interface FaceLandmarkerLike {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => FaceLandmarkerResult
  close: () => void
}

// Raw (unsmoothed) tracking targets written by the detection loop, read by
// useFrame. All values are unitless and roughly in [-1, 1] / [0, 1].
interface TrackState {
  yaw: number
  pitch: number
  roll: number
  blinkL: number
  blinkR: number
  jaw: number
  brow: number
  lastFace: number // performance.now() / 1000 of the last detection, -1 = never
}

// Damps an angle toward a target taking the shortest way around the circle.
function dampAngle(current: number, target: number, lambda: number, delta: number) {
  let diff = (target - current) % (Math.PI * 2)
  if (diff > Math.PI) diff -= Math.PI * 2
  if (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * (1 - Math.exp(-lambda * delta))
}

const clamp = THREE.MathUtils.clamp
const damp = THREE.MathUtils.damp
const lerp = THREE.MathUtils.lerp

// Per-channel damping rates: blinks snap, jaw follows speech, head is buttery.
const LAMBDA_BLINK = 26
const LAMBDA_JAW = 14
const LAMBDA_BROW = 10
const LAMBDA_PUPIL = 18
const LAMBDA_MODE_BLEND = 2.5

const LID_OPEN = -0.62 // lid cap tucked up behind the eye
const LID_CLOSED = 1.35 // lid cap swung down over the eye

const EYE_X = 0.37,
  EYE_Y = 0.14,
  EYE_Z = 0.84

export function FacePuppet({
  color = '#a3e635',
  smoothing = 1,
  trackingSensitivity = 1,
  followMouse = true,
  showPreview = false,
  pupilScale = 1,
  floatIntensity = 1,
}: FacePuppetProps) {
  const rootRef = useRef<THREE.Group>(null)
  const headRef = useRef<THREE.Group>(null)
  const lidLRef = useRef<THREE.Mesh>(null)
  const lidRRef = useRef<THREE.Mesh>(null)
  const browLRef = useRef<THREE.Group>(null)
  const browRRef = useRef<THREE.Group>(null)
  const mouthRef = useRef<THREE.Mesh>(null)
  const pupilLRef = useRef<THREE.Group>(null)
  const pupilRRef = useRef<THREE.Group>(null)
  const previewRef = useRef<THREE.Group>(null)
  const matsRef = useRef<any[]>([])

  const [trackingFailed, setTrackingFailed] = useState(false)
  const [videoTex, setVideoTex] = useState<THREE.VideoTexture | null>(null)

  const trackRef = useRef<TrackState>({
    yaw: 0,
    pitch: 0,
    roll: 0,
    blinkL: 0,
    blinkR: 0,
    jaw: 0,
    brow: 0,
    lastFace: -1,
  })

  // Smoothed, blended values actually applied to the rig.
  const rig = useRef({ blinkL: 0, blinkR: 0, jaw: 0, brow: 0, pupilX: 0, pupilY: 0 })
  const modeWeight = useRef(0) // 0 = autopilot, 1 = live source (face or mouse)
  const autoBlink = useRef({ next: 1.5, phase: 0 })
  const saccade = useRef({ next: 0.8, x: 0, y: 0 })
  const scratch = useRef({ v: new THREE.Vector3() })

  // Collects shader material instances so useFrame can tick their uTime.
  const matRef = (i: number) => (m: any) => {
    if (m) matsRef.current[i] = m
  }

  // Webcam + FaceLandmarker lifecycle. Any failure (no camera, denied
  // permission, WASM/model fetch error, unsupported API) flips the component
  // into mouse-follow / autopilot mode instead of throwing.
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setTrackingFailed(true)
      return
    }

    let cancelled = false
    let raf = 0
    let stream: MediaStream | null = null
    let landmarker: FaceLandmarkerLike | null = null
    let tex: THREE.VideoTexture | null = null

    // Stop the camera no matter which await the teardown races with.
    const stopStream = () => {
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
    }
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true

    // Scratch objects for pose extraction (allocated once, reused per frame).
    const m = new THREE.Matrix4()
    const basis = new THREE.Matrix4()
    const xAxis = new THREE.Vector3()
    const yAxis = new THREE.Vector3()
    const zAxis = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const eul = new THREE.Euler(0, 0, 0, 'YXZ')

    const start = async () => {
      try {
        const vision = await import('@mediapipe/tasks-vision')
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL)
        const created = (await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        })) as unknown as FaceLandmarkerLike
        if (cancelled) {
          created.close()
          return
        }
        landmarker = created

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        })
        // Unmounted while the permission prompt was open: cleanup already ran
        // with stream still null, so we must release the camera ourselves.
        if (cancelled) {
          stopStream()
          return
        }
        video.srcObject = stream
        await video.play()
        if (cancelled) {
          stopStream()
          return
        }

        tex = new THREE.VideoTexture(video)
        tex.colorSpace = THREE.SRGBColorSpace
        setVideoTex(tex)

        const tr = trackRef.current
        const loop = () => {
          if (cancelled) return
          try {
            if (landmarker && video.readyState >= 2) {
              const res = landmarker.detectForVideo(video, performance.now())
              const mat = res.facialTransformationMatrixes?.[0]?.data
              const cats = res.faceBlendshapes?.[0]?.categories
              if (mat && mat.length >= 16 && cats) {
                // Orthonormal rotation from the 4x4 (column-major, the layout
                // Matrix4.fromArray expects). Axis signs are tuned for a
                // mirrored selfie view — flip here if it ever feels inverted.
                m.fromArray(Array.from(mat))
                const e = m.elements
                xAxis.set(e[0], e[1], e[2])
                yAxis.set(e[4], e[5], e[6])
                zAxis.set(e[8], e[9], e[10])
                if (xAxis.lengthSq() > 1e-8 && zAxis.lengthSq() > 1e-8) {
                  xAxis.normalize()
                  yAxis.normalize()
                  zAxis.normalize()
                  basis.makeBasis(xAxis, yAxis, zAxis)
                  q.setFromRotationMatrix(basis)
                  eul.setFromQuaternion(q, 'YXZ')
                  tr.yaw = clamp(-eul.y, -0.8, 0.8)
                  tr.pitch = clamp(-eul.x, -0.6, 0.6)
                  tr.roll = clamp(-eul.z, -0.6, 0.6)
                }
                const get = (n: string) => cats.find((c) => c.categoryName === n)?.score ?? 0
                // Raw blink scores rest around ~0.3-0.5 for open eyes and only
                // peak near 1 on a real blink — remap so open eyes read open.
                const remapBlink = (s: number) => clamp((s - 0.4) / 0.45, 0, 1)
                tr.blinkL = remapBlink(get('eyeBlinkLeft'))
                tr.blinkR = remapBlink(get('eyeBlinkRight'))
                tr.jaw = clamp(get('jawOpen'), 0, 1)
                tr.brow = clamp(get('browInnerUp'), 0, 1)
                tr.lastFace = performance.now() / 1000
              }
            }
          } catch {
            // A single bad frame (tab hidden, video seeking) is not fatal.
          }
          raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
      } catch {
        // Partial startup (e.g. play() rejected after the camera was granted)
        // must not leave the webcam light on.
        stopStream()
        if (!cancelled) setTrackingFailed(true)
      }
    }
    start()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stopStream()
      video.pause()
      video.srcObject = null
      landmarker?.close()
      landmarker = null
      tex?.dispose()
      setVideoTex(null)
    }
  }, [])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const t = state.clock.elapsedTime
    const nowS = performance.now() / 1000
    const tr = trackRef.current
    const r = rig.current
    const sens = trackingSensitivity
    const poseLambda = 9 / Math.max(smoothing, 0.05)

    for (const mat of matsRef.current) if (mat) mat.uTime = t

    // --- Autopilot: gentle procedural pose, always computed ----------------
    const auto = {
      yaw: Math.sin(t * 0.31) * 0.34 + Math.sin(t * 0.17 + 1.3) * 0.1,
      pitch: Math.sin(t * 0.23 + 0.7) * 0.11 - 0.02,
      roll: Math.sin(t * 0.19 + 2.1) * 0.07,
    }

    // Autopilot blink: a short closed pulse every ~2–5s.
    if (t >= autoBlink.current.next) {
      autoBlink.current.phase = 0.16
      autoBlink.current.next = t + 1.8 + Math.random() * 3.2
    }
    autoBlink.current.phase = Math.max(0, autoBlink.current.phase - dt)
    const autoBlinkV = autoBlink.current.phase > 0 ? 1 : 0

    // Saccades: pupils dart to a new random micro-target every ~0.7–2.5s.
    if (t >= saccade.current.next) {
      saccade.current.x = (Math.random() - 0.5) * 0.09
      saccade.current.y = (Math.random() - 0.5) * 0.055
      saccade.current.next = t + 0.7 + Math.random() * 1.8
    }

    // --- Pick the live source ---------------------------------------------
    const faceFresh = tr.lastFace > 0 && nowS - tr.lastFace < 1.2
    const useFace = !trackingFailed && faceFresh
    const useMouse = trackingFailed && followMouse
    const targetWeight = useFace || useMouse ? 1 : 0
    modeWeight.current = damp(modeWeight.current, targetWeight, LAMBDA_MODE_BLEND, dt)
    const w = modeWeight.current

    let srcYaw = 0,
      srcPitch = 0,
      srcRoll = 0,
      srcJaw = 0,
      srcBrow = 0,
      srcBlinkL = autoBlinkV,
      srcBlinkR = autoBlinkV
    if (useFace) {      srcYaw = tr.yaw * sens
      srcPitch = tr.pitch * sens
      srcRoll = tr.roll * sens
      srcJaw = tr.jaw * clamp(sens, 0, 1.5)
      srcBrow = tr.brow
      srcBlinkL = tr.blinkL
      srcBlinkR = tr.blinkR
    } else if (useMouse) {
      srcYaw = state.pointer.x * 0.7 * sens
      srcPitch = -state.pointer.y * 0.45 * sens
      srcRoll = -state.pointer.x * 0.14
    }

    // Blend autopilot <-> live source so mode changes never snap.
    const targetYaw = lerp(auto.yaw, srcYaw, w)
    const targetPitch = lerp(auto.pitch, srcPitch, w)
    const targetRoll = lerp(auto.roll, srcRoll, w)
    const targetJaw = lerp(0, srcJaw, w)
    const targetBrow = lerp(0, srcBrow, w)
    const targetBlinkL = lerp(autoBlinkV, srcBlinkL, w)
    const targetBlinkR = lerp(autoBlinkV, srcBlinkR, w)

    // --- Apply to the rig with per-channel damping -------------------------
    const head = headRef.current
    if (head) {
      head.rotation.y = dampAngle(head.rotation.y, targetYaw, poseLambda, dt)
      head.rotation.x = dampAngle(head.rotation.x, targetPitch, poseLambda, dt)
      head.rotation.z = dampAngle(head.rotation.z, targetRoll, poseLambda, dt)
    }

    r.blinkL = damp(r.blinkL, targetBlinkL, LAMBDA_BLINK, dt)
    r.blinkR = damp(r.blinkR, targetBlinkR, LAMBDA_BLINK, dt)
    if (lidLRef.current) lidLRef.current.rotation.x = lerp(LID_OPEN, LID_CLOSED, r.blinkL)
    if (lidRRef.current) lidRRef.current.rotation.x = lerp(LID_OPEN, LID_CLOSED, r.blinkR)

    r.jaw = damp(r.jaw, targetJaw, LAMBDA_JAW, dt)
    const mouth = mouthRef.current
    if (mouth) {
      mouth.scale.set(1 + r.jaw * 0.25, 0.22 + r.jaw * 1.5, 0.55)
      mouth.position.y = -0.4 - r.jaw * 0.08
    }

    r.brow = damp(r.brow, targetBrow, LAMBDA_BROW, dt)
    if (browLRef.current) {
      browLRef.current.position.y = 0.52 + r.brow * 0.09
      browLRef.current.rotation.z = -0.18 - r.brow * 0.12
    }
    if (browRRef.current) {
      browRRef.current.position.y = 0.52 + r.brow * 0.09
      browRRef.current.rotation.z = 0.18 + r.brow * 0.12
    }

    // Pupils: saccade offset plus a push toward the look direction.
    r.pupilX = damp(r.pupilX, saccade.current.x + targetYaw * 0.11, LAMBDA_PUPIL, dt)
    r.pupilY = damp(r.pupilY, saccade.current.y - targetPitch * 0.09, LAMBDA_PUPIL, dt)
    if (pupilLRef.current) pupilLRef.current.position.set(r.pupilX, r.pupilY, 0.175)
    if (pupilRRef.current) pupilRRef.current.position.set(r.pupilX, r.pupilY, 0.175)

    // --- Idle life: breathing, bob, sway -----------------------------------
    const root = rootRef.current
    if (root) {
      const fi = floatIntensity
      root.position.y = Math.sin(t * 0.85) * 0.06 * fi
      root.rotation.z = Math.sin(t * 0.6 + 1.2) * 0.025 * fi
      const breathe = 1 + Math.sin(t * 1.5) * 0.012 * fi
      root.scale.set(1 / Math.sqrt(breathe), breathe, 1 / Math.sqrt(breathe))
    }

    // --- Picture-in-picture preview pinned to the camera corner ------------
    const preview = previewRef.current
    if (preview) {
      const cam = state.camera
      scratch.current.v.set(0.98, -0.56, -2.2).applyQuaternion(cam.quaternion).add(cam.position)
      preview.position.copy(scratch.current.v)
      preview.quaternion.copy(cam.quaternion)
    }
  })

  // Memoized so state changes (tracking fallback, preview texture) don't
  // allocate fresh colors and re-push uniforms every render.
  const { accent, rim, dark } = useMemo(() => {
    const accent = new THREE.Color(color)
    return {
      accent,
      rim: accent.clone().lerp(new THREE.Color('#ffffff'), 0.45),
      dark: accent.clone().multiplyScalar(0.55),
    }
  }, [color])

  return (
    <group ref={rootRef}>
      {/* Additive halo behind the head. */}
      <mesh scale={[1.32, 1.38, 1.3]}>
        <sphereGeometry args={[1, 32, 32]} />
        <auraMaterial
          ref={matRef(0)}
          uColor={accent}
          transparent
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <group ref={headRef}>
        {/* Skull. */}
        <mesh scale={[1, 1.06, 0.96]}>
          <sphereGeometry args={[1, 48, 48]} />
          <spiritMaterial ref={matRef(1)} uColor={accent} uRimColor={rim} />
        </mesh>

        {/* Eyes: dark glossy sockets + glowing pupils + shader lids. */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * EYE_X, EYE_Y, EYE_Z]}>
            <mesh>
              <sphereGeometry args={[0.17, 24, 24]} />
              <meshBasicMaterial color="#0d0d12" />
            </mesh>
            <group ref={side < 0 ? pupilLRef : pupilRRef} position={[0, 0, 0.175]}>
              <mesh scale={pupilScale}>
                <circleGeometry args={[0.075, 24]} />
                <meshBasicMaterial color={color} toneMapped={false} />
              </mesh>
              <mesh position={[-0.028, 0.03, 0.004]} scale={pupilScale}>
                <circleGeometry args={[0.02, 12]} />
                <meshBasicMaterial color="#ffffff" toneMapped={false} />
              </mesh>
            </group>
            {/* Eyelid: upper-hemisphere cap pivoting over the socket. */}
            <mesh ref={side < 0 ? lidLRef : lidRRef} rotation={[LID_OPEN, 0, 0]}>
              <sphereGeometry args={[0.19, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <spiritMaterial ref={matRef(side < 0 ? 2 : 3)} uColor={accent} uRimColor={rim} />
            </mesh>
          </group>
        ))}

        {/* Brows. */}
        {[-1, 1].map((side) => (
          <group
            key={`brow${side}`}
            ref={side < 0 ? browLRef : browRRef}
            position={[side * EYE_X, 0.52, 0.82]}
            rotation={[0, 0, side * 0.18]}
          >
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <capsuleGeometry args={[0.042, 0.17, 4, 12]} />
              <spiritMaterial ref={matRef(side < 0 ? 4 : 5)} uColor={dark} uRimColor={rim} />
            </mesh>
          </group>
        ))}

        {/* Button nose. */}
        <mesh position={[0, -0.08, 0.96]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>

        {/* Mouth: dark oval that opens with jawOpen. */}
        <mesh ref={mouthRef} position={[0, -0.4, 0.86]} scale={[1, 0.22, 0.55]}>
          <sphereGeometry args={[0.16, 24, 16]} />
          <meshBasicMaterial color="#1c0a10" />
        </mesh>
      </group>

      {/* Corner webcam preview (camera-following). */}
      {showPreview && videoTex && (
        <group ref={previewRef}>
          <mesh position={[0, 0, -0.005]}>
            <planeGeometry args={[0.68, 0.54]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          <mesh scale={[-1, 1, 1]}>
            <planeGeometry args={[0.62, 0.48]} />
            <meshBasicMaterial map={videoTex} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  )
}
