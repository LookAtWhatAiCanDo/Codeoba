import { createSignal, createEffect, For, Show } from "solid-js";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  Pin,
  Layers,
  Activity,
  Archive,
  Trash2,
  CheckCircle2,
  X,
} from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";
import { ArchivalFilter } from "../../../types";
import { GroupTreeNode } from "./groupTreeUtils";

export interface GroupTreeItemProps {
  node: GroupTreeNode;
  depth: number;
  activeGroupFilter: string | null;
  archivalFilter: ArchivalFilter;
  onSelect: (filter: string | null) => void;
  onContextMenu: (e: MouseEvent, node: GroupTreeNode) => void;
  renamingGroupPath: string | null;
  setRenamingGroupPath: (path: string | null) => void;
  onRenameGroup: (oldName: string, newName: string) => Promise<boolean>;
  onAssignSessionToGroup: (sessionId: string, groupName: string) => Promise<void>;
}

export const GroupTreeItem = (props: GroupTreeItemProps) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = createSignal(true);
  const [tempName, setTempName] = createSignal("");
  createEffect(() => {
    setTempName(props.node.segment);
  });
  const [isDragOver, setIsDragOver] = createSignal(false);
  const isSelected = () =>
    props.activeGroupFilter !== null &&
    props.activeGroupFilter.toLowerCase() === props.node.fullName.toLowerCase();

  return (
    <div class="w-full flex flex-col">
      <Show
        when={props.renamingGroupPath === props.node.fullName}
        fallback={
          <div
            class={`w-full flex items-center justify-between px-2 py-1 rounded-lg cursor-pointer transition-all border ${
              isDragOver()
                ? "bg-accent border-accent text-white font-bold shadow-md scale-[1.02]"
                : isSelected()
                  ? "bg-accent/15 border-accent/30 text-accent font-semibold shadow-sm"
                  : "border-transparent text-text-secondary hover:bg-surface/60 hover:text-text-primary"
            }`}
            data-group-name={props.node.fullName}
            style={{
              "padding-left": `${props.depth * 12 + 8}px`,
            }}
            onClick={() => {
              if (isSelected()) {
                props.onSelect(null);
              } else {
                props.onSelect(props.node.fullName);
              }
            }}
            onContextMenu={(e) => props.onContextMenu(e, props.node)}
            on:dragover={(e) => {
              e.preventDefault();
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = "move";
              }
            }}
            on:dragenter={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            on:dragleave={() => {
              setIsDragOver(false);
            }}
            on:drop={async (e) => {
              e.preventDefault();
              setIsDragOver(false);
              const sessionId =
                (window as any).activeDraggedSessionId ||
                (e.dataTransfer ? e.dataTransfer.getData("text/plain") : null);
              if (sessionId) {
                try {
                  await props.onAssignSessionToGroup(sessionId, props.node.fullName);
                } catch (err) {
                  console.error("Failed to assign session:", err);
                }
              }
              (window as any).activeDraggedSessionId = null;
            }}
          >
            <div class="flex items-center gap-1.5 min-w-0 pointer-events-none">
              <Show when={props.node.children.length > 0} fallback={<div class="w-4 h-4" />}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded());
                  }}
                  class={`p-0.5 rounded cursor-pointer transition-colors pointer-events-auto ${
                    isDragOver()
                      ? "text-white/80 hover:text-white"
                      : "hover:text-text-primary text-text-secondary/60"
                  }`}
                >
                  <Show when={isExpanded()} fallback={<ChevronRight class="w-3.5 h-3.5" />}>
                    <ChevronDown class="w-3.5 h-3.5" />
                  </Show>
                </button>
              </Show>
              <Folder
                class={`w-4 h-4 flex-shrink-0 transition-colors ${
                  isDragOver()
                    ? "text-white"
                    : isSelected()
                      ? "text-accent"
                      : "text-text-secondary/70"
                }`}
              />
              <span class={`text-xs truncate ${isDragOver() ? "text-white" : ""}`}>
                {props.node.segment}
              </span>
            </div>

            <div class="flex items-center gap-1.5 flex-shrink-0 pointer-events-none">
              <Show when={props.node.isPinned}>
                <Pin class={`w-3 h-3 ${isDragOver() ? "text-white" : "text-accent"}`} />
              </Show>
              <Show when={!props.node.isPinned && props.node.containsPinnedSessions}>
                <div
                  class={`w-1.5 h-1.5 rounded-full ${isDragOver() ? "bg-white" : "bg-accent"}`}
                />
              </Show>
              <div class="flex items-center gap-1.5 text-[0.625rem] font-bold">
                {/* All */}
                <span
                  class={`flex items-center gap-0.5 px-1 py-0.5 rounded border transition-all ${
                    isDragOver()
                      ? "bg-white/20 border-white/30 text-white"
                      : props.archivalFilter === "all"
                        ? "bg-accent/10 border-accent/20 text-accent font-semibold"
                        : "bg-surface-light border-border/40 text-text-secondary"
                  }`}
                  title={t("sidebar.filterAll")}
                >
                  <Layers class="w-2.5 h-2.5" />
                  {props.node.recursiveSessionCount}
                </span>

                {/* Active */}
                <span
                  class={`flex items-center gap-0.5 px-1 py-0.5 rounded border transition-all ${
                    isDragOver()
                      ? "bg-white/20 border-white/30 text-white"
                      : props.archivalFilter === ArchivalFilter.Active
                        ? "bg-accent/10 border-accent/20 text-accent font-semibold"
                        : "bg-surface-light border-border/40 text-text-secondary/60"
                  }`}
                  title={t("sidebar.filterActive")}
                >
                  <Activity class="w-2.5 h-2.5" />
                  {props.node.recursiveActiveCount}
                </span>

                {/* Archived */}
                <span
                  class={`flex items-center gap-0.5 px-1 py-0.5 rounded border transition-all ${
                    isDragOver()
                      ? "bg-white/20 border-white/30 text-white"
                      : props.archivalFilter === "archived"
                        ? "bg-accent/10 border-accent/20 text-accent font-semibold"
                        : "bg-surface-light border-border/40 text-text-secondary/60"
                  }`}
                  title={t("sidebar.filterArchived")}
                >
                  <Archive class="w-2.5 h-2.5" />
                  {props.node.recursiveArchivedCount}
                </span>

                {/* Deleted */}
                <span
                  class={`flex items-center gap-0.5 px-1 py-0.5 rounded border transition-all ${
                    isDragOver()
                      ? "bg-white/20 border-white/30 text-white"
                      : props.archivalFilter === "deleted"
                        ? "bg-accent/10 border-accent/20 text-accent font-semibold"
                        : "bg-surface-light border-border/40 text-text-secondary/60"
                  }`}
                  title={t("sidebar.filterDeleted")}
                >
                  <Trash2 class="w-2.5 h-2.5" />
                  {props.node.recursiveDeletedCount}
                </span>
              </div>
            </div>
          </div>
        }
      >
        <div
          class="flex items-center gap-1.5 w-full px-2 py-1 bg-surface border border-border rounded-lg"
          style={{
            "margin-left": `${props.depth * 12 + 8}px`,
            width: `calc(100% - ${props.depth * 12 + 8}px)`,
          }}
        >
          <Folder class="w-4 h-4 text-accent flex-shrink-0" />
          <input
            type="text"
            value={tempName()}
            onInput={(e) => setTempName(e.currentTarget.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                const trimmed = tempName().trim().replace(/\\/g, "/");
                if (trimmed && trimmed !== props.node.segment) {
                  const parts = props.node.fullName.split("/");
                  parts[parts.length - 1] = trimmed;
                  const newFullName = parts.join("/");
                  await props.onRenameGroup(props.node.fullName, newFullName);
                }
                props.setRenamingGroupPath(null);
              } else if (e.key === "Escape") {
                props.setRenamingGroupPath(null);
                setTempName(props.node.segment);
              }
            }}
            class="flex-grow bg-transparent border-none text-xs text-text-primary outline-none"
            autofocus
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            disabled={!tempName().trim() || tempName().trim() === props.node.segment}
            onClick={async () => {
              const trimmed = tempName().trim().replace(/\\/g, "/");
              if (trimmed && trimmed !== props.node.segment) {
                const parts = props.node.fullName.split("/");
                parts[parts.length - 1] = trimmed;
                const newFullName = parts.join("/");
                await props.onRenameGroup(props.node.fullName, newFullName);
              }
              props.setRenamingGroupPath(null);
            }}
            class={`p-0.5 flex-shrink-0 transition-all ${
              tempName().trim() && tempName().trim() !== props.node.segment
                ? "text-accent hover:text-accent-light cursor-pointer"
                : "text-text-secondary/30 cursor-not-allowed opacity-50"
            }`}
          >
            <CheckCircle2 class="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              props.setRenamingGroupPath(null);
              setTempName(props.node.segment);
            }}
            class="text-text-secondary hover:text-text-primary p-0.5 cursor-pointer flex-shrink-0"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </Show>

      <Show when={props.node.children.length > 0 && isExpanded()}>
        <div class="flex flex-col">
          <For each={props.node.children}>
            {(child) => (
              <GroupTreeItem
                node={child}
                depth={props.depth + 1}
                activeGroupFilter={props.activeGroupFilter}
                archivalFilter={props.archivalFilter}
                onSelect={props.onSelect}
                onContextMenu={props.onContextMenu}
                renamingGroupPath={props.renamingGroupPath}
                setRenamingGroupPath={props.setRenamingGroupPath}
                onRenameGroup={props.onRenameGroup}
                onAssignSessionToGroup={props.onAssignSessionToGroup}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
