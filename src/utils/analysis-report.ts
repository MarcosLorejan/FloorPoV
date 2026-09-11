import {
  RecordingMetadata,
  RecordingEncounterMetadata,
  RecordingImportantEventMetadata,
  RecordingPlayerMetadata,
} from "../types/events";
import {
  formatDate,
  formatEncounterCategory,
  formatTime,
  getEventTypeLabel,
} from "./format";

export const ANALYSIS_REPORT_SCHEMA_VERSION = 2;

export type AnalysisReportFormat = "md" | "json";

export interface AnalysisReportPayload {
  schemaVersion: number;
  recordingFile: string;
  zoneName?: string;
  encounterName?: string;
  encounterCategory?: string;
  keyLevel?: number;
  encounters: RecordingEncounterMetadata[];
  importantEvents: RecordingImportantEventMetadata[];
  importantEventCounts: Record<string, number>;
  importantEventsDroppedCount: number;
  players: RecordingPlayerMetadata[];
  capturedAtUnix?: number;
}

export function recordingFileStem(recordingFile: string): string {
  const baseName = recordingFile.replace(/^.*[/\\]/, "").trim();
  const withoutExtension = baseName.replace(/\.mp4$/i, "");
  return withoutExtension || "recording";
}

export function suggestedAnalysisReportFilename(
  recordingFile: string,
  extension: AnalysisReportFormat = "md",
): string {
  return `${recordingFileStem(recordingFile)}-analysis.${extension}`;
}

export function resolveAnalysisReportFormat(destinationPath: string): AnalysisReportFormat {
  if (/\.json$/i.test(destinationPath)) {
    return "json";
  }

  return "md";
}

export function ensureAnalysisReportDestination(destinationPath: string): string {
  const trimmedPath = destinationPath.trim();
  if (/\.(md|json)$/i.test(trimmedPath)) {
    return trimmedPath;
  }

  return `${trimmedPath}.md`;
}

export function buildAnalysisReportPayload(
  metadata: RecordingMetadata | null,
  recordingFile: string,
): AnalysisReportPayload {
  return {
    schemaVersion: metadata?.schemaVersion ?? ANALYSIS_REPORT_SCHEMA_VERSION,
    recordingFile: metadata?.recordingFile ?? recordingFile,
    zoneName: metadata?.zoneName,
    encounterName: metadata?.encounterName,
    encounterCategory: metadata?.encounterCategory,
    keyLevel: metadata?.keyLevel,
    encounters: metadata?.encounters ?? [],
    importantEvents: metadata?.importantEvents ?? [],
    importantEventCounts: metadata?.importantEventCounts ?? {},
    importantEventsDroppedCount: metadata?.importantEventsDroppedCount ?? 0,
    players: metadata?.players ?? [],
    capturedAtUnix: metadata?.capturedAtUnix,
  };
}

export function buildAnalysisReportJson(
  metadata: RecordingMetadata | null,
  recordingFile: string,
): string {
  return `${JSON.stringify(buildAnalysisReportPayload(metadata, recordingFile), null, 2)}\n`;
}

export function buildAnalysisReportMarkdown(
  metadata: RecordingMetadata | null,
  recordingFile: string,
): string {
  const report = buildAnalysisReportPayload(metadata, recordingFile);
  const lines: string[] = [
    `# Analysis Report`,
    ``,
    `This export is a FloorPoV metadata snapshot. Use WarcraftLogs for a full combat report.`,
    ``,
    `## Recording`,
    ``,
    `- File: ${report.recordingFile}`,
    `- Zone: ${formatOptionalText(report.zoneName)}`,
    `- Encounter: ${formatOptionalText(report.encounterName)}`,
    `- Category: ${formatEncounterCategory(report.encounterCategory)}`,
    `- Key level: ${formatKeyLevel(report.keyLevel)}`,
  ];

  if (typeof report.capturedAtUnix === "number") {
    lines.push(`- Captured: ${formatDate(report.capturedAtUnix)}`);
  }

  lines.push(``, `## Players`, ``);
  appendMarkdownTable(
    lines,
    ["Name", "Class", "Spec"],
    report.players.map((player) => [
      formatPlayerName(player),
      formatOptionalText(player.className),
      formatOptionalText(player.specName),
    ]),
  );

  lines.push(``, `## Encounters`, ``);
  appendMarkdownTable(
    lines,
    ["Name", "Category", "Start", "End"],
    report.encounters.map((encounter) => [
      encounter.name,
      formatEncounterCategory(encounter.category),
      formatOptionalSeconds(encounter.startedAtSeconds),
      formatOptionalSeconds(encounter.endedAtSeconds),
    ]),
  );

  const sortedEventCounts = Object.entries(report.importantEventCounts).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  });

  lines.push(``, `## Event Counts`, ``);
  if (sortedEventCounts.length === 0) {
    lines.push(`None recorded.`);
  } else {
    for (const [eventType, count] of sortedEventCounts) {
      lines.push(`- ${getEventTypeLabel(eventType)}: ${count}`);
    }
  }

  if (report.importantEventsDroppedCount > 0) {
    lines.push(
      ``,
      `${report.importantEventsDroppedCount} high-volume events were dropped during buffering.`,
    );
  }

  lines.push(``, `## Important Events`, ``);
  appendMarkdownTable(
    lines,
    ["Time", "Event", "Source", "Target", "Encounter"],
    report.importantEvents.map((event) => [
      formatTime(event.timestampSeconds),
      getEventTypeLabel(event.eventType),
      formatOptionalText(event.source),
      formatOptionalText(event.target),
      formatOptionalText(event.encounterName),
    ]),
  );

  lines.push(``);
  return lines.join("\n");
}

export function buildAnalysisReportContents(
  destinationPath: string,
  metadata: RecordingMetadata | null,
  recordingFile: string,
): string {
  if (resolveAnalysisReportFormat(destinationPath) === "json") {
    return buildAnalysisReportJson(metadata, recordingFile);
  }

  return buildAnalysisReportMarkdown(metadata, recordingFile);
}

function formatOptionalText(value: string | undefined): string {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : "—";
}

function formatKeyLevel(keyLevel: number | undefined): string {
  return typeof keyLevel === "number" ? `+${keyLevel}` : "—";
}

function formatOptionalSeconds(value: number | undefined): string {
  return typeof value === "number" ? formatTime(value) : "—";
}

function formatPlayerName(player: RecordingPlayerMetadata): string {
  const trimmedName = player.name?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  return player.guid || "—";
}

function appendMarkdownTable(
  lines: string[],
  headers: string[],
  rows: string[][],
): void {
  if (rows.length === 0) {
    lines.push(`None recorded.`);
    return;
  }

  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

  for (const row of rows) {
    lines.push(`| ${row.map(escapeMarkdownTableCell).join(" | ")} |`);
  }
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
