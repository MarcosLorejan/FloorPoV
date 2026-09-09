import { GameEvent } from "../../types/events";
import { formatTime } from "../../utils/format";
import { AnimatedTooltip } from "../ui/AnimatedTooltip";

interface EventTooltipProps {
  event: GameEvent;
  x: number;
}

const EVENT_LABELS: Record<GameEvent["type"], string> = {
  death: "Death",
  manual: "Manual Marker",
  interrupt: "Interrupt",
  kill: "Kill",
  bloodlust: "Bloodlust",
  combatRes: "Combat Res",
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
