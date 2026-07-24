import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { logFE } from "../utils/logger";
import { useI18n } from "../i18n/i18n";

export function useAutoUpdater() {
  const { t, locale } = useI18n();

  const [updateManifest, setUpdateManifest] = createSignal<any>(null);
  const [showUpdateModal, setShowUpdateModal] = createSignal(false);
  const [isUpdating, setIsUpdating] = createSignal(false);
  const [updateProgress, setUpdateProgress] = createSignal(0);
  const [updateError, setUpdateError] = createSignal<string | null>(null);
  const [showConsentModal, setShowConsentModal] = createSignal(false);

  const [showCheckingModal, setShowCheckingModal] = createSignal(false);
  const [checkingStatus, setCheckingStatus] = createSignal<"checking" | "upToDate" | "error">(
    "checking"
  );
  const [checkingErrorMsg, setCheckingErrorMsg] = createSignal<string | null>(null);

  const runUpdateCheck = () => {
    setTimeout(async () => {
      try {
        const updaterActive = await invoke<boolean>("is_updater_active");
        if (!updaterActive) {
          return;
        }

        const currentVersion = await getVersion();
        logFE(
          "info",
          `Background Updater: Initiating background check. Current version: v${currentVersion}`
        );
        logFE("info", "Background Updater: Querying the update service...");
        const update = await check({
          headers: {
            "Accept-Language": locale(),
          },
        });
        if (update && update.available) {
          logFE(
            "info",
            `Background Updater: Update check successful. Found newer version: v${update.version} (released on ${update.date || "unknown date"})`
          );
          setUpdateManifest(update);
          setShowUpdateModal(true);
        } else {
          logFE(
            "info",
            "Background Updater: Update check successful. The application is up to date."
          );
        }
      } catch (err: any) {
        logFE("error", `Background Updater: Update check failed. Error details: ${err}`);
      }
    }, 2000);
  };

  const handleConsentDecision = (consented: boolean) => {
    localStorage.setItem("codeoba-auto-update", String(consented));
    localStorage.setItem("codeoba-auto-update-consent", consented ? "given" : "declined");
    setShowConsentModal(false);
    logFE("info", `Update check consent set to: ${consented}`);
    if (consented) {
      runUpdateCheck();
    }
  };

  const triggerManualUpdateCheck = async () => {
    setCheckingStatus("checking");
    setCheckingErrorMsg(null);
    setShowCheckingModal(true);

    try {
      await invoke("set_menu_item_text", {
        id: "check-updates",
        text: t("settings.updates.checking"),
      });

      logFE("info", "Manual Updater: Initiating check...");
      const update = await check({
        headers: {
          "Accept-Language": locale(),
        },
      });
      if (update && update.available) {
        logFE("info", `Manual Updater: Update found: v${update.version}`);
        setShowCheckingModal(false);
        setUpdateManifest(update);
        setShowUpdateModal(true);
      } else {
        logFE("info", "Manual Updater: Up to date");
        setCheckingStatus("upToDate");
      }
    } catch (err: any) {
      logFE("error", `Manual Updater: Failed: ${err}`);
      setCheckingStatus("error");
      setCheckingErrorMsg(t("settings.updates.error", { error: err.toString() }));
    } finally {
      await invoke("set_menu_item_text", {
        id: "check-updates",
        text: t("settings.updates.checkUpdate"),
      });
    }
  };

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

  return {
    updateManifest,
    setUpdateManifest,
    showUpdateModal,
    setShowUpdateModal,
    isUpdating,
    updateProgress,
    updateError,
    showConsentModal,
    setShowConsentModal,
    showCheckingModal,
    setShowCheckingModal,
    checkingStatus,
    checkingErrorMsg,
    runUpdateCheck,
    handleConsentDecision,
    triggerManualUpdateCheck,
    handleStartUpdate,
  };
}
