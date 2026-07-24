import { createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import {
  Volume2,
  Pin,
  FolderOpen,
  Clock,
  Copy,
  ExternalLink,
  Folder,
  HelpCircle,
  X,
} from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../../../i18n/i18n";
import { useSpeech } from "../../../utils/useSpeech";
import { Session } from "../../../types";
import { ConversationGroup, GroupTreeNode } from "../groups/groupTreeUtils";

export interface SidebarContextMenuProps {
  contextMenu: {
    x: number;
    y: number;
    type: "session" | "group";
    targetSession?: Session;
    targetGroupNode?: GroupTreeNode;
  } | null;
  menuPosition: {
    ref: (el: HTMLDivElement | undefined) => void;
    pos: () => { top: number; left: number; visible: boolean };
  };
  onClose: () => void;
  pinnedSessionIds: Set<string>;
  onTogglePinSession: (sessionId: string) => void;
  groups: ConversationGroup[];
  onAddGroup: (name: string) => Promise<boolean>;
  onAssignSessionToGroup: (sessionId: string, groupName: string) => Promise<void>;
  onRemoveSessionFromGroup: (sessionId: string, groupName: string) => Promise<void>;
  onToggleGroupPin: (name: string, pinned: boolean) => Promise<void>;
  setRenamingGroupPath: (path: string | null) => void;
  setDeletingGroupName: (name: string | null) => void;
}

export const SidebarContextMenu = (props: SidebarContextMenuProps) => {
  const { t } = useI18n();
  const speech = useSpeech();

  return (
    <Portal>
      <Show when={props.contextMenu}>
        {(context) => {
          return (
            <div
              ref={props.menuPosition.ref}
              class="fixed bg-surface border border-border rounded-xl shadow-xl w-56 py-1.5 z-[9999] select-none transition-opacity duration-75"
              style={{
                top: `${props.menuPosition.pos().top}px`,
                left: `${props.menuPosition.pos().left}px`,
                opacity: props.menuPosition.pos().visible ? 1 : 0,
                "pointer-events": props.menuPosition.pos().visible ? "auto" : "none",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Show when={context().type === "session" && context().targetSession}>
                {(session) => {
                  const [tagInput, setTagInput] = createSignal("");

                  return (
                    <>
                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          speech.toggleReadAloud(session().id, {
                            sourceId: session().sourceId,
                            filePath: session().filePath,
                          });
                          props.onClose();
                        }}
                      >
                        <Volume2 class="w-3.5 h-3.5" />
                        <span>
                          {speech.isReadAloudActive(session().id)
                            ? t("readAloud.stopReading")
                            : t("readAloud.readSessionAloud")}
                        </span>
                      </button>

                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          props.onTogglePinSession(session().id);
                          props.onClose();
                        }}
                      >
                        <Pin class="w-3.5 h-3.5" />
                        <span>
                          {props.pinnedSessionIds.has(session().id)
                            ? t("groups.unpinConversation")
                            : t("groups.pinConversation")}
                        </span>
                      </button>

                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={async () => {
                          props.onClose();
                          try {
                            await invoke("reveal_in_folder", {
                              path: session().filePath,
                            });
                          } catch (e) {
                            console.error("Failed to reveal session file in folder", e);
                          }
                        }}
                      >
                        <FolderOpen class="w-3.5 h-3.5" />
                        <span>
                          {navigator.userAgent.includes("Mac")
                            ? t("detailPane.showSessionInFinder")
                            : t("detailPane.showSessionInFolder")}
                        </span>
                      </button>

                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          navigator.clipboard.writeText(session().id);
                          props.onClose();
                        }}
                      >
                        <Clock class="w-3.5 h-3.5" />
                        <span>{t("groups.copySessionId")}</span>
                      </button>

                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          const titleText = session().threadName || t("detailPane.noSelection");
                          navigator.clipboard.writeText(titleText);
                          props.onClose();
                        }}
                      >
                        <Copy class="w-3.5 h-3.5" />
                        <span>{t("detailPane.copyTitle")}</span>
                      </button>

                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          navigator.clipboard.writeText(session().filePath);
                          props.onClose();
                        }}
                      >
                        <ExternalLink class="w-3.5 h-3.5" />
                        <span>{t("detailPane.copySessionPath")}</span>
                      </button>

                      <Show when={session().cwd}>
                        <button
                          class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                          onClick={async () => {
                            props.onClose();
                            try {
                              await invoke("reveal_in_folder", {
                                path: session().cwd!,
                              });
                            } catch (e) {
                              console.error("Failed to reveal workspace in folder", e);
                            }
                          }}
                        >
                          <FolderOpen class="w-3.5 h-3.5" />
                          <span>
                            {navigator.userAgent.includes("Mac")
                              ? t("detailPane.showWorkspaceInFinder")
                              : t("detailPane.showWorkspaceInFolder")}
                          </span>
                        </button>
                      </Show>

                      <Show when={session().cwd}>
                        <button
                          class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                          onClick={() => {
                            navigator.clipboard.writeText(session().cwd!);
                            props.onClose();
                          }}
                        >
                          <Folder class="w-3.5 h-3.5" />
                          <span>{t("detailPane.copyWorkspacePath")}</span>
                        </button>
                      </Show>

                      <div class="border-t border-border/60 my-1" />
                      <div class="px-3 py-1 text-[0.625rem] font-semibold text-text-secondary uppercase tracking-wider">
                        {t("groups.groupsTagsHeader")}
                      </div>

                      {/* Tag input */}
                      <div class="px-2 py-1">
                        <input
                          type="text"
                          placeholder={t("groups.tagInputPlaceholder")}
                          value={tagInput()}
                          onInput={(e) => setTagInput(e.currentTarget.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              const trimmed = tagInput().trim().replace(/\\/g, "/");
                              if (trimmed) {
                                const exists = props.groups.some(
                                  (g) => g.name.toLowerCase() === trimmed.toLowerCase()
                                );
                                if (!exists) {
                                  await props.onAddGroup(trimmed);
                                }
                                await props.onAssignSessionToGroup(session().id, trimmed);
                                setTagInput("");
                              }
                            }
                          }}
                          class="w-full bg-background border border-border/80 focus:border-accent text-text-primary text-[0.6875rem] px-2 py-1 rounded outline-none"
                        />
                      </div>

                      {/* Tags list */}
                      <div class="max-h-36 overflow-y-auto px-1 py-0.5">
                        <For
                          each={[...props.groups]
                            .filter((g) => g.name.toLowerCase().includes(tagInput().toLowerCase()))
                            .sort((a, b) =>
                              a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
                            )}
                        >
                          {(group) => {
                            const inGroup = () => group.sessionIds?.includes(session().id);
                            return (
                              <button
                                class="w-full text-left px-2 py-1 text-xs hover:bg-accent/10 hover:text-accent text-text-primary rounded transition-all flex items-center justify-between cursor-pointer"
                                onClick={async () => {
                                  if (inGroup()) {
                                    await props.onRemoveSessionFromGroup(session().id, group.name);
                                  } else {
                                    await props.onAssignSessionToGroup(session().id, group.name);
                                  }
                                }}
                              >
                                <span class="truncate max-w-[150px]">{group.name}</span>
                                <Show when={inGroup()}>
                                  <X class="w-3.5 h-3.5 text-accent hover:text-red-400 transition-colors" />
                                </Show>
                              </button>
                            );
                          }}
                        </For>
                        <Show when={props.groups.length === 0 && !tagInput()}>
                          <div class="text-[0.625rem] text-text-secondary/70 text-center py-1">
                            {t("groups.noTagsAvailable")}
                          </div>
                        </Show>
                      </div>
                    </>
                  );
                }}
              </Show>

              <Show when={context().type === "group" && context().targetGroupNode}>
                {(node) => (
                  <>
                    <button
                      class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                      onClick={() => {
                        props.onToggleGroupPin(node().fullName, !node().isPinned);
                        props.onClose();
                      }}
                    >
                      <Pin class="w-3.5 h-3.5" />
                      <span>{node().isPinned ? t("groups.unpinGroup") : t("groups.pinGroup")}</span>
                    </button>
                    <button
                      class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                      onClick={() => {
                        props.setRenamingGroupPath(node().fullName);
                        props.onClose();
                      }}
                    >
                      <HelpCircle class="w-3.5 h-3.5" />
                      <span>{t("groups.renameGroup")}</span>
                    </button>
                    <button
                      class="w-full text-left px-3 py-1.5 text-xs hover:bg-red-500/15 hover:text-red-400 text-red-500 transition-all flex items-center gap-2 cursor-pointer"
                      onClick={() => {
                        props.setDeletingGroupName(node().fullName);
                        props.onClose();
                      }}
                    >
                      <X class="w-3.5 h-3.5" />
                      <span>{t("groups.deleteGroup")}</span>
                    </button>
                  </>
                )}
              </Show>
            </div>
          );
        }}
      </Show>
    </Portal>
  );
};
