import { useMemo } from "react";
import { ListVideo } from "lucide-react";
import { useMarker } from "../../contexts/MarkerContext";
import { useRecording } from "../../contexts/RecordingContext";
import { useVideo } from "../../contexts/VideoContext";
import {
  EVENT_SEEK_OFFSET_SECONDS,
  isCrowdControlEventType,
  isVideoSeekBarEvent,
  type GameEvent,
  type GameEventType,
} from "../../types/events";
import { formatCompactAmount, formatTime, formatUnitName } from "../../utils/format";
import { EventMarker, EventTypeFilter } from "./EventMarker";

const EVENT_LIST_LABELS: Record<GameEventType, string> = {
  death: "Death",
  interrupt: "Interrupt",
  manual: "Marker",
  kill: "Kill",
  bloodlust: "Bloodlust",
  combatRes: "Combat Res",
  bigHit: "Big Hit",
  heal: "Heal",
  crowdControl: "Crowd Control",
  crowdControlBreak: "CC Break",
};

const EVENT_LIST_FILTER_TYPES: GameEventType[] = [
  "death",
  "interrupt",
  "manual",
  "bloodlust",
  "combatRes",
  "bigHit",
  "heal",
  "crowdControl",
  "crowdControlBreak",
];

function getEventListDetail(event: GameEvent): string {
  if (event.type === "death") {
    return formatUnitName(event.target);
  }

  if (event.type === "interrupt") {
    return `${formatUnitName(event.source)} → ${formatUnitName(event.target)}`;
  }

  if (event.type === "manual") {
    return "Manual marker";
  }

  if (event.type === "bloodlust") {
    return formatUnitName(event.source);
  }

  if (event.type === "combatRes") {
    return `${formatUnitName(event.source)} → ${formatUnitName(event.target)}`;
  }

  if (event.type === "bigHit" || event.type === "heal") {
    return `${formatUnitName(event.source)} → ${formatUnitName(event.target)}`;
  }

  if (isCrowdControlEventType(event.type)) {
    const actors = `${formatUnitName(event.source)} → ${formatUnitName(event.target)}`;
    return event.abilityName ? `${actors} · ${event.abilityName}` : actors;
  }

  return `${formatUnitName(event.source)} → ${formatUnitName(event.target)}`;
}

interface PlaybackEventListProps {
  variant?: "sidebar" | "overlay";
}

export function PlaybackEventList({ variant = "sidebar" }: PlaybackEventListProps) {
  const { currentTime, seek, videoSrc } = useVideo();
  const { isRecording } = useRecording();
  const { events, filteredEvents } = useMarker();
  const listEvents = useMemo(() => filteredEvents.filter(isVideoSeekBarEvent), [filteredEvents]);
  const hasTimelineEvents = events.some(isVideoSeekBarEvent);
  const isOverlay = variant === "overlay";

  const activeEventId = useMemo(() => {
    let activeId: string | null = null;

    for (const event of listEvents) {
      if (event.timestamp <= currentTime) {
        activeId = event.id;
        continue;
      }

      break;
    }

    return activeId;
  }, [currentTime, listEvents]);

  const handleEventClick = (timestamp: number) => {
    seek(Math.max(0, timestamp - EVENT_SEEK_OFFSET_SECONDS));
  };

  return (
    <aside
      className={
        isOverlay
          ? "flex h-full w-full flex-col border-l border-white/10 bg-neutral-950/92 backdrop-blur-sm"
          : "flex h-full w-72 shrink-0 flex-col border-l border-white/10 bg-(--surface-2)"
      }
    >
      <div className="flex flex-col gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-neutral-400">
          <ListVideo className="h-3.5 w-3.5 text-neutral-300" />
          Events
        </div>
        <EventTypeFilter types={EVENT_LIST_FILTER_TYPES} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {!videoSrc && !isRecording ? (
          <p className="px-3 py-4 text-xs text-neutral-500">
            Load a recording to see deaths, interrupts, crowd control, hits, heals, and markers.
          </p>
        ) : !hasTimelineEvents ? (
          <p className="px-3 py-4 text-xs text-neutral-500">
            No deaths, interrupts, crowd control, hits, heals, or markers in this recording.
          </p>
        ) : listEvents.length === 0 ? (
          <p className="px-3 py-4 text-xs text-neutral-500">No events match the current filters.</p>
        ) : (
          <ul className="py-1">
            {listEvents.map((event) => {
              const isActive = event.id === activeEventId;
              const compactAmount = formatCompactAmount(event.amount);

              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => handleEventClick(event.timestamp)}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                      isActive ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                    aria-current={isActive ? "true" : undefined}
                    aria-label={`Seek to ${EVENT_LIST_LABELS[event.type]} at ${formatTime(event.timestamp)}${
                      compactAmount ? `, ${compactAmount}` : ""
                    }`}
                  >
                    <span className="mt-0.5 shrink-0">
                      <EventMarker type={event.type} variant="compact" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-neutral-100">
                          {EVENT_LIST_LABELS[event.type]}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-neutral-400">
                          {formatTime(event.timestamp)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs text-neutral-400">
                          {getEventListDetail(event)}
                        </span>
                        {compactAmount ? (
                          <span
                            className={`shrink-0 font-mono text-[11px] ${
                              event.type === "heal" ? "text-teal-300" : "text-orange-300"
                            }`}
                          >
                            {compactAmount}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
