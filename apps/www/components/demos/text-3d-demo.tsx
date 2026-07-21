'use client'

// Demo loader: client-only, forwards playground props to the scene.
import dynamic from 'next/dynamic'

const Scene = dynamic(() => import('./text-3d-scene'), { ssr: false })

export default function Demo(props: Record<string, any>) {
  return <Scene {...props} />
}
