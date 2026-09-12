import { describe, expect, test } from "bun:test";
import {
  convertCombatEvent,
  convertRecordingMetadataToGameEvents,
  isVideoSeekBarEvent,
  shouldShowGameEvent,
  type GameEvent,
  type RecordingMetadata,
} from "./events";

const ALL_TYPES_VISIBLE: Record<GameEvent["type"], boolean> = {
  kill: true,
  death: true,
  manual: true,
  interrupt: true,
  bloodlust: true,
  combatRes: true,
  defensive: true,
};

function metadataWithEvents(
  importantEvents: NonNullable<RecordingMetadata["importantEvents"]>,
): RecordingMetadata {
  return {
    schemaVersion: 2,
    recordingFile: "test.mp4",
    importantEvents,
  };
}

describe("defensive cooldown playback mapping", () => {
  test("maps DEFENSIVE onto the seek bar with source and spell name", () => {
    const events = convertRecordingMetadataToGameEvents(
      metadataWithEvents([
        {
          timestampSeconds: 18,
          eventType: "DEFENSIVE",
          source: "MageOne-NA",
          target: "MageOne-NA",
          targetKind: "PLAYER",
          abilityName: "Ice Block",
        },
      ]),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("defensive");
    expect(events[0]?.source).toBe("MageOne-NA");
    expect(events[0]?.ability).toBe("Ice Block");
    expect(isVideoSeekBarEvent(events[0]!)).toBe(true);
  });

  test("keeps personal defensives visible when NPC events are hidden", () => {
    const event: GameEvent = {
      id: "defensive-1",
      timestamp: 18,
      type: "defensive",
      source: "MageOne-NA",
      target: "MageOne-NA",
      targetKind: "PLAYER",
      ability: "Ice Block",
    };

    expect(shouldShowGameEvent(event, true, ALL_TYPES_VISIBLE)).toBe(true);
    expect(
      shouldShowGameEvent(event, true, { ...ALL_TYPES_VISIBLE, defensive: false }),
    ).toBe(false);
  });

  test("collapses nearby duplicate defensives from the same source and spell", () => {
    const events = convertRecordingMetadataToGameEvents(
      metadataWithEvents([
        {
          timestampSeconds: 20,
          eventType: "DEFENSIVE",
          source: "DeathKnightOne-NA",
          abilityName: "Icebound Fortitude",
        },
        {
          timestampSeconds: 21.2,
          eventType: "DEFENSIVE",
          source: "DeathKnightOne-NA",
          abilityName: "Icebound Fortitude",
        },
        {
          timestampSeconds: 21.5,
          eventType: "DEFENSIVE",
          source: "DeathKnightOne-NA",
          abilityName: "Anti-Magic Shell",
        },
      ]),
    );

    expect(events.map((event) => event.ability)).toEqual([
      "Icebound Fortitude",
      "Anti-Magic Shell",
    ]);
  });

  test("copies ability name from live combat events", () => {
    const event = convertCombatEvent({
      timestamp: 22,
      eventType: "DEFENSIVE",
      source: "PriestOne-NA",
      target: "TankOne-NA",
      abilityName: "Pain Suppression",
    });

    expect(event.type).toBe("defensive");
    expect(event.source).toBe("PriestOne-NA");
    expect(event.target).toBe("TankOne-NA");
    expect(event.ability).toBe("Pain Suppression");
    expect(isVideoSeekBarEvent(event)).toBe(true);
  });
});
