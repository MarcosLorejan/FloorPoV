import { describe, expect, test } from "bun:test";
import {
  convertRecordingMetadataToGameEvents,
  getGameEventDescription,
  isVideoSeekBarEvent,
  shouldShowGameEvent,
  type GameEvent,
  type RecordingMetadata,
} from "./events";

const ALL_EVENT_TYPES_VISIBLE: Record<GameEvent["type"], boolean> = {
  kill: true,
  death: true,
  manual: true,
  interrupt: true,
  dispel: true,
  bloodlust: true,
  combatRes: true,
};

function metadataWithEvents(
  importantEvents: NonNullable<RecordingMetadata["importantEvents"]>,
): RecordingMetadata {
  return {
    schemaVersion: 2,
    recordingFile: "key.mp4",
    importantEvents,
  };
}

describe("convertRecordingMetadataToGameEvents", () => {
  test("maps SPELL_DISPEL onto the playback timeline with the dispelled spell", () => {
    const events = convertRecordingMetadataToGameEvents(
      metadataWithEvents([
        {
          timestampSeconds: 18,
          eventType: "SPELL_DISPEL",
          source: "ShamanOne-NA",
          target: "Enemy5",
          targetKind: "NPC",
          extraSpellName: "Grounding Totem Effect",
        },
      ]),
    );

    expect(events).toEqual([
      {
        id: "SPELL_DISPEL-18-0",
        timestamp: 18,
        type: "dispel",
        source: "ShamanOne-NA",
        target: "Enemy5",
        targetKind: "NPC",
        extraSpellName: "Grounding Totem Effect",
      },
    ]);
  });

  test("keeps interrupt extraSpellName for the interrupted cast", () => {
    const events = convertRecordingMetadataToGameEvents(
      metadataWithEvents([
        {
          timestampSeconds: 22,
          eventType: "SPELL_INTERRUPT",
          source: "RogueOne-NA",
          target: "Enemy6",
          extraSpellName: "Void Bolt",
        },
      ]),
    );

    expect(events[0]?.type).toBe("interrupt");
    expect(events[0]?.extraSpellName).toBe("Void Bolt");
  });
});

describe("playback timeline visibility", () => {
  test("includes dispels on the seek bar", () => {
    expect(
      isVideoSeekBarEvent({
        id: "dispel-1",
        timestamp: 10,
        type: "dispel",
      }),
    ).toBe(true);
  });

  test("shows NPC dispels even when NPC kills are hidden", () => {
    const npcDispel: GameEvent = {
      id: "dispel-npc",
      timestamp: 12,
      type: "dispel",
      target: "Enemy5",
      targetKind: "NPC",
    };
    const npcDeath: GameEvent = {
      id: "death-npc",
      timestamp: 13,
      type: "death",
      target: "Enemy5",
      targetKind: "NPC",
    };

    expect(shouldShowGameEvent(npcDispel, true, ALL_EVENT_TYPES_VISIBLE)).toBe(true);
    expect(shouldShowGameEvent(npcDeath, true, ALL_EVENT_TYPES_VISIBLE)).toBe(false);
  });

  test("hides dispels when the type filter is off", () => {
    expect(
      shouldShowGameEvent(
        { id: "dispel-hidden", timestamp: 4, type: "dispel" },
        false,
        { ...ALL_EVENT_TYPES_VISIBLE, dispel: false },
      ),
    ).toBe(false);
  });
});

describe("getGameEventDescription", () => {
  test("names the source, target, and dispelled spell", () => {
    expect(
      getGameEventDescription({
        id: "dispel-1",
        timestamp: 18,
        type: "dispel",
        source: "ShamanOne-NA",
        target: "Enemy5",
        extraSpellName: "Grounding Totem Effect",
      }),
    ).toBe("ShamanOne-NA dispelled Grounding Totem Effect from Enemy5");
  });

  test("still describes a dispel when the extra spell is missing", () => {
    expect(
      getGameEventDescription({
        id: "dispel-2",
        timestamp: 9,
        type: "dispel",
        source: "PriestOne-NA",
        target: "PriestTwo-NA",
      }),
    ).toBe("PriestOne-NA dispelled PriestTwo-NA");
  });
});
