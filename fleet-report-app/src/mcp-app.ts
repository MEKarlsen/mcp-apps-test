/**
 * @file Fleet weekly report MCP App — charts + analysis over fleet utilization data.
 */
import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { FleetAnalysis } from "../fleet-data.js";
import { renderBarChart } from "./charts.js";
import { renderHarborMap } from "./map.js";
import "./global.css";
import "./mcp-app.css";

const mainEl = document.querySelector(".main") as HTMLElement;
const summaryEl = document.getElementById("summary-text")!;
const statTilesEl = document.getElementById("stat-tiles")!;
const hoursChartEl = document.getElementById("hours-chart")!;
const harborMapEl = document.getElementById("harbor-map")!;

function statTile(label: string, value: string): HTMLElement {
  const tile = document.createElement("div");
  tile.className = "stat-tile";
  const labelEl = document.createElement("span");
  labelEl.className = "stat-tile__label";
  labelEl.textContent = label;
  const valueEl = document.createElement("span");
  valueEl.className = "stat-tile__value";
  valueEl.textContent = value;
  tile.append(labelEl, valueEl);
  return tile;
}

function renderReport(analysis: FleetAnalysis) {
  summaryEl.textContent = analysis.summary;

  const inUse = analysis.byStatus.find((s) => s.status === "In Use")?.count ?? 0;

  statTilesEl.replaceChildren(
    statTile("Total boats", String(analysis.totalBoats)),
    statTile("In use", String(inUse)),
    statTile("Avg. hours/boat", analysis.avgHours.toFixed(1)),
  );

  renderBarChart(
    hoursChartEl,
    analysis.hoursByBoat.map((b) => ({ label: b.boatName, value: b.hours })),
    "h",
  );

  renderHarborMap(harborMapEl, analysis.boats);
}

function handleHostContextChanged(ctx: McpUiHostContext) {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
  if (ctx.styles?.css?.fonts) {
    applyHostFonts(ctx.styles.css.fonts);
  }
  if (ctx.safeAreaInsets) {
    mainEl.style.paddingTop = `${ctx.safeAreaInsets.top}px`;
    mainEl.style.paddingRight = `${ctx.safeAreaInsets.right}px`;
    mainEl.style.paddingBottom = `${ctx.safeAreaInsets.bottom}px`;
    mainEl.style.paddingLeft = `${ctx.safeAreaInsets.left}px`;
  }
}

// 1. Create app instance
const app = new App({ name: "Fleet Weekly Report App", version: "1.0.0" });

// 2. Register handlers BEFORE connecting
app.onteardown = async () => {
  return {};
};

app.ontoolresult = (result: CallToolResult) => {
  const analysis = result.structuredContent as FleetAnalysis | undefined;
  if (analysis) {
    renderReport(analysis);
  } else {
    summaryEl.textContent = "No fleet data returned.";
  }
};

app.onerror = console.error;

app.onhostcontextchanged = handleHostContextChanged;

// 3. Connect to host
app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) {
    handleHostContextChanged(ctx);
  }
});
