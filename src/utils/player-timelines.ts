import type { GameEvent, RecordingPlayerMetadata } from "../types/events";
import { formatUnitName } from "./format";

const PLAYER_ACTION_TYPE_NAMES = new Set<string>([
  "interrupt",
  "dispel",
  "defensive",
  "crowdControl",
]);

export interface PlayerTimelineLane {
  id: string;
  displayName: string;
  className?: string;
  events: GameEvent[];
}

export function isPlayerActionEvent(event: GameEvent): boolean {
  return PLAYER_ACTION_TYPE_NAMES.has(event.type);
}

export function buildPlayerActionLanes(
  players: RecordingPlayerMetadata[],
  events: GameEvent[],
): PlayerTimelineLane[] {
  const actionEvents = events.filter(isPlayerActionEvent);
  const rosterLanes: PlayerTimelineLane[] = [];
  const rosterLanesByActorKey = new Map<string, PlayerTimelineLane>();

  for (const player of players) {
    const lane: PlayerTimelineLane = {
      id: player.guid,
      displayName: getPlayerDisplayName(player),
      className: player.className,
      events: [],
    };
    rosterLanes.push(lane);

    const actorKey = normalizeActorKey(player.name);
    if (actorKey && !rosterLanesByActorKey.has(actorKey)) {
      rosterLanesByActorKey.set(actorKey, lane);
    }
  }

  const unmatchedLanesByActorKey = new Map<string, PlayerTimelineLane>();

  for (const event of actionEvents) {
    const actorKey = normalizeActorKey(event.source);
    if (!actorKey) {
      continue;
    }

    const rosterLane = rosterLanesByActorKey.get(actorKey);
    if (rosterLane) {
      rosterLane.events.push(event);
      continue;
    }

    const existingLane = unmatchedLanesByActorKey.get(actorKey);
    if (existingLane) {
      existingLane.events.push(event);
      continue;
    }

    unmatchedLanesByActorKey.set(actorKey, {
      id: `source:${actorKey}`,
      displayName: formatUnitName(event.source),
      events: [event],
    });
  }

  rosterLanes.sort((left, right) => left.displayName.localeCompare(right.displayName));
  const unmatchedLanes = [...unmatchedLanesByActorKey.values()].sort((left, right) => {
    return left.displayName.localeCompare(right.displayName);
  });

  return [...rosterLanes, ...unmatchedLanes];
}

function normalizeActorKey(name?: string): string | null {
  const formattedName = formatUnitName(name);
  if (formattedName === "Unknown") {
    return null;
  }

  return formattedName.toLowerCase();
}

function getPlayerDisplayName(player: RecordingPlayerMetadata): string {
  const formattedName = formatUnitName(player.name);
  if (formattedName !== "Unknown") {
    return formattedName;
  }

  if (player.guid.length > 24) {
    return `${player.guid.slice(0, 24)}...`;
  }

  return player.guid || "Unknown";
}
