// particle-field demo loader — client-only, forwards playground props.
'use client'

import dynamic from 'next/dynamic'

const Scene = dynamic(() => import('./particle-field-scene'), { ssr: false })

export default function Demo(props: Record<string, any>) {
  return <Scene {...props} />
}
