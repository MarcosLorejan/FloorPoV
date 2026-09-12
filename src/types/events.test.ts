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
  bigHit: true,
  heal: true,
  crowdControl: true,
  crowdControlBreak: true,
};

function metadata(overrides: Partial<RecordingMetadata> = {}): RecordingMetadata {
  return {
    schemaVersion: 2,
    recordingFile: "test.mp4",
    ...overrides,
  };
}

function metadataWithEvents(
  importantEvents: NonNullable<RecordingMetadata["importantEvents"]>,
): RecordingMetadata {
  return {
    schemaVersion: 2,
    recordingFile: "clip.mp4",
    importantEvents,
  };
}

describe("convertRecordingMetadataToGameEvents", () => {
  test("keeps compact amounts on deaths, big hits, and heals", () => {
    const events = convertRecordingMetadataToGameEvents(
      metadata({
        importantEvents: [
          {
            timestampSeconds: 12,
            eventType: "UNIT_DIED",
            target: "DeadOne-NA",
            targetKind: "PLAYER",
            amount: 1_250_000,
          },
          {
            timestampSeconds: 8,
            eventType: "BIG_HIT",
            source: "Boss",
            target: "DeadOne-NA",
            targetKind: "PLAYER",
            amount: 2_400_000,
          },
          {
            timestampSeconds: 9,
            eventType: "HEAL",
            source: "PriestOne-NA",
            target: "DeadOne-NA",
            targetKind: "PLAYER",
            amount: 1_800_000,
          },
        ],
      }),
    );

    expect(events).toEqual([
      {
        id: "BIG_HIT-8-1",
        timestamp: 8,
        type: "bigHit",
        source: "Boss",
        target: "DeadOne-NA",
        targetKind: "PLAYER",
        amount: 2_400_000,
        abilityName: undefined,
      },
      {
        id: "HEAL-9-2",
        timestamp: 9,
        type: "heal",
        source: "PriestOne-NA",
        target: "DeadOne-NA",
        targetKind: "PLAYER",
        amount: 1_800_000,
        abilityName: undefined,
      },
      {
        id: "UNIT_DIED-12-0",
        timestamp: 12,
        type: "death",
        source: undefined,
        target: "DeadOne-NA",
        targetKind: "PLAYER",
        amount: 1_250_000,
        abilityName: undefined,
      },
    ]);
  });

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
  test("forwards live combat amounts", () => {
    expect(
      convertCombatEvent({
        timestamp: 4.5,
        eventType: "BIG_HIT",
        source: "Boss",
        target: "DeadOne-NA",
        amount: 2_400_000,
      }),
    ).toEqual({
      id: "4.5-BIG_HIT-Boss-DeadOne-NA",
      timestamp: 4.5,
      type: "bigHit",
      source: "Boss",
      target: "DeadOne-NA",
      amount: 2_400_000,
      abilityName: undefined,
    });
  });

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
