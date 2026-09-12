import { GameEvent, getGameEventDescription } from "../../types/events";
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
  dispel: "Dispel",
  kill: "Kill",
  bloodlust: "Bloodlust",
  combatRes: "Combat Res",
};

export function EventTooltip({ event, x }: EventTooltipProps) {
  return (
    <AnimatedTooltip x={x}>
      <div className="font-medium">{EVENT_LABELS[event.type]}</div>
      <div className="text-neutral-400">{getGameEventDescription(event)}</div>
      <div className="text-neutral-500">{formatTime(event.timestamp)}</div>
    </AnimatedTooltip>
  );
}
