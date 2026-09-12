import { useMemo, useState, type MouseEvent } from "react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import { Users } from "lucide-react";
import { useMarker } from "../../contexts/MarkerContext";
import { useRecording } from "../../contexts/RecordingContext";
import { useVideo } from "../../contexts/VideoContext";
import { EVENT_SEEK_OFFSET_SECONDS, type GameEvent } from "../../types/events";
import { formatTime } from "../../utils/format";
import { buildPlayerActionLanes } from "../../utils/player-timelines";
import { EventMarker } from "./EventMarker";
import { EventTooltip } from "./EventTooltip";

export function PlayerActionTimelines() {
  const { currentTime, duration, seek } = useVideo();
  const { recordingDuration } = useRecording();
  const { filteredEvents, players } = useMarker();
  const reduceMotion = useReducedMotion();
  const [hoveredEvent, setHoveredEvent] = useState<GameEvent | null>(null);
  const [hoveredLaneId, setHoveredLaneId] = useState<string | null>(null);
  const [tooltipX, setTooltipX] = useState(0);

  const lanes = useMemo(
    () => buildPlayerActionLanes(players, filteredEvents),
    [filteredEvents, players],
  );
  const hasVideoTimeline = duration > 0;
  const timelineDuration = hasVideoTimeline ? duration : recordingDuration;
  const playheadPercent = hasVideoTimeline ? (currentTime / duration) * 100 : 0;

  const handleEventClick = (timestamp: number) => {
    seek(Math.max(0, timestamp - EVENT_SEEK_OFFSET_SECONDS));
  };

  const handleEventHover = (event: GameEvent, laneId: string, mouseEvent: MouseEvent) => {
    const markerRect = mouseEvent.currentTarget.getBoundingClientRect();
    const track = mouseEvent.currentTarget.closest("[data-player-timeline-track]");
    if (!(track instanceof HTMLElement)) {
      return;
    }

    const trackRect = track.getBoundingClientRect();
    setTooltipX(markerRect.left - trackRect.left + markerRect.width / 2);
    setHoveredEvent(event);
    setHoveredLaneId(laneId);
  };

  return (
    <section className="shrink-0 border-t border-white/10 bg-(--surface-2) px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-neutral-400">
        <Users className="h-3.5 w-3.5 text-neutral-300" />
        Player timelines
      </div>
      {lanes.length === 0 ? (
        <p className="text-xs text-neutral-500">
          No player roster or action events in this recording.
        </p>
      ) : (
        <div className="max-h-52 space-y-1 overflow-y-auto [scrollbar-gutter:stable]">
          {lanes.map((lane) => {
            const nameTitle = lane.className
              ? `${lane.displayName} · ${lane.className}`
              : lane.displayName;

            return (
              <div key={lane.id} className="flex min-w-0 items-center gap-2">
                <div
                  className="w-28 shrink-0 truncate text-xs text-neutral-200"
                  title={nameTitle}
                >
                  {lane.displayName}
                </div>
                <div
                  data-player-timeline-track
                  className="relative h-7 min-w-0 flex-1 rounded-sm border border-white/10 bg-neutral-800 px-1"
                  aria-label={
                    lane.events.length === 0
                      ? `${lane.displayName}, no actions`
                      : `${lane.displayName} action timeline`
                  }
                >
                  {hasVideoTimeline && (
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-white/45"
                      style={{ left: `${playheadPercent}%` }}
                      aria-hidden="true"
                    />
                  )}
                  {lane.events.map((event) => {
                    const position = timelineDuration > 0 ? (event.timestamp / timelineDuration) * 100 : 0;

                    return (
                      <button
                        key={event.id}
                        type="button"
                        className="absolute top-1/2 z-20 -ml-2 -translate-y-1/2 rounded-sm p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
                        style={{ left: `${position}%` }}
                        onClick={() => handleEventClick(event.timestamp)}
                        onMouseEnter={(mouseEvent) => handleEventHover(event, lane.id, mouseEvent)}
                        onMouseLeave={() => {
                          setHoveredEvent(null);
                          setHoveredLaneId(null);
                        }}
                        aria-label={`Seek to ${event.type} for ${lane.displayName} at ${formatTime(event.timestamp)}`}
                      >
                        <EventMarker
                          type={event.type}
                          variant="compact"
                          className={`transition-transform ${reduceMotion ? "" : "hover:scale-125"}`}
                        />
                      </button>
                    );
                  })}
                  <AnimatePresence>
                    {hoveredEvent && hoveredLaneId === lane.id && (
                      <EventTooltip event={hoveredEvent} x={tooltipX} />
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
