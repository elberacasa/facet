'use client'

// ModelViewer — drop-in GLTF model viewer.
// Must be rendered inside a react-three-fiber <Canvas>.

import { Suspense } from 'react'
import { useGLTF, Stage, OrbitControls, Environment } from '@react-three/drei'

export interface ModelViewerProps {
  url?: string
  autoRotate?: boolean
  autoRotateSpeed?: number
  environment?:
    | 'sunset'
    | 'dawn'
    | 'night'
    | 'warehouse'
    | 'forest'
    | 'apartment'
    | 'studio'
    | 'city'
    | 'park'
    | 'lobby'
  enableZoom?: boolean
}

const DEFAULT_URL =
  'https://threejs.org/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf'

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  return <primitive object={scene} />
}

export function ModelViewer({
  url = DEFAULT_URL,
  autoRotate = true,
  autoRotateSpeed = 1.5,
  environment = 'city',
  enableZoom = false,
}: ModelViewerProps) {
  return (
    <>
      <Suspense fallback={null}>
        <Stage environment={null} intensity={0.6} adjustCamera={false}>
          <Model url={url} />
        </Stage>
        <Environment preset={environment} />
      </Suspense>
      <OrbitControls
        autoRotate={autoRotate}
        autoRotateSpeed={autoRotateSpeed}
        enableZoom={enableZoom}
        enablePan={false}
        makeDefault
      />
    </>
  )
}
