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
