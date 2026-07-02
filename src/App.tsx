import { createSignal, createEffect, onMount, onCleanup, Show, createMemo, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import packageJson from "../package.json";
import { Sidebar } from "./components/Sidebar";
import { DetailPane } from "./components/DetailPane";
import { Dashboard } from "./components/Dashboard";
import { SettingsDialog } from "./components/SettingsDialog";
import { FileViewerDialog } from "./components/FileViewerDialog";
import { MarkdownRenderer } from "./components/MarkdownRenderer";
import { logFE } from "./utils/logger";
import { useI18n } from "./i18n/i18n";
import { 
  Layers, 
  Terminal, 
  AlertCircle,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeft,
  ArrowRight,
  Home,
  Settings,
  X,
  Download,
  Bug,
  Shield
} from "lucide-solid";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./App.css";

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

// Feature Flags
const SHOW_PRE_RELEASE_NOTICE = true;

interface Turn {
  turnId: string;
  userMessage: string;
  assistantMessage: string;
  timestamp: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

interface Session {
  id: string;
  sourceId: string;
  filePath: string;
  timestamp: number;
  updatedAt: number;
  cwd?: string | null;
  threadName?: string | null;
  turns: Turn[];
  isArchived: boolean;
  isPinned: boolean;
  workspaceName?: string | null;
  status?: string | null;
}

interface SearchResult {
  session: Session;
  matchedTurnIndexes: number[];
  score: number;
}

interface SourceMetadata {
  id: string;
  displayName: string;
  isAvailable: boolean;
  isAppInstalled: boolean;
}



function App() {
  const { t } = useI18n();
  const [theme, setTheme] = createSignal(localStorage.getItem("codeoba-theme") || "obsidian");
  const [sidebarWidth, setSidebarWidth] = createSignal(parseInt(localStorage.getItem("codeoba-sidebar-width") || "380"));
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(localStorage.getItem("codeoba-sidebar-collapsed") === "true");
  const [showSettings, setShowSettings] = createSignal(false);
  const [detectedSources, setDetectedSources] = createSignal<Record<string, boolean>>({});
  const hasDetectedSources = () => Object.keys(detectedSources()).length > 0;
  const [similarityThreshold, setSimilarityThreshold] = createSignal(
    parseFloat(localStorage.getItem("codeoba-similarity-threshold") || "0.35")
  );
  const [dateFormat, setDateFormat] = createSignal(localStorage.getItem("codeoba-date-format") || "system");
  const [timeFormat, setTimeFormat] = createSignal(localStorage.getItem("codeoba-time-format") || "system");
  const [showSeconds, setShowSeconds] = createSignal(localStorage.getItem("codeoba-show-seconds") === "true");
  const [numberFormat, setNumberFormat] = createSignal(localStorage.getItem("codeoba-number-format") || "system");

  const handleDateFormatChange = (val: string) => {
    setDateFormat(val);
    localStorage.setItem("codeoba-date-format", val);
  };

  const handleTimeFormatChange = (val: string) => {
    setTimeFormat(val);
    localStorage.setItem("codeoba-time-format", val);
  };

  const handleShowSecondsChange = (val: boolean) => {
    setShowSeconds(val);
    localStorage.setItem("codeoba-show-seconds", val ? "true" : "false");
  };

  const handleNumberFormatChange = (val: string) => {
    setNumberFormat(val);
    localStorage.setItem("codeoba-number-format", val);
  };

  // Auto-update states
  const [updateManifest, setUpdateManifest] = createSignal<any>(null);
  const [showUpdateModal, setShowUpdateModal] = createSignal(false);
  const [isUpdating, setIsUpdating] = createSignal(false);
  const [updateProgress, setUpdateProgress] = createSignal(0);
  const [updateError, setUpdateError] = createSignal<string | null>(null);
  const [showConsentModal, setShowConsentModal] = createSignal(false);

  const handleConsentDecision = (consented: boolean) => {
    localStorage.setItem("codeoba-auto-update", String(consented));
    localStorage.setItem("codeoba-auto-update-consent", consented ? "given" : "declined");
    setShowConsentModal(false);
    logFE("info", `Update check consent set to: ${consented}`);
    if (consented) {
      runUpdateCheck();
    }
  };

  const runUpdateCheck = () => {
    setTimeout(async () => {
      try {
        const updaterActive = await invoke<boolean>("is_updater_active");
        if (!updaterActive) {
          return;
        }

        const currentVersion = await getVersion();
        logFE("info", `Background Updater: Initiating background check. Current version: v${currentVersion}`);
        logFE("info", "Background Updater: Querying the update service...");
        const update = await check();
        if (update && update.available) {
          logFE("info", `Background Updater: Update check successful. Found newer version: v${update.version} (released on ${update.date || 'unknown date'})`);
          setUpdateManifest(update);
          setShowUpdateModal(true);
        } else {
          logFE("info", "Background Updater: Update check successful. The application is up to date.");
        }
      } catch (err: any) {
        logFE("error", `Background Updater: Update check failed. Error details: ${err}`);
      }
    }, 2000);
  };
  const releaseNotes = createMemo(() => {
    const manifest = updateManifest();
    if (!manifest) return "";
    const rawNotes = manifest.body || manifest.notes || manifest.rawJson?.notes || manifest.rawJson?.body || "";
    // Strip out the downloads section (e.g. ## 📥 Downloads) up to the next heading or end of string
    const cleanNotes = rawNotes.replace(/(?:^|\n)#{1,6}\s*(?:[^\n]*?Downloads)[\s\S]*?(?=(?:\n#{1,6}\s|$))/i, "");
    return cleanNotes.trim();
  });

  const [navHistory, setNavHistory] = createSignal<string[]>(["dashboard"]);
  const [historyIndex, setHistoryIndex] = createSignal<number>(0);

  const [sources, setSources] = createSignal<SourceMetadata[]>([]);
  const [sessions, setSessions] = createSignal<Session[]>([]);
  const [searchResults, setSearchResults] = createSignal<SearchResult[] | null>(null);
  const [selectedSession, setSelectedSession] = createSignal<Session | null>(null);
  
  const [searchQuery, setSearchQuery] = createSignal("");
  const [isSemantic, setIsSemantic] = createSignal(false);
  const [selectedSources, setSelectedSources] = createSignal<Set<string>>(new Set());
  const [archivalFilter, setArchivalFilter] = createSignal<"all" | "active" | "archived">("active");
  
  const [isLoading, setIsLoading] = createSignal(true);
  const [isRebuilding, setIsRebuilding] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [indexingProgress, setIndexingProgress] = createSignal<{
    step: string;
    progress: number;
    currentSource: string;
  } | null>(null);
  const [loadTime, setLoadTime] = createSignal<string | null>(null);
  const [loadingSessionId, setLoadingSessionId] = createSignal<string | null>(null);
  const [appVersion, setAppVersion] = createSignal(packageJson.version);

  const [isMaximized, setIsMaximized] = createSignal(false);

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

  const [groups, setGroups] = createSignal<any[]>([]);
  const [activeGroupFilter, setActiveGroupFilter] = createSignal<string | null>(
    localStorage.getItem("codeoba-active-group-filter") || null
  );
  const [pinnedSessionIds, setPinnedSessionIds] = createSignal<Set<string>>(new Set(
    JSON.parse(localStorage.getItem("codeoba-pinned-sessions") || "[]")
  ));

  createEffect(() => {
    const filter = activeGroupFilter();
    if (filter) {
      localStorage.setItem("codeoba-active-group-filter", filter);
    } else {
      localStorage.removeItem("codeoba-active-group-filter");
    }
  });

  const togglePinSession = (sessionId: string) => {
    const next = new Set(pinnedSessionIds());
    if (next.has(sessionId)) {
      next.delete(sessionId);
    } else {
      next.add(sessionId);
    }
    setPinnedSessionIds(next);
    localStorage.setItem("codeoba-pinned-sessions", JSON.stringify(Array.from(next)));
    
    // Refresh sessions to apply sorting/enriching
    setSessions(enrichedSessions(sessions()));
  };

  const enrichedSessions = (list: Session[]) => {
    const pinned = pinnedSessionIds();
    return list.map(s => ({
      ...s,
      isPinned: pinned.has(s.id)
    }));
  };

  const loadGroups = async () => {
    try {
      const gList = await invoke<any[]>("get_groups");
      setGroups(gList || []);
    } catch (err) {
      console.error("Failed to load groups:", err);
    }
  };

  const handleAddGroup = async (name: string): Promise<boolean> => {
    try {
      const added = await invoke<boolean>("add_group", { name });
      if (added) {
        await loadGroups();
      }
      return added;
    } catch (err) {
      console.error("Failed to add group:", err);
      return false;
    }
  };

  const handleRenameGroup = async (oldName: string, newName: string): Promise<boolean> => {
    try {
      const renamed = await invoke<boolean>("rename_group", { oldName, newName });
      if (renamed) {
        if (activeGroupFilter() === oldName) {
          setActiveGroupFilter(newName);
        }
        await loadGroups();
      }
      return renamed;
    } catch (err) {
      console.error("Failed to rename group:", err);
      return false;
    }
  };

  const handleDeleteGroup = async (name: string): Promise<void> => {
    try {
      await invoke("delete_group", { name });
      if (activeGroupFilter() === name) {
        setActiveGroupFilter(null);
      }
      await loadGroups();
    } catch (err) {
      console.error("Failed to delete group:", err);
    }
  };

  const handleToggleGroupPin = async (name: string, pinned: boolean): Promise<void> => {
    try {
      await invoke("set_group_pinned", { name, pinned });
      await loadGroups();
    } catch (err) {
      console.error("Failed to toggle group pin:", err);
    }
  };

  const handleAssignSessionToGroup = async (sessionId: string, groupName: string): Promise<void> => {
    try {
      await invoke("assign_session_to_group", { sessionId, groupName });
      await loadGroups();
    } catch (err) {
      console.error("Failed to assign session to group:", err);
    }
  };

  const handleRemoveSessionFromGroup = async (sessionId: string, groupName: string): Promise<void> => {
    try {
      await invoke("remove_session_from_group", { sessionId, groupName });
      await loadGroups();
    } catch (err) {
      console.error("Failed to remove session from group:", err);
    }
  };

  const getSessionIdsForGroupAndDescendants = (groupName: string | null, groupsList: any[]): string[] | null => {
    if (!groupName) return null;
    if (groupName === "_none_") {
      const assigned = new Set<string>();
      for (const g of groupsList) {
        if (g.sessionIds) {
          for (const id of g.sessionIds) {
            assigned.add(id);
          }
        }
      }
      const allSessionIds = sessions().map(s => s.id);
      return allSessionIds.filter(id => !assigned.has(id));
    }
    const ids = new Set<string>();
    const target = groupName.toLowerCase();
    const prefix = `${target}/`;
    for (const g of groupsList) {
      const gName = g.name.toLowerCase();
      if (gName === target || gName.startsWith(prefix)) {
        if (g.sessionIds) {
          for (const id of g.sessionIds) {
            ids.add(id);
          }
        }
      }
    }
    return Array.from(ids);
  };

  // Sync theme selection to DOM
  createEffect(() => {
    document.documentElement.setAttribute("data-theme", theme());
    localStorage.setItem("codeoba-theme", theme());
  });

  // Sync sidebar width selection to localStorage
  createEffect(() => {
    localStorage.setItem("codeoba-sidebar-width", String(sidebarWidth()));
  });

  // Sync sidebar collapsed selection to localStorage
  createEffect(() => {
    localStorage.setItem("codeoba-sidebar-collapsed", String(sidebarCollapsed()));
  });

  // Sync similarity threshold to localStorage
  createEffect(() => {
    localStorage.setItem("codeoba-similarity-threshold", String(similarityThreshold()));
  });

  // Clear any pending source prompts if settings dialog is opened
  createEffect(() => {
    if (showSettings()) {
      setDetectedSources({});
    }
  });
  onMount(async () => {
    // Set window title with app version
    try {
      const version = await getVersion();
      setAppVersion(version);
      document.title = `Codeoba v${version}`;
    } catch (err) {
      console.error("Failed to set window title:", err);
    }


    // Hide startup skeleton once UI is mounted
    const skeleton = document.getElementById("sk-container");
    if (skeleton) {
      skeleton.classList.add("sk-fade-out");
      setTimeout(() => {
        skeleton.remove();
      }, 250);
    }

    let unlistenSession: (() => void) | undefined;
    let unlistenProgress: (() => void) | undefined;
    let unlistenDeleted: (() => void) | undefined;
    let unlistenDetectedSource: (() => void) | undefined;
    let unlistenResize: (() => void) | undefined;

    // Register progress and live listeners immediately
    try {
      unlistenSession = await listen<Session>("session-updated", (event) => {
        const updated = event.payload;
        logFE("info", `Live event update: ${updated.id}`);

        // Update sessions state list
        setSessions(prev => {
          const index = prev.findIndex(s => s.id === updated.id);
          const list = [...prev];
          if (index !== -1) {
            list[index] = updated;
          } else {
            list.unshift(updated);
          }
          list.sort((a, b) => b.updatedAt - a.updatedAt);
          return enrichedSessions(list);
        });

        // Update selected view if open
        const current = selectedSession();
        if (current && current.id === updated.id) {
          setSelectedSession(updated);
        }
      });

      unlistenDeleted = await listen<string>("session-deleted", (event) => {
        const deletedId = event.payload;
        logFE("info", `Live event deletion: ${deletedId}`);

        // Filter out deleted session from state list
        setSessions(prev => prev.filter(s => s.id !== deletedId));

        // Deselect if active view
        const current = selectedSession();
        if (current && current.id === deletedId) {
          setSelectedSession(null);
        }
      });

      unlistenProgress = await listen<{
        step: string;
        progress: number;
        currentSource: string;
      }>("indexing-progress", (event) => {
        const payload = event.payload;
        setIndexingProgress(payload);

        if (payload.step === "complete") {
          // Re-fetch sessions from backend once rebuild is complete
          invoke<Session[]>("get_all_sessions").then((list) => {
            setSessions(enrichedSessions(list));
          });
          // Hide progress indicator after a short delay
          setTimeout(() => {
            setIndexingProgress(null);
          }, 1500);
        }
      });

      unlistenDetectedSource = await listen<string>("source-detected", (event) => {
        const sourceId = event.payload;
        if (showSettings()) {
          return;
        }
        logFE("info", `Detected new source installation: ${sourceId}`);
        setDetectedSources(prev => {
          if (sourceId in prev) return prev;
          return { ...prev, [sourceId]: true };
        });
      });

      if (!isMac) {
        const win = getCurrentWindow();
        setIsMaximized(await win.isMaximized());
        unlistenResize = await win.onResized(async () => {
          setIsMaximized(await win.isMaximized());
        });
      }
    } catch (err) {
      console.error("Failed to register listeners:", err);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.key.toLowerCase() === "r") {
        e.preventDefault();
        const bypassCache = e.shiftKey;
        logFE("info", `Shortcut triggered refresh: bypassCache=${bypassCache}`);
        handleRebuildIndex(bypassCache);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      if (unlistenSession) unlistenSession();
      if (unlistenDeleted) unlistenDeleted();
      if (unlistenProgress) unlistenProgress();
      if (unlistenDetectedSource) unlistenDetectedSource();
      if (unlistenResize) unlistenResize();
      window.removeEventListener("keydown", handleKeyDown);
    });

    try {
      setIsLoading(true);
      await loadGroups();
      const metadata = await invoke<SourceMetadata[]>("get_sources");
      setSources(metadata);

      const list = await invoke<Session[]>("get_all_sessions");
      setSessions(enrichedSessions(list));
      
      setErrorMsg(null);

      // Get initial indexing progress state
      try {
        const initialProgress = await invoke<any>("get_indexing_progress");
        if (initialProgress) {
          setIndexingProgress(initialProgress);
          if (initialProgress.step === "complete") {
            setIsRebuilding(false);
            // Wait 4 seconds then clear
            setTimeout(() => {
              setIndexingProgress(current => {
                if (current && current.step === "complete") {
                  return null;
                }
                return current;
              });
            }, 4000);
          } else {
            setIsRebuilding(true);
          }
        }
      } catch (err) {
        console.error("Failed to fetch initial indexing progress:", err);
      }
    } catch (err: any) {
      console.error("Failed to load sessions:", err);
      setErrorMsg(String(err));
    } finally {
      setIsLoading(false);
    }

    // Trigger background rebuild on launch only if not already rebuilding
    const progress = indexingProgress();
    const isAlreadyIndexing = progress && progress.step !== "complete";
    if (!isAlreadyIndexing) {
      handleRebuildIndex();
    }

    // Background update check / explicit consent prompt
    const consent = localStorage.getItem("codeoba-auto-update-consent");
    if (!consent) {
      setTimeout(() => {
        setShowConsentModal(true);
      }, 1500); // prompt user shortly after startup
    } else if (consent === "given") {
      runUpdateCheck();
    }
  });

  const handleStartUpdate = async () => {
    const update = updateManifest();
    if (!update) return;

    setIsUpdating(true);
    setUpdateError(null);
    setUpdateProgress(0);

    try {
      logFE("info", `Starting download and installation for v${update.version}...`);
      
      let downloaded = 0;
      let contentLength = 0;
      
      await update.downloadAndInstall((event: any) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data?.contentLength || 0;
            logFE("info", `Download started. Size: ${contentLength}`);
            break;
          case "Progress":
            downloaded += event.data?.chunkLength || 0;
            if (contentLength > 0) {
              setUpdateProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case "Finished":
            logFE("info", "Download finished.");
            setUpdateProgress(100);
            break;
        }
      });

      logFE("info", "Update installation completed successfully. Relaunching...");
      await relaunch();
    } catch (err: any) {
      logFE("error", `Failed to download and install update: ${err}`);
      setUpdateError(String(err));
      setIsUpdating(false);
    }
  };

  // Handle debounced search changes
  createEffect(() => {
    const query = searchQuery();
    const sem = isSemantic();
    const sources = selectedSources();
    const filter = archivalFilter();
    const thresh = similarityThreshold();
    activeGroupFilter();

    if (query.trim() === "") {
      setSearchResults(null);
      return;
    }

    const delayDebounce = setTimeout(() => {
      performSearch(query, sem, sources, filter, thresh);
    }, 250);

    onCleanup(() => clearTimeout(delayDebounce));
  });

  const performSearch = async (
    query: string,
    sem: boolean,
    sourcesSet: Set<string>,
    filterType: "all" | "active" | "archived",
    thresh: number
  ) => {
    try {
      setErrorMsg(null);
      const filter = {
        sourceIds: Array.from(sourcesSet),
        minTimestamp: 0,
        maxTimestamp: null,
        cwdFilter: null,
        matchCase: false,
        wholeWord: false,
        useRegex: false,
        archivalFilter: filterType,
        sessionIds: getSessionIdsForGroupAndDescendants(activeGroupFilter(), groups())
      };

      const results = await invoke<SearchResult[]>("search_sessions", {
        query,
        filter,
        useSemantic: sem,
        similarityThreshold: thresh
      });
      setSearchResults(results);
    } catch (err: any) {
      logFE("error", `Search error: ${err}`);
      setErrorMsg(String(err));
    }
  };

  const handleToggleSource = (sourceId: string) => {
    const next = new Set(selectedSources());
    if (next.has(sourceId)) {
      next.delete(sourceId);
    } else {
      next.add(sourceId);
    }
    setSelectedSources(next);
  };

  const handleRebuildIndex = async (bypassCache: boolean = false) => {
    try {
      setIsRebuilding(true);
      setErrorMsg(null);
      await invoke("rebuild_index", { bypassCache });
      
      // Refresh session list
      const list = await invoke<Session[]>("get_all_sessions");
      setSessions(enrichedSessions(list));
      
      // Re-trigger search if query exists
      const query = searchQuery();
      if (query.trim() !== "") {
        performSearch(query, isSemantic(), selectedSources(), archivalFilter(), similarityThreshold());
      }
    } catch (err: any) {
      logFE("error", `Rebuild error: ${err}`);
      setErrorMsg(String(err));
    } finally {
      setIsRebuilding(false);
    }
  };

  const handleSelectSession = async (session: Session, skipHistory = false) => {
    if (!skipHistory) {
      const history = [...navHistory().slice(0, historyIndex() + 1)];
      if (history[history.length - 1] !== session.id) {
        history.push(session.id);
        setNavHistory(history);
        setHistoryIndex(history.length - 1);
      }
    }

    const start = performance.now();
    (window as any).sessionSelectionStart = start;
    logFE("info", `Selecting session: ${session.id} (${session.threadName || 'Untitled'})`);
    setLoadTime(t("common.loading"));
    setLoadingSessionId(session.id);
    try {
      const fullSession = await invoke<Session | null>("get_session", {
        sourceId: session.sourceId,
        filePath: session.filePath,
      });
      const fetchTime = performance.now() - start;
      logFE("info", `Fetched session ${session.id} turns in ${fetchTime.toFixed(1)}ms`);

      if (fullSession) {
        setSelectedSession(fullSession);
        
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const paintTime = performance.now() - start;
            const msg = `${paintTime.toFixed(0)}ms (fetch: ${fetchTime.toFixed(0)}ms, render: ${(paintTime - fetchTime).toFixed(0)}ms)`;
            logFE("info", `Rendered and painted session ${session.id} in ${paintTime.toFixed(1)}ms total. Detail metrics: ${msg}`);
            setLoadTime(msg);
            setLoadingSessionId(null);
          });
        });
      } else {
        setLoadTime(null);
        setLoadingSessionId(null);
      }
    } catch (err: any) {
      logFE("error", `Failed to load session details: ${err}`);
      setErrorMsg(t("common.error"));
      setLoadTime(null);
      setLoadingSessionId(null);
    }
  };

  const handleGoHome = (skipHistory = false) => {
    if (!skipHistory) {
      const history = [...navHistory().slice(0, historyIndex() + 1)];
      if (history[history.length - 1] !== "dashboard") {
        history.push("dashboard");
        setNavHistory(history);
        setHistoryIndex(history.length - 1);
      }
    }
    setSelectedSession(null);
  };

  const handleNavBack = () => {
    if (historyIndex() > 0) {
      const prevIdx = historyIndex() - 1;
      setHistoryIndex(prevIdx);
      const target = navHistory()[prevIdx];
      if (target === "dashboard") {
        handleGoHome(true);
      } else {
        const found = sessions().find(s => s.id === target) || 
                      (searchResults()?.find(r => r.session.id === target)?.session);
        if (found) {
          handleSelectSession(found, true);
        } else {
          handleGoHome(true);
        }
      }
    }
  };

  const handleNavForward = () => {
    if (historyIndex() < navHistory().length - 1) {
      const nextIdx = historyIndex() + 1;
      setHistoryIndex(nextIdx);
      const target = navHistory()[nextIdx];
      if (target === "dashboard") {
        handleGoHome(true);
      } else {
        const found = sessions().find(s => s.id === target) || 
                      (searchResults()?.find(r => r.session.id === target)?.session);
        if (found) {
          handleSelectSession(found, true);
        } else {
          handleGoHome(true);
        }
      }
    }
  };

  const filteredSessions = createMemo(() => {
    if (searchResults() !== null) {
      return searchResults()!.map(r => r.session);
    }
    return sessions().filter(s => {
      // Source filter
      if (selectedSources().size > 0 && !selectedSources().has(s.sourceId)) {
        return false;
      }
      // Archival filter
      if (archivalFilter() === "active" && s.isArchived) return false;
      if (archivalFilter() === "archived" && !s.isArchived) return false;
      return true;
    });
  });

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
  };

  const handleOpenIssues = async () => {
    try {
      await openUrl("https://github.com/LookAtWhatAiCanDo/Codeoba/issues");
    } catch (err) {
      console.error("Failed to open issues URL:", err);
    }
  };

  const handleCloseSettings = () => {
    setShowSettings(false);
    invoke("reset_detected_sources").catch((err: any) => {
      logFE("error", `Failed to reset detected sources: ${err.message || err}`);
    });
  };

  const getSourceDisplayNameById = (id: string) => {
    const found = sources().find(s => s.id === id);
    return found ? found.displayName : id;
  };

  const handleToggleDetectedSource = (sourceId: string) => {
    setDetectedSources(prev => ({
      ...prev,
      [sourceId]: !prev[sourceId]
    }));
  };

  const handleSaveDetectedSources = async () => {
    const list = Object.entries(detectedSources());
    setDetectedSources({});
    
    let hasAnyAllowed = false;
    for (const [sourceId, allowed] of list) {
      const decision = allowed ? "allow" : "deny";
      if (allowed) {
        hasAnyAllowed = true;
      }
      try {
        await invoke("save_source_decision", { sourceId, decision });
        logFE("info", `User prompt response: ${sourceId} set to ${decision}`);

        const currentDecisions = JSON.parse(localStorage.getItem("codeoba-source-decisions") || "{}");
        currentDecisions[sourceId] = decision;
        localStorage.setItem("codeoba-source-decisions", JSON.stringify(currentDecisions));
      } catch (err: any) {
        logFE("error", `Failed to save source decision for ${sourceId}: ${err.message || err}`);
      }
    }

    const metadata = await invoke<SourceMetadata[]>("get_sources");
    setSources(metadata);

    if (hasAnyAllowed) {
      handleRebuildIndex(false);
    }
  };

  const handleIgnoreAllDetectedSources = () => {
    setDetectedSources({});
    logFE("info", "User postponed setup (Configure Later chosen). Prompts dismissed for this session.");
  };

  const renderNavigationPill = () => (
    <div 
      class="flex items-center bg-surface/60 border border-border/55 rounded-xl pointer-events-auto flex-shrink-0 no-drag"
      style={{ padding: "4px", gap: "4px" }}
    >
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed())}
        title={sidebarCollapsed() ? "Show Sidebar" : "Hide Sidebar"}
        class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer"
      >
        <Show when={sidebarCollapsed()} fallback={<PanelLeftClose class="w-4 h-4" />}>
          <PanelLeftOpen class="w-4 h-4" />
        </Show>
      </button>

      <div class="bg-border/40" style={{ width: "1px", height: "16px", margin: "0 4px" }} />

      <button
        onClick={handleNavBack}
        disabled={historyIndex() <= 0}
        title="Go Back"
        class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
      >
        <ArrowLeft class="w-4 h-4" />
      </button>

      <button
        onClick={handleNavForward}
        disabled={historyIndex() >= navHistory().length - 1}
        title="Go Forward"
        class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
      >
        <ArrowRight class="w-4 h-4" />
      </button>

      <button
        onClick={() => handleGoHome()}
        title={t("dashboard.globalStats")}
        class={`w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border hover:border-border/60 rounded-lg transition-all cursor-pointer ${
          selectedSession() === null ? "text-accent bg-accent/10 border-accent/20" : "border-transparent text-text-secondary"
        }`}
      >
        <Home class="w-4 h-4" />
      </button>

      <button
        onClick={() => handleRebuildIndex()}
        disabled={isRebuilding() || isLoading()}
        title={t("sidebar.forceRebuild")}
        class={`w-[30px] h-[30px] inline-flex items-center justify-center border border-transparent rounded-lg transition-all ${
          (isRebuilding() || isLoading()) 
            ? "cursor-not-allowed text-accent bg-accent/5 border-accent/15" 
            : "hover:bg-surface hover:border-border/60 hover:text-text-primary text-text-secondary cursor-pointer"
        }`}
      >
        <Show 
          when={isRebuilding() || isLoading()} 
          fallback={<RotateCwClean class="w-4 h-4" />}
        >
          <RotateCwClean class="w-4 h-4 animate-spin origin-center" />
        </Show>
      </button>

      <div class="bg-border/40" style={{ width: "1px", height: "16px", margin: "0 4px" }} />

      <button
        onClick={() => setShowSettings(true)}
        title={t("settings.title")}
        class="w-[30px] h-[30px] inline-flex items-center justify-center hover:bg-surface border border-transparent hover:border-border/60 hover:text-text-primary text-text-secondary rounded-lg transition-all cursor-pointer"
      >
        <Settings class="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div class="flex h-screen w-screen overflow-hidden bg-background text-text-primary">
      {/* Dynamic Headers based on style selection */}
      {/* Dynamic Headers based on style selection */}
      {/* Modern Sidebar Header (Unified Layout) */}
      <div 
        class="absolute top-0 left-0 right-0 h-[var(--sk-header-height)] pointer-events-auto z-50 flex items-center justify-between select-none border-b border-border/10 glass transition-all duration-200"
        style={{
          "padding-left": isMac ? "80px" : "24px",
          "padding-right": isMac ? "24px" : "140px"
        }}
        data-tauri-drag-region
      >
        <div class="flex items-center pointer-events-none" style={{ gap: "16px" }}>
          <div class="flex items-center pointer-events-auto" style={{ gap: "8px", width: "176px", "flex-shrink": 0 }} data-tauri-drag-region>
            <Terminal class="w-[18px] h-[18px] text-accent animate-pulse" data-tauri-drag-region />
            <span class="font-bold tracking-widest text-[14px] text-text-primary leading-none" data-tauri-drag-region>
              CODEOBA
            </span>
            <span class="text-[9px] font-mono bg-surface border border-white/10 rounded text-accent font-semibold leading-none w-[46px] h-[18px] inline-flex items-center justify-center" data-tauri-drag-region>
              v{appVersion()}
            </span>
          </div>
          {renderNavigationPill()}
        </div>

        <div class="flex items-center gap-3 pointer-events-none">
          <div 
            class="hidden md:flex items-center gap-2 text-[11px] font-medium text-text-secondary bg-surface/30 px-3 py-1 rounded-full border border-border/40 pointer-events-auto"
            data-tauri-drag-region
          >
            <Show 
              when={selectedSession()} 
              fallback={
                <span class="text-accent font-semibold flex items-center gap-1" data-tauri-drag-region>
                  <Layers class="w-3 h-3" data-tauri-drag-region /> {t("dashboard.globalStats")}
                </span>
              }
            >
              <span class="text-text-secondary/70 truncate max-w-[120px]" title={selectedSession()?.cwd || ""} data-tauri-drag-region>
                {selectedSession()?.cwd?.split(/[/\\]/).pop() || "Root"}
              </span>
              <span class="text-border" data-tauri-drag-region>/</span>
              <span class="text-text-primary truncate max-w-[160px]" title={selectedSession()?.threadName || "Untitled"} data-tauri-drag-region>
                {selectedSession()?.threadName || "Untitled"}
              </span>
            </Show>
          </div>
          <button
            onClick={handleOpenIssues}
            title={t("common.bugTracker")}
            class="p-1.5 bg-surface/40 hover:bg-surface border border-border/60 hover:border-accent/40 rounded-xl text-text-secondary hover:text-accent transition-all cursor-pointer flex items-center justify-center pointer-events-auto"
          >
            <Bug class="w-4 h-4 text-accent" />
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
              <svg class="w-3.5 h-3.5" viewBox="0 0 10 1" fill="none" stroke="currentColor" stroke-width="1.5">
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
                  <svg class="w-3 h-3" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="0.5" y="0.5" width="9" height="9" />
                  </svg>
                }
              >
                <svg class="w-3 h-3" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
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
              <svg class="w-3 h-3" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M0.5,0.5 L9.5,9.5 M9.5,0.5 L0.5,9.5" />
              </svg>
            </button>
          </div>
        </Show>
      </div>

      {/* Main Grid: Sidebar + Detail Pane */}
      <div 
        class="flex w-full h-full min-h-0 min-w-0"
        style={{
          "padding-top": "var(--sk-header-height, 48px)"
        }}
      >
        <Sidebar
          sessions={sessions()}
          searchResults={searchResults()}
          selectedSessionId={selectedSession()?.id || null}
          loadingSessionId={loadingSessionId()}
          onSelectSession={handleSelectSession}
          searchQuery={searchQuery()}
          onSearchChange={setSearchQuery}
          isSemantic={isSemantic()}
          onSemanticToggle={() => setIsSemantic(!isSemantic())}
          selectedSources={selectedSources()}
          onToggleSource={handleToggleSource}
          archivalFilter={archivalFilter()}
          onArchivalFilterChange={setArchivalFilter}
          sources={sources()}
          indexingProgress={indexingProgress()}
          width={sidebarWidth()}
          onWidthChange={setSidebarWidth}
          collapsed={sidebarCollapsed()}
          appVersion={appVersion()}
          dateFormat={dateFormat()}
          timeFormat={timeFormat()}
          showSeconds={showSeconds()}
          numberFormat={numberFormat()}
          groups={groups()}
          activeGroupFilter={activeGroupFilter()}
          onActiveGroupFilterChange={setActiveGroupFilter}
          onAddGroup={handleAddGroup}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
          onToggleGroupPin={handleToggleGroupPin}
          onAssignSessionToGroup={handleAssignSessionToGroup}
          onRemoveSessionFromGroup={handleRemoveSessionFromGroup}
          pinnedSessionIds={pinnedSessionIds()}
          onTogglePinSession={togglePinSession}
        />

        <div class="flex-grow h-full flex flex-col min-w-0 overflow-hidden">
          {/* Main Error Alert Bar */}
          <Show when={errorMsg()}>
            <div class="bg-red-500/10 border-b border-red-500/20 px-6 py-2.5 flex items-center gap-2 text-xs text-red-400 flex-shrink-0 animate-in fade-in slide-in-from-top-1 duration-150">
              <AlertCircle class="w-4 h-4 flex-shrink-0" />
              <span class="truncate">{errorMsg()}</span>
              <button 
                onClick={() => setErrorMsg(null)}
                class="ml-auto hover:text-white font-medium cursor-pointer"
              >
                {t("common.close")}
              </button>
            </div>
          </Show>

          <Show 
            when={!isLoading()} 
            fallback={
              <div class="flex-grow flex flex-col items-center justify-center text-text-secondary select-none animate-pulse">
                <Layers class="w-12 h-12 text-border animate-bounce mb-3" />
                <p class="text-sm font-medium tracking-wider">{t("dashboard.scanning")}</p>
              </div>
            }
          >
            <Show when={selectedSession()} fallback={<Dashboard sessions={filteredSessions()} numberFormat={numberFormat()} />}>
              <DetailPane
                session={selectedSession()}
                onCopyPath={handleCopyPath}
                loadTime={loadTime()}
                isLoading={loadingSessionId() !== null}
                sidebarCollapsed={sidebarCollapsed()}
                searchQuery={searchQuery()}
                dateFormat={dateFormat()}
                timeFormat={timeFormat()}
                showSeconds={showSeconds()}
                numberFormat={numberFormat()}
              />
            </Show>
          </Show>
        </div>
      </div>

      <SettingsDialog
        isOpen={showSettings()}
        onClose={handleCloseSettings}
        theme={theme()}
        onThemeChange={setTheme}
        sources={sources()}
        onRefreshSources={async () => {
          const metadata = await invoke<SourceMetadata[]>("get_sources");
          setSources(metadata);
        }}
        similarityThreshold={similarityThreshold()}
        onSimilarityThresholdChange={setSimilarityThreshold}
        dateFormat={dateFormat()}
        onDateFormatChange={handleDateFormatChange}
        timeFormat={timeFormat()}
        onTimeFormatChange={handleTimeFormatChange}
        showSeconds={showSeconds()}
        onShowSecondsChange={handleShowSecondsChange}
        numberFormat={numberFormat()}
        onNumberFormatChange={handleNumberFormatChange}
        onUpdateAvailable={(update) => {
          setUpdateManifest(update);
          setShowUpdateModal(true);
          setShowSettings(false);
        }}
      />
      <FileViewerDialog sessionCwd={selectedSession()?.cwd} />

      {/* GDPR/CCPA Consent Modal */}
      <Show when={showConsentModal()}>
        <div class="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-md">
          <div class="w-[520px] bg-surface border border-border/80 p-6 rounded-2xl flex flex-col gap-5 shadow-2xl relative animate-in zoom-in-95 duration-200">
            
            {/* Header info */}
            <div class="flex items-center gap-3.5">
              <div class="p-3 bg-accent/10 border border-accent/20 text-accent rounded-xl">
                <Shield class="w-6 h-6" />
              </div>
              <div>
                <h3 class="text-base font-bold text-text-primary uppercase tracking-wider">
                  {t("updater.consent.title")}
                </h3>
                <p class="text-xs text-text-secondary/70">{t("updater.consent.subtitle")}</p>
              </div>
            </div>

            {/* Quality Disclaimer Callout */}
            <Show when={SHOW_PRE_RELEASE_NOTICE}>
              <div class="bg-yellow-500/5 border border-yellow-500/20 text-yellow-500/90 rounded-xl p-3.5 text-xs leading-relaxed flex items-start gap-3">
                <AlertCircle class="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p class="font-semibold text-text-primary text-xs mb-1">
                    {t("updater.consent.descQualityTitle")}
                  </p>
                  <p class="mt-1.5">
                    {(() => {
                      const parts = t("updater.consent.descQualityReport").split("{bugIcon}");
                      return (
                        <>
                          {parts[0]}
                          <span class="inline-flex items-center justify-center w-4 h-4 bg-surface/50 border border-border/60 rounded text-accent align-middle mx-1 -translate-y-[1px]">
                            <Bug class="w-3 h-3" />
                          </span>
                          {parts[1]}
                        </>
                      );
                    })()}
                  </p>
                </div>
              </div>
            </Show>

            {/* Description */}
            <div class="bg-background/50 border border-border/40 rounded-xl p-4 space-y-3 text-sm leading-relaxed text-text-secondary">
              <p class="font-semibold pt-2.5 border-t border-border/20 text-text-primary">
                {t("updater.consent.question")}
              </p>
              <p>
                {(() => {
                  const parts = t("updater.consent.desc1").split("{domain}");
                  return (
                    <>
                      {parts[0]}
                      <span class="font-semibold text-accent">codeoba.com</span>
                      {parts[1]}
                    </>
                  );
                })()}
              </p>
            </div>

            {/* Legal Compliance Subtext */}
            <p class="text-xs text-text-secondary/60 text-center leading-relaxed px-4">
              {t("updater.consent.complianceSubtext")}
            </p>

            {/* Actions */}
            <div class="flex gap-3 pt-2">
              <button
                onClick={() => handleConsentDecision(false)}
                class="flex-1 py-2.5 border border-border bg-background hover:bg-surface rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
              >
                {t("updater.consent.noThanks")}
              </button>
              <button
                onClick={() => handleConsentDecision(true)}
                class="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-background rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-accent/10"
              >
                {t("updater.consent.enable")}
              </button>
            </div>

          </div>
        </div>
      </Show>

      {/* Update Modal Overlay */}
      <Show when={showUpdateModal() && updateManifest()}>
        <div class="fixed inset-0 bg-black/75 z-[60] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-md">
          <div class="w-[460px] bg-surface border border-border/80 p-6 rounded-2xl flex flex-col gap-5 shadow-2xl relative animate-in zoom-in-95 duration-200">
            
            {/* Close button - only show if NOT currently installing an update */}
            <Show when={!isUpdating()}>
              <button 
                onClick={() => setShowUpdateModal(false)}
                class="absolute top-4 right-4 p-1.5 bg-background hover:bg-surface border border-border/60 rounded-xl text-text-secondary hover:text-text-primary transition-all cursor-pointer"
              >
                <X class="w-4 h-4" />
              </button>
            </Show>

            {/* Header info */}
            <div class="flex items-center gap-3">
              <div class="p-2.5 bg-accent/10 border border-accent/20 text-accent rounded-xl">
                <Show
                  when={isUpdating()}
                  fallback={<RotateCwClean class="w-5 h-5" />}
                >
                  <RotateCwClean class="w-5 h-5 animate-spin origin-center" />
                </Show>
              </div>
              <div>
                <h3 class="text-sm font-bold text-text-primary uppercase tracking-wider">
                  {t("updater.title")}
                </h3>
                <p class="text-[10px] text-text-secondary/70">{t("updater.description", { version: updateManifest().version })}</p>
              </div>
            </div>

            {/* Version Details */}
            <div class="bg-background/50 border border-border/40 rounded-xl p-4 space-y-2 text-xs">
              <div class="flex items-center justify-between font-semibold">
                <span class="text-text-secondary">Version:</span>
                <span class="text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-full text-[10px]">
                  v{updateManifest().version}
                </span>
              </div>
              
              <Show when={releaseNotes()}>
                <div class="border-t border-border/30 pt-3 space-y-2">
                  <span class="text-text-secondary font-semibold">Release Notes:</span>
                  <div class="max-h-48 overflow-y-auto bg-background/30 p-3 rounded-xl border border-border/20 text-left update-notes-container">
                    <MarkdownRenderer content={releaseNotes()} />
                  </div>
                </div>
              </Show>
            </div>

            {/* Status & Progress Bar */}
            <Show when={isUpdating()}>
              <div class="space-y-2">
                <div class="flex justify-between text-[10px] font-semibold text-text-secondary">
                  <span>{t("updater.downloading", { progress: updateProgress() })}</span>
                  <span class="text-accent">{updateProgress()}%</span>
                </div>
                <div class="w-full h-1.5 bg-background rounded-full overflow-hidden border border-border/40">
                  <div 
                    class="h-full bg-accent transition-all duration-300 rounded-full"
                    style={{ width: `${updateProgress()}%` }}
                  />
                </div>
              </div>
            </Show>

            {/* Error Message */}
            <Show when={updateError()}>
              <div class="bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl flex items-center gap-2 text-[10px] text-red-400">
                <AlertCircle class="w-4 h-4 flex-shrink-0" />
                <span class="truncate flex-1">{t("updater.failed", { error: updateError() || "" })}</span>
              </div>
            </Show>

            {/* Actions */}
            <div class="flex gap-3 w-full pt-1">
              <Show when={!isUpdating()}>
                <button
                  onClick={() => setShowUpdateModal(false)}
                  class="flex-1 py-2 border border-border bg-background hover:bg-surface rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
                >
                  {t("updater.later")}
                </button>
                <button
                  onClick={handleStartUpdate}
                  class="flex-1 py-2 bg-accent hover:bg-accent/90 border border-accent/20 rounded-xl text-xs font-semibold text-background hover:text-background transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                >
                  <Download class="w-3.5 h-3.5" />
                  <span>{t("updater.updateBtn")}</span>
                </button>
              </Show>
            </div>
          </div>
        </div>
      </Show>
      {/* Source Detected Prompt Modal */}
      <Show when={hasDetectedSources()}>
        <div class="fixed inset-0 bg-black/75 z-[69] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-md">
          <div class="w-[520px] bg-surface border border-border/80 p-6 rounded-2xl flex flex-col gap-5 shadow-2xl relative animate-in zoom-in-95 duration-200">
            
            {/* Header info */}
            <div class="flex items-center gap-3">
              <div class="p-2.5 bg-accent/10 border border-accent/20 text-accent rounded-xl">
                <Layers class="w-5 h-5" />
              </div>
              <div>
                <h3 class="text-sm font-bold text-text-primary uppercase tracking-wider">
                  {t("settings.sources.detectedMultiPromptTitle")}
                </h3>
                <span class="text-[9px] font-mono bg-accent/15 border border-accent/20 rounded text-accent px-1.5 py-0.5 font-semibold">
                  {t("settings.sources.detectedMultiPromptBadge")}
                </span>
              </div>
            </div>

            {/* Description Details */}
            <div class="text-xs leading-relaxed text-text-secondary">
              {t("settings.sources.detectedMultiPromptMessage")}
            </div>

            {/* Detected sources checkboxes list */}
            <div class="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              <For each={Object.entries(detectedSources())}>
                {([sourceId, allowed]) => (
                  <label class="relative flex items-center justify-between p-3 rounded-xl bg-background/30 hover:bg-background/60 border border-border/40 hover:border-accent/30 transition-all cursor-pointer select-none">
                    <div class="flex items-center gap-3">
                      <div class="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                        <Layers class="w-4 h-4" />
                      </div>
                      <span class="text-xs font-semibold text-text-primary">
                        {getSourceDisplayNameById(sourceId)}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={allowed}
                      onChange={() => handleToggleDetectedSource(sourceId)}
                      class="w-4.5 h-4.5 rounded border-border/80 text-accent focus:ring-accent accent-accent transition-all cursor-pointer"
                    />
                  </label>
                )}
              </For>
            </div>

            {/* Reassurance Callouts */}
            <div class="flex flex-col gap-1.5 p-3 rounded-xl bg-background/50 border border-border/40 text-[10px] text-text-secondary leading-relaxed">
              <div>{t("settings.sources.detectedMultiPromptFootnotePrivate")}</div>
              <div>{t("settings.sources.detectedMultiPromptFootnoteEmpty")}</div>
            </div>

            {/* Actions */}
            <div class="flex gap-3 w-full pt-1">
              <button
                onClick={handleIgnoreAllDetectedSources}
                class="flex-1 py-2 border border-border bg-background hover:bg-surface rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
              >
                {t("settings.sources.detectedMultiPromptDenyAll")}
              </button>
              <button
                onClick={handleSaveDetectedSources}
                class="flex-1 py-2 bg-accent hover:bg-accent/90 border border-accent/20 rounded-xl text-xs font-semibold text-background hover:text-background transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
              >
                <span>{t("settings.sources.detectedMultiPromptAllowSelected")}</span>
              </button>
            </div>
          </div>
        </div>
      </Show>

    </div>
  );
}

export default App;
