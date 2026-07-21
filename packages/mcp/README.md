# @facet3d/mcp

MCP server for the Facet 3D component registry. Lets AI coding agents
(Claude Code, Cursor, etc.) browse, inspect, and install Facet's React Three
Fiber components natively over the Model Context Protocol.

## Setup

Add to your MCP client config (Claude Code / Cursor):

```json
{
  "mcpServers": {
    "facet": {
      "command": "npx",
      "args": ["-y", "@facet3d/mcp"]
    }
  }
}
```

## Tools

- `facet_list` — list all components: name, category, title, description.
- `facet_docs` — docs for one component: description, dependencies, props
  table, and a React Three Fiber usage example.
- `facet_source` — full `.tsx` source of one component.
- `facet_add` — copy a component into the project at
  `<targetDir or cwd>/components/facet/<name>.tsx` (refuses to overwrite
  unless `overwrite: true`) and report the dependencies to install.

## Custom registry

The registry location resolves like the `facet3d` CLI:
`--registry <path-or-url>` > `FACET_REGISTRY` env var > the default registry
on GitHub. For local development against a checkout of the repo:

```json
{
  "mcpServers": {
    "facet": {
      "command": "node",
      "args": ["/path/to/facet/packages/mcp/bin/mcp.js", "--registry", "/path/to/facet/registry"]
    }
  }
}
```

## Development

```
node --test
```

License: MIT
