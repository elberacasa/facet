# Facet

**Copy-paste 3D components for React.** Production-ready React Three Fiber components you copy into your project, not a dependency you install.

```bash
npx facet3d add hero-blob
```

[GitHub](https://github.com/elberacasa/facet) · [llms.txt](https://github.com/elberacasa/facet/blob/main/apps/www/app/llms.txt/route.ts) · MIT

## Why

3D on the web is stuck: monolithic libraries, blurry demos, and code you can't read. Facet is a registry of hand-crafted 3D components (heroes, particles, shaders, scroll scenes) distributed as source code. You own every line.

- **Copy-paste, not npm-install.** Components land in `components/facet/`. Tweak anything.
- **Zero lock-in.** Only peer deps are `three`, `@react-three/fiber`, `@react-three/drei`.
- **A playground for every prop.** Tune color, speed, and geometry live on the docs site, then copy the exact config.
- **Built for AI agents.** Machine-readable registry, `/llms.txt`, and a CLI your agent can drive.

## Components

**Game tier**

| Component | What it is |
| --- | --- |
| `avatar-maker` | Design a stylized 3D character and export it as a .glb for your game |
| `character-controller` | Third-person character controller: WASD movement, jumping, and a collision-aware camera (requires `@react-three/rapier`) |
| `procedural-terrain` | Seeded island worlds with biomes, trees, rocks, and water |
| `ocean` | Gerstner-wave water with sky reflection, subsurface tint, and foam |
| `day-night-sky` | Procedural sky dome with a full sun cycle, stars, and drifting clouds |
| `grass-field` | Tens of thousands of instanced grass blades swaying in the wind |
| `vfx-burst` | Multi-layer GPU particle effects: explosion, fire, smoke, magic |
| `drift-car` | Arcade drift car with raycast suspension, handbrake slides, smoke, and skid marks (requires `@react-three/rapier`) |

**Visuals**

| Component | What it is |
| --- | --- |
| `image-particles` | Particles that assemble into any text or image, and scatter under the cursor |
| `galaxy` | Procedural spiral galaxy with tens of thousands of shader-driven stars |
| `globe-arcs` | Interactive dotted globe with animated connection arcs |
| `aurora` | Animated aurora gradient shader: the landing-page background everyone wants |
| `ripple-plane` | Touch-responsive water surface that ripples under your cursor |
| `node-network` | 3D plexus network of drifting, connected nodes, built for AI landing pages |
| `cursor-trail` | A fluid ribbon of light that follows the cursor |
| `audio-visualizer` | Audio-reactive frequency rings: microphone or built-in simulation |
| `hero-blob` | Morphing distortion sphere: the classic 3D hero centerpiece |
| `particle-field` | Interactive particle cloud that reacts to the cursor |
| `floating-shapes` | Drifting geometric primitives for ambient backgrounds |
| `wave-grid` | Shader-driven undulating wireframe terrain |
| `text-3d` | Extruded 3D typography with environment-lit materials |
| `model-viewer` | Drop-in GLTF model viewer with staging and controls |
| `holo-card` | Holographic fresnel card with iridescent sheen |
| `scroll-camera` | Scroll-driven camera flythrough scene |
| `glass-prism` | Cinematic glass dispersion crystal with real refraction and chromatic aberration |
| `face-puppet` | Webcam face-tracked spirit head that mirrors your expressions, with mouse-follow fallback |
| `god-rays` | Volumetric light shafts with drifting dust: cinematic background glow, zero post-processing |
| `portal` | A standing portal that renders another world live, with true perspective parallax |
| `silk-cloth` | Silk banner billowing in gusting wind, with smooth pointer push and drag |
| `lightning-arcs` | Branching electric arcs with a white-hot core, strike flicker, and pointer chasing |

## Usage

```bash
# initialize (installs three / fiber / drei)
npx facet3d init

# add a component
npx facet3d add particle-field

# print agent-friendly docs for a component (props, usage, source)
npx facet3d docs particle-field --source
```

```tsx
'use client'

import { Canvas } from '@react-three/fiber'
import { ParticleField } from '@/components/facet/particle-field'

export default function Hero() {
  return (
    <div className="h-screen bg-black">
      <Canvas camera={{ position: [0, 0, 6] }}>
        <ParticleField />
      </Canvas>
    </div>
  )
}
```

## Repo layout

- `registry/`: the component source of truth (`index.json` + `components/*.tsx`)
- `apps/www`: the docs / playground site (Next.js)
- `packages/cli`: the `facet3d` CLI

## Develop

```bash
npm install
npm run dev    # docs site
npm test       # CLI tests
```

## License

MIT
