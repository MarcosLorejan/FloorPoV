import { createContext, ReactNode, useContext, useState, useCallback, useMemo } from "react";
import { GameEvent, RecordingEncounterMetadata, shouldShowGameEvent } from "../types/events";

const DEFAULT_EVENT_TYPE_VISIBILITY: Record<GameEvent["type"], boolean> = {
  kill: true,
  death: true,
  manual: true,
  interrupt: true,
};

interface MarkerContextType {
  events: GameEvent[];
  filteredEvents: GameEvent[];
  encounters: RecordingEncounterMetadata[];
  hideNpcEvents: boolean;
  eventTypeVisibility: Record<GameEvent["type"], boolean>;
  addEvent: (event: GameEvent) => void;
  setEvents: (events: GameEvent[]) => void;
  setEncounters: (encounters: RecordingEncounterMetadata[]) => void;
  setHideNpcEvents: (hide: boolean) => void;
  toggleEventTypeVisibility: (type: GameEvent["type"]) => void;
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
  const [hideNpcEvents, setHideNpcEvents] = useState(true);
  const [eventTypeVisibility, setEventTypeVisibility] = useState(DEFAULT_EVENT_TYPE_VISIBILITY);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => shouldShowGameEvent(event, hideNpcEvents, eventTypeVisibility));
  }, [events, hideNpcEvents, eventTypeVisibility]);

  const toggleEventTypeVisibility = useCallback((type: GameEvent["type"]) => {
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
  }, []);

  return (
    <MarkerContext.Provider
      value={{
        events,
        filteredEvents,
        encounters,
        hideNpcEvents,
        eventTypeVisibility,
        addEvent,
        setEvents: replaceEvents,
        setEncounters,
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
