import { createSignal, createEffect, onMount, onCleanup, Show, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import packageJson from "../package.json";
import { Sidebar } from "./components/Sidebar";
import { DetailPane } from "./components/DetailPane";
import { Dashboard } from "./components/Dashboard";
import { SettingsDialog } from "./components/SettingsDialog";
import { FileViewerDialog } from "./components/FileViewerDialog";
import { TitleBar } from "./components/TitleBar";
import { ConsentModal } from "./components/ConsentModal";
import { UpdateModal } from "./components/UpdateModal";
import { SourceDetectedModal } from "./components/SourceDetectedModal";
import { logFE } from "./utils/logger";
import { useI18n } from "./i18n/i18n";
import { Layers, AlertCircle } from "lucide-solid";
import { Session, SearchResult, SourceMetadata } from "./types";
import "./App.css";

function App() {
  const { t } = useI18n();
  const [appearance, setAppearance] = createSignal(localStorage.getItem("codeoba-appearance") || "dark");
  const [darkTheme, setDarkTheme] = createSignal(localStorage.getItem("codeoba-dark-theme") || "obsidian");
  const [lightTheme, setLightTheme] = createSignal(localStorage.getItem("codeoba-light-theme") || "obsidian-light");
  const [systemDark, setSystemDark] = createSignal(window.matchMedia("(prefers-color-scheme: dark)").matches);

  const theme = createMemo(() => {
    const appMode = appearance();
    if (appMode === "system") {
      return systemDark() ? darkTheme() : lightTheme();
    }
    return appMode === "dark" ? darkTheme() : lightTheme();
  });

  const activeColorMode = () => {
    const appMode = appearance();
    return appMode === "system" ? (systemDark() ? "dark" : "light") : appMode;
  };
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

  const [navHistory, setNavHistory] = createSignal<string[]>(["dashboard"]);
  const [historyIndex, setHistoryIndex] = createSignal<number>(0);

  const [sources, setSources] = createSignal<SourceMetadata[]>([]);
  const [sessions, setSessions] = createSignal<Session[]>([]);
  const [searchResults, setSearchResults] = createSignal<SearchResult[] | null>(null);
  const [selectedSession, setSelectedSession] = createSignal<Session | null>(null);
  
  const [searchQuery, setSearchQuery] = createSignal("");
  const [isSemantic, setIsSemantic] = createSignal(false);
  const [selectedSources, setSelectedSources] = createSignal<Set<string>>((() => {
    try {
      const stored = localStorage.getItem("codeoba-selected-sources");
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  })());
  const [archivalFilter, setArchivalFilter] = createSignal<"all" | "active" | "archived">((() => {
    const stored = localStorage.getItem("codeoba-archival-filter");
    if (stored === "all" || stored === "active" || stored === "archived") {
      return stored;
    }
    return "active";
  })());
  
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

  const [matchCase, setMatchCase] = createSignal(localStorage.getItem("codeoba-search-match-case") === "true");
  const [wholeWord, setWholeWord] = createSignal(localStorage.getItem("codeoba-search-whole-word") === "true");
  const [useRegex, setUseRegex] = createSignal(localStorage.getItem("codeoba-search-use-regex") === "true");
  const [multiline, setMultiline] = createSignal(localStorage.getItem("codeoba-search-multiline") === "true");

  const [groups, setGroups] = createSignal<any[]>([]);
  const [activeGroupFilter, setActiveGroupFilter] = createSignal<string | null>(
    localStorage.getItem("codeoba-active-group-filter") || null
  );
  const [pinnedSessionIds, setPinnedSessionIds] = createSignal<Set<string>>(new Set(
    JSON.parse(localStorage.getItem("codeoba-pinned-sessions") || "[]")
  ));

  const getStoredHsl = (mode: "dark" | "light", prefix: string, defH: number, defS: number, defL: number) => {
    const h = parseInt(localStorage.getItem(`codeoba-custom-${mode}-${prefix}-h`) || String(defH), 10);
    const s = parseInt(localStorage.getItem(`codeoba-custom-${mode}-${prefix}-s`) || String(defS), 10);
    const l = parseInt(localStorage.getItem(`codeoba-custom-${mode}-${prefix}-l`) || String(defL), 10);
    return { h, s, l };
  };

  const [customDarkTheme, setCustomDarkTheme] = createSignal({
    bg: getStoredHsl("dark", "bg", 228, 15, 8),
    surface: getStoredHsl("dark", "surface", 228, 15, 11),
    accent1: getStoredHsl("dark", "accent1", 238, 82, 66),
    accent2: getStoredHsl("dark", "accent2", 244, 79, 58)
  });

  const [customLightTheme, setCustomLightTheme] = createSignal({
    bg: getStoredHsl("light", "bg", 210, 20, 95),
    surface: getStoredHsl("light", "surface", 210, 20, 98),
    accent1: getStoredHsl("light", "accent1", 238, 82, 66),
    accent2: getStoredHsl("light", "accent2", 244, 79, 58)
  });

  createEffect(() => {
    const filter = activeGroupFilter();
    if (filter) {
      localStorage.setItem("codeoba-active-group-filter", filter);
    } else {
      localStorage.removeItem("codeoba-active-group-filter");
    }
  });

  createEffect(() => {
    localStorage.setItem("codeoba-selected-sources", JSON.stringify(Array.from(selectedSources())));
  });

  createEffect(() => {
    localStorage.setItem("codeoba-archival-filter", archivalFilter());
  });

  createEffect(() => {
    localStorage.setItem("codeoba-search-match-case", matchCase() ? "true" : "false");
    localStorage.setItem("codeoba-search-whole-word", wholeWord() ? "true" : "false");
    localStorage.setItem("codeoba-search-use-regex", useRegex() ? "true" : "false");
    localStorage.setItem("codeoba-search-multiline", multiline() ? "true" : "false");
  });

  const togglePinSession = async (sessionId: string) => {
    const next = new Set(pinnedSessionIds());
    if (next.has(sessionId)) {
      next.delete(sessionId);
    } else {
      next.add(sessionId);
    }
    setPinnedSessionIds(next);
    const arr = Array.from(next);
    localStorage.setItem("codeoba-pinned-sessions", JSON.stringify(arr));
    
    // Sync to backend config.json
    try {
      await invoke("save_pinned_sessions", { ids: arr });
    } catch (err) {
      console.error("Failed to save pinned sessions to backend:", err);
    }

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

  let themeSaveTimeout: any = null;
  const saveThemeToBackend = () => {
    if (themeSaveTimeout) clearTimeout(themeSaveTimeout);
    themeSaveTimeout = setTimeout(() => {
      invoke("save_theme_settings", {
        appearance: appearance(),
        darkTheme: darkTheme(),
        lightTheme: lightTheme()
      }).catch(err => console.error("Failed to save theme settings to backend config:", err));

      const activeTheme = theme();
      if (activeTheme === "custom") {
        const isDark = activeColorMode() === "dark";
        const colors = isDark ? customDarkTheme() : customLightTheme();
        invoke("save_custom_theme_bg", {
          mode: isDark ? "dark" : "light",
          h: colors.bg.h,
          s: colors.bg.s,
          l: colors.bg.l
        }).catch(err => console.error("Failed to save custom theme bg to backend config:", err));
      }
    }, 250);
  };

  // Sync theme selection to DOM
  createEffect(() => {
    const activeTheme = theme();
    document.documentElement.setAttribute("data-theme", activeTheme);
    localStorage.setItem("codeoba-appearance", appearance());
    localStorage.setItem("codeoba-dark-theme", darkTheme());
    localStorage.setItem("codeoba-light-theme", lightTheme());
    saveThemeToBackend();

    if (activeTheme === "custom") {
      const isDark = activeColorMode() === "dark";
      const colors = isDark ? customDarkTheme() : customLightTheme();

      const bgStr = `hsl(${colors.bg.h}, ${colors.bg.s}%, ${colors.bg.l}%)`;
      const surfaceStr = `hsl(${colors.surface.h}, ${colors.surface.s}%, ${colors.surface.l}%)`;
      const borderStr = `hsl(${colors.surface.h}, ${colors.surface.s}%, ${isDark ? colors.surface.l + 8 : colors.surface.l - 8}%)`;
      const accentStr = `hsl(${colors.accent1.h}, ${colors.accent1.s}%, ${colors.accent1.l}%)`;
      const accentHoverStr = `hsl(${colors.accent2.h}, ${colors.accent2.s}%, ${colors.accent2.l}%)`;
      const accentLightStr = `hsla(${colors.accent1.h}, ${colors.accent1.s}%, ${colors.accent1.l}%, 0.15)`;

      document.documentElement.style.setProperty("--background", bgStr);
      document.documentElement.style.setProperty("--surface", surfaceStr);
      document.documentElement.style.setProperty("--border", borderStr);
      document.documentElement.style.setProperty("--accent", accentStr);
      document.documentElement.style.setProperty("--accent-hover", accentHoverStr);
      document.documentElement.style.setProperty("--accent-light", accentLightStr);
      document.documentElement.style.setProperty("--text-primary", isDark ? "#f3f4f6" : "#0f172a");
      document.documentElement.style.setProperty("--text-secondary", isDark ? "#9ca3af" : "#475569");
    } else {
      document.documentElement.style.removeProperty("--background");
      document.documentElement.style.removeProperty("--surface");
      document.documentElement.style.removeProperty("--border");
      document.documentElement.style.removeProperty("--text-primary");
      document.documentElement.style.removeProperty("--text-secondary");
      document.documentElement.style.removeProperty("--accent");
      document.documentElement.style.removeProperty("--accent-hover");
      document.documentElement.style.removeProperty("--accent-light");
    }
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
    // Listen to system color preference change
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mediaQuery.addEventListener("change", handler);
    onCleanup(() => mediaQuery.removeEventListener("change", handler));

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
      window.removeEventListener("keydown", handleKeyDown);
    });

    try {
      setIsLoading(true);
      await loadGroups();
      const metadata = await invoke<SourceMetadata[]>("get_sources");
      setSources(metadata);

      // Sync pinned sessions from backend config
      try {
        const backendPinned = await invoke<string[]>("get_pinned_sessions");
        if (backendPinned && backendPinned.length > 0) {
          setPinnedSessionIds(new Set(backendPinned));
          localStorage.setItem("codeoba-pinned-sessions", JSON.stringify(backendPinned));
        } else {
          const localPinned = JSON.parse(localStorage.getItem("codeoba-pinned-sessions") || "[]");
          if (localPinned.length > 0) {
            await invoke("save_pinned_sessions", { ids: localPinned });
          }
        }
      } catch (errPinned) {
        console.error("Failed to sync pinned sessions on startup:", errPinned);
      }

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
    setTimeout(async () => {
      try {
        const updaterActive = await invoke<boolean>("is_updater_active");
        if (!updaterActive) {
          return;
        }

        const consent = localStorage.getItem("codeoba-auto-update-consent");
        if (!consent) {
          setShowConsentModal(true);
        } else if (consent === "given") {
          runUpdateCheck();
        }
      } catch (err) {
        console.error("Failed to check if updater is active:", err);
      }
    }, 1500); // check shortly after startup
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
    const thresh = similarityThreshold();
    activeGroupFilter();
    matchCase();
    wholeWord();
    useRegex();

    if (query.trim() === "") {
      setSearchResults(null);
      return;
    }

    const delayDebounce = setTimeout(() => {
      performSearch(query, sem, thresh);
    }, 250);

    onCleanup(() => clearTimeout(delayDebounce));
  });

  const performSearch = async (
    query: string,
    sem: boolean,
    thresh: number
  ) => {
    try {
      setErrorMsg(null);
      const filter = {
        // Intentionally query all sources and all archival states from the Tauri backend
        // so that we can calculate matches count for all filter options on the frontend
        // and filter the displayed sessions list in-memory.
        sourceIds: [],
        minTimestamp: 0,
        maxTimestamp: null,
        cwdFilter: null,
        matchCase: matchCase(),
        wholeWord: wholeWord(),
        useRegex: useRegex(),
        archivalFilter: "all",
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
        performSearch(query, isSemantic(), similarityThreshold());
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
      return searchResults()!
        .filter(r => {
          // Source filter
          if (selectedSources().size > 0 && !selectedSources().has(r.session.sourceId)) {
            return false;
          }
          // Archival filter
          if (archivalFilter() === "active" && r.session.isArchived) return false;
          if (archivalFilter() === "archived" && !r.session.isArchived) return false;
          return true;
        })
        .map(r => r.session);
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

  return (
    <div class="flex h-screen w-screen overflow-hidden bg-background text-text-primary">
      {/* OS Specific Titlebar / Header Component */}
      <TitleBar
        selectedSession={selectedSession()}
        sidebarCollapsed={sidebarCollapsed()}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed())}
        historyIndex={historyIndex()}
        navHistoryLength={navHistory().length}
        onNavBack={handleNavBack}
        onNavForward={handleNavForward}
        onGoHome={handleGoHome}
        onRebuildIndex={handleRebuildIndex}
        isRebuilding={isRebuilding()}
        isLoading={isLoading()}
        onShowSettings={() => setShowSettings(true)}
        appVersion={appVersion()}
      />

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
          matchCase={matchCase()}
          onMatchCaseToggle={() => setMatchCase(!matchCase())}
          wholeWord={wholeWord()}
          onWholeWordToggle={() => setWholeWord(!wholeWord())}
          useRegex={useRegex()}
          onRegexToggle={() => setUseRegex(!useRegex())}
          multiline={multiline()}
          onMultilineToggle={() => setMultiline(!multiline())}
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
                matchCase={matchCase()}
                wholeWord={wholeWord()}
                useRegex={useRegex()}
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
        onThemeChange={(newTheme) => {
          if (activeColorMode() === "dark") {
            setDarkTheme(newTheme);
          } else {
            setLightTheme(newTheme);
          }
        }}
        appearance={appearance()}
        onAppearanceChange={setAppearance}
        customTheme={activeColorMode() === "dark" ? customDarkTheme() : customLightTheme()}
        onCustomThemeChange={activeColorMode() === "dark" ? setCustomDarkTheme : setCustomLightTheme}
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
      <ConsentModal
        isOpen={showConsentModal()}
        onDecision={handleConsentDecision}
      />

      {/* Update Modal Overlay */}
      <UpdateModal
        isOpen={showUpdateModal()}
        updateManifest={updateManifest()}
        isUpdating={isUpdating()}
        updateProgress={updateProgress()}
        updateError={updateError()}
        onClose={() => setShowUpdateModal(false)}
        onStartUpdate={handleStartUpdate}
      />

      {/* Source Detected Prompt Modal */}
      <SourceDetectedModal
        isOpen={hasDetectedSources()}
        detectedSources={detectedSources()}
        onToggleSource={handleToggleDetectedSource}
        onIgnoreAll={handleIgnoreAllDetectedSources}
        onSave={handleSaveDetectedSources}
        getSourceDisplayNameById={getSourceDisplayNameById}
      />
    </div>
  );
}

export default App;
