import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../i18n/i18n";
import { Session } from "../types";
import {
  Layers,
  Terminal,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeft,
  ArrowRight,
  Home,
  Settings,
  Bug,
} from "lucide-solid";

const RotateCwClean = (props: { class?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    class={props.class}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.72 2.78L21 8" />
    <path d="M21 3v5h-5" />
  </svg>
);

// Detect if running on macOS
const isMac = /macintosh|mac os x/i.test(navigator.userAgent);

interface TitleBarProps {
  selectedSession: Session | null;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  historyIndex: number;
  navHistoryLength: number;
  onNavBack: () => void;
  onNavForward: () => void;
  onGoHome: () => void;
  onRebuildIndex: () => void;
  isRebuilding: boolean;
  isLoading: boolean;
  onShowSettings: () => void;
  appVersion: string;
  indexingProgress?: {
    step: string;
    progress: number;
    currentSource: string;
  } | null;
  fontSize?: number;
  onFontSizeChange?: (val: number) => void;
}

export const TitleBar = (props: TitleBarProps) => {
  const { t } = useI18n();
  const [isMaximized, setIsMaximized] = createSignal(false);
  let unlistenResize: (() => void) | undefined;

  const handleMinimize = () => {
    getCurrentWindow().minimize();
  };

  const handleMaximize = async () => {
    const win = getCurrentWindow();
    if (await win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  };

  const handleClose = () => {
    getCurrentWindow().close();
  };

  const handleOpenIssues = async () => {
    try {
      await openUrl("https://github.com/LookAtWhatAiCanDo/Codeoba/issues");
    } catch (err) {
      console.error("Failed to open issues URL:", err);
    }
  };

  onMount(async () => {
    if (!isMac) {
      try {
        const win = getCurrentWindow();
        setIsMaximized(await win.isMaximized());
        unlistenResize = await win.onResized(async () => {
          setIsMaximized(await win.isMaximized());
        });
      } catch (err) {
        console.error("Failed to setup window controls listener:", err);
      }
    }
  });

  onCleanup(() => {
    if (unlistenResize) {
      unlistenResize();
    }
  });

  const renderNavigationPill = () => (
    <div
      class="flex items-center bg-surface/60 border border-border/55 rounded-xl pointer-events-auto flex-shrink-0 no-drag"
      style={{ padding: "4px", gap: "4px" }}
    >
      <button
        onClick={props.onToggleSidebar}
        title={props.sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
        class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer"
      >
        <Show when={props.sidebarCollapsed} fallback={<PanelLeftClose class="w-[16px] h-[16px]" />}>
          <PanelLeftOpen class="w-[16px] h-[16px]" />
        </Show>
      </button>

      <div class="bg-border/40" style={{ width: "1px", height: "16px", margin: "0 4px" }} />

      <button
        onClick={props.onNavBack}
        disabled={props.historyIndex <= 0}
        title="Go Back"
        class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
      >
        <ArrowLeft class="w-[16px] h-[16px]" />
      </button>

      <button
        onClick={props.onNavForward}
        disabled={props.historyIndex >= props.navHistoryLength - 1}
        title="Go Forward"
        class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
      >
        <ArrowRight class="w-[16px] h-[16px]" />
      </button>

      <button
        onClick={props.onGoHome}
        title={t("dashboard.globalStats")}
        class={`w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border hover:border-border/60 rounded-lg transition-all cursor-pointer ${
          props.selectedSession === null
            ? "text-accent bg-accent/10 border-accent/20"
            : "border-transparent text-text-secondary"
        }`}
      >
        <Home class="w-[16px] h-[16px]" />
      </button>

      <div
        class={`inline-flex items-center gap-1.5 transition-all ${props.isRebuilding ? "px-1.5" : ""}`}
      >
        <button
          onClick={props.onRebuildIndex}
          disabled={props.isRebuilding || props.isLoading}
          title={
            props.isRebuilding && props.indexingProgress
              ? `${props.indexingProgress.step === "complete" ? "Finished" : "Rebuilding"}: ${props.indexingProgress.currentSource} (${Math.round(props.indexingProgress.progress * 100)}%)`
              : t("sidebar.forceRebuild")
          }
          class={`w-[30px] h-[30px] inline-flex items-center justify-center border border-transparent rounded-lg transition-all ${
            props.isRebuilding || props.isLoading
              ? "cursor-not-allowed text-accent bg-accent/5 border-accent/15"
              : "hover:bg-surface hover:border-border/60 hover:text-text-primary text-text-secondary cursor-pointer"
          }`}
        >
          <Show
            when={props.isRebuilding || props.isLoading}
            fallback={<RotateCwClean class="w-[16px] h-[16px]" />}
          >
            <RotateCwClean class="w-[16px] h-[16px] animate-spin origin-center" />
          </Show>
        </button>
        <Show when={props.isRebuilding && props.indexingProgress}>
          <span class="text-[10px] font-mono text-accent font-semibold select-none animate-pulse pr-1">
            {Math.round(props.indexingProgress!.progress * 100)}%
          </span>
        </Show>
      </div>

      <div class="bg-border/40" style={{ width: "1px", height: "16px", margin: "0 4px" }} />

      <button
        onClick={props.onShowSettings}
        title={t("settings.title")}
        class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer"
      >
        <Settings class="w-[16px] h-[16px]" />
      </button>
    </div>
  );

  return (
    <div
      class="absolute top-0 left-0 right-0 h-[var(--sk-header-height)] pointer-events-auto z-50 flex items-center justify-between select-none border-b border-border/10 glass transition-all duration-200"
      style={{
        "padding-left": isMac ? "80px" : "24px",
        "padding-right": isMac ? "24px" : "140px",
      }}
      data-tauri-drag-region
    >
      <div class="flex items-center pointer-events-none" style={{ gap: "16px" }}>
        <div
          class="flex items-center pointer-events-auto"
          style={{ gap: "8px", width: "176px", "flex-shrink": 0 }}
          data-tauri-drag-region
        >
          <Terminal class="w-[18px] h-[18px] text-accent animate-pulse" data-tauri-drag-region />
          <div class="flex items-baseline" style={{ gap: "8px" }} data-tauri-drag-region>
            <span
              class="font-bold tracking-widest text-[14px] text-text-primary leading-none"
              data-tauri-drag-region
            >
              CODEOBA
            </span>
            <span
              class="text-[11px] font-mono bg-surface border border-white/10 text-accent font-semibold leading-none inline-flex items-center justify-center"
              style={{
                padding: "2px 6px",
                "border-radius": "4px",
              }}
              data-tauri-drag-region
            >
              v{props.appVersion}
            </span>
          </div>
        </div>
        {renderNavigationPill()}
      </div>

      <div class="flex items-center pointer-events-none" style={{ gap: "12px" }}>
        <div
          class="hidden md:flex items-center text-text-secondary bg-surface/30 rounded-full border border-border/40 pointer-events-auto"
          style={{
            padding: "4px 12px",
            gap: "8px",
            "font-size": "14px",
            "font-weight": "500",
          }}
          data-tauri-drag-region
        >
          <Show
            when={props.selectedSession}
            fallback={
              <span
                class="text-accent font-semibold flex items-center"
                style={{ gap: "4px" }}
                data-tauri-drag-region
              >
                <Layers style={{ width: "12px", height: "12px" }} data-tauri-drag-region />{" "}
                {t("dashboard.globalStats")}
              </span>
            }
          >
            <span
              class="text-text-secondary/70"
              title={props.selectedSession?.cwd || ""}
              data-tauri-drag-region
            >
              {props.selectedSession?.cwd?.split(/[/\\]/).pop() || t("common.root")}
            </span>
            <span class="text-border" data-tauri-drag-region>
              /
            </span>
            <span
              class="text-text-primary"
              title={props.selectedSession?.threadName || t("common.untitledSession")}
              data-tauri-drag-region
            >
              {props.selectedSession?.threadName || t("common.untitledSession")}
            </span>
          </Show>
        </div>
        <Show when={props.fontSize && props.onFontSizeChange}>
          <div
            class="flex items-center bg-surface/40 hover:bg-surface/60 border border-border/60 rounded-xl text-text-secondary select-none box-border pointer-events-auto"
            style={{
              height: "28px",
              width: "90px",
              padding: "2px 6px",
              gap: "4px",
              "font-size": "11px",
            }}
          >
            <button
              onClick={() => props.onFontSizeChange!(Math.max(10, props.fontSize! - 1))}
              class="hover:bg-background hover:text-text-primary rounded transition-all cursor-pointer flex items-center justify-center font-bold text-xs"
              style={{
                width: "16px",
                height: "16px",
                "font-size": "11px",
              }}
              title="Decrease Font Size"
            >
              -
            </button>
            <span
              onDblClick={() => props.onFontSizeChange!(15)}
              class="font-mono text-center cursor-pointer hover:text-text-primary select-none flex-grow"
              style={{
                "font-size": "11px",
              }}
              title={t("detailPane.resetFontSize") || "Double click to reset to default"}
            >
              {props.fontSize}px
            </span>
            <button
              onClick={() => props.onFontSizeChange!(Math.min(24, props.fontSize! + 1))}
              class="hover:bg-background hover:text-text-primary rounded transition-all cursor-pointer flex items-center justify-center font-bold text-xs"
              style={{
                width: "16px",
                height: "16px",
                "font-size": "11px",
              }}
              title="Increase Font Size"
            >
              +
            </button>
          </div>
        </Show>
        <button
          onClick={handleOpenIssues}
          title={t("common.bugTracker")}
          class="bg-surface/40 hover:bg-surface border border-border/60 hover:border-accent/40 rounded-xl text-text-secondary hover:text-accent transition-all cursor-pointer flex items-center justify-center pointer-events-auto"
          style={{
            width: "28px",
            height: "28px",
            padding: "6px",
          }}
        >
          <Bug style={{ width: "14px", height: "14px" }} class="text-accent" />
        </button>
      </div>

      {/* Custom Window Controls for Windows/Linux */}
      <Show when={!isMac}>
        <div class="absolute top-0 right-0 h-full flex items-center z-50 pointer-events-auto select-none no-drag">
          {/* Minimize */}
          <button
            onClick={handleMinimize}
            class="h-full w-11 flex items-center justify-center win-control-btn transition-colors cursor-pointer"
          >
            <svg
              class="w-[14px] h-[14px]"
              viewBox="0 0 10 1"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <line x1="0" y1="0.5" x2="10" y2="0.5" />
            </svg>
          </button>

          {/* Maximize / Restore */}
          <button
            onClick={handleMaximize}
            class="h-full w-11 flex items-center justify-center win-control-btn transition-colors cursor-pointer"
          >
            <Show
              when={isMaximized()}
              fallback={
                <svg
                  class="w-[12px] h-[12px]"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <rect x="0.5" y="0.5" width="9" height="9" />
                </svg>
              }
            >
              <svg
                class="w-[12px] h-[12px]"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <rect x="0.5" y="2.5" width="7" height="7" />
                <path d="M2.5,2.5 V0.5 H9.5 V7.5 H7.5" />
              </svg>
            </Show>
          </button>

          {/* Close */}
          <button
            onClick={handleClose}
            class="h-full w-11 flex items-center justify-center win-close-btn transition-colors cursor-pointer"
          >
            <svg
              class="w-[14px] h-[14px]"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M0.5,0.5 L9.5,9.5 M9.5,0.5 L0.5,9.5" />
            </svg>
          </button>
        </div>
      </Show>
    </div>
  );
};
