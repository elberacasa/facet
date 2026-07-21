import { DemoShell } from '@/components/demo-shell'
import Demo from '@/components/demos/node-network-demo'

export default function Page() {
  return <DemoShell name="node-network" Demo={Demo} />
}
