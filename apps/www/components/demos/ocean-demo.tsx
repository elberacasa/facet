'use client'

import dynamic from 'next/dynamic'

const Scene = dynamic(() => import('./ocean-scene'), { ssr: false })

export default function Demo(props: Record<string, any>) {
  return <Scene {...props} />
}
