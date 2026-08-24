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
import { renderBarChart, statusColor, typeColor } from "./charts.js";
import "./global.css";
import "./mcp-app.css";

const mainEl = document.querySelector(".main") as HTMLElement;
const summaryEl = document.getElementById("summary-text")!;
const statTilesEl = document.getElementById("stat-tiles")!;
const hoursChartEl = document.getElementById("hours-chart")!;
const statusChartEl = document.getElementById("status-chart")!;
const typeChartEl = document.getElementById("type-chart")!;
const attentionListEl = document.getElementById("attention-list")!;

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

function attentionItem(boatName: string, detail: string, badge: "critical" | "warning", badgeText: string): HTMLElement {
  const item = document.createElement("li");
  item.className = "attention-item";

  const badgeEl = document.createElement("span");
  badgeEl.className = `attention-badge attention-badge--${badge}`;
  badgeEl.textContent = badgeText;

  const boatEl = document.createElement("span");
  boatEl.className = "attention-item__boat";
  boatEl.textContent = boatName;

  const detailEl = document.createElement("span");
  detailEl.className = "attention-item__detail";
  detailEl.textContent = detail;

  item.append(badgeEl, boatEl, detailEl);
  return item;
}

function renderReport(analysis: FleetAnalysis) {
  summaryEl.textContent = analysis.summary;

  const inUse = analysis.byStatus.find((s) => s.status === "In Use")?.count ?? 0;
  const needsAttention = analysis.attention.lowFuel.length
    + analysis.attention.idleTooLong.length
    + analysis.attention.maintenance.length;

  statTilesEl.replaceChildren(
    statTile("Total boats", String(analysis.totalBoats)),
    statTile("In use", String(inUse)),
    statTile("Avg. hours/boat", analysis.avgHours.toFixed(1)),
    statTile("Needs attention", String(needsAttention)),
  );

  renderBarChart(
    hoursChartEl,
    analysis.hoursByBoat.map((b) => ({ label: b.boatName, value: b.hours })),
    "h",
  );

  renderBarChart(
    statusChartEl,
    analysis.byStatus.map((s) => ({
      label: s.status,
      value: s.count,
      color: statusColor(s.status),
      tooltip: `${s.status}: ${s.count} boat${s.count === 1 ? "" : "s"}`,
    })),
    "",
  );

  renderBarChart(
    typeChartEl,
    analysis.byType.map((t) => ({
      label: t.type,
      value: Math.round(t.avgHours * 10) / 10,
      color: typeColor(t.type),
      tooltip: `${t.type}: avg ${t.avgHours.toFixed(1)}h across ${t.count} boat${t.count === 1 ? "" : "s"}`,
    })),
    "h",
  );

  const items: HTMLElement[] = [];
  for (const m of analysis.attention.maintenance) {
    items.push(attentionItem(m.boatName, `In maintenance — last used ${m.daysSinceUsed}d ago`, "critical", "Maintenance"));
  }
  for (const f of analysis.attention.lowFuel) {
    items.push(attentionItem(f.boatName, `Fuel at ${f.fuelPercent}%`, "critical", "Low fuel"));
  }
  for (const i of analysis.attention.idleTooLong) {
    items.push(attentionItem(i.boatName, `Unused for ${i.daysSinceUsed} days`, "warning", "Idle"));
  }

  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "attention-empty";
    empty.textContent = "No boats currently flagged for attention.";
    attentionListEl.replaceChildren(empty);
  } else {
    attentionListEl.replaceChildren(...items);
  }
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
