import { createSignal, Show, For } from "solid-js";

import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../i18n/i18n";
import { Session } from "../types";
import { useSpeech } from "../utils/useSpeech";
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
  SkipBack,
  Play,
  Pause,
  Square,
  SkipForward,
  Volume2,
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

/**
 * One box for every control in the navigation pill. It used to mix three sizes
 * — 16px for the nav icons, 14px for the Read Aloud transport, 12px for stop —
 * which left the row optically uneven even though all the glyphs were centered
 * on the same line. Lucide draws its icons on a shared 24-unit grid with a
 * common stroke width, so rendering them all at one size is what keeps their
 * weight consistent; per-icon sizes are what break it.
 */
const PILL_ICON = "w-[16px] h-[16px]";

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
  onGoToReadAloud?: () => void;
}

export const TitleBar = (props: TitleBarProps) => {
  const { t, locale } = useI18n();
  const speech = useSpeech();
  const [showPrevDropdown, setShowPrevDropdown] = createSignal(false);
  const [showNextDropdown, setShowNextDropdown] = createSignal(false);

  const handleOpenIssues = async () => {
    try {
      await openUrl("https://github.com/LookAtWhatAiCanDo/Codeoba/issues");
    } catch (err) {
      console.error("Failed to open issues URL:", err);
    }
  };

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
        <Show when={props.sidebarCollapsed} fallback={<PanelLeftClose class={PILL_ICON} />}>
          <PanelLeftOpen class={PILL_ICON} />
        </Show>
      </button>

      <div class="bg-border/40" style={{ width: "1px", height: "16px", margin: "0 4px" }} />

      <button
        onClick={props.onNavBack}
        disabled={props.historyIndex <= 0}
        title="Go Back"
        class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
      >
        <ArrowLeft class={PILL_ICON} />
      </button>

      <button
        onClick={props.onNavForward}
        disabled={props.historyIndex >= props.navHistoryLength - 1}
        title="Go Forward"
        class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
      >
        <ArrowRight class={PILL_ICON} />
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
        <Home class={PILL_ICON} />
      </button>

      {/*
        Nothing in this group changes size between idle and rebuilding: the
        progress slot below is always laid out, so starting a rebuild never
        shifts the Read Aloud controls that follow. That also means the refresh
        button never moves while it is spinning.

        Explicit px rather than the rem-based gap-1.5/px-1.5: the root font
        size is user-adjustable (App.tsx sets documentElement.style.fontSize,
        default 15px), so 0.375rem lands on 5.625px and drags the spinning
        icon a quarter of a device pixel off the grid, where the SVG
        re-rasterizes about an off-grid center every frame. Every other offset
        in this pill is already integer px for the same reason.
      */}
      <div class="inline-flex items-center" style={{ gap: "6px" }}>
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
          {/*
            One icon whose classes toggle, not two instances behind a <Show>:
            swapping the element replaced the DOM node at the exact moment the
            spin began, which promoted a fresh compositing layer mid-animation
            and showed up as a hitch on the first frame. will-change keeps the
            spinning icon on its own layer so it is rasterized once and rotated
            as a texture rather than re-rasterized every frame.
          */}
          <RotateCwClean
            class={`${PILL_ICON} ${
              props.isRebuilding || props.isLoading
                ? "animate-spin origin-center will-change-transform"
                : ""
            }`}
          />
        </button>
        {/*
          Always laid out, never conditionally mounted — mounting it mid-rebuild
          is what made the Read Aloud controls jump. Only the opacity changes.

          28px is exact, not padded guesswork: "100%" measures 24px in JetBrains
          Mono at 10px (6px/char), plus the 4px of trailing padding. Right
          aligned so the "%" stays put as the number goes 5% -> 40% -> 100%.
          The pulse lives on an inner element so the outer opacity can fade
          independently of it.
        */}
        <span
          class={`text-[10px] font-mono text-accent font-semibold select-none inline-flex justify-end transition-opacity duration-200 ${
            props.isRebuilding && props.indexingProgress ? "opacity-100" : "opacity-0"
          }`}
          style={{ width: "28px", "padding-right": "4px" }}
          aria-hidden={!(props.isRebuilding && props.indexingProgress)}
        >
          <span class="animate-pulse">
            {props.indexingProgress ? `${Math.round(props.indexingProgress.progress * 100)}%` : ""}
          </span>
        </span>
      </div>

      <div class="bg-border/40" style={{ width: "1px", height: "16px", margin: "0 4px" }} />
      <div class="flex items-center" style={{ gap: "2px" }}>
        <button
          onClick={() => props.onGoToReadAloud?.()}
          title={t("dashboard.readAloud")}
          class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer"
        >
          <Volume2 class={PILL_ICON} />
        </button>
        {/*
          flex items-center, not inline-block: as a block container this wrapper
          put its inline-flex button on a text baseline, so the button's vertical
          position came from the inherited line-height rather than from the row's
          align-items. That sat prev/next 2px below volume/play/stop, and since
          the strut scales with the user's font-size setting the gap widened as
          the font grew. Centering here makes it depend on nothing but the row.
        */}
        <div
          class="relative flex items-center"
          onMouseEnter={() => setShowPrevDropdown(true)}
          onMouseLeave={() => setShowPrevDropdown(false)}
        >
          <button
            onClick={() => speech.prev()}
            title={showPrevDropdown() ? "" : t("readAloud.speechPrev")}
            class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer"
          >
            <SkipBack class={PILL_ICON} />
          </button>
          <Show when={showPrevDropdown() && speech.pastHistory().length > 0}>
            <div class="absolute top-full left-0 pt-1 z-[9999]">
              <div class="bg-surface border border-border rounded-xl shadow-xl py-1.5 w-64 select-none text-left no-drag">
                <For each={speech.pastHistory()}>
                  {(item) => (
                    <button
                      onClick={() => {
                        speech.goToIndex(item.index);
                        setShowPrevDropdown(false);
                      }}
                      class="w-full text-left px-3 py-1.5 text-[11px] hover:bg-accent/10 hover:text-accent text-text-primary transition-all truncate block cursor-pointer"
                      title={item.text}
                    >
                      {item.text}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>

        <button
          onClick={() => {
            if (speech.isPlaying()) {
              speech.play();
            } else if (props.selectedSession) {
              speech.play(props.selectedSession, locale());
            } else {
              speech.play();
            }
          }}
          title={
            speech.isPlaying() && !speech.isPaused()
              ? t("readAloud.speechPause")
              : t("readAloud.speechPlay")
          }
          class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer"
        >
          {speech.isPlaying() && !speech.isPaused() ? (
            <Pause class={PILL_ICON} />
          ) : (
            <Play class={PILL_ICON} />
          )}
        </button>

        <button
          onClick={() => speech.stop()}
          title={t("readAloud.speechStop")}
          class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer"
        >
          <Square class={PILL_ICON} />
        </button>

        {/* Same baseline-vs-centering fix as the prev-track wrapper above. */}
        <div
          class="relative flex items-center"
          onMouseEnter={() => setShowNextDropdown(true)}
          onMouseLeave={() => setShowNextDropdown(false)}
        >
          <button
            onClick={() => speech.next()}
            title={showNextDropdown() ? "" : t("readAloud.speechNext")}
            class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer"
          >
            <SkipForward class={PILL_ICON} />
          </button>
          <Show when={showNextDropdown() && speech.futureHistory().length > 0}>
            <div class="absolute top-full right-0 pt-1 z-[9999]">
              <div class="bg-surface border border-border rounded-xl shadow-xl py-1.5 w-64 select-none text-left no-drag">
                <For each={speech.futureHistory()}>
                  {(item) => (
                    <button
                      onClick={() => {
                        speech.goToIndex(item.index);
                        setShowNextDropdown(false);
                      }}
                      class="w-full text-left px-3 py-1.5 text-[11px] hover:bg-accent/10 hover:text-accent text-text-primary transition-all truncate block cursor-pointer"
                      title={item.text}
                    >
                      {item.text}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );

  return (
    <div
      class="absolute top-0 left-0 right-0 h-[var(--sk-header-height)] pointer-events-auto z-[1000] flex items-center justify-between select-none border-b border-border/10 glass transition-all duration-200"
      style={{
        "padding-left": isMac ? "80px" : "24px",
        "padding-right": "24px",
      }}
      data-tauri-drag-region={isMac ? true : undefined}
    >
      <div class="flex items-center pointer-events-none" style={{ gap: "16px" }}>
        <div
          class="flex items-center pointer-events-auto"
          style={{ gap: "8px", width: "176px", "flex-shrink": 0 }}
          data-tauri-drag-region={isMac ? true : undefined}
        >
          <Terminal
            class="w-[18px] h-[18px] text-accent animate-pulse"
            data-tauri-drag-region={isMac ? true : undefined}
          />
          <div
            class="flex items-baseline"
            style={{ gap: "8px" }}
            data-tauri-drag-region={isMac ? true : undefined}
          >
            <span
              class="font-bold tracking-widest text-[14px] text-text-primary leading-none"
              data-tauri-drag-region={isMac ? true : undefined}
            >
              CODEOBA
            </span>
            <span
              class="text-[11px] font-mono bg-surface border border-white/10 text-accent font-semibold leading-none inline-flex items-center justify-center"
              style={{
                padding: "2px 6px",
                "border-radius": "4px",
              }}
              data-tauri-drag-region={isMac ? true : undefined}
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
          data-tauri-drag-region={isMac ? true : undefined}
        >
          <Show
            when={props.selectedSession}
            fallback={
              <span
                class="text-accent font-semibold flex items-center"
                style={{ gap: "4px" }}
                data-tauri-drag-region={isMac ? true : undefined}
              >
                <Layers
                  style={{ width: "12px", height: "12px" }}
                  data-tauri-drag-region={isMac ? true : undefined}
                />{" "}
                {t("dashboard.globalStats")}
              </span>
            }
          >
            <span
              class="text-text-secondary/70"
              title={props.selectedSession?.cwd || ""}
              data-tauri-drag-region={isMac ? true : undefined}
            >
              {props.selectedSession?.cwd?.split(/[/\\]/).pop() || t("common.root")}
            </span>
            <span class="text-border" data-tauri-drag-region={isMac ? true : undefined}>
              /
            </span>
            <span
              class="text-text-primary"
              title={props.selectedSession?.threadName || t("common.untitledSession")}
              data-tauri-drag-region={isMac ? true : undefined}
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
              title={t("detailPane.resetFontSize")}
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
          onClick={props.onShowSettings}
          title={t("settings.title")}
          class="bg-surface/40 hover:bg-surface border border-border/60 hover:border-accent/40 rounded-xl text-text-secondary hover:text-accent transition-all cursor-pointer flex items-center justify-center pointer-events-auto"
          style={{
            width: "28px",
            height: "28px",
            padding: "6px",
          }}
        >
          <Settings style={{ width: "14px", height: "14px" }} />
        </button>

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
    </div>
  );
};
