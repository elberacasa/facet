#!/usr/bin/env node
// facet3d CLI entry point.

import { run } from '../src/cli.mjs'

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
