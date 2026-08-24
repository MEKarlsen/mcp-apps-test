const STATUS_COLOR_VAR: Record<string, string> = {
  "In Use": "var(--viz-cat-1)",
  "Reserved": "var(--viz-cat-2)",
  "Idle": "var(--viz-cat-3)",
  "Maintenance": "var(--viz-cat-4)",
};

export function statusColor(status: string): string {
  return STATUS_COLOR_VAR[status] ?? "var(--viz-muted)";
}

export interface BarRow {
  label: string;
  value: number;
  color?: string;
  tooltip?: string;
}

const tooltipEl = document.getElementById("tooltip") as HTMLDivElement;

function showTooltip(target: HTMLElement, text: string) {
  const rect = target.getBoundingClientRect();
  tooltipEl.textContent = text;
  tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
  tooltipEl.style.top = `${rect.top}px`;
  tooltipEl.hidden = false;
}

function hideTooltip() {
  tooltipEl.hidden = true;
}

/**
 * Renders a horizontal bar list: label | track+fill | value.
 * Bars share one baseline; the fill's width is proportional to `maxValue`.
 */
export function renderBarChart(container: HTMLElement, rows: BarRow[], unit = "h"): void {
  container.replaceChildren();
  const maxValue = Math.max(1, ...rows.map((r) => r.value));

  for (const row of rows) {
    const rowEl = document.createElement("div");
    rowEl.className = "bar-row";

    const labelEl = document.createElement("span");
    labelEl.className = "bar-row__label";
    labelEl.textContent = row.label;

    const trackEl = document.createElement("div");
    trackEl.className = "bar-row__track";

    const fillEl = document.createElement("div");
    fillEl.className = "bar-row__fill";
    fillEl.style.width = `${Math.max(2, (row.value / maxValue) * 100)}%`;
    if (row.color) fillEl.style.setProperty("--bar-color", row.color);
    fillEl.tabIndex = 0;
    const tooltipText = row.tooltip ?? `${row.label}: ${row.value}${unit}`;
    fillEl.addEventListener("pointerenter", () => showTooltip(fillEl, tooltipText));
    fillEl.addEventListener("pointerleave", hideTooltip);
    fillEl.addEventListener("focus", () => showTooltip(fillEl, tooltipText));
    fillEl.addEventListener("blur", hideTooltip);
    trackEl.appendChild(fillEl);

    const valueEl = document.createElement("span");
    valueEl.className = "bar-row__value";
    valueEl.textContent = `${row.value}${unit}`;

    rowEl.append(labelEl, trackEl, valueEl);
    container.appendChild(rowEl);
  }
}
