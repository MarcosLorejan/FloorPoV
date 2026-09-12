export type GameEventType =
  | "kill"
  | "death"
  | "manual"
  | "interrupt"
  | "bloodlust"
  | "combatRes"
  | "defensive"
  | "bigHit"
  | "heal"
  | "bossAbility"
  | "crowdControl"
  | "crowdControlBreak"
  | "note";

export interface GameEvent {
  id: string;
  timestamp: number;
  type: GameEventType;
  source?: string;
  target?: string;
  targetKind?: string;
  amount?: number;
  abilityName?: string;
  name?: string;
  note?: string;
}

export interface RecordingImportantEventMetadata {
  timestampSeconds: number;
  logTimestamp?: string;
  eventType: string;
  source?: string;
  target?: string;
  targetKind?: string;
  amount?: number;
  abilityName?: string;
  zoneName?: string;
  encounterName?: string;
  encounterCategory?: string;
  keyLevel?: number;
  name?: string;
}

export interface RecordingEncounterMetadata {
  name: string;
  category: string;
  startedAtSeconds?: number;
  endedAtSeconds?: number;
}

export interface RecordingPlayerMetadata {
  guid: string;
  name?: string;
  className?: string;
  specName?: string;
  specId?: number;
}

export interface RecordingNoteMetadata {
  id: string;
  timestampSeconds: number;
  text: string;
}

export interface RecordingMetadata {
  schemaVersion: number;
  recordingFile: string;
  zoneName?: string;
  encounterName?: string;
  encounterCategory?: string;
  keyLevel?: number;
  encounters?: RecordingEncounterMetadata[];
  importantEvents?: RecordingImportantEventMetadata[];
  importantEventCounts?: Record<string, number>;
  importantEventsDroppedCount?: number;
  players?: RecordingPlayerMetadata[];
  notes?: RecordingNoteMetadata[];
}

export interface CombatEvent {
  timestamp: number;
  eventType: string;
  source?: string;
  target?: string;
  amount?: number;
  abilityName?: string;
  name?: string;
}

export interface CombatTriggerEvent {
  triggerType: "start" | "end";
  mode: "mythicPlus" | "raid" | "pvp";
  eventType: string;
  encounterName?: string;
  keyLevel?: number;
}

export interface CombatWatchStatusEvent {
  level: "info" | "warn" | "error";
  message: string;
  watchedLogPath?: string;
}

export interface ParsedCombatEvent {
  lineNumber: number;
  logTimestamp: string;
  eventType: string;
  source?: string;
  target?: string;
  targetKind?: string;
  abilityName?: string;
  zoneName?: string;
  encounterName?: string;
  encounterCategory?: "mythicPlus" | "raid" | "pvp" | "unknown";
  keyLevel?: number;
}

export interface ParseCombatLogDebugResult {
  filePath: string;
  fileSizeBytes: number;
  totalLines: number;
  parsedEvents: ParsedCombatEvent[];
  eventCounts: Record<string, number>;
  truncated: boolean;
}

export type ImportCombatLogMode = "overwrite" | "merge";

export interface ImportCombatLogResult {
  recordingPath: string;
  mode: ImportCombatLogMode;
  importedEventCount: number;
  totalEventCount: number;
  backupPath?: string | null;
}

export const EVENT_SEEK_OFFSET_SECONDS = 5;
export const MANUAL_MARKER_NAME_MAX_LENGTH = 64;
export const MANUAL_MARKER_TIMESTAMP_EPSILON_SECONDS = 0.05;

/** 0-based index among manual markers in the same timestamp window, matching sidecar order. */
export function manualMarkerOccurrenceIndex(
  events: GameEvent[],
  targetEvent: GameEvent,
): number {
  let occurrence = 0;

  for (const event of events) {
    if (event.type !== "manual") {
      continue;
    }

    if (Math.abs(event.timestamp - targetEvent.timestamp) > MANUAL_MARKER_TIMESTAMP_EPSILON_SECONDS) {
      continue;
    }

    if (event.id === targetEvent.id) {
      return occurrence;
    }

    occurrence += 1;
  }

  return 0;
}

export function normalizeManualMarkerName(value: string | undefined | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const collapsed = value.trim().replace(/\s+/g, " ");
  if (!collapsed) {
    return undefined;
  }

  return Array.from(collapsed).slice(0, MANUAL_MARKER_NAME_MAX_LENGTH).join("");
}

export function getManualMarkerLabel(event: Pick<GameEvent, "name">): string {
  return event.name ?? "Manual marker";
}

export function shouldPromptManualMarkerName(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  return document.visibilityState === "visible" && document.hasFocus();
}

