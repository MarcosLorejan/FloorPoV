import { describe, expect, test } from "bun:test";
import {
  convertCombatEvent,
  convertRecordingMetadataToGameEvents,
  type RecordingMetadata,
} from "./events";

function metadata(overrides: Partial<RecordingMetadata> = {}): RecordingMetadata {
  return {
    schemaVersion: 2,
    recordingFile: "test.mp4",
    ...overrides,
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
      },
      {
        id: "HEAL-9-2",
        timestamp: 9,
        type: "heal",
        source: "PriestOne-NA",
        target: "DeadOne-NA",
        targetKind: "PLAYER",
        amount: 1_800_000,
      },
      {
        id: "UNIT_DIED-12-0",
        timestamp: 12,
        type: "death",
        source: undefined,
        target: "DeadOne-NA",
        targetKind: "PLAYER",
        amount: 1_250_000,
      },
    ]);
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
      id: "4.5-BIG_HIT",
      timestamp: 4.5,
      type: "bigHit",
      source: "Boss",
      target: "DeadOne-NA",
      amount: 2_400_000,
    });
  });
});
