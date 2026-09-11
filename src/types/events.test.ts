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
  bossAbility: true,
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

describe("boss ability playback mapping", () => {
  test("maps BOSS_ABILITY onto the seek bar with ability name", () => {
    const events = convertRecordingMetadataToGameEvents(
      metadataWithEvents([
        {
          timestampSeconds: 42,
          eventType: "BOSS_ABILITY",
          source: "Queen Ansurek",
          target: "PlayerOne",
          targetKind: "PLAYER",
          abilityName: "Devour",
        },
      ]),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("bossAbility");
    expect(events[0]?.source).toBe("Queen Ansurek");
    expect(events[0]?.ability).toBe("Devour");
    expect(events[0]?.target).toBe("PlayerOne");
    expect(isVideoSeekBarEvent(events[0]!)).toBe(true);
  });

  test("does not stuff the ability name into target", () => {
    const events = convertRecordingMetadataToGameEvents(
      metadataWithEvents([
        {
          timestampSeconds: 10,
          eventType: "BOSS_ABILITY",
          source: "Sikran",
          abilityName: "Phase Blades",
        },
      ]),
    );

    expect(events[0]?.ability).toBe("Phase Blades");
    expect(events[0]?.target).toBeUndefined();
  });

  test("keeps boss abilities visible when NPC events are hidden", () => {
    const event: GameEvent = {
      id: "boss-1",
      timestamp: 8,
      type: "bossAbility",
      source: "Queen Ansurek",
      targetKind: "NPC",
      ability: "Devour",
    };

    expect(shouldShowGameEvent(event, true, ALL_TYPES_VISIBLE)).toBe(true);
    expect(
      shouldShowGameEvent(event, true, { ...ALL_TYPES_VISIBLE, bossAbility: false }),
    ).toBe(false);
  });

  test("collapses nearby duplicate boss abilities from the same source", () => {
    const events = convertRecordingMetadataToGameEvents(
      metadataWithEvents([
        {
          timestampSeconds: 20,
          eventType: "BOSS_ABILITY",
          source: "Queen Ansurek",
          abilityName: "Devour",
        },
        {
          timestampSeconds: 21.2,
          eventType: "BOSS_ABILITY",
          source: "Queen Ansurek",
          abilityName: "Devour",
        },
        {
          timestampSeconds: 30,
          eventType: "BOSS_ABILITY",
          source: "Queen Ansurek",
          abilityName: "Abyssal Infusion",
        },
      ]),
    );

    expect(events.map((event) => event.ability)).toEqual(["Devour", "Abyssal Infusion"]);
  });

  test("copies ability name from live combat events", () => {
    const event = convertCombatEvent({
      timestamp: 15,
      eventType: "BOSS_ABILITY",
      source: "Plexus Sentinel",
      abilityName: "Purifying Light",
    });

    expect(event.type).toBe("bossAbility");
    expect(event.ability).toBe("Purifying Light");
    expect(isVideoSeekBarEvent(event)).toBe(true);
  });
});
