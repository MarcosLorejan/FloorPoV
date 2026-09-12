import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Clapperboard } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRecording } from "../../contexts/RecordingContext";
import { useVideo } from "../../contexts/VideoContext";
import { panelVariants, smoothTransition } from "../../lib/motion";
import { MEDIA_SECTION_RESIZE_DELTA } from "../../types/settings";
import { PlaybackEventList } from "../events/PlaybackEventList";
import { PlayerActionTimelines } from "../events/PlayerActionTimelines";
import { CompareVideoPlayer } from "./CompareVideoPlayer";
import { RecordingsList } from "./RecordingsList";
import { VideoPlayer } from "./VideoPlayer";

const IDLE_MEDIA_HEIGHT = 220;
const MIN_ACTIVE_MEDIA_HEIGHT = 320;

export function HomePage() {
  const { videoSrc, isCompareMode } = useVideo();
  const { isRecording } = useRecording();
  const reduceMotion = useReducedMotion();
  const [isResizingMedia, setIsResizingMedia] = useState(false);
  const [mediaSectionHeight, setMediaSectionHeight] = useState(() =>
    typeof window === "undefined" ? 520 : Math.round(window.innerHeight * 0.52),
  );

  const showPlaybackWorkspace = Boolean(videoSrc) || isRecording || isCompareMode;
  const showComparePlayer = isCompareMode && !isRecording;
  const mediaSectionMaxHeight =
    typeof window === "undefined" ? MIN_ACTIVE_MEDIA_HEIGHT : Math.max(MIN_ACTIVE_MEDIA_HEIGHT, Math.round(window.innerHeight * 0.66));
  const displayedMediaHeight = showPlaybackWorkspace ? mediaSectionHeight : IDLE_MEDIA_HEIGHT;

  const clampMediaSectionHeight = (height: number, viewportHeight: number) => {
    const maxHeight = Math.max(MIN_ACTIVE_MEDIA_HEIGHT, Math.round(viewportHeight * 0.66));
    return Math.min(maxHeight, Math.max(MIN_ACTIVE_MEDIA_HEIGHT, height));
  };

  useEffect(() => {
    const handleWindowResize = () => {
      setMediaSectionHeight((currentHeight) =>
        clampMediaSectionHeight(currentHeight, window.innerHeight),
      );
    };

    handleWindowResize();
    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, []);

  const handleMediaResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsResizingMedia(true);

    const startY = event.clientY;
    const startHeight = mediaSectionHeight;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      setMediaSectionHeight(clampMediaSectionHeight(startHeight + deltaY, window.innerHeight));
    };

    const handlePointerEnd = () => {
      setIsResizingMedia(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
  };

  const adjustMediaSectionHeight = (delta: number) => {
    setMediaSectionHeight((currentHeight) => {
      return clampMediaSectionHeight(currentHeight + delta, window.innerHeight);
    });
  };

  return (
    <motion.div
      className={`flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-sm border border-white/10 bg-(--surface-1) shadow-(--surface-glow) ${
        isResizingMedia ? "select-none" : ""
      }`}
      variants={panelVariants}
      initial={reduceMotion ? false : "initial"}
      animate="animate"
      exit={reduceMotion ? undefined : "exit"}
      transition={smoothTransition}
    >
      <header className="shrink-0 border-b border-white/10 bg-(--surface-1) px-4 py-3 md:px-6">
        <h1 className="inline-flex items-center gap-2 text-lg font-semibold text-neutral-100">
          <Clapperboard className="h-4 w-4 text-neutral-300" />
          Library
        </h1>
        <p className="text-xs uppercase tracking-[0.12em] text-neutral-500">
          {isCompareMode ? "Comparing two recordings" : "Play a recording from this folder"}
        </p>
      </header>

      <section
        className="flex w-full shrink-0 overflow-hidden"
        style={{ height: displayedMediaHeight }}
      >
        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-neutral-950/70">
          {showComparePlayer ? <CompareVideoPlayer /> : <VideoPlayer />}
        </main>
        {showPlaybackWorkspace && !showComparePlayer && <PlaybackEventList />}
      </section>

      {showPlaybackWorkspace && (
        <div
          className={`flex h-3 w-full cursor-row-resize items-center justify-center border-y border-white/10 bg-(--surface-2) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 ${
            isResizingMedia ? "bg-white/10" : "hover:bg-white/5"
          }`}
          onPointerDown={handleMediaResizeStart}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              adjustMediaSectionHeight(-MEDIA_SECTION_RESIZE_DELTA);
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              adjustMediaSectionHeight(MEDIA_SECTION_RESIZE_DELTA);
            }
          }}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize media section"
          aria-valuemin={MIN_ACTIVE_MEDIA_HEIGHT}
          aria-valuenow={mediaSectionHeight}
          aria-valuemax={mediaSectionMaxHeight}
          aria-valuetext={`${mediaSectionHeight}px`}
          tabIndex={0}
        >
          <div className="h-0.5 w-24 rounded-full bg-white/35" />
        </div>
      )}

      {showPlaybackWorkspace && <PlayerActionTimelines />}

      <RecordingsList />
    </motion.div>
  );
}