const SUPPORTED_PLAYBACK_EVENT_TYPES = new Set([
  "PARTY_KILL",
  "UNIT_DIED",
  "MANUAL_MARKER",
  "SPELL_INTERRUPT",
  "BLOODLUST",
  "COMBAT_RES",
  "DEFENSIVE",
  "BIG_HIT",
  "HEAL",
  "BOSS_ABILITY",
  "CROWD_CONTROL",
  "CROWD_CONTROL_BREAK",
]);

const NPC_KINDS = new Set(["NPC", "PET", "GUARDIAN", "UNKNOWN"]);
const PLAYER_KINDS = new Set(["PLAYER"]);

function inferTargetKind(target: string | undefined): string | undefined {
  if (!target) return undefined;
  if (target.includes("-")) {
    return "PLAYER";
  }
  return undefined;
}

export function isNpcKind(targetKind: string | undefined, target?: string): boolean {
  const resolvedKind = targetKind ?? inferTargetKind(target);
  if (!resolvedKind) return false;
  return NPC_KINDS.has(resolvedKind);
}

export function isPlayerKind(targetKind: string | undefined, target?: string): boolean {
  const resolvedKind = targetKind ?? inferTargetKind(target);
  if (!resolvedKind) return false;
  return PLAYER_KINDS.has(resolvedKind);
}

function mapEventTypeToGameEventType(eventType: string): GameEventType {
  if (eventType === "PARTY_KILL") {
    return "kill";
  }

  if (eventType === "UNIT_DIED") {
    return "death";
  }

  if (eventType === "SPELL_INTERRUPT") {
    return "interrupt";
  }

  if (eventType === "BLOODLUST") {
    return "bloodlust";
  }

  if (eventType === "COMBAT_RES") {
    return "combatRes";
  }

  if (eventType === "DEFENSIVE") {
    return "defensive";
  }

  if (eventType === "BIG_HIT") {
    return "bigHit";
  }

  if (eventType === "HEAL") {
    return "heal";
  }

  if (eventType === "BOSS_ABILITY") {
    return "bossAbility";
  }

  if (eventType === "CROWD_CONTROL") {
    return "crowdControl";
  }

  if (eventType === "CROWD_CONTROL_BREAK") {
    return "crowdControlBreak";
  }

  return "manual";
}

export function convertRecordingNoteToGameEvent(note: RecordingNoteMetadata): GameEvent | null {
  if (!note.id.trim()) {
    return null;
  }

  if (!Number.isFinite(note.timestampSeconds) || note.timestampSeconds < 0) {
    return null;
  }

  const text = note.text.trim();
  if (!text) {
    return null;
  }

  return {
    id: note.id,
    timestamp: note.timestampSeconds,
    type: "note",
    note: text,
  };
}

export function isCrowdControlEventType(type: GameEventType): boolean {
  return type === "crowdControl" || type === "crowdControlBreak";
}

const DUPLICATE_EVENT_WINDOW_SECONDS = 2;

// Crowd control reapplies and multi-target casts land as separate log lines, so the
// window is wider than for cooldown usages to keep one entry per lockdown.
const CROWD_CONTROL_DUPLICATE_WINDOW_SECONDS = 3;

function isDeduplicatedEventType(type: GameEventType): boolean {
  return (
    type === "bloodlust" ||
    type === "combatRes" ||
    type === "defensive" ||
    type === "bossAbility" ||
    isCrowdControlEventType(type)
  );
}

function isDuplicateOfEvent(existingEvent: GameEvent, event: GameEvent): boolean {
  if (existingEvent.type !== event.type) {
    return false;
  }

  if (isCrowdControlEventType(event.type)) {
    return (
      Math.abs(existingEvent.timestamp - event.timestamp) <
        CROWD_CONTROL_DUPLICATE_WINDOW_SECONDS &&
      existingEvent.target === event.target &&
      existingEvent.abilityName === event.abilityName
    );
  }

  if (event.type === "defensive" || event.type === "bossAbility") {
    return (
      Math.abs(existingEvent.timestamp - event.timestamp) < DUPLICATE_EVENT_WINDOW_SECONDS &&
      existingEvent.source === event.source &&
      existingEvent.abilityName === event.abilityName
    );
  }

  return (
    Math.abs(existingEvent.timestamp - event.timestamp) < DUPLICATE_EVENT_WINDOW_SECONDS &&
    existingEvent.source === event.source
  );
}

