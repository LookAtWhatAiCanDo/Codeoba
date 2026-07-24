import { createSignal, createMemo, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import {
  Folder,
  FolderOpen,
  Copy,
  Check,
  ChevronDown,
  MoreVertical,
  Pin,
  Trash2,
  Volume2,
} from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";
import { useSpeech } from "../../../utils/useSpeech";
import { getStatusBadge } from "../../../utils/sessionStatus";
import { Session } from "../../../types";

export interface DetailHeaderProps {
  session: Session;
  onCopyPath: (path: string) => void;
  groups?: any[];
  pinnedSessionIds?: Set<string>;
  onTogglePinSession?: (sessionId: string) => void;
  onAssignSessionToGroup?: (sessionId: string, groupName: string) => Promise<void>;
  onRemoveSessionFromGroup?: (sessionId: string, groupName: string) => Promise<void>;
}

export const DetailHeader = (props: DetailHeaderProps) => {
  const { t } = useI18n();
  const speech = useSpeech();

  const [copiedPath, setCopiedPath] = createSignal(false);
  const [copiedWorkspace, setCopiedWorkspace] = createSignal(false);
  const [copiedTitle, setCopiedTitle] = createSignal(false);

  const [showActionsDropdown, setShowActionsDropdown] = createSignal(false);
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = createSignal(false);
  const [showSessionDropdown, setShowSessionDropdown] = createSignal(false);

  const [workspaceAction, setWorkspaceAction] = createSignal<"copy" | "show">(
    (localStorage.getItem("codeoba-workspace-action") as "copy" | "show") || "copy"
  );
  const [sessionAction, setSessionAction] = createSignal<"copy" | "show">(
    (localStorage.getItem("codeoba-session-action") as "copy" | "show") || "copy"
  );

  const getWorkspaceName = () => {
    return props.session.workspaceName || t("common.localWorkspace");
  };

  const statusBadge = (status: string) => getStatusBadge(status, t);

  const handleCopyPath = () => {
    props.onCopyPath(props.session.filePath);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const handleCopyWorkspacePath = () => {
    if (props.session.cwd) {
      navigator.clipboard.writeText(props.session.cwd);
      setCopiedWorkspace(true);
      setTimeout(() => setCopiedWorkspace(false), 2000);
    }
  };

  const handleCopyTitle = () => {
    const titleText = props.session.threadName || t("detailPane.noSelection");
    navigator.clipboard.writeText(titleText);
    setCopiedTitle(true);
    setTimeout(() => setCopiedTitle(false), 2000);
  };

  const compactionCount = createMemo(() => {
    return props.session.turns.filter((t) => t.extraData?.isCompaction === "true").length;
  });

  return (
    <div
      class="border-b border-border/60 flex items-center justify-between glass flex-shrink-0 transition-all duration-200 px-6 relative z-50"
      style={{
        height: "4.75rem",
      }}
    >
      <div class="min-w-0 flex flex-col gap-0.5 pt-2">
        <div class="flex items-center gap-1.5 text-xs text-text-secondary/80">
          <span class="hover:text-text-primary transition-colors cursor-default">
            {getWorkspaceName()}
          </span>
          <span class="text-border">/</span>
          <div class="flex items-center gap-1.5 min-w-0">
            <span
              onClick={handleCopyTitle}
              class={`truncate font-medium transition-all cursor-pointer hover:text-accent select-none ${copiedTitle() ? "text-emerald-400 font-semibold" : "text-text-primary"}`}
              title={copiedTitle() ? t("detailPane.titleCopied") : t("detailPane.clickToCopyTitle")}
            >
              {props.session.threadName || t("detailPane.noSelection")}
            </span>
            <Show when={copiedTitle()}>
              <span class="text-[0.5625rem] font-bold text-emerald-400 bg-emerald-400/10 px-1 py-0.5 rounded border border-emerald-400/20 animate-in fade-in zoom-in-95 duration-150 select-none">
                {t("common.copied")}
              </span>
            </Show>
          </div>
          <Show when={props.session.status}>
            <div
              class={`flex items-center gap-1 px-1.5 py-0.5 border rounded-md text-[0.5625rem] font-bold select-none leading-none ${statusBadge(props.session.status!).class}`}
            >
              {statusBadge(props.session.status!).icon()}
              <span>{statusBadge(props.session.status!).label}</span>
            </div>
          </Show>
          <Show when={props.session.isDeleted}>
            <div class="flex items-center gap-1 px-1.5 py-0.5 border border-red-500/30 bg-red-500/10 text-red-500 rounded-md text-[0.5625rem] font-bold select-none leading-none">
              <Trash2 class="w-3 h-3 text-red-500" />
              <span>{t("sidebar.badgeDeleted")}</span>
            </div>
          </Show>
          <Show when={compactionCount() > 0}>
            <span class="px-2 py-0.5 bg-accent/15 border border-accent/30 text-accent rounded-full text-[0.5625rem] font-bold select-none leading-none pt-[3px] pb-[3px]">
              {t("dashboard.totalCompactions")}: {compactionCount()}
            </span>
          </Show>
        </div>

        <Show when={props.session.cwd}>
          <div dir="ltr" class="flex items-center gap-1.5 text-[0.6875rem] text-left">
            <Folder
              class={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${copiedWorkspace() ? "text-emerald-400" : "text-text-secondary/60"}`}
            />
            <span
              onClick={handleCopyWorkspacePath}
              class={`truncate transition-colors cursor-pointer hover:text-accent select-none ${copiedWorkspace() ? "text-emerald-400 font-medium" : "text-text-secondary/60"}`}
              title={
                copiedWorkspace()
                  ? t("detailPane.workspacePathCopied")
                  : t("detailPane.copyWorkspacePath")
              }
            >
              {props.session.cwd}
            </span>
            <Show when={copiedWorkspace()}>
              <span class="text-[0.5625rem] font-bold text-emerald-400 bg-emerald-400/10 px-1 py-0.5 rounded border border-emerald-400/20 animate-in fade-in zoom-in-95 duration-150 select-none">
                {t("common.copied")}
              </span>
            </Show>
          </div>
        </Show>
      </div>

      <div class="flex items-center gap-2">
        <Show when={props.session.cwd}>
          <div class="relative flex items-center bg-surface border border-border/80 rounded-xl hover:border-border/60 transition-all select-none">
            <button
              onClick={async () => {
                if (workspaceAction() === "copy") {
                  handleCopyWorkspacePath();
                } else {
                  try {
                    await invoke("reveal_in_folder", { path: props.session.cwd! });
                  } catch (e) {
                    console.error("Failed to reveal workspace path:", e);
                  }
                }
              }}
              title={
                workspaceAction() === "copy"
                  ? t("detailPane.copyWorkspacePath")
                  : navigator.userAgent.includes("Mac")
                    ? t("detailPane.showWorkspaceInFinder")
                    : t("detailPane.showWorkspaceInFolder")
              }
              class="pl-3 pr-2 py-2 text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
            >
              <Show when={workspaceAction() === "copy"}>
                <Show when={copiedWorkspace()} fallback={<Copy class="w-3.5 h-3.5" />}>
                  <Check class="w-3.5 h-3.5 text-emerald-400" />
                </Show>
                <span>{t("detailPane.copyWorkspacePath")}</span>
              </Show>
              <Show when={workspaceAction() === "show"}>
                <FolderOpen class="w-3.5 h-3.5" />
                <span>
                  {navigator.userAgent.includes("Mac")
                    ? t("detailPane.showWorkspaceInFinder")
                    : t("detailPane.showWorkspaceInFolder")}
                </span>
              </Show>
            </button>
            <div class="w-[1px] h-3 bg-border/80 self-center" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowWorkspaceDropdown(!showWorkspaceDropdown());
                setShowSessionDropdown(false);
                setShowActionsDropdown(false);
                window.dispatchEvent(new CustomEvent("close-context-menus"));
              }}
              class="px-2 py-2 text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center cursor-pointer"
            >
              <ChevronDown class="w-3 h-3" />
            </button>

            <Show when={showWorkspaceDropdown()}>
              <div class="absolute right-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-xl w-52 py-1 z-[9999] text-left flex flex-col animate-in fade-in slide-in-from-top-1 duration-100">
                <button
                  class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-colors flex items-center justify-between cursor-pointer"
                  onClick={() => {
                    setWorkspaceAction("copy");
                    localStorage.setItem("codeoba-workspace-action", "copy");
                    setShowWorkspaceDropdown(false);
                  }}
                >
                  <div class="flex items-center gap-2 whitespace-nowrap">
                    <Copy class="w-3.5 h-3.5" />
                    <span>{t("detailPane.copyWorkspacePath")}</span>
                  </div>
                  <Show when={workspaceAction() === "copy"}>
                    <Check class="w-3 h-3 text-text-secondary" />
                  </Show>
                </button>
                <button
                  class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-colors flex items-center justify-between cursor-pointer"
                  onClick={() => {
                    setWorkspaceAction("show");
                    localStorage.setItem("codeoba-workspace-action", "show");
                    setShowWorkspaceDropdown(false);
                  }}
                >
                  <div class="flex items-center gap-2 whitespace-nowrap">
                    <FolderOpen class="w-3.5 h-3.5" />
                    <span>
                      {navigator.userAgent.includes("Mac")
                        ? t("detailPane.showWorkspaceInFinder")
                        : t("detailPane.showWorkspaceInFolder")}
                    </span>
                  </div>
                  <Show when={workspaceAction() === "show"}>
                    <Check class="w-3 h-3 text-text-secondary" />
                  </Show>
                </button>
              </div>
            </Show>
          </div>
        </Show>

        <div class="relative flex items-center bg-surface border border-border/80 rounded-xl hover:border-border/60 transition-all select-none">
          <button
            onClick={async () => {
              if (sessionAction() === "copy") {
                handleCopyPath();
              } else {
                try {
                  await invoke("reveal_in_folder", { path: props.session.filePath });
                } catch (e) {
                  console.error("Failed to reveal session path:", e);
                }
              }
            }}
            title={
              sessionAction() === "copy"
                ? t("detailPane.copySessionPath")
                : navigator.userAgent.includes("Mac")
                  ? t("detailPane.showSessionInFinder")
                  : t("detailPane.showSessionInFolder")
            }
            class="pl-3 pr-2 py-2 text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
          >
            <Show when={sessionAction() === "copy"}>
              <Show when={copiedPath()} fallback={<Copy class="w-3.5 h-3.5" />}>
                <Check class="w-3.5 h-3.5 text-emerald-400" />
              </Show>
              <span>{t("detailPane.copySessionPath")}</span>
            </Show>
            <Show when={sessionAction() === "show"}>
              <FolderOpen class="w-3.5 h-3.5" />
              <span>
                {navigator.userAgent.includes("Mac")
                  ? t("detailPane.showSessionInFinder")
                  : t("detailPane.showSessionInFolder")}
              </span>
            </Show>
          </button>
          <div class="w-[1px] h-3 bg-border/80 self-center" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSessionDropdown(!showSessionDropdown());
              setShowWorkspaceDropdown(false);
              setShowActionsDropdown(false);
              window.dispatchEvent(new CustomEvent("close-context-menus"));
            }}
            class="px-2 py-2 text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center cursor-pointer"
          >
            <ChevronDown class="w-3 h-3" />
          </button>

          <Show when={showSessionDropdown()}>
            <div class="absolute right-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-xl w-52 py-1 z-[9999] text-left flex flex-col animate-in fade-in slide-in-from-top-1 duration-100">
              <button
                class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-colors flex items-center justify-between cursor-pointer"
                onClick={() => {
                  setSessionAction("copy");
                  localStorage.setItem("codeoba-session-action", "copy");
                  setShowSessionDropdown(false);
                }}
              >
                <div class="flex items-center gap-2 whitespace-nowrap">
                  <Copy class="w-3.5 h-3.5" />
                  <span>{t("detailPane.copySessionPath")}</span>
                </div>
                <Show when={sessionAction() === "copy"}>
                  <Check class="w-3 h-3 text-text-secondary" />
                </Show>
              </button>
              <button
                class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-colors flex items-center justify-between cursor-pointer"
                onClick={() => {
                  setSessionAction("show");
                  localStorage.setItem("codeoba-session-action", "show");
                  setShowSessionDropdown(false);
                }}
              >
                <div class="flex items-center gap-2 whitespace-nowrap">
                  <FolderOpen class="w-3.5 h-3.5" />
                  <span>
                    {navigator.userAgent.includes("Mac")
                      ? t("detailPane.showSessionInFinder")
                      : t("detailPane.showSessionInFolder")}
                  </span>
                </div>
                <Show when={sessionAction() === "show"}>
                  <Check class="w-3 h-3 text-text-secondary" />
                </Show>
              </button>
            </div>
          </Show>
        </div>

        {/* Playback (Read Aloud) Session Toggle */}
        <Show when={props.session}>
          <Show
            when={speech.isReadAloudActive(props.session.id)}
            fallback={
              <button
                onClick={() =>
                  speech.toggleReadAloud(props.session.id, {
                    sourceId: props.session.sourceId,
                    filePath: props.session.filePath,
                  })
                }
                title={t("readAloud.readSessionAloud")}
                class="p-2 bg-surface hover:bg-surface/80 border border-border/80 rounded-xl text-text-secondary hover:text-text-primary transition-all flex items-center justify-center cursor-pointer"
              >
                <Volume2 class="w-3.5 h-3.5" />
              </button>
            }
          >
            <button
              onClick={() =>
                speech.toggleReadAloud(props.session.id, {
                  sourceId: props.session.sourceId,
                  filePath: props.session.filePath,
                })
              }
              title={t("readAloud.stopReading")}
              class="p-2 bg-accent-light/10 hover:bg-accent-light/25 border border-accent/20 rounded-xl text-accent transition-all flex items-center justify-center cursor-pointer animate-pulse"
            >
              <Volume2 class="w-3.5 h-3.5" />
            </button>
          </Show>
        </Show>

        {/* Pin/Unpin Toggle */}
        <Show when={props.onTogglePinSession && props.pinnedSessionIds && props.session}>
          <button
            onClick={() => props.onTogglePinSession!(props.session.id)}
            title={
              props.pinnedSessionIds!.has(props.session.id)
                ? t("groups.unpinConversation")
                : t("groups.pinConversation")
            }
            class={`p-2 bg-surface border rounded-xl transition-all flex items-center justify-center cursor-pointer ${
              props.pinnedSessionIds!.has(props.session.id)
                ? "text-accent border-accent/20 bg-accent-light/10 hover:bg-accent-light/20"
                : "text-text-secondary hover:text-text-primary border-border/80 hover:bg-surface/80"
            }`}
          >
            <Pin class="w-3.5 h-3.5" />
          </button>
        </Show>

        <div class="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowActionsDropdown(!showActionsDropdown());
              setShowSessionDropdown(false);
              setShowWorkspaceDropdown(false);
              window.dispatchEvent(new CustomEvent("close-context-menus"));
            }}
            title="More actions"
            class="p-2 bg-surface hover:bg-surface/80 border border-border/80 rounded-xl text-text-secondary hover:text-text-primary transition-all flex items-center justify-center cursor-pointer"
          >
            <MoreVertical class="w-3.5 h-3.5" />
          </button>

          <Show when={showActionsDropdown()}>
            <div
              onClick={(e) => e.stopPropagation()}
              class="absolute right-0 mt-2 bg-surface border border-border rounded-xl shadow-xl w-56 py-1.5 z-[9999] select-none text-left flex flex-col"
            >
              {/* Copy Session ID */}
              <Show when={props.session}>
                <button
                  class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                  onClick={() => {
                    navigator.clipboard.writeText(props.session.id);
                    setShowActionsDropdown(false);
                  }}
                >
                  <Copy class="w-3.5 h-3.5" />
                  <span>{t("groups.copySessionId")}</span>
                </button>
              </Show>

              {/* Copy Session Title */}
              <Show when={props.session}>
                <button
                  class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                  onClick={() => {
                    handleCopyTitle();
                    setShowActionsDropdown(false);
                  }}
                >
                  <Copy class="w-3.5 h-3.5" />
                  <span>{t("detailPane.copyTitle")}</span>
                </button>
              </Show>

              {/* Assign Group Submenu Header */}
              <Show
                when={
                  props.groups &&
                  props.groups.length > 0 &&
                  props.onAssignSessionToGroup &&
                  props.session
                }
              >
                <div class="border-t border-border/60 my-1" />
                <div class="px-3 py-1 text-[0.625rem] font-bold uppercase tracking-wider text-text-secondary/55">
                  {t("groups.filterByGroup")}
                </div>
                <div class="max-h-36 overflow-y-auto">
                  <For
                    each={[...(props.groups || [])].sort((a, b) =>
                      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
                    )}
                  >
                    {(g) => {
                      const isAssigned = () => {
                        const ids = Array.isArray(g.sessionIds)
                          ? g.sessionIds
                          : Array.from(g.sessionIds || []);
                        return ids.includes(props.session.id);
                      };

                      return (
                        <button
                          class={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 transition-all flex items-center justify-between cursor-pointer ${
                            isAssigned()
                              ? "text-accent font-semibold"
                              : "text-text-secondary hover:text-text-primary"
                          }`}
                          onClick={async () => {
                            setShowActionsDropdown(false);
                            if (isAssigned()) {
                              if (props.onRemoveSessionFromGroup) {
                                await props.onRemoveSessionFromGroup(props.session.id, g.name);
                              }
                            } else {
                              await props.onAssignSessionToGroup!(props.session.id, g.name);
                            }
                          }}
                        >
                          <span class="truncate pr-2">{g.name}</span>
                          <Show when={isAssigned()}>
                            <Check class="w-3 h-3 text-accent flex-shrink-0" />
                          </Show>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};
