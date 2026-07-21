#!/usr/bin/env node
// Facet MCP server (stdio transport).

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { resolveRegistryLocation } from '../src/registry.mjs'
import { TOOLS, callTool } from '../src/tools.mjs'

function parseFlags(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--registry') {
      const value = argv[++i]
      if (!value) {
        console.error('facet-mcp: --registry requires a value')
        process.exit(1)
      }
      flags.registry = value
    } else if (arg.startsWith('--registry=')) {
      flags.registry = arg.slice('--registry='.length)
    }
  }
  return flags
}

const location = resolveRegistryLocation(parseFlags(process.argv.slice(2)))

const server = new Server(
  { name: 'facet', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const text = await callTool(
      location,
      request.params.name,
      request.params.arguments ?? {}
    )
    return { content: [{ type: 'text', text }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: err.message }],
      isError: true,
    }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`facet-mcp: serving registry ${location}`)
