import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { X, ExternalLink, FileText, RefreshCw, ShieldAlert } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { logFE } from "../utils/logger";
import { useI18n } from "../i18n/i18n";
import { getLocalizedAppError } from "../utils/errorHelper";
import { BaseModal } from "./common/BaseModal";

interface FileViewerDialogProps {
  sessionCwd?: string | null;
}

export const FileViewerDialog = (props: FileViewerDialogProps) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = createSignal(false);
  const [filePath, setFilePath] = createSignal("");
  const [canonicalPath, setCanonicalPath] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<
    "idle" | "loading" | "allowed" | "confirmation_required" | "denied" | "error"
  >("idle");
  const [content, setContent] = createSignal("");
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [confirmReason, setConfirmReason] = createSignal<string | null>(null);

  const handleOpenLocalFile = async (e: Event) => {
    const customEvent = e as CustomEvent<{ href: string }>;
    const href = customEvent.detail.href;
    setFilePath(href);
    setIsOpen(true);
    await loadFile(href);
  };

  onMount(() => {
    window.addEventListener("open-local-file", handleOpenLocalFile);
    onCleanup(() => {
      window.removeEventListener("open-local-file", handleOpenLocalFile);
    });
  });

  const loadFile = async (pathStr: string) => {
    setStatus("loading");
    setErrorMsg(null);
    setConfirmReason(null);

    try {
      const response = await invoke<{
        status: string;
        content: string | null;
        canonicalPath: string | null;
        reason: string | null;
      }>("resolve_and_read_file", {
        rawPath: pathStr,
        sessionCwd: props.sessionCwd || null,
      });

      setCanonicalPath(response.canonicalPath);

      if (response.status === "allowed") {
        setContent(response.content || "");
        setStatus("allowed");
      } else if (response.status === "confirmation_required") {
        setConfirmReason(response.reason);
        setStatus("confirmation_required");
      } else {
        setErrorMsg(t("fileViewer.failedLoadGeneric"));
        setStatus("error");
      }
    } catch (err: any) {
      logFE("error", `FileViewerDialog: Failed to resolve file: ${err}`);
      setErrorMsg(getLocalizedAppError(err, t));
      setStatus("error");
    }
  };

  const handleGrantPermission = async (decision: "allow" | "deny") => {
    if (!canonicalPath()) return;
    try {
      await invoke("save_file_permission", {
        canonicalPath: canonicalPath()!,
        action: "preview",
        decision,
      });
      logFE(
        "info",
        `FileViewerDialog: Saved preview permission '${decision}' for ${canonicalPath()}`
      );

      if (decision === "allow") {
        await loadFile(filePath());
      } else {
        setStatus("denied");
        setErrorMsg(t("fileViewer.permissionDeniedByUser"));
      }
    } catch (err) {
      logFE("error", `FileViewerDialog: Failed to save permission: ${err}`);
    }
  };

  const handleLaunchExternal = async () => {
    try {
      logFE("info", `FileViewerDialog: Opening ${filePath()} externally`);
      await invoke("open_file_externally", {
        rawPath: filePath(),
        sessionCwd: props.sessionCwd || null,
      });
    } catch (err: any) {
      logFE("error", `FileViewerDialog: Failed to open externally: ${err}`);
      // If confirmation is required, ask user
      if (err.toString().includes("Confirmation required")) {
        const confirmOpen = confirm(t("fileViewer.confirmExternalOpen"));
        if (confirmOpen && canonicalPath()) {
          await invoke("save_file_permission", {
            canonicalPath: canonicalPath()!,
            action: "external_open",
            decision: "allow",
          });
          await invoke("open_file_externally", {
            rawPath: filePath(),
            sessionCwd: props.sessionCwd || null,
          });
        }
      } else {
        alert(t("fileViewer.errorOpeningFile", { error: err.toString() }));
      }
    }
  };

  const isMarkdown = () => {
    const path = filePath().toLowerCase();
    return path.endsWith(".md") || path.endsWith(".markdown");
  };

  const fileName = () => {
    const parts = filePath().split(/[/\\]/);
    return parts[parts.length - 1] || "File Viewer";
  };

  const handleClose = () => {
    setIsOpen(false);
    setStatus("idle");
    setContent("");
    setCanonicalPath(null);
  };

  return (
    <BaseModal
      isOpen={isOpen()}
      onClose={handleClose}
      backdropClass="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      class="bg-[#121318]/95 border border-border/60 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in scale-in duration-200"
    >
      {/* Header */}
      <div class="flex items-center justify-between border-b border-border/40 px-6 py-4 flex-shrink-0 bg-surface/30">
        <div class="flex items-center gap-3">
          <FileText class="w-5 h-5 text-accent" />
          <div class="flex flex-col">
            <h3 class="text-sm font-bold text-text-primary tracking-wide">{fileName()}</h3>
            <span class="text-[0.625rem] text-text-secondary/70 font-mono truncate max-w-2xl">
              {canonicalPath() || filePath()}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Show when={canonicalPath()}>
            <button
              onClick={handleLaunchExternal}
              class="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-elevated border border-border/60 rounded-xl text-xs text-text-secondary hover:text-text-primary transition-all cursor-pointer"
              title={t("fileViewer.openInDefaultApp")}
            >
              <ExternalLink class="w-3.5 h-3.5" />
              <span>{t("fileViewer.openExternal")}</span>
            </button>
          </Show>
          <button
            onClick={handleClose}
            class="p-1.5 hover:bg-surface rounded-xl text-text-secondary hover:text-text-primary transition-all cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div class="flex-1 overflow-hidden relative flex flex-col">
        <Show when={status() === "loading"}>
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#121318]/80 backdrop-blur-xs z-20 text-text-secondary">
            <RefreshCw class="w-6 h-6 animate-spin text-accent" />
            <span class="text-xs font-medium">{t("fileViewer.loadingContent")}</span>
          </div>
        </Show>

        <Show when={status() === "allowed"}>
          <div class="flex-1 overflow-y-auto p-6 custom-scrollbar select-text">
            <Show
              when={isMarkdown()}
              fallback={
                <pre class="font-mono text-xs text-text-primary leading-relaxed whitespace-pre-wrap break-all">
                  {content()}
                </pre>
              }
            >
              <div class="markdown-body max-w-none text-text-primary">
                <MarkdownRenderer content={content()} />
              </div>
            </Show>
          </div>
        </Show>

        <Show when={status() === "confirmation_required"}>
          <div class="flex-1 flex flex-col items-center justify-center p-8 text-center gap-5 max-w-lg mx-auto">
            <div class="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldAlert class="w-7 h-7 animate-bounce" />
            </div>

            <div class="space-y-2">
              <h4 class="text-base font-bold text-text-primary">
                {t("fileViewer.accessPermissionRequired")}
              </h4>
              <p class="text-xs text-text-secondary leading-relaxed">
                {confirmReason() || t("fileViewer.permissionExplanation")}
              </p>
            </div>

            <div class="w-full bg-background/50 border border-border/40 rounded-xl p-3 text-left space-y-1.5">
              <span class="text-[0.625rem] font-bold text-text-secondary uppercase tracking-wider">
                {t("fileViewer.targetPath")}
              </span>
              <p class="text-xs font-mono text-text-primary break-all select-text">
                {canonicalPath() || filePath()}
              </p>
            </div>

            <div class="flex items-center gap-3 w-full pt-2">
              <button
                onClick={() => handleGrantPermission("deny")}
                class="flex-1 py-2.5 bg-surface hover:bg-surface-elevated border border-border rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleGrantPermission("allow")}
                class="flex-1 py-2.5 bg-accent hover:bg-accent/90 border border-accent/20 rounded-xl text-xs font-semibold text-background transition-all cursor-pointer shadow-md"
              >
                {t("fileViewer.grantPermission")}
              </button>
            </div>
          </div>
        </Show>

        {/* Denied or Error */}
        <Show when={status() === "denied" || status() === "error"}>
          <div class="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto p-6 space-y-4">
            <div class="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 text-red-400">
              <ShieldAlert class="w-6 h-6" />
            </div>
            <div class="space-y-1">
              <h4 class="text-sm font-bold text-text-primary">{t("common.error")}</h4>
              <p class="text-xs text-text-secondary leading-relaxed">{errorMsg()}</p>
            </div>
            <button
              onClick={handleClose}
              class="px-4 py-2 bg-surface border border-border rounded-xl text-xs font-semibold hover:bg-background transition-all cursor-pointer"
            >
              {t("common.close")}
            </button>
          </div>
        </Show>
      </div>
    </BaseModal>
  );
};