export function convertRecordingMetadataToGameEvents(
  metadata: RecordingMetadata | null,
): GameEvent[] {
  const combatEvents = (metadata?.importantEvents ?? [])
    .flatMap((importantEvent, index) => {
      if (!SUPPORTED_PLAYBACK_EVENT_TYPES.has(importantEvent.eventType)) {
        return [];
      }

      if (!Number.isFinite(importantEvent.timestampSeconds) || importantEvent.timestampSeconds < 0) {
        return [];
      }

      return [{
        id: `${importantEvent.eventType}-${importantEvent.timestampSeconds}-${index}`,
        timestamp: importantEvent.timestampSeconds,
        type: mapEventTypeToGameEventType(importantEvent.eventType),
        source: importantEvent.source,
        target: importantEvent.target,
        targetKind: importantEvent.targetKind,
        amount: importantEvent.amount,
        abilityName: importantEvent.abilityName,
        name: normalizeManualMarkerName(importantEvent.name),
      }];
    })
    .sort((a, b) => a.timestamp - b.timestamp)
    .reduce<GameEvent[]>((uniqueEvents, event) => {
      if (!isDeduplicatedEventType(event.type)) {
        uniqueEvents.push(event);
        return uniqueEvents;
      }

      const hasNearbyDuplicate = uniqueEvents.some((existingEvent) => {
        return isDuplicateOfEvent(existingEvent, event);
      });

      if (!hasNearbyDuplicate) {
        uniqueEvents.push(event);
      }

      return uniqueEvents;
    }, []);

  const noteEvents = (metadata?.notes ?? []).flatMap((note) => {
    const gameEvent = convertRecordingNoteToGameEvent(note);
    return gameEvent ? [gameEvent] : [];
  });

  return [...combatEvents, ...noteEvents].sort((left, right) => left.timestamp - right.timestamp);
}

export function recordingMetadataHasCombatContent(metadata: RecordingMetadata | null): boolean {
  if (!metadata) {
    return false;
  }

  return Boolean(
    metadata.zoneName ||
      metadata.encounterName ||
      metadata.encounterCategory ||
      metadata.keyLevel ||
      metadata.encounters?.length ||
      metadata.importantEvents?.length ||
      metadata.players?.length ||
      metadata.importantEventsDroppedCount,
  );
}

export function isVideoSeekBarEvent(event: GameEvent): boolean {
  return (
    event.type === "death" ||
    event.type === "manual" ||
    event.type === "interrupt" ||
    event.type === "bloodlust" ||
    event.type === "combatRes" ||
    event.type === "defensive" ||
    event.type === "bigHit" ||
    event.type === "heal" ||
    event.type === "bossAbility" ||
    isCrowdControlEventType(event.type) ||
    event.type === "note"
  );
}

export function shouldShowGameEvent(
  event: GameEvent,
  hideNpcEvents: boolean,
  eventTypeVisibility: Record<GameEventType, boolean>,
): boolean {
  if (!eventTypeVisibility[event.type]) {
    return false;
  }

  // These types are useful even when the dest unit is an NPC or the caster themselves.
  if (
    event.type === "interrupt" ||
    event.type === "bloodlust" ||
    event.type === "combatRes" ||
    event.type === "defensive" ||
    event.type === "bigHit" ||
    event.type === "heal" ||
    event.type === "bossAbility" ||
    event.type === "note"
  ) {
    return true;
  }

  // The backend only records crowd control landing on players, so the NPC filter would
  // only ever drop entries whose target kind failed to resolve.
  if (isCrowdControlEventType(event.type)) {
    return true;
  }

  if (!hideNpcEvents) {
    return true;
  }

  return !isNpcKind(event.targetKind, event.target);
}

// Live events arrive one at a time and two markers can share a timestamp, so ids need a
// sequence to stay unique. Renaming a marker targets the event by id, not by timestamp.
let liveEventSequence = 0;

export function convertCombatEvent(combatEvent: CombatEvent): GameEvent {
  const type = mapEventTypeToGameEventType(combatEvent.eventType);
  liveEventSequence += 1;
  const identity = [combatEvent.source, combatEvent.target, combatEvent.abilityName]
    .filter(Boolean)
    .join("-");

  return {
    id: identity
      ? `${combatEvent.eventType}-${combatEvent.timestamp}-live-${liveEventSequence}-${identity}`
      : `${combatEvent.eventType}-${combatEvent.timestamp}-live-${liveEventSequence}`,
    timestamp: combatEvent.timestamp,
    type,
    source: combatEvent.source,
    target: combatEvent.target,
    amount: combatEvent.amount,
    abilityName: combatEvent.abilityName,
    name: normalizeManualMarkerName(combatEvent.name),
  };
}
