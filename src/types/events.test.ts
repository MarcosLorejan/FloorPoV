import { describe, expect, test } from "bun:test";
import {
  convertCombatEvent,
  convertRecordingMetadataToGameEvents,
  getManualMarkerLabel,
  MANUAL_MARKER_NAME_MAX_LENGTH,
  manualMarkerOccurrenceIndex,
  normalizeManualMarkerName,
  shouldPromptManualMarkerName,
  type GameEvent,
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
