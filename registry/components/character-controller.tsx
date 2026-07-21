// character-controller — third-person character controller with game feel:
// camera-relative WASD/arrow movement, Shift to sprint (1.6x), jumping with
// coyote time, procedural squash & stretch, lean into movement and turns,
// landing/running dust puffs, FOV kick, subtle camera bob, and a
// collision-aware drag-to-orbit camera. Built on @react-three/rapier.
//
// Renders its own rapier Physics world — do NOT nest it inside another <Physics>.
// Pass level geometry as children; it is simulated in the same world:
//
//   <Canvas>
//     <CharacterController color="#a3e635">
//       <RigidBody type="fixed" colliders={false}>
//         <CuboidCollider args={[15, 0.5, 15]} />
//         <mesh>...</mesh>
//       </RigidBody>
//     </CharacterController>
//   </Canvas>
//
// Controls: WASD / arrow keys to move, hold Shift to sprint, Space to jump,
// pointer-drag on the canvas to orbit the camera. The controller owns the
// camera — do not add OrbitControls. The character drops in from ~3m on load.
'use client'

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  MathUtils,
  Vector3,
  type BufferAttribute,
  type BufferGeometry,
  type Group,
  type PerspectiveCamera,
  type PointsMaterial,
} from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Physics,
  RigidBody,
  CapsuleCollider,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier'

export interface CharacterControllerProps {
  color?: string
  speed?: number
  jumpForce?: number
  cameraDistance?: number
  children?: ReactNode
}

const CAPSULE_HALF_HEIGHT = 0.5
const CAPSULE_RADIUS = 0.35
const FEET_OFFSET = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS
const HEAD_OFFSET = 0.6
const GROUND_RAY_LENGTH = 1.15
const COYOTE_TIME = 0.12
const MOVE_SMOOTHING = 10
const TURN_SMOOTHING = 14
const CAMERA_SMOOTHING = 12
const CAMERA_PULL_IN = 0.3
const MIN_CAMERA_DIST = 0.4
const PITCH_LIMIT = 1.2
const GRAVITY = -22
const SPRINT_MULTIPLIER = 1.6
// Squash & stretch spring: slightly under-damped so it overshoots once and
// settles in ~0.35s.
const SQUASH_K = 170
const SQUASH_C = 15
const SQUASH_MIN = 0.55
const SQUASH_MAX = 1.5
const JUMP_STRETCH_IMPULSE = 2.4
// Camera feel.
const BASE_FOV = 55
const SPEED_FOV = 7
const SPRINT_FOV = 2
const MAX_LANDING_FOV_KICK = 3.5
const FOV_MIN = 50
const FOV_MAX = 68
const FOV_SMOOTHING = 6
const BOB_MAX_AMP = 0.045
// Dust puffs: a small pool of CPU-animated point bursts.
const DUST_POOL = 8
const DUST_COUNT = 20
const DUST_LIFE = 0.4
const RUN_DUST_INTERVAL = 0.25

const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

