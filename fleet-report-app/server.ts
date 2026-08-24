import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { analyzeFleet, loadFleetRows } from "./fleet-data.js";

// Works both from source (server.ts) and compiled (dist/server.js)
const PROJECT_ROOT = import.meta.dirname;
const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(PROJECT_ROOT, "dist")
  : PROJECT_ROOT;

const DATA_PATH = path.join(PROJECT_ROOT, "data", "fleet_utilization.xlsx");

/**
 * Creates a new MCP server instance with tools and resources registered.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "Fleet Utilization MCP App Server",
    version: "1.0.0",
  });

  const resourceUri = "ui://fleet-report/mcp-app.html";

  registerAppTool(server,
    "get-fleet-report",
    {
      title: "Fleet Weekly Report",
      description: "Displays an interactive dashboard analyzing current fleet utilization: hours logged per boat, and a harbor map showing each boat's location and status.",
      inputSchema: {},
      _meta: { ui: { resourceUri } },
    },
    async (): Promise<CallToolResult> => {
      const rows = await loadFleetRows(DATA_PATH);
      const analysis = analyzeFleet(rows);
      return {
        content: [{ type: "text", text: analysis.summary }],
        structuredContent: { ...analysis },
      };
    },
  );

  registerAppResource(server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8");

      return {
        contents: [
          { uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html },
        ],
      };
    },
  );

  return server;
}
