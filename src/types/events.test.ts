import { describe, expect, test } from "bun:test";
import {
  convertCombatEvent,
  convertRecordingMetadataToGameEvents,
  convertRecordingNoteToGameEvent,
  getManualMarkerLabel,
  isVideoSeekBarEvent,
  MANUAL_MARKER_NAME_MAX_LENGTH,
  manualMarkerOccurrenceIndex,
  normalizeManualMarkerName,
  recordingMetadataHasCombatContent,
  shouldPromptManualMarkerName,
  shouldShowGameEvent,
  type GameEvent,
  type GameEventType,
  type RecordingMetadata,
} from "./events";

interface DocumentFocusStub {
  visibilityState: string;
  hasFocus: () => boolean;
}

function withDocument(stub: DocumentFocusStub | null, assert: () => void): void {
  const globalScope = globalThis as { document?: unknown };
  const originalDocument = globalScope.document;

  if (stub) {
    globalScope.document = stub;
  } else {
    delete globalScope.document;
  }

  try {
    assert();
  } finally {
    if (originalDocument === undefined) {
      delete globalScope.document;
    } else {
      globalScope.document = originalDocument;
    }
  }
}

function metadataWithMarker(name?: string): RecordingMetadata {
  return {
    schemaVersion: 2,
    recordingFile: "screen_recording_20260222_153012.mp4",
    importantEvents: [
      { timestampSeconds: 12.5, eventType: "MANUAL_MARKER", name },
      { timestampSeconds: 30, eventType: "UNIT_DIED", target: "Player-1234-ABCD" },
    ],
  };
}

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
  note: true,
};

