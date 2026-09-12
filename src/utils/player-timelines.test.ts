import { describe, expect, test } from "bun:test";
import type { GameEvent, RecordingPlayerMetadata } from "../types/events";
import { buildPlayerActionLanes, isPlayerActionEvent } from "./player-timelines";

function createEvent(overrides: Partial<GameEvent> & Pick<GameEvent, "id" | "type">): GameEvent {
  return {
    timestamp: 10,
    ...overrides,
  };
}

function createPlayer(
  overrides: Partial<RecordingPlayerMetadata> & Pick<RecordingPlayerMetadata, "guid">,
): RecordingPlayerMetadata {
  return {
    ...overrides,
  };
}

describe("isPlayerActionEvent", () => {
  test("treats interrupts as player actions", () => {
    expect(isPlayerActionEvent(createEvent({ id: "kick", type: "interrupt" }))).toBe(true);
  });

  test("accepts defensive, dispel, and crowd-control types when those land", () => {
    expect(isPlayerActionEvent(createEvent({ id: "dispel", type: "dispel" as GameEvent["type"] }))).toBe(
      true,
    );
    expect(
      isPlayerActionEvent(createEvent({ id: "defensive", type: "defensive" as GameEvent["type"] })),
    ).toBe(true);
    expect(
      isPlayerActionEvent(createEvent({ id: "cc", type: "crowdControl" as GameEvent["type"] })),
    ).toBe(true);
  });

  test("ignores deaths, kills, markers, bloodlust, and combat res", () => {
    expect(isPlayerActionEvent(createEvent({ id: "death", type: "death" }))).toBe(false);
    expect(isPlayerActionEvent(createEvent({ id: "kill", type: "kill" }))).toBe(false);
    expect(isPlayerActionEvent(createEvent({ id: "manual", type: "manual" }))).toBe(false);
    expect(isPlayerActionEvent(createEvent({ id: "lust", type: "bloodlust" }))).toBe(false);
    expect(isPlayerActionEvent(createEvent({ id: "bres", type: "combatRes" }))).toBe(false);
  });
});

describe("buildPlayerActionLanes", () => {
  test("creates one lane per roster player even when nobody acted", () => {
    const lanes = buildPlayerActionLanes(
      [
        createPlayer({ guid: "Player-1", name: "Tank-NA", className: "Warrior" }),
        createPlayer({ guid: "Player-2", name: "Healer-NA", className: "Priest" }),
      ],
      [createEvent({ id: "death-1", type: "death", target: "Tank-NA" })],
    );

    expect(lanes).toHaveLength(2);
    expect(lanes.map((lane) => lane.displayName)).toEqual(["Healer", "Tank"]);
    expect(lanes.every((lane) => lane.events.length === 0)).toBe(true);
  });

  test("assigns interrupts to the matching roster player by source name", () => {
    const lanes = buildPlayerActionLanes(
      [
        createPlayer({ guid: "Player-1", name: "Kicker-NA" }),
        createPlayer({ guid: "Player-2", name: "Idle-NA" }),
      ],
      [
        createEvent({
          id: "kick-1",
          type: "interrupt",
          timestamp: 12,
          source: "Kicker-NA",
          target: "Boss",
        }),
      ],
    );

    expect(lanes).toHaveLength(2);
    const kickerLane = lanes.find((lane) => lane.displayName === "Kicker");
    const idleLane = lanes.find((lane) => lane.displayName === "Idle");
    expect(kickerLane?.events.map((event) => event.id)).toEqual(["kick-1"]);
    expect(idleLane?.events).toEqual([]);
  });

  test("matches realm-qualified and bare names case-insensitively", () => {
    const lanes = buildPlayerActionLanes(
      [createPlayer({ guid: "Player-1", name: "Kicker-NA" })],
      [createEvent({ id: "kick-1", type: "interrupt", source: "kicker" })],
    );

    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.events).toHaveLength(1);
  });

  test("keeps unnamed roster players as readable lanes", () => {
    const lanes = buildPlayerActionLanes(
      [createPlayer({ guid: "Player-1111-0000000000000001" })],
      [],
    );

    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.displayName).toBe("Player-1111-000000000000...");
    expect(lanes[0]?.events).toEqual([]);
  });

  test("adds fallback lanes for action sources missing from the roster", () => {
    const lanes = buildPlayerActionLanes(
      [createPlayer({ guid: "Player-1", name: "Rostered-NA" })],
      [
        createEvent({ id: "kick-1", type: "interrupt", source: "Guest-NA", target: "Caster" }),
        createEvent({ id: "kick-2", type: "interrupt", source: "Guest-NA", target: "Caster" }),
      ],
    );

    expect(lanes.map((lane) => lane.displayName)).toEqual(["Rostered", "Guest"]);
    expect(lanes[1]?.events.map((event) => event.id)).toEqual(["kick-1", "kick-2"]);
  });

  test("builds source lanes when the sidecar has no roster", () => {
    const lanes = buildPlayerActionLanes(
      [],
      [createEvent({ id: "kick-1", type: "interrupt", source: "Solo-NA" })],
    );

    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.id).toBe("source:solo");
    expect(lanes[0]?.displayName).toBe("Solo");
  });

  test("returns no lanes when there is no roster and no player actions", () => {
    expect(
      buildPlayerActionLanes([], [createEvent({ id: "death-1", type: "death", target: "Tank-NA" })]),
    ).toEqual([]);
  });

  test("skips action events that have no usable source", () => {
    const lanes = buildPlayerActionLanes(
      [createPlayer({ guid: "Player-1", name: "Tank-NA" })],
      [createEvent({ id: "kick-1", type: "interrupt" })],
    );

    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.events).toEqual([]);
  });
});
