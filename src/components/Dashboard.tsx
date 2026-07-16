import { createSignal, createMemo, createEffect, For, Show, Switch, Match } from "solid-js";
import { useI18n } from "../i18n/i18n";
import {
  formatNumberWithSetting,
  formatDateWithSetting,
  formatTimeWithSetting,
} from "../utils/format";
import {
  Folder,
  MessageSquare,
  Clock,
  Cpu,
  Settings,
  RefreshCw,
  Bolt,
  Layers,
  Play,
  Pause,
  Trash2,
  X,
  Locate,
  AlertTriangle,
} from "lucide-solid";
import { getSessionComputeTimeMs, formatSpeed, formatDuration } from "./Sidebar";
import { Session, DashboardTab } from "../types";
import { useSpeech } from "../utils/useSpeech";

interface DashboardProps {
  sessions: Session[];
  numberFormat?: string;
  dateFormat?: string;
  timeFormat?: string;
  showSeconds?: boolean;
  activeTab?: DashboardTab;
  onActiveTabChange?: (tab: DashboardTab) => void;
  onSelectSession?: (session: Session) => void;
  onDeeplink?: (sessionId: string, turnIndex: number, clickedText?: string) => void;
}

interface ModelItemStats {
  modelName: string;
  turnCount: number;
  totalTokens: number;
  computeTimeMs: number;
  speedTps: number;
}

type SortDimension = "turns" | "tokens" | "speed" | "duration" | "name";

