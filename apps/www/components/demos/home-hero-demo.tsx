'use client'

import dynamic from 'next/dynamic'

const Scene = dynamic(() => import('./home-hero-scene'), { ssr: false })

export default function Demo() {
  return <Scene />
}
