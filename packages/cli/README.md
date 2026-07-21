# facet3d

The CLI for [Facet](https://github.com/elberacasa/facet): copy-paste 3D components for React. Production-ready React Three Fiber components installed as source into your project, not as a dependency.

```bash
# set up your project (installs three, @react-three/fiber, @react-three/drei)
npx facet3d init

# add a component
npx facet3d add avatar-maker

# browse what's available
npx facet3d list

# print docs for a component (props, usage, source)
npx facet3d docs avatar-maker --source
```

Components land in `components/facet/` as plain TypeScript you own. 30 components: game systems (character controller, procedural terrain, ocean, avatar maker with GLB export) and visuals (image particles, galaxy, aurora, god rays, and more).

Built for humans and AI agents alike: `facet3d docs` prints agent-consumable documentation for any component.

## Links

- [GitHub](https://github.com/elberacasa/facet)
- [Component registry](https://github.com/elberacasa/facet/tree/main/registry)

## License

MIT
