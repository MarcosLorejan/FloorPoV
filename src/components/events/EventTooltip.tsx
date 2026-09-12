import { GameEvent, GameEventType, getManualMarkerLabel } from "../../types/events";
import { formatCompactAmount, formatTime } from "../../utils/format";
import { AnimatedTooltip } from "../ui/AnimatedTooltip";

interface EventTooltipProps {
  event: GameEvent;
  x: number;
}

const EVENT_LABELS: Record<GameEventType, string> = {
  death: "Death",
  manual: "Manual Marker",
  interrupt: "Interrupt",
  kill: "Kill",
  bloodlust: "Bloodlust",
  combatRes: "Combat Res",
  bigHit: "Big Hit",
  heal: "Heal",
  bossAbility: "Boss Ability",
  crowdControl: "Crowd Control",
  crowdControlBreak: "Crowd Control Break",
  note: "Note",
};

function getEventDescription(event: GameEvent): string {
  if (event.type === "death") {
    return `${event.target ?? "Unknown"} died`;
  }

  if (event.type === "manual") {
    return "User marked this moment";
  }

  if (event.type === "interrupt") {
    return `${event.source ?? "Unknown"} interrupted ${event.target ?? "Unknown"}`;
  }

  if (event.type === "bloodlust") {
    return `${event.source ?? "Unknown"} used Bloodlust`;
  }

  if (event.type === "combatRes") {
    return `${event.source ?? "Unknown"} combat ressed ${event.target ?? "Unknown"}`;
  }

  if (event.type === "bigHit") {
    return `${event.source ?? "Unknown"} hit ${event.target ?? "Unknown"}`;
  }

  if (event.type === "heal") {
    return `${event.source ?? "Unknown"} healed ${event.target ?? "Unknown"}`;
  }

  if (event.type === "bossAbility") {
    return `${event.source ?? "Unknown"} cast ${event.abilityName ?? "Unknown"}`;
  }

  if (event.type === "crowdControl") {
    return `${event.source ?? "Unknown"} landed ${event.abilityName ?? "crowd control"} on ${
      event.target ?? "Unknown"
    }`;
  }

  if (event.type === "crowdControlBreak") {
    return `${event.source ?? "Unknown"} broke ${event.abilityName ?? "crowd control"} on ${
      event.target ?? "Unknown"
    }`;
  }

  if (event.type === "note") {
    const noteText = event.note ?? "Review note";
    if (noteText.length <= 80) {
      return noteText;
    }

    return `${noteText.slice(0, 77)}...`;
  }

  return `${event.source ?? "Unknown"} killed ${event.target ?? "Unknown"}`;
}

export function EventTooltip({ event, x }: EventTooltipProps) {
  const compactAmount = formatCompactAmount(event.amount);

  return (
    <AnimatedTooltip x={x}>
      <div className="font-medium">
        {event.type === "manual" ? getManualMarkerLabel(event) : EVENT_LABELS[event.type]}
      </div>
      <div className="text-neutral-400">{getEventDescription(event)}</div>
      {compactAmount ? (
        <div className={event.type === "heal" ? "text-teal-300" : "text-orange-300"}>
          {compactAmount}
        </div>
      ) : null}
      <div className="text-neutral-500">{formatTime(event.timestamp)}</div>
    </AnimatedTooltip>
  );
}
