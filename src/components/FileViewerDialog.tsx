import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { X, ShieldAlert, ExternalLink, FileText } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { logFE } from "../utils/logger";

interface FileViewerDialogProps {
  sessionCwd?: string | null;
}

export const FileViewerDialog = (props: FileViewerDialogProps) => {
  const [isOpen, setIsOpen] = createSignal(false);
  const [filePath, setFilePath] = createSignal("");
  const [canonicalPath, setCanonicalPath] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<"idle" | "loading" | "allowed" | "confirmation_required" | "denied" | "error">("idle");
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
      } else if (response.status === "denied") {
        setErrorMsg(response.reason || "Access was denied.");
        setStatus("denied");
      } else {
        setErrorMsg(response.reason || "Failed to load file.");
        setStatus("error");
      }
    } catch (err: any) {
      logFE("error", `FileViewerDialog: Failed to resolve file: ${err}`);
      setErrorMsg(err.toString());
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
      logFE("info", `FileViewerDialog: Saved preview permission '${decision}' for ${canonicalPath()}`);
      
      if (decision === "allow") {
        await loadFile(filePath());
      } else {
        setStatus("denied");
        setErrorMsg("Permission denied by user.");
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
        const confirmOpen = confirm("This file is outside the workspace. Allow opening externally?");
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
        alert(`Error opening file: ${err}`);
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
    <Show when={isOpen()}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div class="bg-[#121318]/95 border border-border/60 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in scale-in duration-200">
          
          {/* Header */}
          <div class="flex items-center justify-between border-b border-border/40 px-6 py-4 flex-shrink-0 bg-surface/30">
            <div class="flex items-center gap-3">
              <FileText class="w-5 h-5 text-accent" />
              <div class="flex flex-col">
                <h3 class="text-sm font-bold text-text-primary tracking-wide">{fileName()}</h3>
                <span class="text-[10px] text-text-secondary/70 font-mono truncate max-w-2xl">
                  {canonicalPath() || filePath()}
                </span>
              </div>
            </div>
            
            <div class="flex items-center gap-3">
              <button
                onClick={handleLaunchExternal}
                title="Open in System Editor"
                class="flex items-center gap-1.5 px-3 py-1.5 bg-background hover:bg-surface border border-border/60 hover:border-accent/40 rounded-xl text-xs font-semibold text-text-secondary hover:text-accent transition-all cursor-pointer"
              >
                <ExternalLink class="w-3.5 h-3.5" />
                <span>Open Externally</span>
              </button>
              <button
                onClick={handleClose}
                class="p-2 hover:bg-surface border border-border/40 hover:border-border rounded-xl text-text-secondary hover:text-text-primary transition-all cursor-pointer"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div class="flex-grow overflow-y-auto p-6 relative bg-background/25">
            
            {/* Loading */}
            <Show when={status() === "loading"}>
              <div class="absolute inset-0 flex items-center justify-center bg-background/50">
                <div class="flex flex-col items-center gap-2">
                  <div class="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                  <span class="text-xs text-text-secondary font-semibold">Resolving file...</span>
                </div>
              </div>
            </Show>

            {/* Allowed Content */}
            <Show when={status() === "allowed"}>
              <Show 
                when={isMarkdown()} 
                fallback={
                  <pre class="w-full text-xs font-mono leading-relaxed text-text-primary/80 overflow-x-auto whitespace-pre p-2 bg-surface/10 rounded-2xl border border-border/20 select-text">
                    <code>{content()}</code>
                  </pre>
                }
              >
                <div class="markdown-body p-2 text-text-primary/95 select-text">
                  <MarkdownRenderer content={content()} />
                </div>
              </Show>
            </Show>

            {/* Confirmation Overlay */}
            <Show when={status() === "confirmation_required"}>
              <div class="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto p-6 space-y-6">
                <div class="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20 text-yellow-400">
                  <ShieldAlert class="w-8 h-8 animate-bounce" />
                </div>
                <div class="space-y-2">
                  <h4 class="text-sm font-bold text-text-primary">Security Confirmation Required</h4>
                  <p class="text-xs text-text-secondary leading-relaxed">
                    {confirmReason() || "The requested file lies outside of the workspace directory of your current session."}
                  </p>
                  <pre class="bg-surface border border-border rounded-xl p-3 text-[10.5px] font-mono text-left truncate text-text-primary/90 mt-2 select-all">
                    {canonicalPath()}
                  </pre>
                </div>

                <div class="flex flex-col w-full gap-2 pt-2">
                  <button
                    onClick={() => handleGrantPermission("allow")}
                    class="w-full py-2.5 bg-accent hover:bg-accent-hover text-black font-semibold rounded-xl text-xs transition-all cursor-pointer shadow-lg hover:shadow-accent/20"
                  >
                    Allow & Preview File
                  </button>
                  <button
                    onClick={() => handleGrantPermission("deny")}
                    class="w-full py-2.5 bg-background hover:bg-red-500/10 border border-border hover:border-red-500/30 text-text-secondary hover:text-red-400 font-semibold rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Block Preview
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
                  <h4 class="text-sm font-bold text-text-primary">Unable to Open File</h4>
                  <p class="text-xs text-text-secondary leading-relaxed">{errorMsg()}</p>
                </div>
                <button
                  onClick={handleClose}
                  class="px-4 py-2 bg-surface border border-border rounded-xl text-xs font-semibold hover:bg-background transition-all cursor-pointer"
                >
                  Close Viewer
                </button>
              </div>
            </Show>

          </div>
        </div>
      </div>
    </Show>
  );
};
