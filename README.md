<div align="center">

<img src="assets/x/profile-400.png" width="96" alt="Facet logo">

# Facet

**Copy-paste 3D components for React.**

Production-ready React Three Fiber components you copy into your project. Not a dependency. No lock-in. Own every line.

[![npm version](https://img.shields.io/npm/v/facet3d?color=a3e635&label=npm)](https://www.npmjs.com/package/facet3d)
[![components](https://img.shields.io/badge/components-30-a3e635)](https://github.com/elberacasa/facet/tree/main/registry)
[![license](https://img.shields.io/badge/license-MIT-a3e635)](https://github.com/elberacasa/facet/blob/main/LICENSE)
[![X](https://img.shields.io/badge/follow-%40facet__3d-a3e635)](https://x.com/facet_3d)

[**npm**](https://www.npmjs.com/package/facet3d) · [**Registry**](https://github.com/elberacasa/facet/tree/main/registry) · [**llms.txt**](https://github.com/elberacasa/facet/blob/main/apps/www/app/llms.txt/route.ts) · [**Issues**](https://github.com/elberacasa/facet/issues)

```bash
npx facet3d add avatar-maker
```

![Facet](docs/showcase/hero.jpg)

**If Facet is useful to you, a star goes a long way.**

</div>

## See it move

<table>
  <tr>
    <td><img src="docs/showcase/image-particles.gif" alt="Image Particles"><br><b>image-particles</b> — particles assemble into any text, scatter under the cursor</td>
    <td><img src="docs/showcase/vfx-burst.gif" alt="VFX Burst"><br><b>vfx-burst</b> — multi-layer GPU explosion with shockwave and flash light</td>
  </tr>
</table>

## Why Facet

3D on the web is stuck: monolithic libraries, blurry demos, code you can't read. Facet is a registry of hand-crafted 3D components (game systems, shaders, generators) distributed as **source code**. One command drops a component into your repo, fully typed, ready to customize.

- **Copy-paste, not npm-install.** Components land in `components/facet/`. Tweak anything.
- **A playground for every prop.** Tune everything live in the docs, then copy the exact config.
- **Game tier included.** Character controller, procedural terrain, ocean, sky, grass, VFX, and an avatar maker that exports real .glb files.
- **Built for AI agents.** Machine-readable registry, `llms.txt`, and a CLI your agent can drive.

## How it compares

| | Facet | 3D npm libraries | Build it yourself |
| --- | --- | --- | --- |
| Own the source | ✅ every line | ❌ black box | ✅ but weeks of work |
| Install time | ✅ one command | ✅ | ❌ |
| No version lock-in | ✅ | ❌ breaking changes | ✅ |
| Game-grade systems | ✅ physics, terrain, VFX | rare | ❌ hard |
| Agent-ready docs | ✅ llms.txt + CLI | ❌ | ❌ |

## Showcase

<table>
  <tr>
    <td><img src="docs/showcase/avatar-maker.jpg" alt="Avatar Maker"><br><b>Avatar Maker</b> — design a character, export a .glb for your game</td>
    <td><img src="docs/showcase/image-particles.jpg" alt="Image Particles"><br><b>Image Particles</b> — particles assemble into any text or image</td>
  </tr>
  <tr>
    <td><img src="docs/showcase/grass-field.jpg" alt="Grass Field"><br><b>Grass Field</b> — 30,000 instanced blades swaying in the wind</td>
    <td><img src="docs/showcase/portal.jpg" alt="Portal"><br><b>Portal</b> — a window into another world, live render target</td>
  </tr>
  <tr>
    <td><img src="docs/showcase/drift-car.jpg" alt="Drift Car"><br><b>Drift Car</b> — arcade driving with raycast suspension and skid marks</td>
    <td><img src="docs/showcase/ocean.jpg" alt="Ocean"><br><b>Ocean</b> — Gerstner waves, sky reflection, crest foam</td>
  </tr>
</table>

## Usage

```bash
# set up your project (installs three, @react-three/fiber, @react-three/drei)
npx facet3d init

# add a component
npx facet3d add image-particles

# browse the registry
npx facet3d list

# print docs for any component (agent-friendly)
npx facet3d docs image-particles --source
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

## Components

**Game tier**

| Component | What it is |
| --- | --- |
| `avatar-maker` | Design a stylized 3D character with expressions and export it as a .glb |
| `character-controller` | Third-person controller: WASD, jumping, collision-aware camera (`@react-three/rapier`) |
| `procedural-terrain` | Seeded island worlds with biomes, trees, rocks, and water |
| `ocean` | Gerstner-wave water with sky reflection, subsurface tint, and foam |
| `day-night-sky` | Procedural sky dome with a full sun cycle, stars, and drifting clouds |
| `grass-field` | Tens of thousands of instanced grass blades swaying in the wind |
| `vfx-burst` | Multi-layer GPU particle effects: explosion, fire, smoke, magic |
| `drift-car` | Arcade drift car with raycast suspension, handbrake slides, and skid marks |

**Visuals**

| Component | What it is |
| --- | --- |
| `image-particles` | Particles that assemble into any text or image, and scatter under the cursor |
| `galaxy` | Procedural spiral galaxy with tens of thousands of shader-driven stars |
| `glass-prism` | Glass dispersion crystal with real refraction and chromatic aberration |
| `portal` | A standing portal that renders another world live, with true parallax |
| `god-rays` | Volumetric light shafts with drifting dust, zero post-processing |
| `silk-cloth` | Silk banner billowing in gusting wind, with pointer push and drag |
| `lightning-arcs` | Branching electric arcs with a white-hot core and pointer chasing |
| `face-puppet` | Webcam face-tracked head that mirrors your expressions |
| `globe-arcs` | Interactive dotted globe with animated connection arcs |
| `aurora` | Animated aurora gradient shader background |
| `ripple-plane` | Touch-responsive water surface |
| `node-network` | 3D plexus network of drifting, connected nodes |
| `cursor-trail` | A fluid ribbon of light that follows the cursor |
| `audio-visualizer` | Audio-reactive frequency rings: microphone or simulation |
| `hero-blob` | Morphing distortion sphere |
| `particle-field` | Interactive particle cloud that reacts to the cursor |
| `floating-shapes` | Drifting geometric primitives for ambient backgrounds |
| `wave-grid` | Shader-driven undulating wireframe terrain |
| `text-3d` | Extruded 3D typography with environment-lit materials |
| `model-viewer` | Drop-in GLTF model viewer with staging and orbit controls |
| `holo-card` | Holographic fresnel card with an iridescent sheen |
| `scroll-camera` | Scroll-driven camera flythrough scene |

## Made for AI agents

Facet is designed to be consumed by coding agents (Claude Code, Cursor, Copilot):

- `/llms.txt` and `/llms-full.txt` routes describe every component, prop, and default
- `facet3d docs <name> --source` prints agent-consumable documentation and full source
- The registry itself is machine-readable: [`registry/index.json`](registry/index.json)

## Roadmap

- [x] 30 components across game and visual tiers
- [x] CLI with init / add / list / docs
- [x] Live playground for every prop
- [ ] Public docs deployment
- [ ] World composer: one command, a full island scene
- [ ] Avatar poses and rigged animation export
- [ ] Component packs by theme (cyberpunk, minimal, nature)

## Contributing

Issues and PRs welcome. New components need: a self-contained `registry/components/<name>.tsx`, an entry in `registry/index.json` with a prop schema, and a demo page. Read a few existing components first — the conventions are strict on purpose.

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=elberacasa/facet&type=Date)](https://star-history.com/#elberacasa/facet&Date)

## License

MIT