function metadata(overrides: Partial<RecordingMetadata> = {}): RecordingMetadata {
  return {
    schemaVersion: 2,
    recordingFile: "screen_recording_20260911_175201.mp4",
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

describe("normalizeManualMarkerName", () => {
  test("collapses surrounding and repeated whitespace", () => {
    expect(normalizeManualMarkerName("  bad   soak  ")).toBe("bad soak");
    expect(normalizeManualMarkerName("hold\tkick\n")).toBe("hold kick");
  });

  test("treats blank and missing names as unnamed", () => {
    expect(normalizeManualMarkerName("   ")).toBeUndefined();
    expect(normalizeManualMarkerName("")).toBeUndefined();
    expect(normalizeManualMarkerName(undefined)).toBeUndefined();
    expect(normalizeManualMarkerName(null)).toBeUndefined();
  });

  test("caps the name at the shared maximum length", () => {
    const longName = normalizeManualMarkerName("x".repeat(MANUAL_MARKER_NAME_MAX_LENGTH + 16));

    expect(longName).toHaveLength(MANUAL_MARKER_NAME_MAX_LENGTH);
  });

  test("counts code points rather than UTF-16 units when capping", () => {
    const emojiName = normalizeManualMarkerName("💀".repeat(MANUAL_MARKER_NAME_MAX_LENGTH + 4));

    expect(Array.from(emojiName ?? "")).toHaveLength(MANUAL_MARKER_NAME_MAX_LENGTH);
  });
});

describe("getManualMarkerLabel", () => {
  test("prefers the user supplied name", () => {
    expect(getManualMarkerLabel({ name: "bad soak" })).toBe("bad soak");
  });

  test("falls back to a generic label for unnamed markers", () => {
    expect(getManualMarkerLabel({})).toBe("Manual marker");
  });
});

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

describe("convertRecordingNoteToGameEvent", () => {
  test("maps a persisted note onto the playback event list", () => {
    expect(
      convertRecordingNoteToGameEvent({
        id: "note-1",
        timestampSeconds: 42.25,
        text: "  watch the frontal  ",
      }),
    ).toEqual({
      id: "note-1",
      timestamp: 42.25,
      type: "note",
      note: "watch the frontal",
    });
  });

  test("skips notes without usable text or time", () => {
    expect(
      convertRecordingNoteToGameEvent({
        id: "note-2",
        timestampSeconds: 10,
        text: "   ",
      }),
    ).toBeNull();
    expect(
      convertRecordingNoteToGameEvent({
        id: "note-3",
        timestampSeconds: Number.NaN,
        text: "later",
      }),
    ).toBeNull();
  });
});

describe("recordingMetadataHasCombatContent", () => {
  test("returns false for missing metadata", () => {
    expect(recordingMetadataHasCombatContent(null)).toBe(false);
  });

  test("returns false for an empty sidecar", () => {
    expect(recordingMetadataHasCombatContent(metadata())).toBe(false);
  });

  test("returns true when combat fields are present", () => {
    expect(recordingMetadataHasCombatContent(metadata({ zoneName: "Voidscar Arena" }))).toBe(true);
    expect(
      recordingMetadataHasCombatContent(
        metadata({
          importantEvents: [
            {
              timestampSeconds: 12,
              eventType: "UNIT_DIED",
            },
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe("convertRecordingMetadataToGameEvents", () => {
  test("carries the marker name from the sidecar", () => {
    const [marker] = convertRecordingMetadataToGameEvents(metadataWithMarker("  bad soak  "));

    expect(marker.type).toBe("manual");
    expect(marker.name).toBe("bad soak");
  });

  test("leaves unnamed markers without a name", () => {
    const [marker] = convertRecordingMetadataToGameEvents(metadataWithMarker());

    expect(marker.name).toBeUndefined();
  });

  test("includes notes without replacing manual markers", () => {
    const events = convertRecordingMetadataToGameEvents({
      schemaVersion: 2,
      recordingFile: "key.mp4",
      importantEvents: [
        {
          timestampSeconds: 8,
          eventType: "MANUAL_MARKER",
        },
      ],
      notes: [
        {
          id: "note-keep",
          timestampSeconds: 12,
          text: "missed kick",
        },
      ],
    });

    expect(events).toEqual([
      {
        id: "MANUAL_MARKER-8-0",
        timestamp: 8,
        type: "manual",
        source: undefined,
        target: undefined,
        targetKind: undefined,
        abilityName: undefined,
        name: undefined,
      },
      {
        id: "note-keep",
        timestamp: 12,
        type: "note",
        note: "missed kick",
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
  test("keeps the name emitted with a live marker", () => {
    const marker = convertCombatEvent({
      timestamp: 12.5,
      eventType: "MANUAL_MARKER",
      name: "hold  kick",
    });

    expect(marker.type).toBe("manual");
    expect(marker.name).toBe("hold kick");
  });

  test("gives markers on the same timestamp distinct ids", () => {
    const first = convertCombatEvent({ timestamp: 12.5, eventType: "MANUAL_MARKER" });
    const second = convertCombatEvent({ timestamp: 12.5, eventType: "MANUAL_MARKER" });

    expect(first.id).not.toBe(second.id);
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

describe("shouldPromptManualMarkerName", () => {
  test("prompts while the window is visible and focused", () => {
    withDocument({ visibilityState: "visible", hasFocus: () => true }, () => {
      expect(shouldPromptManualMarkerName()).toBe(true);
    });
  });

  test("stays quiet while the hotkey is used from the game", () => {
    withDocument({ visibilityState: "visible", hasFocus: () => false }, () => {
      expect(shouldPromptManualMarkerName()).toBe(false);
    });

    withDocument({ visibilityState: "hidden", hasFocus: () => true }, () => {
      expect(shouldPromptManualMarkerName()).toBe(false);
    });
  });

  test("stays quiet without a document", () => {
    withDocument(null, () => {
      expect(shouldPromptManualMarkerName()).toBe(false);
    });
  });
});

describe("manualMarkerOccurrenceIndex", () => {
  const first: GameEvent = { id: "manual-8-0", timestamp: 8, type: "manual", name: "keep" };
  const second: GameEvent = { id: "manual-8-1", timestamp: 8, type: "manual", name: "rename me" };
  const later: GameEvent = { id: "manual-20-2", timestamp: 20, type: "manual" };

  test("counts only manuals inside the same timestamp window", () => {
    const events = [first, second, later];
    expect(manualMarkerOccurrenceIndex(events, first)).toBe(0);
    expect(manualMarkerOccurrenceIndex(events, second)).toBe(1);
    expect(manualMarkerOccurrenceIndex(events, later)).toBe(0);
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
