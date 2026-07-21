// drift-car — arcade third-person drift car with real game feel on
// @react-three/rapier: hand-rolled raycast suspension (4 wheel rays,
// spring/damper), split lateral/longitudinal tire friction, a Space handbrake
// that collapses rear lateral grip into controllable drifts, snappy
// counter-steer, a laggy chase camera with velocity look-ahead, FOV kick and
// roll-into-drift, fade-out skid-mark ribbons, pooled GPU drift smoke, and a
// self-contained playground (dark plane, ramps, scatterable cones).
//
// Renders its own rapier Physics world — do NOT nest inside another
// <Physics>. The car owns the camera — do not add OrbitControls.
//
//   <Canvas camera={{ fov: 58, position: [0, 3.2, -7.5] }}>
//     <DriftCar />
//   </Canvas>
//
// Controls: WASD / arrow keys to drive, hold Space for the handbrake.
// Install:  npx facet3d add drift-car
// Requires: three, @react-three/fiber, @react-three/drei, @react-three/rapier
'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { extend, useFrame, useThree } from '@react-three/fiber'
import { Grid, RoundedBox, shaderMaterial } from '@react-three/drei'
import { Physics, RigidBody, CuboidCollider, useRapier, type RapierRigidBody } from '@react-three/rapier'

export interface DriftCarProps {
  carColor?: string
  acceleration?: number
  topSpeed?: number
  driftFactor?: number // 0 = grippy, 1 = very slidey
  cameraLag?: number // higher = snappier camera
  fovKick?: boolean
  smoke?: boolean
  skidmarks?: boolean
}

// --- tuning (forces are per-unit-mass, applied as impulses) -----------------
const GRAVITY = -20 // snappier than real gravity, keeps landings arcade-tight
const WHEEL_X = 0.62,
  WHEEL_Z = 0.92,
  WHEEL_RADIUS = 0.3,
  SUSP_REST = 0.34,
  RAY_ORIGIN_Y = 0.06,
  RAY_LEN = RAY_ORIGIN_Y + SUSP_REST + WHEEL_RADIUS
const SPRING_K = 55, // suspension spring / damper
  SPRING_D = 5.5,
  FRONT_GRIP = 9, // lateral accel per m/s of slip
  MAX_TIRE = 12, // friction-circle clamp
  BRAKE_DECEL = 26,
  MAX_STEER = 0.62,
  STEER_SMOOTHING = 12,
  YAW_GAIN = 1.9
const CAM_DIST = 6.4,
  CAM_HEIGHT = 2.5,
  BASE_FOV = 58,
  FOV_KICK_MAX = 13
const SKID_SEGS = 160, // ring-buffered quads per rear-wheel ribbon
  SKID_LIFE = 6,
  SKID_HALF_W = 0.09,
  SKID_SLIP_MIN = 1.6
const SMOKE_MAX = 384 // pooled GPU point cloud, animated entirely in-shader
const DRIVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

