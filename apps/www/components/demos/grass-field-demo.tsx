'use client'

import dynamic from 'next/dynamic'

const Scene = dynamic(() => import('./grass-field-scene'), { ssr: false })

export default function Demo(props: Record<string, any>) {
  return <Scene {...props} />
}
