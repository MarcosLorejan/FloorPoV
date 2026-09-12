import { Flag, Heart, ShieldOff, Skull, Snowflake, Sparkles, Sword, Unlock, Zap } from "lucide-react";
import { useMarker } from "../../contexts/MarkerContext";
import { GameEventType } from "../../types/events";

type EventMarkerVariant = "compact" | "detailed";

interface EventMarkerProps {
  type: GameEventType;
  variant?: EventMarkerVariant;
  className?: string;
}

const VARIANT_CLASS_NAMES: Record<EventMarkerVariant, string> = {
  compact: "h-4 w-4",
  detailed: "h-7 w-7",
};

const ICON_CLASS_NAMES: Record<EventMarkerVariant, string> = {
  compact: "h-2.5 w-2.5",
  detailed: "h-4.5 w-4.5",
};

const ICONS: Record<GameEventType, React.ComponentType<{ className?: string }>> = {
  kill: Sword,
  death: Skull,
  manual: Flag,
  interrupt: ShieldOff,
  dispel: Sparkles,
  bloodlust: Zap,
  combatRes: Heart,
  crowdControl: Snowflake,
  crowdControlBreak: Unlock,
};

const MARKER_CLASS_NAMES: Record<GameEventType, Record<EventMarkerVariant, string>> = {
  kill: {
    compact: "rounded-full bg-neutral-500 text-neutral-900",
    detailed: "rounded-full border border-neutral-100/45 bg-neutral-500 text-neutral-900",
  },
  death: {
    compact: "rounded-full bg-rose-500 text-rose-950",
    detailed: "rounded-full border border-rose-200/40 bg-rose-500 text-rose-950",
  },
  manual: {
    compact: "rounded-sm bg-neutral-400 text-neutral-900",
    detailed: "rounded-sm border border-neutral-100/55 bg-neutral-400 text-neutral-900",
  },
  interrupt: {
    compact: "rounded-full bg-amber-400 text-amber-950",
    detailed: "rounded-full border border-amber-200/40 bg-amber-400 text-amber-950",
  },
  dispel: {
    compact: "rounded-full bg-violet-400 text-violet-950",
    detailed: "rounded-full border border-violet-200/40 bg-violet-400 text-violet-950",
  },
  bloodlust: {
    compact: "rounded-full bg-sky-400 text-sky-950",
    detailed: "rounded-full border border-sky-200/40 bg-sky-400 text-sky-950",
  },
  combatRes: {
    compact: "rounded-full bg-emerald-400 text-emerald-950",
    detailed: "rounded-full border border-emerald-200/40 bg-emerald-400 text-emerald-950",
  },
  crowdControl: {
    compact: "rounded-full bg-violet-400 text-violet-950",
    detailed: "rounded-full border border-violet-200/40 bg-violet-400 text-violet-950",
  },
  crowdControlBreak: {
    compact: "rounded-full bg-indigo-300 text-indigo-950",
    detailed: "rounded-full border border-indigo-100/45 bg-indigo-300 text-indigo-950",
  },
};

export function EventMarker({ type, variant = "compact", className }: EventMarkerProps) {
  const Icon = ICONS[type];

  return (
    <span
      className={`flex items-center justify-center ${VARIANT_CLASS_NAMES[variant]} ${MARKER_CLASS_NAMES[type][variant]} ${className || ""}`.trim()}
    >
      <Icon className={ICON_CLASS_NAMES[variant]} />
    </span>
  );
}

const EVENT_TYPE_FILTER_LABELS: Record<GameEventType, string> = {
  death: "Deaths",
  interrupt: "Interrupts",
  dispel: "Dispels",
  manual: "Markers",
  kill: "Kills",
  bloodlust: "Bloodlust",
  combatRes: "Combat Res",
  crowdControl: "Crowd Control",
  crowdControlBreak: "CC Breaks",
};

const DEFAULT_EVENT_TYPE_FILTERS: GameEventType[] = [
  "death",
  "interrupt",
  "dispel",
  "manual",
  "kill",
];

interface EventTypeFilterProps {
  types?: GameEventType[];
}

export function EventTypeFilter({ types = DEFAULT_EVENT_TYPE_FILTERS }: EventTypeFilterProps) {
  const { events, eventTypeVisibility, toggleEventTypeVisibility } = useMarker();
  const availableTypes = types.filter((type) => events.some((event) => event.type === type));

  if (availableTypes.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Event type filters">
      {availableTypes.map((type) => {
        const isVisible = eventTypeVisibility[type];

        return (
          <button
            key={type}
            type="button"
            aria-pressed={isVisible}
            onClick={() => toggleEventTypeVisibility(type)}
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] transition-colors ${
              isVisible
                ? "border-white/20 bg-black/20 text-neutral-200"
                : "border-white/10 bg-transparent text-neutral-500"
            }`}
          >
            <EventMarker type={type} variant="compact" className={isVisible ? undefined : "opacity-40"} />
            {EVENT_TYPE_FILTER_LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}