// Damps an angle toward a target taking the shortest way around the circle.
function dampAngle(current: number, target: number, lambda: number, delta: number) {
  let diff = (target - current) % (Math.PI * 2)
  if (diff > Math.PI) diff -= Math.PI * 2
  if (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * (1 - Math.exp(-lambda * delta))
}

interface BodyProps {
  color: string
  speed: number
  jumpForce: number
  cameraDistance: number
}

function ControllerBody({ color, speed, jumpForce, cameraDistance }: BodyProps) {
  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  const squashGroup = useRef<Group>(null)
  const { camera, gl } = useThree()
  const { world, rapier } = useRapier()

  const keys = useRef(new Set<string>())
  const sprinting = useRef(false)
  const jumpQueued = useRef(false)
  const coyote = useRef(0)
  const grounded = useRef(false)
  const maxFallSpeed = useRef(0)
  const squashSpring = useRef({ v: 1, vel: 0 })
  const yawRate = useRef(0)
  const bobPhase = useRef(0)
  const bobAmp = useRef(0)
  const fovKick = useRef(0)
  const runDustTimer = useRef(0)
  const yaw = useRef(0)
  const pitch = useRef(0.35)
  const scratch = useRef({
    move: new Vector3(),
    head: new Vector3(),
    desired: new Vector3(),
    boomDir: new Vector3(),
    camRay: null as InstanceType<typeof rapier.Ray> | null,
    groundRay: null as InstanceType<typeof rapier.Ray> | null,
  })

  // Dust burst pool: world-space point clouds, recycled round-robin.
  const dustGeoms = useRef<(BufferGeometry | null)[]>([])
  const dustMats = useRef<(PointsMaterial | null)[]>([])
  const nextBurst = useRef(0)
  const bursts = useMemo(
    () =>
      Array.from({ length: DUST_POOL }, () => ({
        active: false,
        life: 0,
        floor: 0,
        size: 0.09,
        peakOpacity: 0.5,
        pos: new Float32Array(DUST_COUNT * 3),
        vel: new Float32Array(DUST_COUNT * 3),
      })),
    []
  )

  const spawnDust = (x: number, y: number, z: number, intensity: number) => {
    const b = bursts[nextBurst.current]
    nextBurst.current = (nextBurst.current + 1) % DUST_POOL
    b.active = true
    b.life = 0
    b.floor = y
    b.peakOpacity = 0.25 + intensity * 0.32
    b.size = 0.06 + intensity * 0.06
    for (let i = 0; i < DUST_COUNT; i++) {
      const a = Math.random() * Math.PI * 2
      const r = (0.6 + Math.random() * 1.6) * intensity
      b.pos[i * 3] = x + (Math.random() - 0.5) * 0.2
      b.pos[i * 3 + 1] = y + 0.02 + Math.random() * 0.06
      b.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.2
      b.vel[i * 3] = Math.cos(a) * r
      b.vel[i * 3 + 1] = (0.6 + Math.random() * 1.4) * intensity
      b.vel[i * 3 + 2] = Math.sin(a) * r
    }
  }

  // Keyboard input (window listeners, client-only).
  useEffect(() => {
    const pressed = keys.current
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (!e.repeat) jumpQueued.current = true
        e.preventDefault()
        return
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        sprinting.current = true
        return
      }
      if (MOVE_KEYS.has(e.code)) {
        pressed.add(e.code)
        e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sprinting.current = false
      pressed.delete(e.code)
    }
    const onBlur = () => {
      pressed.clear()
      sprinting.current = false
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

  // Drag-to-orbit camera (pointer events on the canvas, no pointer lock).
  useEffect(() => {
    const el = gl.domElement
    el.style.touchAction = 'none'
    let dragging = false
    const onPointerDown = (e: PointerEvent) => {
      dragging = true
      el.setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return
      yaw.current -= e.movementX * 0.0045
      pitch.current = MathUtils.clamp(pitch.current + e.movementY * 0.0045, -PITCH_LIMIT, PITCH_LIMIT)
    }
    const onPointerUp = (e: PointerEvent) => {
      dragging = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
    }
  }, [gl])

  useFrame((_, delta) => {
    const rb = body.current
    if (!rb) return
    const dt = Math.min(delta, 1 / 30)
    const s = scratch.current
    if (!s.groundRay) s.groundRay = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
    if (!s.camRay) s.camRay = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })

    const pos = rb.translation()
    const vel = rb.linvel()
    const horizSpeed = Math.hypot(vel.x, vel.z)

    // Grounded check: short ray straight down from the body center, excluding
    // the player. Landing is the airborne -> grounded transition; impact
    // strength comes from the peak fall speed seen while airborne.
    s.groundRay.origin = pos
    const groundHit = world.castRay(s.groundRay, GROUND_RAY_LENGTH, true, undefined, undefined, undefined, rb)
    const isGrounded = groundHit !== null
    if (isGrounded) {
      if (!grounded.current) {
        const impact = -maxFallSpeed.current
        if (impact > 2) {
          squashSpring.current.vel -= MathUtils.clamp(impact * 0.3, 1.2, 4)
          fovKick.current = MathUtils.clamp(impact * 0.25, 0, MAX_LANDING_FOV_KICK)
          spawnDust(pos.x, pos.y - FEET_OFFSET, pos.z, MathUtils.clamp(impact / 11, 0.35, 1.4))
        }
        maxFallSpeed.current = 0
      }
      coyote.current = COYOTE_TIME
    } else {
      coyote.current = Math.max(0, coyote.current - dt)
      maxFallSpeed.current = Math.min(maxFallSpeed.current, vel.y)
    }
    grounded.current = isGrounded

    // Camera-relative movement direction on the ground plane.
    const pressed = keys.current
    const ix =
      (pressed.has('KeyD') || pressed.has('ArrowRight') ? 1 : 0) -
      (pressed.has('KeyA') || pressed.has('ArrowLeft') ? 1 : 0)
    const iz =
      (pressed.has('KeyW') || pressed.has('ArrowUp') ? 1 : 0) -
      (pressed.has('KeyS') || pressed.has('ArrowDown') ? 1 : 0)

    const fwdX = -Math.sin(yaw.current)
    const fwdZ = -Math.cos(yaw.current)
    // right = (-fwdZ, 0, fwdX)
    const move = s.move.set(fwdX * iz + -fwdZ * ix, 0, fwdZ * iz + fwdX * ix)
    const hasInput = move.lengthSq() > 0
    if (hasInput) move.normalize()

    // Horizontal velocity eases toward the target; vertical velocity is preserved.
    const targetSpeed = speed * (sprinting.current ? SPRINT_MULTIPLIER : 1)
    let vy = vel.y
    if (jumpQueued.current) {
      jumpQueued.current = false
      if (coyote.current > 0) {
        vy = jumpForce
        coyote.current = 0
        grounded.current = false
        // Stretch on takeoff.
        squashSpring.current.vel += JUMP_STRETCH_IMPULSE
      }
    }
    rb.setLinvel(
      {
        x: MathUtils.damp(vel.x, move.x * targetSpeed, MOVE_SMOOTHING, dt),
        y: vy,
        z: MathUtils.damp(vel.z, move.z * targetSpeed, MOVE_SMOOTHING, dt),
      },
      true
    )

    // Face the direction of travel; track turn rate for the lean-into-turn roll.
    if (visual.current) {
      if (hasInput) {
        const prevYaw = visual.current.rotation.y
        const newYaw = dampAngle(prevYaw, Math.atan2(move.x, move.z), TURN_SMOOTHING, dt)
        visual.current.rotation.y = newYaw
        yawRate.current = MathUtils.damp(yawRate.current, (newYaw - prevYaw) / dt, 10, dt)
      } else {
        yawRate.current = MathUtils.damp(yawRate.current, 0, 10, dt)
      }
    }

    // Squash & stretch spring (semi-implicit Euler), volume-preserving scale.
    const sp = squashSpring.current
    sp.vel += (-SQUASH_K * (sp.v - 1) - SQUASH_C * sp.vel) * dt
    sp.v = MathUtils.clamp(sp.v + sp.vel * dt, SQUASH_MIN, SQUASH_MAX)
    if (squashGroup.current) {
      const sy = sp.v
      const sxz = 1 / Math.sqrt(sy)
      squashGroup.current.scale.set(sxz, sy, sxz)
      // Keep the feet planted while squashing/stretching.
      squashGroup.current.position.y = -FEET_OFFSET * (1 - sy)
    }

    // Lean: forward with speed, sideways into turns.
    const speedNorm = MathUtils.clamp(horizSpeed / Math.max(targetSpeed, 0.001), 0, 1)
    if (tilt.current) {
      const leanFwd = speedNorm * 0.14 * (isGrounded ? 1 : 0.6)
      const leanSide = MathUtils.clamp(-yawRate.current * 0.05, -0.16, 0.16)
      tilt.current.rotation.x = MathUtils.damp(tilt.current.rotation.x, leanFwd, 8, dt)
      tilt.current.rotation.z = MathUtils.damp(tilt.current.rotation.z, leanSide, 8, dt)
    }

    // Faint running dust while moving fast on the ground.
    runDustTimer.current -= dt
    if (isGrounded && horizSpeed > Math.max(speed * 0.55, 3) && runDustTimer.current <= 0) {
      runDustTimer.current = RUN_DUST_INTERVAL
      spawnDust(pos.x, pos.y - FEET_OFFSET, pos.z, 0.3 + speedNorm * 0.25)
    }

    // Dust burst simulation: expand with drag + light gravity, fade out.
    for (let bi = 0; bi < DUST_POOL; bi++) {
      const b = bursts[bi]
      if (!b.active) continue
      b.life += dt
      const t = b.life / DUST_LIFE
      const m = dustMats.current[bi]
      const g = dustGeoms.current[bi]
      if (t >= 1) {
        b.active = false
        if (m) m.opacity = 0
        continue
      }
      const drag = Math.max(0, 1 - 3 * dt)
      for (let i = 0; i < DUST_COUNT; i++) {
        b.vel[i * 3] *= drag
        b.vel[i * 3 + 1] = (b.vel[i * 3 + 1] - 5.5 * dt) * drag
        b.vel[i * 3 + 2] *= drag
        b.pos[i * 3] += b.vel[i * 3] * dt
        b.pos[i * 3 + 1] = Math.max(b.floor + 0.01, b.pos[i * 3 + 1] + b.vel[i * 3 + 1] * dt)
        b.pos[i * 3 + 2] += b.vel[i * 3 + 2] * dt
      }
      if (g) (g.attributes.position as BufferAttribute).needsUpdate = true
      if (m) {
        m.opacity = b.peakOpacity * (1 - t)
        m.size = b.size * (0.7 + t * 1.6)
      }
    }

    // Collision-aware boom camera.
    const head = s.head.set(pos.x, pos.y + HEAD_OFFSET, pos.z)
    const cp = Math.cos(pitch.current)
    const boom = s.boomDir.set(Math.sin(yaw.current) * cp, Math.sin(pitch.current), Math.cos(yaw.current) * cp)
    let dist = cameraDistance
    s.camRay.origin = head
    s.camRay.dir = boom
    const camHit = world.castRay(s.camRay, cameraDistance, true, undefined, undefined, undefined, rb)
    if (camHit) dist = Math.max(camHit.timeOfImpact - CAMERA_PULL_IN, MIN_CAMERA_DIST)
    const desired = s.desired.copy(boom).multiplyScalar(dist).add(head)
    camera.position.set(
      MathUtils.damp(camera.position.x, desired.x, CAMERA_SMOOTHING, dt),
      MathUtils.damp(camera.position.y, desired.y, CAMERA_SMOOTHING, dt),
      MathUtils.damp(camera.position.z, desired.z, CAMERA_SMOOTHING, dt)
    )

    // Camera bob: tiny vertical oscillation while running, fades out in air.
    bobPhase.current += horizSpeed * dt * 1.5
    const bobTarget = isGrounded ? MathUtils.clamp(horizSpeed / 12, 0, 1) * BOB_MAX_AMP : 0
    bobAmp.current = MathUtils.damp(bobAmp.current, bobTarget, 8, dt)
    camera.position.y += Math.sin(bobPhase.current) * bobAmp.current
    camera.lookAt(head)

    // FOV kick: widens with speed, sprint, and landing impacts; eases back.
    fovKick.current = MathUtils.damp(fovKick.current, 0, 5, dt)
    if ('fov' in camera) {
      const pc = camera as PerspectiveCamera
      const speedFov = MathUtils.clamp(horizSpeed / 12, 0, 1) * SPEED_FOV
      const sprintFov = sprinting.current && hasInput ? SPRINT_FOV : 0
      const fovTarget = MathUtils.clamp(BASE_FOV + speedFov + sprintFov + fovKick.current, FOV_MIN, FOV_MAX)
      pc.fov = MathUtils.damp(pc.fov, fovTarget, FOV_SMOOTHING, dt)
      pc.updateProjectionMatrix()
    }
  })

  return (
    <>
      <RigidBody
        ref={body}
        colliders={false}
        position={[0, FEET_OFFSET + 3, 0]}
        lockRotations
        ccd
        friction={0.2}
        linearDamping={0.05}
      >
        <CapsuleCollider args={[CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS]} />
        <group ref={visual}>
          <group ref={tilt}>
            <group ref={squashGroup}>
              <mesh castShadow>
                <capsuleGeometry args={[CAPSULE_RADIUS, CAPSULE_HALF_HEIGHT * 2, 8, 16]} />
                <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
              </mesh>
              {/* Visor so facing is readable. */}
              <mesh position={[0, 0.45, 0.27]}>
                <sphereGeometry args={[0.13, 16, 16]} />
                <meshStandardMaterial color="#0a0a0a" roughness={0.2} metalness={0.4} />
              </mesh>
            </group>
          </group>
        </group>
      </RigidBody>
      {bursts.map((b, i) => (
        <points key={i} frustumCulled={false}>
          <bufferGeometry
            ref={(g) => {
              dustGeoms.current[i] = g
            }}
          >
            <bufferAttribute attach="attributes-position" args={[b.pos, 3]} />
          </bufferGeometry>
          <pointsMaterial
            ref={(m) => {
              dustMats.current[i] = m
            }}
            size={0.09}
            sizeAttenuation
            transparent
            opacity={0}
            depthWrite={false}
            color="#cfcabd"
          />
        </points>
      ))}
    </>
  )
}

export function CharacterController({
  color = '#a3e635',
  speed = 6,
  jumpForce = 8,
  cameraDistance = 6,
  children,
}: CharacterControllerProps) {
  return (
    <Physics gravity={[0, GRAVITY, 0]}>
      <ControllerBody color={color} speed={speed} jumpForce={jumpForce} cameraDistance={cameraDistance} />
      {children}
    </Physics>
  )
}
