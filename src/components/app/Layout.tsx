import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { GameModePage } from "../gamemodes/GameModePage";
import { HomePage } from "../playback/HomePage";
import { Settings } from "../settings/Settings";
import { CombatLogDebug } from "../debug/CombatLogDebug";
import { WarcraftLogsUploadPage } from "../warcraftlogs/WarcraftLogsUploadPage";
import { VideoProvider } from "../../contexts/VideoContext";
import { RecordingProvider } from "../../contexts/RecordingContext";
import { SettingsProvider, useSettings } from "../../contexts/SettingsContext";
import { MarkerProvider } from "../../contexts/MarkerContext";
import { WclUploadProvider } from "../../contexts/WclUploadContext";
import { panelVariants, smoothTransition } from "../../lib/motion";
import { installAvailableAppUpdate } from "../../services/app-updater";
import { type AppView } from "../../types/ui";

export type { AppView };
const GAME_MODE_VIEWS = new Set<AppView>(["mythic-plus", "raid", "pvp"]);
const AUTO_UPDATE_SESSION_FLAG = "floorpov:auto-update-check-ran";

function LayoutContent() {
  const { settings, isLoading: isSettingsLoading } = useSettings();
  const hasAttemptedAutoUpdateRef = useRef(false);
  const [currentView, setCurrentView] = useState<AppView>("main");
  const [gameModeNavigationVersion, setGameModeNavigationVersion] = useState(0);
  const [isDebugBuild, setIsDebugBuild] = useState(false);
  const [autoUpdateBannerText, setAutoUpdateBannerText] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const loadDebugFlag = async () => {
      try {
        const debugEnabled = await invoke<boolean>("is_debug_build");
        setIsDebugBuild(debugEnabled);
      } catch (error) {
        console.error("Failed to load debug build flag:", error);
        setIsDebugBuild(false);
      }
    };

    loadDebugFlag();
  }, []);

  useEffect(() => {
    if (!isDebugBuild && currentView === "debug") {
      setCurrentView("main");
    }
  }, [currentView, isDebugBuild]);

  useEffect(() => {
    if (!isTauri() || isSettingsLoading || !settings.enableAutoUpdate || hasAttemptedAutoUpdateRef.current) {
      return;
    }

    hasAttemptedAutoUpdateRef.current = true;
    let isCancelled = false;

    const runAutoUpdate = async () => {
      try {
        if (typeof window !== "undefined") {
          if (window.sessionStorage.getItem(AUTO_UPDATE_SESSION_FLAG) === "1") {
            return;
          }

          window.sessionStorage.setItem(AUTO_UPDATE_SESSION_FLAG, "1");
        }

        const updateResult = await installAvailableAppUpdate((statusText) => {
          if (!isCancelled) {
            setAutoUpdateBannerText(statusText);
          }
        });

        if (updateResult === "up-to-date" || isCancelled) {
          return;
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("Auto-update check failed:", error);
          setAutoUpdateBannerText(null);
        }
      }
    };

    void runAutoUpdate();

    return () => {
      isCancelled = true;
    };
  }, [isSettingsLoading, settings.enableAutoUpdate]);

  const handleNavigate = (view: AppView) => {
    setCurrentView(view);

    if (GAME_MODE_VIEWS.has(view)) {
      setGameModeNavigationVersion((currentVersion) => currentVersion + 1);
    }
  };

  return (
    <div className="relative h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden">
      {autoUpdateBannerText && (
        <div
          className="pointer-events-none absolute right-4 top-14 z-50 rounded-sm border border-amber-300/30 bg-amber-500/12 px-3 py-2 text-xs text-amber-100 shadow-(--surface-glow)"
          role="status"
          aria-live="polite"
        >
          {autoUpdateBannerText}
        </div>
      )}
      <TitleBar />
      <div className="flex flex-1 min-h-0 flex-col gap-2 p-2 md:flex-row md:gap-3 md:p-3">
        <Sidebar
          onNavigate={handleNavigate}
          currentView={currentView}
          isDebugMode={isDebugBuild}
        />
        <AnimatePresence mode="wait" initial={false}>
          {currentView === "main" ? (
            <HomePage key="main-view" />
          ) : currentView === "settings" ? (
            <motion.div
              key="settings-view"
              className="h-full flex-1 min-w-0 min-h-0 flex flex-col rounded-sm border border-white/10 bg-(--surface-1) shadow-(--surface-glow) overflow-hidden"
              variants={panelVariants}
              initial={reduceMotion ? false : "initial"}
              animate="animate"
              exit={reduceMotion ? undefined : "exit"}
              transition={smoothTransition}
            >
              <Settings />
            </motion.div>
          ) : currentView === "warcraftlogs" ? (
            <motion.div
              key="warcraftlogs-view"
              className="h-full flex-1 min-w-0 min-h-0 flex flex-col rounded-sm border border-white/10 bg-(--surface-1) shadow-(--surface-glow) overflow-hidden"
              variants={panelVariants}
              initial={reduceMotion ? false : "initial"}
              animate="animate"
              exit={reduceMotion ? undefined : "exit"}
              transition={smoothTransition}
            >
              <WarcraftLogsUploadPage />
            </motion.div>
          ) : currentView === "mythic-plus" ? (
            <motion.div
              key="mythic-plus-view"
              className="h-full flex-1 min-w-0 min-h-0 flex flex-col rounded-sm border border-white/10 bg-(--surface-1) shadow-(--surface-glow) overflow-hidden"
              variants={panelVariants}
              initial={reduceMotion ? false : "initial"}
              animate="animate"
              exit={reduceMotion ? undefined : "exit"}
              transition={smoothTransition}
            >
              <GameModePage
                key={`mythic-plus-page-${gameModeNavigationVersion}`}
                gameMode="mythic-plus"
              />
            </motion.div>
          ) : currentView === "raid" ? (
            <motion.div
              key="raid-view"
              className="h-full flex-1 min-w-0 min-h-0 flex flex-col rounded-sm border border-white/10 bg-(--surface-1) shadow-(--surface-glow) overflow-hidden"
              variants={panelVariants}
              initial={reduceMotion ? false : "initial"}
              animate="animate"
              exit={reduceMotion ? undefined : "exit"}
              transition={smoothTransition}
            >
              <GameModePage key={`raid-page-${gameModeNavigationVersion}`} gameMode="raid" />
            </motion.div>
          ) : currentView === "pvp" ? (
            <motion.div
              key="pvp-view"
              className="h-full flex-1 min-w-0 min-h-0 flex flex-col rounded-sm border border-white/10 bg-(--surface-1) shadow-(--surface-glow) overflow-hidden"
              variants={panelVariants}
              initial={reduceMotion ? false : "initial"}
              animate="animate"
              exit={reduceMotion ? undefined : "exit"}
              transition={smoothTransition}
            >
              <GameModePage key={`pvp-page-${gameModeNavigationVersion}`} gameMode="pvp" />
            </motion.div>
          ) : (
            <CombatLogDebug />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function Layout() {
  return (
    <VideoProvider>
      <SettingsProvider>
        <MarkerProvider>
          <RecordingProvider>
            <WclUploadProvider>
              <LayoutContent />
            </WclUploadProvider>
          </RecordingProvider>
        </MarkerProvider>
      </SettingsProvider>
    </VideoProvider>
  );
}
