import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ListVideo, Pencil, Trash2 } from "lucide-react";
import { useMarker } from "../../contexts/MarkerContext";
import { useRecording } from "../../contexts/RecordingContext";
import { useVideo } from "../../contexts/VideoContext";
import { getErrorMessage } from "../../services/tauri";
import {
  EVENT_SEEK_OFFSET_SECONDS,
  isCrowdControlEventType,
  isVideoSeekBarEvent,
  type GameEvent,
  type GameEventType,
} from "../../types/events";
import { formatTime, formatUnitName } from "../../utils/format";
import { deleteRecordingNote, saveRecordingNote } from "../../utils/recording-notes";
import { DeleteConfirmDialog } from "../ui/DeleteConfirmDialog";
import { EventMarker, EventTypeFilter } from "./EventMarker";
import { NoteEditorDialog } from "./NoteEditorDialog";

const EVENT_LIST_LABELS: Record<GameEventType, string> = {
  death: "Death",
  interrupt: "Interrupt",
  manual: "Marker",
  kill: "Kill",
  bloodlust: "Bloodlust",
  combatRes: "Combat Res",
  crowdControl: "Crowd Control",
  crowdControlBreak: "CC Break",
  note: "Note",
};

const EVENT_LIST_FILTER_TYPES: GameEventType[] = [
  "death",
  "interrupt",
  "manual",
  "bloodlust",
  "combatRes",
  "crowdControl",
  "crowdControlBreak",
  "note",
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

  if (isCrowdControlEventType(event.type)) {
    const actors = `${formatUnitName(event.source)} → ${formatUnitName(event.target)}`;
    return event.abilityName ? `${actors} · ${event.abilityName}` : actors;
  }

  if (event.type === "note") {
    return event.note ?? "Review note";
  }

  return `${formatUnitName(event.source)} → ${formatUnitName(event.target)}`;
}

interface PlaybackEventListProps {
  variant?: "sidebar" | "overlay";
}

export function PlaybackEventList({ variant = "sidebar" }: PlaybackEventListProps) {
  const { currentTime, loadedFilePath, seek, videoSrc } = useVideo();
  const { isRecording } = useRecording();
  const { events, filteredEvents, updateEvent, removeEvent } = useMarker();
  const [editingNote, setEditingNote] = useState<GameEvent | null>(null);
  const [notePendingDelete, setNotePendingDelete] = useState<GameEvent | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const listEvents = useMemo(() => filteredEvents.filter(isVideoSeekBarEvent), [filteredEvents]);
  const hasTimelineEvents = events.some(isVideoSeekBarEvent);
  const isOverlay = variant === "overlay";
  const canEditNotes = Boolean(loadedFilePath) && !isRecording;

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

  const handleSaveEditedNote = async (text: string) => {
    if (!editingNote || !loadedFilePath || isSavingNote) {
      return;
    }

    setIsSavingNote(true);
    setNoteError(null);

    try {
      const savedNote = await saveRecordingNote({
        filePath: loadedFilePath,
        noteId: editingNote.id,
        timestampSeconds: editingNote.timestamp,
        text,
      });
      updateEvent(editingNote.id, savedNote);
      setEditingNote(null);
    } catch (error) {
      setNoteError(getErrorMessage(error) || "Could not save the note.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleConfirmDeleteNote = async () => {
    if (!notePendingDelete || !loadedFilePath || isDeletingNote) {
      return;
    }

    setIsDeletingNote(true);

    try {
      await deleteRecordingNote(loadedFilePath, notePendingDelete.id);
      removeEvent(notePendingDelete.id);
      setNotePendingDelete(null);
    } catch (error) {
      setNoteError(getErrorMessage(error) || "Could not delete the note.");
    } finally {
      setIsDeletingNote(false);
    }
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
        {noteError && !editingNote ? (
          <p className="text-xs text-rose-300" role="alert">
            {noteError}
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {!videoSrc && !isRecording ? (
          <p className="px-3 py-4 text-xs text-neutral-500">
            Load a recording to see deaths, interrupts, crowd control, markers, and notes.
          </p>
        ) : !hasTimelineEvents ? (
          <p className="px-3 py-4 text-xs text-neutral-500">
            No deaths, interrupts, bloodlust, combat res, crowd control, markers, or notes in this
            recording. Import a combat log from the player controls to add them.
          </p>
        ) : listEvents.length === 0 ? (
          <p className="px-3 py-4 text-xs text-neutral-500">No events match the current filters.</p>
        ) : (
          <ul className="py-1">
            {listEvents.map((event) => {
              const isActive = event.id === activeEventId;

              return (
                <li key={event.id}>
                  <div
                    className={`flex w-full items-start gap-1 px-1 py-1 ${
                      isActive ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleEventClick(event.timestamp)}
                      className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1 text-left transition-colors"
                      aria-current={isActive ? "true" : undefined}
                      aria-label={`Seek to ${EVENT_LIST_LABELS[event.type]} at ${formatTime(event.timestamp)}`}
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
                        <span className="mt-0.5 block truncate text-xs text-neutral-400">
                          {getEventListDetail(event)}
                        </span>
                      </span>
                    </button>
                    {event.type === "note" && canEditNotes ? (
                      <div className="flex shrink-0 items-center pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setNoteError(null);
                            setEditingNote(event);
                          }}
                          className="rounded p-1 text-neutral-400 transition-colors hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
                          aria-label={`Edit note at ${formatTime(event.timestamp)}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNoteError(null);
                            setNotePendingDelete(event);
                          }}
                          className="rounded p-1 text-neutral-400 transition-colors hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
                          aria-label={`Delete note at ${formatTime(event.timestamp)}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {editingNote
        ? createPortal(
            <NoteEditorDialog
              title="Edit note"
              timestamp={editingNote.timestamp}
              initialText={editingNote.note ?? ""}
              isSaving={isSavingNote}
              error={noteError}
              onSave={(text) => {
                void handleSaveEditedNote(text);
              }}
              onCancel={() => {
                if (isSavingNote) {
                  return;
                }

                setEditingNote(null);
                setNoteError(null);
              }}
            />,
            document.body,
          )
        : null}
      {notePendingDelete
        ? createPortal(
            <DeleteConfirmDialog
              title="Delete note"
              description={`Delete the note at ${formatTime(notePendingDelete.timestamp)}? This cannot be undone.`}
              isDeleting={isDeletingNote}
              confirmLabel="Delete note"
              onConfirm={() => {
                void handleConfirmDeleteNote();
              }}
              onCancel={() => {
                if (isDeletingNote) {
                  return;
                }

                setNotePendingDelete(null);
              }}
            />,
            document.body,
          )
        : null}
    </aside>
  );
}
