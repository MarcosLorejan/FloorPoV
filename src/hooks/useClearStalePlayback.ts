import { useEffect, useRef } from "react";
import { useMarker } from "../contexts/MarkerContext";
import { useVideo } from "../contexts/VideoContext";
import { shouldClearStalePlayback } from "../utils/playback-session";

interface PlaybackRecordingItem {
  file_path: string;
}

export function useClearStalePlayback(
  recordings: PlaybackRecordingItem[],
  isListReady: boolean,
  onCleared?: () => void,
): void {
  const { loadedFilePath, videoSrc, clearPlayback } = useVideo();
  const { clearEvents } = useMarker();
  const onClearedRef = useRef(onCleared);
  onClearedRef.current = onCleared;

  useEffect(() => {
    if (!isListReady || !shouldClearStalePlayback(loadedFilePath, Boolean(videoSrc), recordings)) {
      return;
    }

    clearPlayback();
    clearEvents();
    onClearedRef.current?.();
  }, [clearEvents, clearPlayback, isListReady, loadedFilePath, recordings, videoSrc]);
}
