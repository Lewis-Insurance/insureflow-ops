// lewis-crm MCP server entrypoint. Runs over stdio so each Hermes profile can
// register it. stdout is the MCP channel — all logging goes to stderr.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.ts";
import { config } from "./config.ts";

const server = new McpServer({ name: "lewis-crm", version: "1.0.0" });
registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`[lewis-crm] ready — profile "${config.profile}" acting as ${config.employeeEmail}\n`);
