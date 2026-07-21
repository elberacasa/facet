'use client'

import dynamic from 'next/dynamic'

const Scene = dynamic(() => import('./floating-shapes-scene'), { ssr: false })

// Demo loader: forwards playground props to the client-only scene.
export default function Demo(props: Record<string, any>) {
  return <Scene {...props} />
}