// Deterministic RNG so the playground layout is stable across reloads.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Drift smoke: spawn data lives in attributes; the shader ages, rises,
// expands and fades each puff. Dead particles collapse to zero size.
const DriftSmokeMaterial = shaderMaterial(
  { uTime: 0, uPixelRatio: 1, uColor: new THREE.Color('#d4d4d1') },
  /* glsl */ `
    uniform float uTime;
    uniform float uPixelRatio;
    attribute vec3 aVelocity;
    attribute float aBirth;
    attribute float aSeed;
    varying float vT;
    varying float vSeed;
    void main() {
      float age = uTime - aBirth;
      float life = mix(0.5, 1.1, aSeed);
      float t = clamp(age / life, 0.0, 1.0);
      float alive = step(0.0, age) * (1.0 - step(life, age));
      vec3 pos = position + aVelocity * age;
      pos.y += 0.8 * age + 0.4 * age * age; // buoyant rise
      pos.x += sin(aSeed * 37.0 + age * 2.5) * 0.15 * age;
      pos.z += cos(aSeed * 41.0 + age * 2.0) * 0.15 * age;
      vT = t;
      vSeed = aSeed;
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      float sizeCurve = 0.35 + t * 2.2; // puffs expand as they dissipate
      gl_PointSize = sizeCurve * alive * uPixelRatio * 220.0 / max(-mvPosition.z, 0.1);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  /* glsl */ `
    uniform vec3 uColor;
    varying float vT;
    varying float vSeed;
    void main() {
      // smoothstep edges stay ascending — reversed edges are undefined in
      // GLSL and return NaN on Metal, wiping out every particle.
      float d = length(gl_PointCoord - 0.5);
      float disc = 1.0 - smoothstep(0.15, 0.5, d);
      float alpha = disc * 0.3 * smoothstep(0.0, 0.15, vT) * (1.0 - smoothstep(0.45, 1.0, vT));
      if (alpha < 0.004) discard;
      gl_FragColor = vec4(mix(uColor * 0.7, uColor, vSeed), alpha);
    }
  `
)
extend({ DriftSmokeMaterial })

declare global {
  namespace JSX {
    interface IntrinsicElements {
      driftSmokeMaterial: any
    }
  }
}

function CarRig({ carColor, acceleration, topSpeed, driftFactor, cameraLag, fovKick, smoke, skidmarks }: Required<DriftCarProps>) {
  const body = useRef<RapierRigidBody>(null)
  const tilt = useRef<THREE.Group>(null)
  const tailMat = useRef<THREE.MeshStandardMaterial>(null)
  const { camera, gl } = useThree()
  const { world, rapier } = useRapier()
  const keys = useRef(new Set<string>())
  const handbrake = useRef(false)
  const steerAngle = useRef(0),
    yawRate = useRef(0),
    accelSm = useRef(0),
    camRoll = useRef(0)
  const firstFrame = useRef(true)
  const time = useRef(0)

  const wheels = useMemo(
    () => [
      { ox: WHEEL_X, oz: WHEEL_Z, front: true },
      { ox: -WHEEL_X, oz: WHEEL_Z, front: true },
      { ox: WHEEL_X, oz: -WHEEL_Z, front: false },
      { ox: -WHEEL_X, oz: -WHEEL_Z, front: false },
    ],
    []
  )
  // Per-wheel visual state (suspension height + spin) and mesh refs.
  const wheelState = useRef(wheels.map(() => ({ y: -SUSP_REST, spin: 0 })))
  const wheelGroups = useRef<(THREE.Group | null)[]>([])
  const steerGroups = useRef<(THREE.Group | null)[]>([])
  const spinGroups = useRef<(THREE.Group | null)[]>([])
  const scratch = useRef({
    q: new THREE.Quaternion(), fwd: new THREE.Vector3(), right: new THREE.Vector3(),
    vf: new THREE.Vector3(), vr: new THREE.Vector3(), origin: new THREE.Vector3(),
    contact: new THREE.Vector3(), impulse: new THREE.Vector3(), camTarget: new THREE.Vector3(),
    look: new THREE.Vector3(), ray: null as InstanceType<typeof rapier.Ray> | null,
  })

  // Smoke pool: ring buffer of preallocated attributes, recycled in place.
  const smokePool = useMemo(
    () => ({
      pos: new Float32Array(SMOKE_MAX * 3), vel: new Float32Array(SMOKE_MAX * 3),
      birth: new Float32Array(SMOKE_MAX).fill(-100), seed: Float32Array.from({ length: SMOKE_MAX }, () => Math.random()),
      cursor: 0, dirty: false,
    }),
    []
  )
  const smokeGeom = useRef<THREE.BufferGeometry>(null)
  const smokeMat = useRef<any>(null)
  const spawnSmoke = (x: number, y: number, z: number, vx: number, vy: number, vz: number) => {
    const p = smokePool, i = p.cursor
    p.cursor = (p.cursor + 1) % SMOKE_MAX
    p.pos.set([x, y, z], i * 3)
    p.vel.set([vx + (Math.random() - 0.5) * 0.8, vy + Math.random() * 0.5, vz + (Math.random() - 0.5) * 0.8], i * 3)
    p.birth[i] = time.current
    p.dirty = true
  }

  // Skid ribbons: one per rear wheel. Each is a fixed pool of quads; every
  // quad fades out over SKID_LIFE seconds and is then recycled.
  const skids = useMemo(
    () =>
      [0, 1].map(() => ({
        positions: new Float32Array(SKID_SEGS * 6 * 3), colors: new Float32Array(SKID_SEGS * 6 * 4),
        base: new Float32Array(SKID_SEGS), age: new Float32Array(SKID_SEGS),
        head: 0, hasPrev: false, prev: new THREE.Vector3(),
      })),
    []
  )
  const skidGeoms = useRef<(THREE.BufferGeometry | null)[]>([])
  const addSkidQuad = (sk: (typeof skids)[number], si: number, p: THREE.Vector3, right: THREE.Vector3, k: number) => {
    // Skip micro-segments; long gaps (respawns) start a fresh strip.
    const d2 = sk.prev.distanceToSquared(p)
    if (!sk.hasPrev || d2 < 0.002 || d2 > 4) {
      sk.prev.copy(p)
      sk.hasPrev = true
      return
    }
    const i = sk.head, w = SKID_HALF_W
    sk.head = (sk.head + 1) % SKID_SEGS
    sk.base[i] = k
    sk.age[i] = 0
    // Two triangles (a,b,c)(b,d,c), ribbon width along the chassis right.
    // prettier-ignore
    sk.positions.set([
      sk.prev.x - right.x * w, sk.prev.y, sk.prev.z - right.z * w, sk.prev.x + right.x * w, sk.prev.y, sk.prev.z + right.z * w,
      p.x - right.x * w, p.y, p.z - right.z * w, sk.prev.x + right.x * w, sk.prev.y, sk.prev.z + right.z * w,
      p.x + right.x * w, p.y, p.z + right.z * w, p.x - right.x * w, p.y, p.z - right.z * w,
    ], i * 18)
    // Marks read as worn rubber streaks: slightly lighter than the near-black
    // ground (pure dark-on-dark is invisible on this playground).
    for (let v = 0; v < 6; v++) sk.colors.set([0.3, 0.3, 0.31, k], (i * 6 + v) * 4)
    sk.prev.copy(p)
    const g = skidGeoms.current[si]
    if (g) {
      ;(g.attributes.position as THREE.BufferAttribute).needsUpdate = true
      ;(g.attributes.color as THREE.BufferAttribute).needsUpdate = true
    }
  }

  // Keyboard input (window listeners, client-only).
  useEffect(() => {
    const pressed = keys.current
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') handbrake.current = true
      else if (DRIVE_KEYS.has(e.code)) pressed.add(e.code)
      else return
      e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') handbrake.current = false
      pressed.delete(e.code)
    }
    const onBlur = () => {
      pressed.clear()
      handbrake.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useFrame((_, delta) => {
    const rb = body.current
    if (!rb) return
    const dt = Math.min(delta, 1 / 30)
    time.current += dt
    const s = scratch.current
    if (!s.ray) s.ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
    const pos = rb.translation(), vel = rb.linvel()
    const m = Math.max(rb.mass(), 0.001)
    const drift = THREE.MathUtils.clamp(driftFactor, 0, 1)
    // Respawn if the car falls off the playground.
    if (pos.y < -8) {
      rb.setTranslation({ x: 0, y: 1.2, z: 0 }, true)
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
      rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
      return
    }

    // Chassis frame on the ground plane (pitch/roll are physics-locked).
    const q = rb.rotation()
    s.q.set(q.x, q.y, q.z, q.w)
    s.fwd.set(0, 0, 1).applyQuaternion(s.q)
    s.fwd.y = 0
    if (s.fwd.lengthSq() < 1e-6) s.fwd.set(0, 0, 1)
    s.fwd.normalize()
    s.right.set(s.fwd.z, 0, -s.fwd.x) // up x fwd
    const vLon = vel.x * s.fwd.x + vel.z * s.fwd.z,
      vLat = vel.x * s.right.x + vel.z * s.right.z,
      speed = Math.hypot(vel.x, vel.z),
      omega = rb.angvel().y

    // --- input ---
    const pressed = keys.current
    const steerInput =
      (pressed.has('KeyD') || pressed.has('ArrowRight') ? 1 : 0) - (pressed.has('KeyA') || pressed.has('ArrowLeft') ? 1 : 0)
    const throttle =
      (pressed.has('KeyW') || pressed.has('ArrowUp') ? 1 : 0) - (pressed.has('KeyS') || pressed.has('ArrowDown') ? 1 : 0)
    const hb = handbrake.current, braking = throttle < 0 && vLon > 0.5
    // Steering: less lock at speed, snappy both ways (fast counter-steer).
    const maxSteer = MAX_STEER / (1 + speed * 0.055)
    steerAngle.current = THREE.MathUtils.damp(steerAngle.current, steerInput * maxSteer, STEER_SMOOTHING, dt)
    // Longitudinal engine/brake force (m/s^2, multiplied by mass later).
    let engine = 0
    if (throttle > 0) engine = vLon < topSpeed ? acceleration : 0
    else if (throttle < 0) engine = vLon > 0.5 ? -BRAKE_DECEL : vLon > -topSpeed * 0.35 ? -acceleration * 0.6 : 0
    engine += -vLon * (throttle === 0 ? 0.9 : 0.12) // engine braking + drag
    // Rear grip is the drift knob; the handbrake collapses it.
    const rearGrip = THREE.MathUtils.lerp(9, 5.2, drift) * (hb ? THREE.MathUtils.lerp(0.32, 0.06, drift) : 1)

    // --- per-wheel raycast suspension + tire forces ---
    s.impulse.set(0, 0, 0)
    let groundedCount = 0
    const steer = steerAngle.current
    for (let i = 0; i < 4; i++) {
      const w = wheels[i]
      s.origin.set(pos.x + s.right.x * w.ox + s.fwd.x * w.oz, pos.y + RAY_ORIGIN_Y, pos.z + s.right.z * w.ox + s.fwd.z * w.oz)
      s.ray.origin = s.origin
      const hit = world.castRay(s.ray, RAY_LEN, true, undefined, undefined, undefined, rb)
      const ws = wheelState.current[i]
      if (!hit) {
        ws.y = THREE.MathUtils.damp(ws.y, -(SUSP_REST + 0.08), 10, dt) // droop in air
        continue
      }
      groundedCount++
      const toi = hit.timeOfImpact
      // Suspension spring/damper along world up.
      const spring = Math.max(0, (RAY_LEN - toi) * SPRING_K - vel.y * SPRING_D)
      s.impulse.y += Math.min(spring, 30)
      // Wheel axes (front wheels rotated by the steer angle).
      const a = w.front ? steer : 0, ca = Math.cos(a), sa = Math.sin(a)
      s.vf.set(s.fwd.x * ca + s.right.x * sa, 0, s.fwd.z * ca + s.right.z * sa)
      s.vr.set(s.right.x * ca - s.fwd.x * sa, 0, s.right.z * ca - s.fwd.z * sa)
      // Velocity at the contact patch includes yaw rotation (w x r).
      const pvx = vel.x + omega * w.oz,
        pvz = vel.z - omega * w.ox,
        wLon = pvx * s.vf.x + pvz * s.vf.z,
        wLat = pvx * s.vr.x + pvz * s.vr.z
      // Longitudinal: RWD engine, braking bias, handbrake locks the rears.
      let fLon = 0
      if (!w.front) fLon += engine * 0.5
      if (braking) fLon += THREE.MathUtils.clamp(-wLon * 8, -BRAKE_DECEL, BRAKE_DECEL) * (w.front ? 0.35 : 0.15)
      if (hb && !w.front) fLon += THREE.MathUtils.clamp(-wLon * 12, -BRAKE_DECEL, BRAKE_DECEL) * 0.5
      // Lateral grip: kills sideways slip, split front/rear, friction circle.
      let fLat = -wLat * (w.front ? FRONT_GRIP : rearGrip)
      const fLen = Math.hypot(fLon, fLat)
      if (fLen > MAX_TIRE) {
        fLon *= MAX_TIRE / fLen
        fLat *= MAX_TIRE / fLen
      }
      s.impulse.x += s.vf.x * fLon + s.vr.x * fLat
      s.impulse.z += s.vf.z * fLon + s.vr.z * fLat
      // Contact point for fx and wheel placement.
      s.contact.set(s.origin.x, s.origin.y - toi, s.origin.z)
      ws.y = THREE.MathUtils.damp(ws.y, RAY_ORIGIN_Y - toi + WHEEL_RADIUS, 22, dt)
      ws.spin += (wLon / WHEEL_RADIUS) * dt
      // Rear wheels: skid marks + smoke when sliding.
      if (!w.front) {
        const sliding = Math.abs(wLat) > SKID_SLIP_MIN && speed > 2
        if (skidmarks && sliding) {
          const k = THREE.MathUtils.clamp(Math.abs(wLat) / 7, 0.35, 1)
          // Lay quads above the drei Grid plane (y=0.02), which writes depth —
          // coplanar marks are rejected by the depth test and never show.
          addSkidQuad(skids[i - 2], i - 2, s.contact.setY(s.contact.y + 0.04), s.right, k)
        } else skids[i - 2].hasPrev = false
        if (smoke && sliding)
          spawnSmoke(s.contact.x, s.contact.y + 0.05, s.contact.z, -s.vf.x * wLon * 0.06 + s.vr.x * wLat * 0.15, 0.4, -s.vf.z * wLon * 0.06 + s.vr.z * wLat * 0.15)
      }
    }

    // Accumulated tire+suspension force as one impulse at the COM.
    rb.applyImpulse({ x: s.impulse.x * m * dt, y: s.impulse.y * m * dt, z: s.impulse.z * m * dt }, true)
    // Yaw: manual angular velocity gives the arcade-direct steering feel.
    // Handbrake gets extra yaw authority so the rear steps out on demand.
    const dir = vLon >= -0.5 ? 1 : -1,
      speedFac = THREE.MathUtils.clamp(Math.abs(vLon) / 5, 0, 1) * dir,
      yawTarget = groundedCount > 0 ? steer * speedFac * YAW_GAIN * (hb ? 2.0 : 1) : 0
    yawRate.current = THREE.MathUtils.damp(yawRate.current, yawTarget, 10, dt)
    rb.setAngvel({ x: 0, y: yawRate.current, z: 0 }, true)

    // --- visuals ---
    // Fake body roll/pitch (physics rotations are locked, so lean is visual).
    accelSm.current = THREE.MathUtils.damp(accelSm.current, engine, 6, dt)
    if (tilt.current) {
      const roll = THREE.MathUtils.clamp(yawRate.current * speed * 0.004, -0.12, 0.12),
        pitch = THREE.MathUtils.clamp(-accelSm.current * 0.004, -0.07, 0.09)
      tilt.current.rotation.z = THREE.MathUtils.damp(tilt.current.rotation.z, roll, 8, dt)
      tilt.current.rotation.x = THREE.MathUtils.damp(tilt.current.rotation.x, pitch, 8, dt)
    }
    for (let i = 0; i < 4; i++) {
      const g = wheelGroups.current[i]
      if (g) g.position.y = wheelState.current[i].y
      const sg = spinGroups.current[i]
      if (sg) sg.rotation.x = wheelState.current[i].spin
      const st = steerGroups.current[i]
      if (st && wheels[i].front) st.rotation.y = steer
    }
    // Taillights flare under braking / handbrake.
    if (tailMat.current) {
      tailMat.current.emissiveIntensity = THREE.MathUtils.damp(tailMat.current.emissiveIntensity, braking || hb ? 5 : 1.8, 12, dt)
    }
    // Flush smoke pool uploads once per frame.
    if (smokePool.dirty && smokeGeom.current) {
      const g = smokeGeom.current
      ;(g.attributes.position as THREE.BufferAttribute).needsUpdate = true
      ;(g.attributes.aVelocity as THREE.BufferAttribute).needsUpdate = true
      ;(g.attributes.aBirth as THREE.BufferAttribute).needsUpdate = true
      smokePool.dirty = false
    }
    if (smokeMat.current) {
      smokeMat.current.uTime = time.current
      smokeMat.current.uPixelRatio = gl.getPixelRatio()
    }
    // Fade skid quads; dead ones are recycled by the ring buffer.
    for (let si = 0; si < 2; si++) {
      const sk = skids[si], g = skidGeoms.current[si]
      let dirty = false
      for (let i = 0; i < SKID_SEGS; i++) {
        if (sk.base[i] <= 0) continue
        sk.age[i] += dt
        let alpha = sk.base[i] * (1 - sk.age[i] / SKID_LIFE)
        if (alpha <= 0.004) { alpha = 0; sk.base[i] = 0 }
        for (let v = 0; v < 6; v++) sk.colors[(i * 6 + v) * 4 + 3] = alpha
        dirty = true
      }
      if (dirty && g) (g.attributes.color as THREE.BufferAttribute).needsUpdate = true
    }

    // --- chase camera: lagged position, velocity look-ahead, drift roll ---
    s.camTarget.set(
      pos.x - s.fwd.x * (CAM_DIST + speed * 0.05),
      pos.y + CAM_HEIGHT + speed * 0.012,
      pos.z - s.fwd.z * (CAM_DIST + speed * 0.05)
    )
    if (firstFrame.current) {
      camera.position.copy(s.camTarget)
      firstFrame.current = false
    } else {
      camera.position.set(
        THREE.MathUtils.damp(camera.position.x, s.camTarget.x, cameraLag, dt),
        THREE.MathUtils.damp(camera.position.y, s.camTarget.y, cameraLag, dt),
        THREE.MathUtils.damp(camera.position.z, s.camTarget.z, cameraLag, dt)
      )
    }
    const lookK = Math.min(speed * 0.28, 4) / 4
    s.look.set(pos.x + vel.x * 0.28 * lookK, pos.y + 0.9, pos.z + vel.z * 0.28 * lookK)
    camera.lookAt(s.look)
    // Roll into drifts, proportional to the slip angle.
    const slipAngle = Math.atan2(vLat, Math.max(Math.abs(vLon), 3))
    camRoll.current = THREE.MathUtils.damp(camRoll.current, THREE.MathUtils.clamp(slipAngle * 0.3, -0.12, 0.12), 6, dt)
    camera.rotateZ(camRoll.current)
    // FOV kick with speed.
    if (fovKick && 'fov' in camera) {
      const pc = camera as THREE.PerspectiveCamera
      pc.fov = THREE.MathUtils.damp(pc.fov, BASE_FOV + THREE.MathUtils.clamp(speed / Math.max(topSpeed, 0.001), 0, 1) * FOV_KICK_MAX, 5, dt)
      pc.updateProjectionMatrix()
    }
  })

  const darkMat = <meshStandardMaterial color="#171717" roughness={0.4} metalness={0.4} />
  return (
    <>
      <RigidBody ref={body} colliders={false} position={[0, 1.0, 0]} enabledRotations={[false, true, false]} ccd friction={0.1} linearDamping={0.02}>
        <CuboidCollider args={[0.55, 0.16, 1.05]} position={[0, -0.02, 0]} />
        <group ref={tilt}>
          {/* Rounded body shell + dark glass cabin. */}
          <RoundedBox args={[1.15, 0.32, 2.2]} radius={0.09} smoothness={4} position={[0, 0.02, 0]} castShadow>
            <meshStandardMaterial color={carColor} roughness={0.35} metalness={0.25} />
          </RoundedBox>
          <RoundedBox args={[0.95, 0.3, 1.0]} radius={0.12} smoothness={4} position={[0, 0.3, -0.12]} castShadow>
            <meshStandardMaterial color="#101010" roughness={0.15} metalness={0.6} />
          </RoundedBox>
          {/* Spoiler + struts, taillight bar (flares on brake), headlights. */}
          <mesh position={[0, 0.34, -1.0]} castShadow><boxGeometry args={[1.2, 0.04, 0.28]} />{darkMat}</mesh>
          {[0.35, -0.35].map((x) => (
            <mesh key={x} position={[x, 0.24, -1.0]}><boxGeometry args={[0.05, 0.18, 0.12]} />{darkMat}</mesh>
          ))}
          <mesh position={[0, 0.1, -1.11]}><boxGeometry args={[0.9, 0.07, 0.03]} />
            <meshStandardMaterial ref={tailMat} color="#1a0505" emissive="#ef4444" emissiveIntensity={1.8} /></mesh>
          {[0.38, -0.38].map((x) => (
            <mesh key={x} position={[x, 0.08, 1.11]}>
              <boxGeometry args={[0.22, 0.07, 0.03]} /><meshStandardMaterial color="#111111" emissive="#fefce8" emissiveIntensity={1.4} />
            </mesh>
          ))}
          {/* Underglow strip + accent light. */}
          <mesh position={[0, -0.15, 0]}>
            <boxGeometry args={[1.0, 0.02, 2.0]} /><meshStandardMaterial color="#0a0a0a" emissive={carColor} emissiveIntensity={1.1} />
          </mesh>
          <pointLight position={[0, -0.1, 0]} color={carColor} intensity={2.5} distance={5} decay={2} />
        </group>
        {/* Wheels: outer group tracks suspension, mid steers, inner spins. */}
        {wheels.map((w, i) => (
          <group key={i} position={[w.ox, -SUSP_REST, w.oz]} ref={(g) => { wheelGroups.current[i] = g }}>
            <group ref={(g) => { steerGroups.current[i] = g }}>
              <group ref={(g) => { spinGroups.current[i] = g }}>
                <mesh rotation-z={Math.PI / 2} castShadow>
                  <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.26, 20]} /><meshStandardMaterial color="#151515" roughness={0.9} />
                </mesh>
                <mesh rotation-z={Math.PI / 2}>
                  <cylinderGeometry args={[WHEEL_RADIUS * 0.55, WHEEL_RADIUS * 0.55, 0.27, 20]} />
                  <meshStandardMaterial color="#262626" emissive={carColor} emissiveIntensity={0.25} metalness={0.6} roughness={0.35} />
                </mesh>
              </group>
            </group>
          </group>
        ))}
      </RigidBody>

      {/* Pooled GPU drift smoke. */}
      <points frustumCulled={false}>
        <bufferGeometry ref={smokeGeom}>
          <bufferAttribute attach="attributes-position" args={[smokePool.pos, 3]} />
          <bufferAttribute attach="attributes-aVelocity" args={[smokePool.vel, 3]} />
          <bufferAttribute attach="attributes-aBirth" args={[smokePool.birth, 1]} />
          <bufferAttribute attach="attributes-aSeed" args={[smokePool.seed, 1]} />
        </bufferGeometry>
        <driftSmokeMaterial ref={smokeMat} transparent depthWrite={false} />
      </points>

      {/* Fade-out skid-mark ribbons (one per rear wheel). */}
      {skids.map((sk, i) => (
        <mesh key={i} frustumCulled={false} renderOrder={1}>
          <bufferGeometry ref={(g) => { skidGeoms.current[i] = g }}>
            <bufferAttribute attach="attributes-position" args={[sk.positions, 3]} />
            <bufferAttribute attach="attributes-color" args={[sk.colors, 4]} />
          </bufferGeometry>
          {/* DoubleSide: the ribbon winding faces down, and ground decals are
              only ever viewed from above — culling would hide them. */}
          <meshBasicMaterial vertexColors transparent depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  )
}

// Traffic cone: dynamic rigid body, scatters when clipped.
function Cone({ position }: { position: [number, number, number] }) {
  return (
    <RigidBody colliders="hull" position={position} linearDamping={0.1} angularDamping={0.5} ccd>
      <mesh castShadow><cylinderGeometry args={[0.02, 0.22, 0.55, 12]} /><meshStandardMaterial color="#e7e5e4" roughness={0.5} /></mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.14, 0.17, 0.12, 12]} />
        <meshStandardMaterial color="#a3e635" emissive="#a3e635" emissiveIntensity={0.7} roughness={0.4} />
      </mesh>
    </RigidBody>
  )
}

// Fixed ramp: tilted box, drivable via the same raycast suspension.
function Ramp({ position, yaw }: { position: [number, number, number]; yaw: number }) {
  return (
    <RigidBody type="fixed" colliders={false} position={position} rotation={[0, yaw, 0]}>
      <CuboidCollider args={[1.8, 0.15, 3]} rotation={[-0.32, 0, 0]} />
      <mesh rotation={[-0.32, 0, 0]} castShadow receiveShadow><boxGeometry args={[3.6, 0.3, 6]} /><meshStandardMaterial color="#1c1c1c" roughness={0.85} /></mesh>
    </RigidBody>
  )
}

function Playground() {
  // Deterministic cone scatter: a slalom ahead of spawn plus a loose ring.
  const cones = useMemo(() => {
    const rng = mulberry32(1337)
    const list: [number, number, number][] = []
    for (let i = 0; i < 6; i++) list.push([(i % 2 === 0 ? -1 : 1) * (3 + rng() * 1.5), 0.28, 8 + i * 4])
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2
      const r = 16 + rng() * 10
      list.push([Math.cos(a) * r, 0.28, Math.sin(a) * r])
    }
    return list
  }, [])

  return (
    <>
      {/* Ground: physics slab + dark plane + faint grid overlay. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[100, 0.5, 100]} position={[0, -0.5, 0]} />
        <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[200, 200]} /><meshStandardMaterial color="#0c0c0c" roughness={0.95} /></mesh>
      </RigidBody>
      <Grid position={[0, 0.02, 0]} infiniteGrid cellSize={1.5} sectionSize={7.5} cellColor="#1f1f1f" sectionColor="#2e3a0d" fadeDistance={90} fadeStrength={1.5} />
      <Ramp position={[0, 1.05, 24]} yaw={0} />
      <Ramp position={[-16, 1.05, -8]} yaw={0.9} />
      <Ramp position={[18, 1.05, -14]} yaw={-0.7} />
      {cones.map((p, i) => (
        <Cone key={i} position={p} />
      ))}
    </>
  )
}

export function DriftCar({
  carColor = '#a3e635',
  acceleration = 18,
  topSpeed = 26,
  driftFactor = 0.6,
  cameraLag = 6,
  fovKick = true,
  smoke = true,
  skidmarks = true,
}: DriftCarProps) {
  return (
    <>
      {/* Self-contained lighting so the car reads on a bare dark canvas. */}
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 12, 4]} intensity={1.1} />
      <directionalLight position={[-8, 6, -6]} intensity={0.25} color={carColor} />
      <Physics gravity={[0, GRAVITY, 0]}>
        <CarRig {...{ carColor, acceleration, topSpeed, driftFactor, cameraLag, fovKick, smoke, skidmarks }} />
        <Playground />
      </Physics>
    </>
  )
}
