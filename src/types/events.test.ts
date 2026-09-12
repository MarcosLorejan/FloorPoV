import { describe, expect, test } from "bun:test";
import {
  convertCombatEvent,
  convertRecordingMetadataToGameEvents,
  getManualMarkerLabel,
  isVideoSeekBarEvent,
  MANUAL_MARKER_NAME_MAX_LENGTH,
  manualMarkerOccurrenceIndex,
  normalizeManualMarkerName,
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
