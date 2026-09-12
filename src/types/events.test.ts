import { describe, expect, test } from "bun:test";
import {
  convertCombatEvent,
  convertRecordingMetadataToGameEvents,
  isVideoSeekBarEvent,
  shouldShowGameEvent,
  type GameEvent,
  type GameEventType,
  type RecordingMetadata,
} from "./events";

const ALL_EVENT_TYPES_VISIBLE: Record<GameEventType, boolean> = {
  kill: true,
  death: true,
  manual: true,
  interrupt: true,
  bloodlust: true,
  combatRes: true,
  bossAbility: true,
  crowdControl: true,
  crowdControlBreak: true,
};

function metadataWithEvents(
  importantEvents: NonNullable<RecordingMetadata["importantEvents"]>,
): RecordingMetadata {
  return {
    schemaVersion: 2,
    recordingFile: "clip.mp4",
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
    expect(events[0]?.abilityName).toBe("Devour");
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

    expect(events[0]?.abilityName).toBe("Phase Blades");
    expect(events[0]?.target).toBeUndefined();
  });

  test("keeps boss abilities visible when NPC events are hidden", () => {
    const event: GameEvent = {
      id: "boss-1",
      timestamp: 8,
      type: "bossAbility",
      source: "Queen Ansurek",
      targetKind: "NPC",
      abilityName: "Devour",
    };

    expect(shouldShowGameEvent(event, true, ALL_EVENT_TYPES_VISIBLE)).toBe(true);
    expect(
      shouldShowGameEvent(event, true, { ...ALL_EVENT_TYPES_VISIBLE, bossAbility: false }),
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

    expect(events.map((event) => event.abilityName)).toEqual(["Devour", "Abyssal Infusion"]);
  });

  test("copies ability name from live combat events", () => {
    const event = convertCombatEvent({
      timestamp: 15,
      eventType: "BOSS_ABILITY",
      source: "Plexus Sentinel",
      abilityName: "Purifying Light",
    });

    expect(event.type).toBe("bossAbility");
    expect(event.abilityName).toBe("Purifying Light");
    expect(isVideoSeekBarEvent(event)).toBe(true);
  });
});

describe("convertRecordingMetadataToGameEvents", () => {
  test("maps crowd control apply and break with ability names", () => {
    const events = convertRecordingMetadataToGameEvents(
      metadataWithEvents([
        {
          timestampSeconds: 16,
          eventType: "CROWD_CONTROL",
          source: "PaladinOne-NA",
          target: "WarriorOne-NA",
          targetKind: "PLAYER",
          abilityName: "Hammer of Justice",
        },
        {
          timestampSeconds: 18,
          eventType: "CROWD_CONTROL_BREAK",
          source: "RogueOne-NA",
          target: "WarriorOne-NA",
          targetKind: "PLAYER",
          abilityName: "Hammer of Justice",
        },
      ]),
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "crowdControl",
      source: "PaladinOne-NA",
      target: "WarriorOne-NA",
      abilityName: "Hammer of Justice",
    });
    expect(events[1]).toMatchObject({
      type: "crowdControlBreak",
      source: "RogueOne-NA",
      target: "WarriorOne-NA",
      abilityName: "Hammer of Justice",
    });
  });

  test("dedupes nearby crowd control on the same target and ability", () => {
    const events = convertRecordingMetadataToGameEvents(
      metadataWithEvents([
        {
          timestampSeconds: 20,
          eventType: "CROWD_CONTROL",
          source: "MageOne-NA",
          target: "WarriorOne-NA",
          abilityName: "Frost Nova",
        },
        {
          timestampSeconds: 21.5,
          eventType: "CROWD_CONTROL",
          source: "MageOne-NA",
          target: "WarriorOne-NA",
          abilityName: "Frost Nova",
        },
        {
          timestampSeconds: 21.5,
          eventType: "CROWD_CONTROL",
          source: "MageOne-NA",
          target: "PriestOne-NA",
          abilityName: "Frost Nova",
        },
      ]),
    );

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.target)).toEqual(["WarriorOne-NA", "PriestOne-NA"]);
  });
});

describe("convertCombatEvent", () => {
  test("keeps ability names on live crowd control events", () => {
    expect(
      convertCombatEvent({
        timestamp: 16,
        eventType: "CROWD_CONTROL",
        source: "PaladinOne-NA",
        target: "WarriorOne-NA",
        abilityName: "Hammer of Justice",
      }),
    ).toMatchObject({
      type: "crowdControl",
      source: "PaladinOne-NA",
      target: "WarriorOne-NA",
      abilityName: "Hammer of Justice",
    });
  });
});

describe("crowd control playback visibility", () => {
  const crowdControlEvent: GameEvent = {
    id: "cc-1",
    timestamp: 16,
    type: "crowdControl",
    source: "PaladinOne-NA",
    target: "WarriorOne-NA",
    abilityName: "Hammer of Justice",
  };

  test("shows crowd control on the seek bar", () => {
    expect(isVideoSeekBarEvent(crowdControlEvent)).toBe(true);
    expect(
      isVideoSeekBarEvent({
        ...crowdControlEvent,
        id: "cc-break-1",
        type: "crowdControlBreak",
      }),
    ).toBe(true);
  });

  test("keeps crowd control visible when NPC events are hidden", () => {
    expect(shouldShowGameEvent(crowdControlEvent, true, ALL_EVENT_TYPES_VISIBLE)).toBe(true);
  });

  test("hides crowd control when that filter is off", () => {
    expect(
      shouldShowGameEvent(crowdControlEvent, true, {
        ...ALL_EVENT_TYPES_VISIBLE,
        crowdControl: false,
      }),
    ).toBe(false);
  });
});
