import { createContext, ReactNode, useContext, useState, useCallback, useMemo } from "react";
import {
  GameEvent,
  GameEventType,
  RecordingEncounterMetadata,
  RecordingPlayerMetadata,
  shouldShowGameEvent,
} from "../types/events";

const DEFAULT_EVENT_TYPE_VISIBILITY: Record<GameEventType, boolean> = {
  kill: true,
  death: true,
  manual: true,
  interrupt: true,
  bloodlust: true,
  combatRes: true,
  crowdControl: true,
  crowdControlBreak: true,
};

interface MarkerContextType {
  events: GameEvent[];
  filteredEvents: GameEvent[];
  encounters: RecordingEncounterMetadata[];
  players: RecordingPlayerMetadata[];
  hideNpcEvents: boolean;
  eventTypeVisibility: Record<GameEventType, boolean>;
  addEvent: (event: GameEvent) => void;
  setEvents: (events: GameEvent[]) => void;
  setEncounters: (encounters: RecordingEncounterMetadata[]) => void;
  setPlayers: (players: RecordingPlayerMetadata[]) => void;
  setHideNpcEvents: (hide: boolean) => void;
  toggleEventTypeVisibility: (type: GameEventType) => void;
  clearEvents: () => void;
}

const MarkerContext = createContext<MarkerContextType | undefined>(undefined);

function sortEventsByTimestamp(unsortedEvents: GameEvent[]): GameEvent[] {
  return [...unsortedEvents].sort((a, b) => a.timestamp - b.timestamp);
}

function insertEventByTimestamp(sortedEvents: GameEvent[], nextEvent: GameEvent): GameEvent[] {
  if (
    sortedEvents.length === 0 ||
    sortedEvents[sortedEvents.length - 1].timestamp <= nextEvent.timestamp
  ) {
    return [...sortedEvents, nextEvent];
  }

  let low = 0;
  let high = sortedEvents.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sortedEvents[middle].timestamp <= nextEvent.timestamp) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  const nextEvents = [...sortedEvents];
  nextEvents.splice(low, 0, nextEvent);
  return nextEvents;
}

export function MarkerProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [encounters, setEncounters] = useState<RecordingEncounterMetadata[]>([]);
  const [players, setPlayers] = useState<RecordingPlayerMetadata[]>([]);
  const [hideNpcEvents, setHideNpcEvents] = useState(true);
  const [eventTypeVisibility, setEventTypeVisibility] = useState(DEFAULT_EVENT_TYPE_VISIBILITY);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => shouldShowGameEvent(event, hideNpcEvents, eventTypeVisibility));
  }, [events, hideNpcEvents, eventTypeVisibility]);

  const toggleEventTypeVisibility = useCallback((type: GameEventType) => {
    setEventTypeVisibility((currentVisibility) => ({
      ...currentVisibility,
      [type]: !currentVisibility[type],
    }));
  }, []);

  const addEvent = useCallback((event: GameEvent) => {
    setEvents((previousEvents) => insertEventByTimestamp(previousEvents, event));
  }, []);

  const replaceEvents = useCallback((nextEvents: GameEvent[]) => {
    setEvents(sortEventsByTimestamp(nextEvents));
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setEncounters([]);
    setPlayers([]);
  }, []);

  return (
    <MarkerContext.Provider
      value={{
        events,
        filteredEvents,
        encounters,
        players,
        hideNpcEvents,
        eventTypeVisibility,
        addEvent,
        setEvents: replaceEvents,
        setEncounters,
        setPlayers,
        setHideNpcEvents,
        toggleEventTypeVisibility,
        clearEvents,
      }}
    >
      {children}
    </MarkerContext.Provider>
  );
}

export function useMarker() {
  const context = useContext(MarkerContext);
  if (!context) {
    throw new Error("useMarker must be used within MarkerProvider");
  }
  return context;
}
