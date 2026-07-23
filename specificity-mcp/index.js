#!/usr/bin/env node
// specificity-mcp — MCP server exposing the developer profile as tools
//
// Hosts that can only receive context via tools (no hooks) can query the
// profile on-demand. Also provides structured access for any agent that
// prefers tool calls over raw context injection.
//
// Tool definitions and dispatch live in ./lib/tools.js (transport-free, so the
// trust-boundary logic is unit-testable); this file is just the stdio wiring.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import { TOOLS, callTool } from "./lib/tools.js";

const { version } = JSON.parse(
  fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")
);

const server = new Server(
  { name: "specificity-mcp", version },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  callTool(request.params.name, request.params.arguments || {})
);

const transport = new StdioServerTransport();
await server.connect(transport);
