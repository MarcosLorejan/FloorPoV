import { describe, expect, test } from "bun:test";
import { convertRecordingMetadataToGameEvents, convertRecordingNoteToGameEvent } from "./events";

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

describe("convertRecordingMetadataToGameEvents", () => {
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
      },
      {
        id: "note-keep",
        timestamp: 12,
        type: "note",
        note: "missed kick",
      },
    ]);
  });
});