export const Dashboard = (props: DashboardProps) => {
  const { t, locale } = useI18n();
  const speech = useSpeech();
  let readAloudScrollContainer: HTMLDivElement | undefined;
  const [isScrollLocked, setIsScrollLocked] = createSignal(true);
  const [sessionColWidth, setSessionColWidth] = createSignal(220);
  const [showClearConfirm, setShowClearConfirm] = createSignal(false);

  const startResize = (e: MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sessionColWidth();

    const doDrag = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(120, Math.min(600, startWidth + delta));
      setSessionColWidth(newWidth);
    };

    const stopDrag = () => {
      window.removeEventListener("mousemove", doDrag);
      window.removeEventListener("mouseup", stopDrag);
    };

    window.addEventListener("mousemove", doDrag);
    window.addEventListener("mouseup", stopDrag);
  };

  const handleScroll = (e: Event) => {
    const target = e.currentTarget as HTMLDivElement;
    if (!target) return;

    const scrollBottom = target.scrollHeight - target.scrollTop;
    const clientHeight = target.clientHeight;
    const atBottom = scrollBottom - clientHeight <= 15;
    setIsScrollLocked(atBottom);
  };

  createEffect(() => {
    const list = speech.sentences();

    if (list.length > 0 && isScrollLocked() && readAloudScrollContainer) {
      setTimeout(() => {
        if (readAloudScrollContainer) {
          readAloudScrollContainer.scrollTop = readAloudScrollContainer.scrollHeight;
        }
      }, 50);
    }
  });
  const [localActiveTab, setLocalActiveTab] = createSignal<DashboardTab>(DashboardTab.Global);
  const activeTab = () => props.activeTab || localActiveTab();
  const setActiveTab = (tab: DashboardTab) => {
    if (props.onActiveTabChange) {
      props.onActiveTabChange(tab);
    } else {
      setLocalActiveTab(tab);
    }
  };

  const formatGeneratedTime = (timestamp?: number) => {
    if (!timestamp) return "";
    const dateObj = new Date(timestamp);
    const now = new Date();

    const isToday =
      dateObj.getDate() === now.getDate() &&
      dateObj.getMonth() === now.getMonth() &&
      dateObj.getFullYear() === now.getFullYear();

    const df = props.dateFormat || "system";
    const tf = props.timeFormat || "system";
    const sec = props.showSeconds || false;

    const timeStr = formatTimeWithSetting(dateObj, tf, sec, locale());

    if (isToday) {
      return timeStr;
    }

    const dateStr = formatDateWithSetting(dateObj, df, locale());
    return `${dateStr} ${timeStr}`;
  };
  const [sortBy, setSortBy] = createSignal<SortDimension>("turns");
  const [sortAscending, setSortAscending] = createSignal(false);

  // Compute stats based on the passed sessions (which will be the visible/filtered ones)
  const stats = createMemo(() => {
    const list = props.sessions;
    const totalConversations = list.length;
    let totalTurns = 0;
    let totalDurationMs = 0;
    let totalElapsedMs = 0;
    let totalCompactions = 0;
    let totalCompactionTimeMs = 0;
    let promptTokens = 0;
    let responseTokens = 0;

    // Model aggregation
    const modelMap = new Map<
      string,
      {
        turnCount: number;
        promptChars: number;
        responseChars: number;
        computeTimeMs: number;
        totalTokens: number;
      }
    >();

    for (const session of list) {
      totalTurns += session.turns.length;
      totalDurationMs += getSessionComputeTimeMs(session);
      totalElapsedMs += Math.max(0, session.updatedAt - session.timestamp);

      for (const turn of session.turns) {
        const extra = turn.extraData;

        // Count compactions
        if (extra && extra["isCompaction"] === "true") {
          totalCompactions++;
        }
        if (extra && extra["compactionTimeMs"]) {
          const ms = parseInt(extra["compactionTimeMs"], 10);
          if (!isNaN(ms)) totalCompactionTimeMs += ms;
        }

        // Model stats
        const modelName = (extra && extra["model"]) || t("dashboard.unknownModel");
        let mStats = modelMap.get(modelName);
        if (!mStats) {
          mStats = {
            turnCount: 0,
            promptChars: 0,
            responseChars: 0,
            computeTimeMs: 0,
            totalTokens: 0,
          };
          modelMap.set(modelName, mStats);
        }
        mStats.turnCount++;

        const turnUserLen = (turn.userMessage || "").length;
        const turnAssistantLen = (turn.assistantMessage || "").length;

        mStats.promptChars += turnUserLen;
        mStats.responseChars += turnAssistantLen;

        let turnInputTokens = 0;
        let turnOutputTokens = 0;

        if (turn.inputTokens !== undefined && turn.inputTokens !== null) {
          turnInputTokens = turn.inputTokens;
        } else {
          turnInputTokens = Math.round((turnUserLen + 3) / 4);
        }

        if (turn.outputTokens !== undefined && turn.outputTokens !== null) {
          turnOutputTokens = turn.outputTokens;
        } else {
          turnOutputTokens = Math.round((turnAssistantLen + 3) / 4);
        }

        mStats.totalTokens += turnInputTokens + turnOutputTokens;
        promptTokens += turnInputTokens;
        responseTokens += turnOutputTokens;

        const compMsStr = extra ? extra["computeTimeMs"] : null;
        const compMs = compMsStr ? parseInt(compMsStr, 10) : null;
        if (compMs !== null && !isNaN(compMs) && compMs > 0) {
          mStats.computeTimeMs += Math.min(900000, compMs);
        } else if (turn.assistantMessage && turn.assistantMessage.length > 0) {
          const estMs = Math.round((turn.assistantMessage.length / 120.0) * 1000.0);
          mStats.computeTimeMs += Math.max(2000, Math.min(60000, estMs));
        }
      }
    }

    const totalEstTokens = promptTokens + responseTokens;
    const avgTurns = totalConversations > 0 ? totalTurns / totalConversations : 0;
    const avgDurationMs = totalConversations > 0 ? totalElapsedMs / totalConversations : 0;
    const avgSpeedText = formatSpeed(totalEstTokens, totalDurationMs);

    // Format model list
    const modelStatsList: ModelItemStats[] = [];
    modelMap.forEach((val, key) => {
      // If we didn't populate totalTokens (due to character estimation fallback)
      let finalTokens = val.totalTokens;
      if (finalTokens === 0) {
        finalTokens = Math.round((val.promptChars + val.responseChars) / 4);
      }

      const speedTps = val.computeTimeMs > 0 ? (finalTokens * 1000.0) / val.computeTimeMs : 0;
      modelStatsList.push({
        modelName: key,
        turnCount: val.turnCount,
        totalTokens: finalTokens,
        computeTimeMs: val.computeTimeMs,
        speedTps,
      });
    });

    // Group aggregation
    const groupMap = new Map<string, number>();
    for (const session of list) {
      const source = session.sourceId;
      groupMap.set(source, (groupMap.get(source) || 0) + 1);
    }
    const sourceGroups = Array.from(groupMap.entries()).sort((a, b) => b[1] - a[1]);

    return {
      totalConversations,
      totalTurns,
      promptTokens,
      responseTokens,
      totalEstTokens,
      avgTurns,
      totalDurationMs,
      avgDurationMs,
      avgSpeedText,
      totalCompactions,
      totalCompactionTimeMs,
      modelStatsList,
      sourceGroups,
    };
  });

  // Sorted model list
  const sortedModelStats = createMemo(() => {
    const list = [...stats().modelStatsList];
    const dim = sortBy();
    const asc = sortAscending();

    list.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;
      if (dim === "turns") {
        valA = a.turnCount;
        valB = b.turnCount;
      } else if (dim === "tokens") {
        valA = a.totalTokens;
        valB = b.totalTokens;
      } else if (dim === "speed") {
        valA = a.speedTps;
        valB = b.speedTps;
      } else if (dim === "duration") {
        valA = a.computeTimeMs;
        valB = b.computeTimeMs;
      } else if (dim === "name") {
        return asc
          ? a.modelName.localeCompare(b.modelName)
          : b.modelName.localeCompare(a.modelName);
      }

      return asc ? valA - valB : valB - valA;
    });
    return list;
  });

  const toggleSort = (dim: SortDimension) => {
    if (sortBy() === dim) {
      setSortAscending(!sortAscending());
    } else {
      setSortBy(dim);
      setSortAscending(false);
    }
  };

  const formatNumber = (num: number) => {
    return formatNumberWithSetting(num, props.numberFormat || "system", locale());
  };

  const handleDashboardClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest("input, textarea, button, select, a, [role='button']")) {
      const container = document.getElementById("dashboard-scroll-container");
      if (container) {
        container.focus();
      }
    }
  };

  return (
    <div
      id="dashboard-scroll-container"
      tabindex="-1"
      onClick={handleDashboardClick}
      class="flex-grow h-full flex flex-col bg-background/95 min-w-0 overflow-y-auto px-8 pt-6 pb-6 space-y-6 outline-none transition-all duration-200 relative focus-within:z-[51] group"
    >
      {/* Focus Highlight Border Overlay */}
      <div class="pointer-events-none absolute inset-0 border-2 border-transparent group-focus-within:border-accent/35 z-[100] transition-all duration-200" />

      {/* Overview Tabs Navigation */}
      {/* Overview Tabs Navigation */}
      <div class="flex items-center justify-between max-w-xl flex-shrink-0 gap-4">
        <div class="flex bg-surface p-1 rounded-xl border border-border/60 max-w-md flex-grow">
          <button
            onClick={() => setActiveTab(DashboardTab.Global)}
            class={`flex-1 text-center py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab() === DashboardTab.Global
                ? "bg-background text-accent border border-border/80 shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t("dashboard.globalStats")}
          </button>
          <button
            onClick={() => setActiveTab(DashboardTab.Groups)}
            class={`flex-1 text-center py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab() === DashboardTab.Groups
                ? "bg-background text-accent border border-border/80 shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t("dashboard.agentStats")}
          </button>
          <button
            onClick={() => setActiveTab(DashboardTab.ReadAloud)}
            class={`flex-1 text-center py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab() === DashboardTab.ReadAloud
                ? "bg-background text-accent border border-border/80 shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t("dashboard.readAloud")}
          </button>
        </div>
      </div>

      <Switch>
        <Match when={activeTab() === DashboardTab.Global}>
          {/* Global Stats Grid View */}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl flex-shrink-0">
            <StatCard
              title={t("dashboard.totalConversations")}
              value={formatNumber(stats().totalConversations)}
              subtitle={t("detailPane.selectSession")}
              icon={<Folder class="w-5 h-5" />}
            />
            <StatCard
              title={t("dashboard.totalTurns")}
              value={formatNumber(stats().totalTurns)}
              subtitle={`${t("dashboard.avgTurns")}: ${stats().avgTurns.toFixed(1)}`}
              icon={<MessageSquare class="w-5 h-5" />}
            />
            <StatCard
              title={t("dashboard.avgSpeed")}
              value={stats().avgSpeedText}
              subtitle={t("settings.general.logModeDesc")}
              icon={<Bolt class="w-5 h-5" />}
            />
            <StatCard
              title={t("dashboard.totalEstTokens")}
              value={formatNumber(stats().totalEstTokens)}
              subtitle={`${formatNumber(stats().promptTokens)} in / ${formatNumber(stats().responseTokens)} out`}
              icon={<Cpu class="w-5 h-5" />}
            />
            <StatCard
              title={t("dashboard.totalComputeTime")}
              value={formatDuration(stats().totalDurationMs)}
              subtitle={t("settings.general.cacheDesc")}
              icon={<Clock class="w-5 h-5" />}
            />
            <StatCard
              title={t("dashboard.avgSessionDuration")}
              value={formatDuration(stats().avgDurationMs)}
              subtitle={t("settings.general.logModeDesc")}
              icon={<Clock class="w-5 h-5" />}
            />
            <StatCard
              title={t("dashboard.totalCompactions")}
              value={formatNumber(stats().totalCompactions)}
              subtitle={t("settings.general.logMode")}
              icon={<Settings class="w-5 h-5" />}
            />
            <StatCard
              title={t("dashboard.totalCompactionTime")}
              value={formatDuration(stats().totalCompactionTimeMs)}
              subtitle={
                stats().totalCompactions > 0
                  ? `Avg: ${(stats().totalCompactionTimeMs / stats().totalCompactions / 1000).toFixed(2)}s`
                  : "Avg: 0s"
              }
              icon={<RefreshCw class="w-5 h-5" />}
            />
          </div>

          {/* Model Performance List */}
          <div class="space-y-4 max-w-5xl">
            <div class="flex items-center justify-between border-b border-border/40 pb-2 flex-shrink-0">
              <h3 class="text-sm font-bold uppercase tracking-wider text-text-secondary">
                {t("dashboard.topModels")}
              </h3>

              {/* Sorting controls */}
              <div class="flex items-center gap-2">
                <span class="text-xs text-text-secondary/70">{t("dashboard.sort")}:</span>
                <For each={["turns", "tokens", "speed", "duration", "name"] as const}>
                  {(dim) => (
                    <button
                      onClick={() => toggleSort(dim)}
                      class={`px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                        sortBy() === dim
                          ? "bg-accent/10 border-accent/40 text-accent font-bold"
                          : "bg-surface border-border/40 text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {
                        {
                          turns: t("dashboard.turns"),
                          tokens: t("dashboard.tokens"),
                          speed: t("dashboard.speed"),
                          duration: t("dashboard.duration"),
                          name: t("dashboard.name"),
                        }[dim]
                      }
                      <Show when={sortBy() === dim}>
                        <span class="ml-1 text-[0.625rem]">{sortAscending() ? "▲" : "▼"}</span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class="space-y-3.5">
              <For
                each={sortedModelStats()}
                fallback={
                  <div class="p-6 text-center text-text-secondary text-sm">
                    {t("detailPane.noPermissions")}
                  </div>
                }
              >
                {(m) => (
                  <div class="bg-surface/40 border border-border/40 rounded-2xl p-5 hover:bg-surface/60 transition-all shadow-sm">
                    <div class="flex items-center justify-between mb-3">
                      <span class="text-sm font-bold text-text-primary">{m.modelName}</span>
                      <div class="flex items-center gap-1 text-xs text-accent font-semibold bg-accent-light/10 border border-accent/25 px-2 py-0.5 rounded-lg">
                        <Bolt class="w-3.5 h-3.5" />
                        <span>{m.speedTps.toFixed(1)} t/s</span>
                      </div>
                    </div>

                    <div class="grid grid-cols-3 gap-6 text-xs text-text-secondary">
                      <div>
                        <div class="text-[0.625rem] font-semibold uppercase tracking-wider text-text-secondary/50 mb-1">
                          {t("dashboard.tokens")}
                        </div>
                        <div class="text-sm font-bold text-text-primary">
                          {formatNumber(m.totalTokens)}
                        </div>
                      </div>
                      <div>
                        <div class="text-[0.625rem] font-semibold uppercase tracking-wider text-text-secondary/50 mb-1">
                          {t("dashboard.turns")}
                        </div>
                        <div class="text-sm font-bold text-text-primary">
                          {m.turnCount} {t("dashboard.turns").toLowerCase()}
                          <span class="text-xs text-text-secondary/60 font-normal ml-1.5">
                            (
                            {stats().totalTurns > 0
                              ? ((m.turnCount / stats().totalTurns) * 100).toFixed(1)
                              : 0}
                            %)
                          </span>
                        </div>
                      </div>
                      <div>
                        <div class="text-[0.625rem] font-semibold uppercase tracking-wider text-text-secondary/50 mb-1">
                          {t("dashboard.duration")}
                        </div>
                        <div class="text-sm font-bold text-text-primary">
                          {formatDuration(m.computeTimeMs)}
                          <span class="text-xs text-text-secondary/60 font-normal ml-1.5">
                            (
                            {stats().totalDurationMs > 0
                              ? ((m.computeTimeMs / stats().totalDurationMs) * 100).toFixed(1)
                              : 0}
                            %)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === DashboardTab.Groups}>
          {/* Groups Dashboard View */}
          <div class="space-y-4 max-w-4xl">
            <h3 class="text-sm font-bold uppercase tracking-wider text-text-secondary">
              {t("dashboard.agentStats")}
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <For each={stats().sourceGroups}>
                {([source, count]) => (
                  <div class="bg-surface border border-border/50 rounded-2xl p-5 flex items-center justify-between shadow-sm">
                    <div class="flex items-center gap-3">
                      <div class="p-2.5 bg-accent/10 border border-accent/25 rounded-xl text-accent">
                        <Layers class="w-5 h-5" />
                      </div>
                      <div>
                        <h4 class="text-sm font-bold text-text-primary capitalize">{source}</h4>
                        <span class="text-xs text-text-secondary">{t("settings.agents.desc")}</span>
                      </div>
                    </div>
                    <div class="text-right">
                      <div class="text-[1.25rem] font-bold text-text-primary">{count}</div>
                      <span class="text-xs text-text-secondary">
                        {t("sidebar.title").toLowerCase()}
                      </span>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === DashboardTab.ReadAloud}>
          {/* Read Aloud Tab View */}
          <div class="space-y-4 max-w-5xl flex-grow flex flex-col min-h-0">
            <div class="flex items-center justify-between flex-shrink-0">
              <h3 class="text-sm font-bold uppercase tracking-wider text-text-secondary select-none">
                {t("dashboard.readAloudHistory")}
              </h3>
              <Show when={speech.sentences().length > 0}>
                <button
                  onClick={() => setShowClearConfirm(true)}
                  class="bg-surface/40 hover:bg-surface border border-border/60 hover:border-red-500/40 rounded-xl text-text-secondary hover:text-red-500 transition-all cursor-pointer flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                  <span>{t("dashboard.clearHistory")}</span>
                </button>

                {/* Clear History Confirmation Modal */}
                <Show when={showClearConfirm()}>
                  <div class="fixed inset-0 bg-black/60 z-[999] flex items-center justify-center backdrop-blur-sm">
                    <div class="bg-surface border border-border/80 p-5 rounded-2xl w-80 shadow-2xl animate-in zoom-in-95 duration-200 text-center flex flex-col items-center gap-3">
                      <AlertTriangle class="w-10 h-10 text-red-500 animate-pulse mx-auto" />
                      <div class="text-sm font-semibold text-text-primary">
                        {t("dashboard.clearReadAloudHistory")}?
                      </div>
                      <div class="text-xs text-text-secondary leading-relaxed">
                        {t("dashboard.confirmClearHistory")}
                      </div>
                      <div class="flex justify-end gap-2 mt-4 w-full">
                        <button
                          onClick={() => setShowClearConfirm(false)}
                          class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-light border border-border/60 hover:bg-surface text-text-secondary transition-all cursor-pointer flex-1"
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          onClick={() => {
                            speech.clearReadAloudHistory();
                            setShowClearConfirm(false);
                          }}
                          class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500 hover:bg-red-600 text-white shadow transition-all cursor-pointer flex-1"
                        >
                          {t("common.clear")}
                        </button>
                      </div>
                    </div>
                  </div>
                </Show>
              </Show>
            </div>

            <div class="flex-grow border border-border/40 rounded-2xl bg-surface/20 overflow-hidden flex flex-col min-h-[300px]">
              <div
                ref={(el) => {
                  readAloudScrollContainer = el;
                  if (el && isScrollLocked()) {
                    setTimeout(() => {
                      el.scrollTop = el.scrollHeight;
                    }, 50);
                  }
                }}
                onScroll={handleScroll}
                class="overflow-x-auto overflow-y-auto flex-grow"
              >
                <table class="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr class="text-text-secondary font-semibold select-none">
                      <th class="sticky top-0 z-20 bg-surface/95 backdrop-blur-sm px-4 py-1 w-24 text-center border-b border-border/40" />
                      <th class="sticky top-0 z-20 bg-surface/95 backdrop-blur-sm px-4 py-1 w-px whitespace-nowrap border-b border-border/40">
                        {t("dashboard.time")}
                      </th>
                      <th
                        class="sticky top-0 z-20 bg-surface/95 backdrop-blur-sm px-4 py-1 relative group/header select-none border-b border-border/40"
                        style={{
                          width: `${sessionColWidth()}px`,
                          "max-width": `${sessionColWidth()}px`,
                        }}
                      >
                        <span class="truncate block pr-2">{t("dashboard.session")}</span>
                        <div
                          onMouseDown={startResize}
                          class="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/40 active:bg-accent transition-colors z-10"
                        />
                      </th>
                      <th class="sticky top-0 z-20 bg-surface/95 backdrop-blur-sm px-4 py-1 w-full border-b border-border/40">
                        {t("dashboard.text")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <For
                      each={speech.sentences()}
                      fallback={
                        <tr>
                          <td colspan="4" class="p-8 text-center text-text-secondary select-none">
                            {t("dashboard.noSpokenHistory")}
                          </td>
                        </tr>
                      }
                    >
                      {(item) => {
                        const isCurrent = createMemo(
                          () => speech.currentSentenceIndex() === item.globalIndex
                        );
                        return (
                          <tr
                            class={`border-b border-border/10 hover:bg-surface/30 transition-colors group/row ${
                              isCurrent()
                                ? "bg-accent/5 text-accent font-medium"
                                : "text-text-primary"
                            }`}
                          >
                            {/* Action Buttons Column */}
                            <td class="px-2 py-1 w-24 text-center select-none">
                              <div class="flex items-center justify-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    speech.removeSentence(item.globalIndex);
                                  }}
                                  class="text-text-secondary/40 hover:text-red-500 p-1 rounded-lg hover:bg-red-500/10 opacity-0 group-hover/row:opacity-100 transition-all cursor-pointer inline-flex items-center justify-center"
                                  title="Remove from history"
                                >
                                  <X class="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!item.sessionId) return;
                                    const sess = props.sessions.find(
                                      (s) => s.id === item.sessionId
                                    );
                                    if (sess && props.onSelectSession) {
                                      props.onSelectSession(sess);
                                    }
                                    if (props.onDeeplink) {
                                      props.onDeeplink(item.sessionId, item.turnIndex, item.text);
                                    }
                                  }}
                                  class="text-text-secondary/40 hover:text-accent p-1 rounded-lg hover:bg-accent/10 opacity-0 group-hover/row:opacity-100 transition-all cursor-pointer inline-flex items-center justify-center"
                                  title="Sync to transcript"
                                >
                                  <Locate class="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isCurrent()) {
                                      if (speech.isPlaying() && !speech.isPaused()) {
                                        speech.play(); // pause
                                      } else {
                                        speech.play(); // resume
                                      }
                                    } else {
                                      speech.goToIndex(item.globalIndex);
                                    }
                                  }}
                                  class="text-text-secondary hover:text-accent p-1 rounded-lg hover:bg-surface transition-all cursor-pointer inline-flex items-center justify-center"
                                  title={
                                    isCurrent() && speech.isPlaying() && !speech.isPaused()
                                      ? t("readAloud.speechPause")
                                      : t("readAloud.speechPlay")
                                  }
                                >
                                  <Show
                                    when={isCurrent() && speech.isPlaying() && !speech.isPaused()}
                                    fallback={<Play class="w-3.5 h-3.5" />}
                                  >
                                    <Pause class="w-3.5 h-3.5" />
                                  </Show>
                                </button>
                              </div>
                            </td>

                            {/* Generated Time */}
                            <td
                              onClick={() => speech.goToIndex(item.globalIndex)}
                              class="px-4 py-1 select-none text-text-secondary cursor-pointer whitespace-nowrap w-px"
                              title={
                                item.timestamp
                                  ? new Date(item.timestamp).toLocaleString(locale())
                                  : ""
                              }
                            >
                              {formatGeneratedTime(item.timestamp)}
                            </td>

                            {/* Session Title */}
                            <td
                              onClick={() => speech.goToIndex(item.globalIndex)}
                              class="px-4 py-1 select-none truncate font-medium cursor-pointer"
                              style={{
                                width: `${sessionColWidth()}px`,
                                "max-width": `${sessionColWidth()}px`,
                              }}
                              title={item.sessionTitle}
                            >
                              {item.sessionTitle}
                            </td>

                            {/* Spoken Text */}
                            <td
                              onClick={() => speech.goToIndex(item.globalIndex)}
                              class="px-4 py-1 font-mono truncate cursor-pointer w-full max-w-0"
                              title={item.text}
                            >
                              {item.text}
                            </td>
                          </tr>
                        );
                      }}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Match>
      </Switch>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: any;
}

const StatCard = (props: StatCardProps) => {
  return (
    <div class="bg-surface/50 border border-border/50 p-5 rounded-2xl flex items-center gap-4 shadow-sm hover:border-border transition-colors">
      <div class="p-3 bg-accent-light/10 border border-accent/10 rounded-xl text-accent flex-shrink-0">
        {props.icon}
      </div>
      <div class="min-w-0">
        <div class="text-xs font-semibold text-text-secondary/80 uppercase tracking-wider mb-0.5">
          {props.title}
        </div>
        <div class="text-[1.375rem] font-extrabold text-text-primary leading-tight mb-1">
          {props.value}
        </div>
        <div class="text-[0.71875rem] text-text-secondary truncate leading-none">
          {props.subtitle}
        </div>
      </div>
    </div>
  );
};
