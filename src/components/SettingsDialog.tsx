import { createSignal, Show, onMount } from "solid-js";
import { X } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { logFE } from "../utils/logger";
import { useI18n } from "../i18n/i18n";
import { getLocalizedAppError } from "../utils/errorHelper";
import { useSpeech, DEFAULT_PRONUNCIATIONS } from "../utils/useSpeech";

import { Category, SettingsDialogProps } from "./settings/types";
import { SettingsNav } from "./settings/SettingsNav";
import { GeneralTab } from "./settings/tabs/GeneralTab";
import { ThemeTab } from "./settings/tabs/ThemeTab";
import { ReadAloudTab } from "./settings/tabs/ReadAloudTab";
import { SourcesTab } from "./settings/tabs/SourcesTab";
import { PermissionsTab, PermissionEntry } from "./settings/tabs/PermissionsTab";
import { UpdatesTab } from "./settings/tabs/UpdatesTab";

export const SettingsDialog = (props: SettingsDialogProps) => {
  const { locale, t } = useI18n();
  const [activeCategory, setActiveCategory] = createSignal<Category>("general");

  const [deletingSourceId, setDeletingSourceId] = createSignal<string | null>(null);
  const [checkingUpdates, setCheckingUpdates] = createSignal(false);
  const [updateCheckResult, setUpdateCheckResult] = createSignal<string | null>(null);
  const [updaterActive, setUpdaterActive] = createSignal(false);
  const [appVersion, setAppVersion] = createSignal("0.1.0");

  const [voices, setVoices] = createSignal<SpeechSynthesisVoice[]>([]);
  const [selectedAssistantVoiceName, setSelectedAssistantVoiceName] = createSignal("");
  const [selectedUserVoiceName, setSelectedUserVoiceName] = createSignal("");
  const [assistantSpeechRate, setAssistantSpeechRate] = createSignal(1.0);
  const [assistantSpeechPitch, setAssistantSpeechPitch] = createSignal(1.0);
  const [userSpeechRate, setUserSpeechRate] = createSignal(1.0);
  const [userSpeechPitch, setUserSpeechPitch] = createSignal(1.0);
  const [testText, setTestText] = createSignal("");

  const [rules, setRules] = createSignal<Record<string, string>>({});
  const [newWord, setNewWord] = createSignal("");
  const [newReplacement, setNewReplacement] = createSignal("");
  const [editingWord, setEditingWord] = createSignal<string | null>(null);
  const [editWordVal, setEditWordVal] = createSignal("");
  const [editRepVal, setEditRepVal] = createSignal("");

  // General Settings
  const [cacheEnabled, setCacheEnabled] = createSignal(
    localStorage.getItem("codeoba-cache-enabled") !== "false"
  );
  const [autoUpdateEnabled, setAutoUpdateEnabled] = createSignal(
    localStorage.getItem("codeoba-auto-update") !== "false"
  );
  const [parserMode, setParserMode] = createSignal(
    localStorage.getItem("codeoba-parser-mode") || "standard"
  );
  const [pruneDeleted, setPruneDeleted] = createSignal(false);

  // Path Permissions
  const [permissions, setPermissions] = createSignal<PermissionEntry[]>([]);

  // Source decisions (mock list stored in localStorage)
  const [sourceDecisions, setSourceDecisions] = createSignal<
    Record<string, "allow" | "deny" | "ask">
  >(JSON.parse(localStorage.getItem("codeoba-source-decisions") || "{}"));

  const speech = useSpeech();

  const handleSaveEdit = (oldWord: string) => {
    const word = editWordVal().trim().toLowerCase();
    const rep = editRepVal().trim();
    if (!word || !rep) return;
    const updated = { ...rules() };
    if (word !== oldWord) {
      delete updated[oldWord];
    }
    updated[word] = rep;
    setRules(updated);
    localStorage.setItem("codeoba-tts-pronunciations", JSON.stringify(updated));
    setEditingWord(null);
  };

  const loadRules = () => {
    try {
      const saved = localStorage.getItem("codeoba-tts-pronunciations");
      if (saved) {
        const parsed = JSON.parse(saved);
        let changed = false;
        for (const key of Object.keys(DEFAULT_PRONUNCIATIONS)) {
          if (!(key in parsed)) {
            parsed[key] = DEFAULT_PRONUNCIATIONS[key];
            changed = true;
          }
        }
        if (changed) {
          localStorage.setItem("codeoba-tts-pronunciations", JSON.stringify(parsed));
        }
        setRules(parsed);
      } else {
        setRules(DEFAULT_PRONUNCIATIONS);
      }
    } catch (e) {
      setRules(DEFAULT_PRONUNCIATIONS);
    }
  };

  const handleAddRule = (e: Event) => {
    e.preventDefault();
    const word = newWord().trim().toLowerCase();
    const rep = newReplacement().trim();
    if (!word || !rep) return;
    const updated = { ...rules(), [word]: rep };
    setRules(updated);
    localStorage.setItem("codeoba-tts-pronunciations", JSON.stringify(updated));
    setNewWord("");
    setNewReplacement("");
  };

  const handleDeleteRule = (word: string) => {
    const updated = { ...rules() };
    delete updated[word];
    setRules(updated);
    localStorage.setItem("codeoba-tts-pronunciations", JSON.stringify(updated));
  };

  const handleResetRules = () => {
    setRules(DEFAULT_PRONUNCIATIONS);
    localStorage.setItem("codeoba-tts-pronunciations", JSON.stringify(DEFAULT_PRONUNCIATIONS));
  };

  const handleTestVoice = async (speaker: "assistant" | "user" = "assistant") => {
    const saying = testText().trim() || t("settings.readAloud.testSaying");
    try {
      await speech.speakDirectText(saying, speaker);
    } catch (err) {
      console.error("[TTS] Test voice failed:", err);
      alert(
        "Failed to play system voice. Please check your system speech synthesizer configuration."
      );
    }
  };

  const handleResetTestText = () => {
    const defaultText = t("settings.readAloud.testSaying");
    setTestText(defaultText);
    localStorage.removeItem("codeoba-tts-test-text");
  };

  const loadVoices = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      setVoices(window.speechSynthesis.getVoices());
    }
  };

  const handleAssistantVoiceChange = (val: string) => {
    setSelectedAssistantVoiceName(val);
    localStorage.setItem("codeoba-tts-voice-assistant", val);
  };

  const handleUserVoiceChange = (val: string) => {
    setSelectedUserVoiceName(val);
    localStorage.setItem("codeoba-tts-voice-user", val);
  };

  const handleAssistantRateChange = (val: number) => {
    setAssistantSpeechRate(val);
    localStorage.setItem("codeoba-tts-rate-assistant", String(val));
  };

  const handleAssistantPitchChange = (val: number) => {
    setAssistantSpeechPitch(val);
    localStorage.setItem("codeoba-tts-pitch-assistant", String(val));
  };

  const handleUserRateChange = (val: number) => {
    setUserSpeechRate(val);
    localStorage.setItem("codeoba-tts-rate-user", String(val));
  };

  const handleUserPitchChange = (val: number) => {
    setUserSpeechPitch(val);
    localStorage.setItem("codeoba-tts-pitch-user", String(val));
  };

  const handleResetAssistantVoice = () => {
    setSelectedAssistantVoiceName("");
    setAssistantSpeechRate(1.0);
    setAssistantSpeechPitch(1.0);
    localStorage.removeItem("codeoba-tts-voice-assistant");
    localStorage.removeItem("codeoba-tts-rate-assistant");
    localStorage.removeItem("codeoba-tts-pitch-assistant");
  };

  const handleResetUserVoice = () => {
    setSelectedUserVoiceName("");
    setUserSpeechRate(1.0);
    setUserSpeechPitch(1.0);
    localStorage.removeItem("codeoba-tts-voice-user");
    localStorage.removeItem("codeoba-tts-rate-user");
    localStorage.removeItem("codeoba-tts-pitch-user");
  };

  const handleResetReadAloudDefaults = () => {
    setSelectedAssistantVoiceName("");
    setSelectedUserVoiceName("");
    setAssistantSpeechRate(1.0);
    setAssistantSpeechPitch(1.0);
    setUserSpeechRate(1.0);
    setUserSpeechPitch(1.0);
    localStorage.removeItem("codeoba-tts-voice-assistant");
    localStorage.removeItem("codeoba-tts-voice-user");
    localStorage.removeItem("codeoba-tts-rate-assistant");
    localStorage.removeItem("codeoba-tts-pitch-assistant");
    localStorage.removeItem("codeoba-tts-rate-user");
    localStorage.removeItem("codeoba-tts-pitch-user");
    handleResetRules();
  };

  onMount(async () => {
    // 1. Check updater status
    try {
      const active = await invoke<boolean>("is_updater_active");
      setUpdaterActive(active);
    } catch (err) {
      logFE("error", `Failed to check updater active status: ${err}`);
    }

    // 2. Get app version
    try {
      const v = await getVersion();
      setAppVersion(v);
    } catch (err) {
      logFE("error", `Failed to get app version: ${err}`);
    }

    // 3. Load path permissions
    try {
      await refreshPermissions();
    } catch (err) {
      logFE("error", `Failed to refresh path permissions: ${err}`);
    }

    // 4. Load source decisions
    try {
      const backendDecisions =
        await invoke<Record<string, "allow" | "deny" | "ask">>("get_source_decisions");
      if (backendDecisions) {
        setSourceDecisions(backendDecisions);
        localStorage.setItem("codeoba-source-decisions", JSON.stringify(backendDecisions));
      }
    } catch (errDec) {
      logFE("error", `Failed to load source decisions from backend: ${errDec}`);
    }

    // 6. Load prune deleted sessions setting
    try {
      const val = await invoke<string | null>("get_credential", { key: "prune_deleted_sessions" });
      setPruneDeleted(val === "true");
    } catch (err) {
      logFE("error", `Failed to load prune_deleted_sessions setting: ${err}`);
    }

    // 7. Initialize Read Aloud Settings
    loadVoices();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    setSelectedAssistantVoiceName(localStorage.getItem("codeoba-tts-voice-assistant") || "");
    setSelectedUserVoiceName(localStorage.getItem("codeoba-tts-voice-user") || "");
    setAssistantSpeechRate(
      localStorage.getItem("codeoba-tts-rate-assistant")
        ? parseFloat(localStorage.getItem("codeoba-tts-rate-assistant")!)
        : 1.0
    );
    setAssistantSpeechPitch(
      localStorage.getItem("codeoba-tts-pitch-assistant")
        ? parseFloat(localStorage.getItem("codeoba-tts-pitch-assistant")!)
        : 1.0
    );
    setUserSpeechRate(
      localStorage.getItem("codeoba-tts-rate-user")
        ? parseFloat(localStorage.getItem("codeoba-tts-rate-user")!)
        : 1.0
    );
    setUserSpeechPitch(
      localStorage.getItem("codeoba-tts-pitch-user")
        ? parseFloat(localStorage.getItem("codeoba-tts-pitch-user")!)
        : 1.0
    );
    loadRules();
    setTestText(
      localStorage.getItem("codeoba-tts-test-text") || t("settings.readAloud.testSaying")
    );
  });

  const refreshPermissions = async () => {
    try {
      const backendPermissions = await invoke<
        Array<{
          canonical_path: string;
          action: string;
          decision: string;
          timestamp: number;
        }>
      >("get_all_permissions");

      const grouped: Record<string, { preview: string; external: string }> = {};
      backendPermissions.forEach((entry) => {
        if (!grouped[entry.canonical_path]) {
          grouped[entry.canonical_path] = { preview: "ask", external: "ask" };
        }
        if (entry.action === "preview") {
          grouped[entry.canonical_path].preview = entry.decision;
        } else if (entry.action === "external_open") {
          grouped[entry.canonical_path].external = entry.decision;
        }
      });

      const list = Object.entries(grouped).map(([path, val]) => ({
        path,
        preview: val.preview,
        external: val.external,
      }));

      setPermissions(list);
    } catch (err) {
      logFE("error", `Failed to load path permissions: ${err}`);
    }
  };

  const handleToggleCache = (val: boolean) => {
    setCacheEnabled(val);
    localStorage.setItem("codeoba-cache-enabled", String(val));
    logFE("info", `Persistent cache set to: ${val}`);
  };

  const handleTogglePruneDeleted = async (checked: boolean) => {
    try {
      await invoke("save_credential", {
        key: "prune_deleted_sessions",
        value: checked ? "true" : "false",
      });
      setPruneDeleted(checked);
      logFE("info", `Prune deleted sessions set to: ${checked}`);
      props.onRefreshSources();
    } catch (err) {
      logFE("error", `Failed to save prune_deleted_sessions setting: ${err}`);
    }
  };

  const handleToggleAutoUpdate = (val: boolean) => {
    setAutoUpdateEnabled(val);
    localStorage.setItem("codeoba-auto-update", String(val));
    localStorage.setItem("codeoba-auto-update-consent", val ? "given" : "declined");
    logFE("info", `Auto-updates set to: ${val}`);
  };

  const handleParserModeChange = (mode: string) => {
    setParserMode(mode);
    localStorage.setItem("codeoba-parser-mode", mode);
    logFE("info", `Preferred parser mode set to: ${mode}`);
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    setUpdateCheckResult(null);
    try {
      await invoke("set_menu_item_text", {
        id: "check-updates",
        text: t("settings.updates.checking"),
      });

      logFE("info", `Settings: Initiating check for updates. Current version: v${appVersion()}`);
      logFE("info", "Settings: Querying the update service...");
      const update = await check({
        headers: {
          "Accept-Language": locale(),
        },
      });
      setCheckingUpdates(false);
      if (update && update.available) {
        logFE(
          "info",
          `Settings: Update check successful. Found newer version: v${update.version} (released on ${update.date || "unknown date"})`
        );
        setUpdateCheckResult(t("settings.updates.updateFound", { version: update.version }));
        if (props.onUpdateAvailable) {
          props.onUpdateAvailable(update);
        }
      } else {
        logFE("info", "Settings: Update check successful. The application is up to date.");
        setUpdateCheckResult(t("settings.updates.upToDate"));
      }
    } catch (err: any) {
      logFE("error", `Settings: Update check failed. Error details: ${err}`);
      setCheckingUpdates(false);
      setUpdateCheckResult(t("settings.updates.error", { error: String(err) }));

      try {
        logFE("info", "Settings: Attempting diagnostic connection to find root cause...");
        const endpoints = await invoke<string[]>("get_resolved_updater_endpoints");
        if (endpoints && endpoints.length > 0) {
          logFE("info", `Settings: Diagnostic fetch hitting resolved endpoint: ${endpoints[0]}`);
          const diagResponse = await fetch(endpoints[0], {
            method: "GET",
            signal: AbortSignal.timeout(5000),
          });
          if (!diagResponse.ok) {
            const bodyText = await diagResponse.text();
            logFE(
              "error",
              `Settings: Diagnostic fetch returned HTTP ${diagResponse.status}: ${bodyText}`
            );
            setUpdateCheckResult(t("settings.updates.error", { error: bodyText }));
          } else {
            logFE(
              "info",
              "Settings: Diagnostic fetch succeeded. Update manifest exists but is likely not compatible."
            );
          }
        }
      } catch (diagErr: any) {
        logFE("error", `Settings: Diagnostic connection failed: ${diagErr.message || diagErr}`);
      }
    } finally {
      await invoke("set_menu_item_text", {
        id: "check-updates",
        text: t("settings.updates.checkUpdate"),
      });
    }
  };

  const handleToggleSourceDecision = async (
    sourceId: string,
    decision: "allow" | "deny" | "ask"
  ) => {
    const next = { ...sourceDecisions(), [sourceId]: decision };
    setSourceDecisions(next);
    localStorage.setItem("codeoba-source-decisions", JSON.stringify(next));
    try {
      await invoke("save_source_decision", { sourceId, decision });
      logFE("info", `Source decision for ${sourceId} set to: ${decision}`);
      props.onRefreshSources();
    } catch (err: any) {
      logFE("error", `Failed to save source decision to backend: ${err.message || err}`);
    }
  };

  const handleDeleteSourceData = async (sourceId: string) => {
    try {
      logFE("info", `Deleting database and session data for source: ${sourceId}`);
      const success = await invoke<boolean>("delete_source_data", { sourceId });
      if (success) {
        logFE("info", `Successfully deleted data paths for source: ${sourceId}`);
        setDeletingSourceId(null);
        props.onRefreshSources();
      } else {
        logFE("error", `Failed to delete data paths for source: ${sourceId}`);
      }
    } catch (err: any) {
      logFE("error", `Error deleting data paths: ${getLocalizedAppError(err, t)}`);
    }
  };

  const handleResetPermission = async (path: string, type: "preview" | "external" | "all") => {
    try {
      if (type === "all") {
        await invoke("delete_permission", { canonicalPath: path });
      } else {
        const action = type === "preview" ? "preview" : "external_open";
        await invoke("delete_permission", { canonicalPath: path, action });
      }
      await refreshPermissions();
    } catch (err) {
      logFE("error", `Failed to reset permission: ${err}`);
    }
  };

  const handleClearAllPermissions = async () => {
    try {
      await invoke("clear_all_permissions");
      await refreshPermissions();
    } catch (err) {
      logFE("error", `Failed to clear permissions: ${err}`);
    }
  };

  const getSourceDecision = (sourceId: string) => {
    return sourceDecisions()[sourceId] || "allow";
  };

  return (
    <Show when={props.isOpen}>
      {/* Modal scrim background */}
      <div
        class="fixed inset-0 bg-black/60 z-[999] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-sm"
        onClick={() => props.onClose()}
      >
        {/* Settings Dialog box */}
        <div
          class="w-[760px] h-[520px] bg-surface border border-border/80 rounded-2xl flex overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button in top-right */}
          <button
            onClick={() => props.onClose()}
            class="absolute top-4 right-4 p-1.5 bg-background hover:bg-surface border border-border/60 rounded-xl text-text-secondary hover:text-text-primary transition-all cursor-pointer"
          >
            <X class="w-4 h-4" />
          </button>

          {/* Left Sidebar categories list */}
          <div class="flex flex-col h-full flex-shrink-0">
            <SettingsNav
              activeCategory={activeCategory()}
              onSelectCategory={(cat) => setActiveCategory(cat)}
            />

            {/* Version Display */}
            <div class="mt-auto p-4 pt-0">
              <div class="px-3 py-2 bg-background/50 border border-border/40 rounded-xl flex items-center justify-between text-[0.625rem] text-text-secondary font-medium">
                <span>Codeoba</span>
                <span class="font-mono bg-surface border border-border/60 px-1.5 py-0.5 rounded text-accent">
                  v{appVersion()}
                </span>
              </div>
            </div>
          </div>

          {/* Right Pane Content Area */}
          <div class="flex-grow h-full flex flex-col p-6 pt-8 overflow-y-auto min-w-0">
            <GeneralTab
              activeCategory={activeCategory()}
              cacheEnabled={cacheEnabled()}
              onToggleCache={handleToggleCache}
              pruneDeleted={pruneDeleted()}
              onTogglePruneDeleted={handleTogglePruneDeleted}
              fontSize={props.fontSize}
              onFontSizeChange={props.onFontSizeChange}
              parserMode={parserMode()}
              onParserModeChange={handleParserModeChange}
              dateFormat={props.dateFormat}
              onDateFormatChange={props.onDateFormatChange}
              timeFormat={props.timeFormat}
              onTimeFormatChange={props.onTimeFormatChange}
              showSeconds={props.showSeconds}
              onShowSecondsChange={props.onShowSecondsChange}
              numberFormat={props.numberFormat}
              onNumberFormatChange={props.onNumberFormatChange}
              excludedPaths={props.excludedPaths}
              onExcludedPathsChange={props.onExcludedPathsChange}
              indexSubagents={props.indexSubagents}
              onIndexSubagentsChange={props.onIndexSubagentsChange}
            />

            <ThemeTab
              activeCategory={activeCategory()}
              theme={props.theme}
              onThemeChange={props.onThemeChange}
              appearance={props.appearance}
              onAppearanceChange={props.onAppearanceChange}
              customTheme={props.customTheme}
              onCustomThemeChange={props.onCustomThemeChange}
            />

            <ReadAloudTab
              activeCategory={activeCategory()}
              voices={voices()}
              selectedAssistantVoiceName={selectedAssistantVoiceName()}
              onAssistantVoiceChange={handleAssistantVoiceChange}
              selectedUserVoiceName={selectedUserVoiceName()}
              onUserVoiceChange={handleUserVoiceChange}
              assistantSpeechRate={assistantSpeechRate()}
              onAssistantRateChange={handleAssistantRateChange}
              assistantSpeechPitch={assistantSpeechPitch()}
              onAssistantPitchChange={handleAssistantPitchChange}
              userSpeechRate={userSpeechRate()}
              onUserRateChange={handleUserRateChange}
              userSpeechPitch={userSpeechPitch()}
              onUserPitchChange={handleUserPitchChange}
              onResetAssistantVoice={handleResetAssistantVoice}
              onResetUserVoice={handleResetUserVoice}
              onResetReadAloudDefaults={handleResetReadAloudDefaults}
              testText={testText()}
              setTestText={setTestText}
              rules={rules()}
              onAddRule={handleAddRule}
              newWord={newWord()}
              setNewWord={setNewWord}
              newReplacement={newReplacement()}
              setNewReplacement={setNewReplacement}
              editingWord={editingWord()}
              setEditingWord={setEditingWord}
              editWordVal={editWordVal()}
              setEditWordVal={setEditWordVal}
              editRepVal={editRepVal()}
              setEditRepVal={setEditRepVal}
              onSaveEdit={handleSaveEdit}
              onDeleteRule={handleDeleteRule}
              onResetRules={handleResetRules}
              onTestVoice={handleTestVoice}
              onResetTestText={handleResetTestText}
            />

            <SourcesTab
              activeCategory={activeCategory()}
              sources={props.sources}
              getSourceDecision={getSourceDecision}
              onToggleSourceDecision={handleToggleSourceDecision}
              deletingSourceId={deletingSourceId()}
              setDeletingSourceId={setDeletingSourceId}
              onDeleteSourceData={handleDeleteSourceData}
            />

            <PermissionsTab
              activeCategory={activeCategory()}
              permissions={permissions()}
              onResetPermission={handleResetPermission}
              onClearAllPermissions={handleClearAllPermissions}
            />

            <UpdatesTab
              activeCategory={activeCategory()}
              updaterActive={updaterActive()}
              autoUpdateEnabled={autoUpdateEnabled()}
              onToggleAutoUpdate={handleToggleAutoUpdate}
              appVersion={appVersion()}
              checkingUpdates={checkingUpdates()}
              updateCheckResult={updateCheckResult()}
              onCheckUpdates={props.onCheckUpdates || handleCheckUpdates}
            />
          </div>
        </div>
      </div>
    </Show>
  );
};
