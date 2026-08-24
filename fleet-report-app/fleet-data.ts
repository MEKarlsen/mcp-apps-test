import ExcelJS from "exceljs";

export interface BoatRow {
  boatName: string;
  type: string;
  berth: string;
  status: string;
  assignedTo: string | null;
  hoursThisMonth: number;
  lastUsed: string;
  fuelPercent: number;
  lat: number;
  lon: number;
  destLat: number | null;
  destLon: number | null;
}

export interface FleetAnalysis {
  boats: BoatRow[];
  totalBoats: number;
  totalHours: number;
  avgHours: number;
  byStatus: { status: string; count: number }[];
  byType: { type: string; count: number; avgHours: number; totalHours: number }[];
  hoursByBoat: { boatName: string; hours: number; status: string }[];
  attention: {
    lowFuel: { boatName: string; fuelPercent: number }[];
    idleTooLong: { boatName: string; daysSinceUsed: number }[];
    maintenance: { boatName: string; daysSinceUsed: number }[];
  };
  summary: string;
}

// Fixed display order — categorical color assignment must stay stable
// regardless of how many boats fall into each bucket.
const STATUS_ORDER = ["In Use", "Reserved", "Idle", "Maintenance"];
const TYPE_ORDER = ["Yacht", "Catamaran", "Speedboat", "RIB", "Tender"];

const LOW_FUEL_THRESHOLD = 30;
const IDLE_TOO_LONG_DAYS = 14;

function daysSince(dateStr: string, now: Date): number {
  const then = new Date(dateStr);
  return Math.round((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

export async function loadFleetRows(xlsxPath: string): Promise<BoatRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const sheet = workbook.worksheets[0];

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: BoatRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (name: string): unknown => {
      const idx = headers.indexOf(name);
      return idx === -1 ? undefined : row.getCell(idx).value;
    };
    const boatName = String(get("Boat Name") ?? "").trim();
    if (!boatName) return;

    const lastUsedRaw = get("Last Used");
    const lastUsed = lastUsedRaw instanceof Date
      ? lastUsedRaw.toISOString().slice(0, 10)
      : String(lastUsedRaw ?? "");

    rows.push({
      boatName,
      type: String(get("Type") ?? "").trim(),
      berth: String(get("Berth") ?? "").trim(),
      status: String(get("Status") ?? "").trim(),
      assignedTo: get("Assigned To") ? String(get("Assigned To")) : null,
      hoursThisMonth: Number(get("Hours This Month") ?? 0),
      lastUsed,
      fuelPercent: Number(get("Fuel %") ?? 0),
      lat: Number(get("Latitude") ?? 0),
      lon: Number(get("Longitude") ?? 0),
      destLat: get("Destination Latitude") != null ? Number(get("Destination Latitude")) : null,
      destLon: get("Destination Longitude") != null ? Number(get("Destination Longitude")) : null,
    });
  });

  return rows;
}

export function analyzeFleet(boats: BoatRow[], now: Date = new Date()): FleetAnalysis {
  const totalBoats = boats.length;
  const totalHours = boats.reduce((sum, b) => sum + b.hoursThisMonth, 0);
  const avgHours = totalBoats ? totalHours / totalBoats : 0;

  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    count: boats.filter((b) => b.status === status).length,
  })).filter((s) => s.count > 0);

  const byType = TYPE_ORDER.map((type) => {
    const inType = boats.filter((b) => b.type === type);
    const total = inType.reduce((sum, b) => sum + b.hoursThisMonth, 0);
    return {
      type,
      count: inType.length,
      totalHours: total,
      avgHours: inType.length ? total / inType.length : 0,
    };
  }).filter((t) => t.count > 0);

  const hoursByBoat = [...boats]
    .sort((a, b) => b.hoursThisMonth - a.hoursThisMonth)
    .map((b) => ({ boatName: b.boatName, hours: b.hoursThisMonth, status: b.status }));

  const lowFuel = boats
    .filter((b) => b.fuelPercent < LOW_FUEL_THRESHOLD)
    .map((b) => ({ boatName: b.boatName, fuelPercent: b.fuelPercent }))
    .sort((a, b) => a.fuelPercent - b.fuelPercent);

  const idleTooLong = boats
    .filter((b) => b.status === "Idle" && daysSince(b.lastUsed, now) >= IDLE_TOO_LONG_DAYS)
    .map((b) => ({ boatName: b.boatName, daysSinceUsed: daysSince(b.lastUsed, now) }))
    .sort((a, b) => b.daysSinceUsed - a.daysSinceUsed);

  const maintenance = boats
    .filter((b) => b.status === "Maintenance")
    .map((b) => ({ boatName: b.boatName, daysSinceUsed: daysSince(b.lastUsed, now) }))
    .sort((a, b) => b.daysSinceUsed - a.daysSinceUsed);

  const inUseCount = byStatus.find((s) => s.status === "In Use")?.count ?? 0;
  const topPerformer = hoursByBoat[0];
  const busiestType = [...byType].sort((a, b) => b.avgHours - a.avgHours)[0];
  const quietestType = [...byType].sort((a, b) => a.avgHours - b.avgHours)[0];

  const summaryParts: string[] = [];
  summaryParts.push(
    `${totalBoats} boats in the fleet, ${inUseCount} currently in use (${Math.round((inUseCount / totalBoats) * 100)}%). ` +
    `Average utilization this month is ${avgHours.toFixed(1)} hours per boat.`
  );
  if (topPerformer) {
    summaryParts.push(`${topPerformer.boatName} leads the fleet with ${topPerformer.hours} hours logged.`);
  }
  if (busiestType && quietestType && busiestType.type !== quietestType.type) {
    summaryParts.push(
      `${busiestType.type}s are the most utilized type (avg ${busiestType.avgHours.toFixed(1)}h), ` +
      `while ${quietestType.type}s see the least use (avg ${quietestType.avgHours.toFixed(1)}h).`
    );
  }
  const attentionCount = lowFuel.length + idleTooLong.length + maintenance.length;
  if (attentionCount > 0) {
    const bits: string[] = [];
    if (lowFuel.length) bits.push(`${lowFuel.length} boat${lowFuel.length > 1 ? "s" : ""} low on fuel`);
    if (idleTooLong.length) bits.push(`${idleTooLong.length} idle ${idleTooLong.length > 1 ? "boats" : "boat"} unused ${IDLE_TOO_LONG_DAYS}+ days`);
    if (maintenance.length) bits.push(`${maintenance.length} in maintenance`);
    summaryParts.push(`Needs attention: ${bits.join(", ")}.`);
  } else {
    summaryParts.push("No boats currently flagged for attention.");
  }

  return {
    boats,
    totalBoats,
    totalHours,
    avgHours,
    byStatus,
    byType,
    hoursByBoat,
    attention: { lowFuel, idleTooLong, maintenance },
    summary: summaryParts.join(" "),
  };
}
