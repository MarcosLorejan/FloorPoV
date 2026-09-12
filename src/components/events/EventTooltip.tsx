import { GameEvent, GameEventType } from "../../types/events";
import { formatTime } from "../../utils/format";
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
  defensive: "Defensive",
  crowdControl: "Crowd Control",
  crowdControlBreak: "Crowd Control Break",
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

  if (event.type === "defensive") {
    const source = event.source ?? "Unknown";
    const ability = event.abilityName ?? "Unknown";
    if (event.target && event.target !== event.source) {
      return `${source} used ${ability} on ${event.target}`;
    }

    return `${source} used ${ability}`;
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

  return `${event.source ?? "Unknown"} killed ${event.target ?? "Unknown"}`;
}

export function EventTooltip({ event, x }: EventTooltipProps) {
  return (
    <AnimatedTooltip x={x}>
      <div className="font-medium">{EVENT_LABELS[event.type]}</div>
      <div className="text-neutral-400">{getEventDescription(event)}</div>
      <div className="text-neutral-500">{formatTime(event.timestamp)}</div>
    </AnimatedTooltip>
  );
}
