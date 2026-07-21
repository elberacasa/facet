'use client'

import dynamic from 'next/dynamic'

const Scene = dynamic(() => import('./audio-visualizer-scene'), { ssr: false })

export default function Demo(props: Record<string, any>) {
  return <Scene {...props} />
}
