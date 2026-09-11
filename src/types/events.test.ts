import { describe, expect, test } from "bun:test";
import { recordingMetadataHasCombatContent, type RecordingMetadata } from "./events";

function metadata(overrides: Partial<RecordingMetadata> = {}): RecordingMetadata {
  return {
    schemaVersion: 2,
    recordingFile: "screen_recording_20260911_175201.mp4",
    ...overrides,
  };
}

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
