// cursor-trail — fluid ribbon of light following the cursor. Must be rendered inside a react-three-fiber <Canvas>.
'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { ElementRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'

export interface CursorTrailProps {
  color?: string
  length?: number
  width?: number
}

export function CursorTrail({ color = '#22d3ee', length = 60, width = 4 }: CursorTrailProps) {
  const lineRef = useRef<ElementRef<typeof Line>>(null)
  const trailRef = useRef<THREE.Vector3[]>([])
  const scratchRef = useRef({ point: new THREE.Vector3(), dir: new THREE.Vector3() })

  // Reset the trail whenever the point budget changes.
  useEffect(() => {
    trailRef.current = []
  }, [length])

  // Initial (placeholder) points — drei Line builds the Line2 geometry from these
  // once per length change; positions are then driven imperatively in useFrame.
  const points = useMemo(
    () => Array.from({ length }, () => new THREE.Vector3(0, 0, 0)),
    [length]
  )

  // Head → tail vertex color fade (bright `color` at the head, black at the tail).
  // Rebuilt only when length or color changes; black fades to invisible with additive blending.
  const vertexColors = useMemo(() => {
    const c = new THREE.Color(color)
    return Array.from({ length }, (_, i) => {
      const t = length > 1 ? i / (length - 1) : 1
      return c.clone().multiplyScalar(t * t)
    })
  }, [color, length])

  useFrame((state) => {
    const line = lineRef.current
    if (!line) return

    // Unproject the pointer onto the z=0 plane (camera ray / plane intersection).
    const { camera, pointer } = state
    const { point, dir } = scratchRef.current
    point.set(pointer.x, pointer.y, 0.5).unproject(camera)
    dir.copy(point).sub(camera.position).normalize()
    if (Math.abs(dir.z) < 1e-6) return
    const dist = -camera.position.z / dir.z
    if (dist <= 0) return
    const px = camera.position.x + dir.x * dist
    const py = camera.position.y + dir.y * dist

    // Push a new point only when the cursor moved enough — keeps the ribbon smooth.
    const trail = trailRef.current
    const last = trail[trail.length - 1]
    if (!last || Math.hypot(px - last.x, py - last.y) > 0.01) {
      trail.push(new THREE.Vector3(px, py, 0))
      if (trail.length > length) trail.splice(0, trail.length - length)
    }

    const n = trail.length
    if (n < 2) return

    // Flatten the trail into the geometry, oldest first so the head stays at the
    // brightest vertex. Short trails are padded at the tail with the oldest point,
    // producing invisible zero-length black segments until the trail fills up.
    const flat = new Float32Array(length * 3)
    const pad = length - n
    for (let i = 0; i < length; i++) {
      const p = i < pad ? trail[0] : trail[i - pad]
      flat[i * 3] = p.x
      flat[i * 3 + 1] = p.y
      flat[i * 3 + 2] = p.z
    }
    ;(line.geometry as { setPositions: (a: Float32Array) => void }).setPositions(flat)
  })

  return (
    <Line
      ref={lineRef}
      points={points}
      vertexColors={vertexColors}
      lineWidth={width}
      transparent
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      frustumCulled={false}
    />
  )
}
