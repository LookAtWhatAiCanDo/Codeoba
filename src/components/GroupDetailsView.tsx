import { createSignal, createMemo, createEffect, For, Show } from "solid-js";
import { useI18n } from "../i18n/i18n";
import { Folder, Plus, Trash2, Play, CheckCircle2, Pause } from "lucide-solid";
import { Session } from "../types";

interface GroupTask {
  id: string;
  title: string;
  isCompleted: boolean;
  associatedSessionId?: string | null;
}

interface ConversationGroup {
  name: string;
  description: string;
  status: string;
  sessionIds: string[];
  tasks: GroupTask[];
  pastWorkSummary: string;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

interface GroupDetailsViewProps {
  groupName: string;
  groups: ConversationGroup[];
  sessions: Session[];
  onUpdateGroupDetails: (
    groupName: string,
    description: string,
    status: string,
    pastWorkSummary: string,
    tasks: GroupTask[]
  ) => Promise<void>;
  onSelectSession: (session: Session) => void;
  onActiveGroupFilterChange: (groupName: string | null) => void;
}

export default function GroupDetailsView(props: GroupDetailsViewProps) {
  const { t } = useI18n();
  const handleGroupDetailsClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest("input, textarea, button, select, a, [role='button']")) {
      const container = document.getElementById("group-details-scroll-container");
      if (container) {
        container.focus();
      }
    }
  };
  const [description, setDescription] = createSignal("");
  const [status, setStatus] = createSignal("Active");
  const [pastWorkSummary, setPastWorkSummary] = createSignal("");
  const [tasks, setTasks] = createSignal<GroupTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = createSignal("");

  const activeGroup = createMemo(() => {
    return props.groups.find(g => g.name.toLowerCase() === props.groupName.toLowerCase());
  });

  // Sync state whenever the active group updates
  createEffect(() => {
    const group = activeGroup();
    if (group) {
      setDescription(group.description || "");
      setStatus(group.status || "Active");
      setPastWorkSummary(group.pastWorkSummary || "");
      
      // Handle set or array sessionIds normalized
      const rawTasks = group.tasks || [];
      setTasks(rawTasks.map(t => ({
        id: t.id,
        title: t.title,
        isCompleted: !!t.isCompleted,
        associatedSessionId: t.associatedSessionId || null
      })));
    }
  });

  const groupSessions = createMemo(() => {
    const group = activeGroup();
    if (!group) return [];
    
    // Normalise sessionIds as array or Set
    const ids = Array.isArray(group.sessionIds) 
      ? group.sessionIds 
      : Array.from(group.sessionIds || []);
      
    return props.sessions.filter(s => ids.includes(s.id));
  });

  const saveChanges = async (updatedTasks?: GroupTask[], updatedStatus?: string) => {
    const group = activeGroup();
    if (!group) return;
    
    try {
      await props.onUpdateGroupDetails(
        group.name,
        description(),
        updatedStatus !== undefined ? updatedStatus : status(),
        pastWorkSummary(),
        updatedTasks !== undefined ? updatedTasks : tasks()
      );
    } catch (err) {
      console.error("Failed to auto-save group details:", err);
    }
  };

  const handleAddTask = () => {
    const title = newTaskTitle().trim();
    if (!title) return;
    
    const newTask: GroupTask = {
      id: Math.random().toString(36).substring(2, 9),
      title,
      isCompleted: false,
      associatedSessionId: null
    };
    
    const updated = [...tasks(), newTask];
    setTasks(updated);
    setNewTaskTitle("");
    saveChanges(updated);
  };

  const handleToggleTask = (taskId: string) => {
    const updated = tasks().map(t => 
      t.id === taskId ? { ...t, isCompleted: !t.isCompleted } : t
    );
    setTasks(updated);
    saveChanges(updated);
  };

  const handleRenameTask = (taskId: string, newTitle: string) => {
    const updated = tasks().map(t => 
      t.id === taskId ? { ...t, title: newTitle } : t
    );
    setTasks(updated);
    saveChanges(updated);
  };

  const handleAssociateSession = (taskId: string, sessionId: string | null) => {
    const updated = tasks().map(t => 
      t.id === taskId ? { ...t, associatedSessionId: sessionId || null } : t
    );
    setTasks(updated);
    saveChanges(updated);
  };

  const handleDeleteTask = (taskId: string) => {
    const updated = tasks().filter(t => t.id !== taskId);
    setTasks(updated);
    saveChanges(updated);
  };

  const getStatusIcon = (statusVal: string) => {
    switch (statusVal) {
      case "Completed":
        return <CheckCircle2 class="w-3.5 h-3.5 text-emerald-500" />;
      case "Paused":
        return <Pause class="w-3.5 h-3.5 text-amber-500" />;
      case "Active":
      default:
        return <Play class="w-3.5 h-3.5 text-blue-500" />;
    }
  };

  const getStatusBadgeClass = (statusVal: string) => {
    switch (statusVal) {
      case "Completed":
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
      case "Paused":
        return "bg-amber-500/10 border-amber-500/20 text-amber-400";
      case "Active":
      default:
        return "bg-blue-500/10 border-blue-500/20 text-blue-400";
    }
  };

  return (
    <div class="flex-grow h-full flex overflow-hidden min-w-0 font-sans text-text-primary bg-background">
      {/* Left Pane: Groups List */}
      <div class="w-60 border-r border-border h-full flex flex-col overflow-hidden bg-surface/10 select-none flex-shrink-0">
        <div class="p-4 border-b border-border">
          <h2 class="text-xs font-bold text-text-secondary/70 uppercase tracking-wider">
            {t("groups.filterByGroup")}
          </h2>
        </div>
        <div class="flex-grow overflow-y-auto p-2 space-y-1">
          <For each={props.groups}>
            {g => (
              <div
                onClick={() => props.onActiveGroupFilterChange(g.name)}
                class={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all border ${
                  g.name.toLowerCase() === props.groupName.toLowerCase()
                    ? "bg-accent/15 border-accent text-accent font-semibold"
                    : "border-transparent hover:bg-surface/50 text-text-secondary hover:text-text-primary"
                }`}
              >
                <span class="truncate text-xs">{g.name}</span>
                <span class={`px-1.5 py-0.5 border text-[0.5625rem] font-bold rounded uppercase flex-shrink-0 ${getStatusBadgeClass(g.status || "Active")}`}>
                  {g.status || "Active"}
                </span>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Right Pane: Details View */}
      <Show 
        when={activeGroup()} 
        fallback={
          <div class="flex-grow h-full flex flex-col items-center justify-center text-text-secondary">
            <Folder class="w-12 h-12 text-border mb-3" />
            <p class="text-xs font-medium">Select a valid group to view dashboard details</p>
          </div>
        }
      >
        <div 
          id="group-details-scroll-container"
          tabindex="-1"
          onClick={handleGroupDetailsClick}
          class="flex-grow h-full overflow-y-auto p-6 flex flex-col gap-6 min-w-0 outline-none transition-all duration-200 relative focus-within:z-[51] group"
        >
          {/* Focus Highlight Border Overlay */}
          <div class="pointer-events-none absolute inset-0 border-2 border-transparent group-focus-within:border-accent/35 z-[100] transition-all duration-200" />

          {/* Header row */}
          <div class="flex items-center justify-between border-b border-border pb-4 gap-4">
            <div class="min-w-0">
              <h1 class="text-lg font-bold text-text-primary truncate">{activeGroup()?.name}</h1>
              <p class="text-[0.625rem] text-text-secondary/50 mt-1">
                Last updated {activeGroup()?.updatedAt ? new Date(activeGroup()!.updatedAt).toLocaleString() : "Never"}
              </p>
            </div>
            
            <div class="flex items-center gap-2 flex-shrink-0">
              <span class="text-xs text-text-secondary/80 font-medium">Status:</span>
              <div class={`flex items-center gap-1.5 px-3 py-1 border rounded-lg text-xs font-semibold ${getStatusBadgeClass(status())}`}>
                {getStatusIcon(status())}
                <select
                  value={status()}
                  onChange={(e) => {
                    setStatus(e.currentTarget.value);
                    saveChanges(undefined, e.currentTarget.value);
                  }}
                  class="bg-transparent border-none text-xs font-semibold outline-none cursor-pointer p-0"
                >
                  <option class="bg-background text-text-primary" value="Active">Active</option>
                  <option class="bg-background text-text-primary" value="Completed">Completed</option>
                  <option class="bg-background text-text-primary" value="Paused">Paused</option>
                </select>
              </div>
            </div>
          </div>

          {/* Textareas Card Grid */}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Description Card */}
            <div class="flex flex-col gap-2 p-4 bg-surface/30 border border-border/60 rounded-xl">
              <label class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Description
              </label>
              <textarea
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
                onBlur={() => saveChanges()}
                placeholder="Enter group description..."
                class="bg-background/40 border border-border/50 rounded-lg p-3 text-xs text-text-primary focus:border-accent outline-none resize-none h-24 placeholder:text-text-secondary/40 leading-normal"
              />
            </div>

            {/* Past Work Summary Card */}
            <div class="flex flex-col gap-2 p-4 bg-surface/30 border border-border/60 rounded-xl">
              <label class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Past Work Summary
              </label>
              <textarea
                value={pastWorkSummary()}
                onInput={(e) => setPastWorkSummary(e.currentTarget.value)}
                onBlur={() => saveChanges()}
                placeholder="Summarize key decisions, issues resolved, or milestones achieved..."
                class="bg-background/40 border border-border/50 rounded-lg p-3 text-xs text-text-primary focus:border-accent outline-none resize-none h-24 placeholder:text-text-secondary/40 leading-normal"
              />
            </div>
          </div>

          {/* Tasks Checklist Card */}
          <div class="flex flex-col gap-3 p-4 bg-surface/30 border border-border/60 rounded-xl">
            <label class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Group Checklist & Tasks
            </label>
            
            {/* Add Task Input */}
            <div class="flex items-center gap-2">
              <input
                type="text"
                value={newTaskTitle()}
                onInput={(e) => setNewTaskTitle(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddTask();
                }}
                placeholder="Create a new task..."
                class="flex-grow bg-background/40 border border-border/50 rounded-lg px-3 py-2 text-xs text-text-primary focus:border-accent outline-none placeholder:text-text-secondary/40"
              />
              <button
                onClick={handleAddTask}
                class="bg-accent/20 hover:bg-accent/35 text-accent border border-accent/20 font-semibold px-4 py-2 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1 flex-shrink-0"
              >
                <Plus class="w-3.5 h-3.5" />
                Add Task
              </button>
            </div>

            {/* Task list list */}
            <div class="space-y-2 mt-2 max-h-64 overflow-y-auto pr-1">
              <For each={tasks()}>
                {task => (
                  <div class="flex items-center gap-3 p-2 border border-border/40 hover:border-border bg-background/25 rounded-lg text-xs transition-all">
                    {/* Completion checkbox */}
                    <input
                      type="checkbox"
                      checked={task.isCompleted}
                      onChange={() => handleToggleTask(task.id)}
                      class="w-4 h-4 rounded border-border/80 bg-background text-accent focus:ring-accent focus:ring-opacity-25 cursor-pointer accent-accent"
                    />

                    {/* Editable Title input */}
                    <input
                      type="text"
                      value={task.title}
                      onBlur={(e) => handleRenameTask(task.id, e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      class={`flex-grow bg-transparent border-none p-0 focus:ring-0 outline-none truncate font-medium text-xs ${
                        task.isCompleted ? "line-through text-text-secondary/45" : "text-text-primary"
                      }`}
                    />

                    {/* Associated Session Selector */}
                    <select
                      value={task.associatedSessionId || ""}
                      onChange={(e) => handleAssociateSession(task.id, e.currentTarget.value || null)}
                      class="bg-surface/60 border border-border/50 text-[0.625rem] rounded px-1.5 py-0.5 focus:border-accent outline-none max-w-[130px] truncate text-text-secondary hover:text-text-primary cursor-pointer"
                    >
                      <option value="">No Session Link</option>
                      <For each={groupSessions()}>
                        {session => (
                          <option value={session.id}>{session.threadName || t("common.untitledSession")}</option>
                        )}
                      </For>
                    </select>

                    {/* Delete action button */}
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      title="Delete task"
                      class="p-1 hover:bg-red-500/10 rounded text-text-secondary hover:text-red-400 transition-all cursor-pointer"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </For>
              
              <Show when={tasks().length === 0}>
                <div class="text-center py-6 text-text-secondary/55 text-xs border border-dashed border-border/30 rounded-lg">
                  No tasks defined for this group. Add tasks above to track checklist items.
                </div>
              </Show>
            </div>
          </div>

          {/* Associated sessions list section */}
          <div class="flex flex-col gap-2">
            <label class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Linked Sessions ({groupSessions().length})
            </label>
            <div class="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
              <For each={groupSessions()}>
                {session => (
                  <div
                    onClick={() => props.onSelectSession(session)}
                    class="flex items-center justify-between p-3.5 bg-surface/30 border border-border/60 hover:border-accent/40 rounded-xl cursor-pointer hover:bg-surface/50 transition-all text-xs"
                  >
                    <div class="min-w-0 flex-grow mr-4">
                      <span class="font-semibold text-text-primary truncate block">{session.threadName || t("common.untitledSession")}</span>
                      <span class="text-[0.625rem] text-text-secondary/60 mt-0.5 truncate block">{session.snippet || t("common.noSnippet")}</span>
                    </div>
                    <span class="text-[0.625rem] text-text-secondary/50 flex-shrink-0">
                      {session.updatedAt ? new Date(session.updatedAt).toLocaleDateString() : "Never"}
                    </span>
                  </div>
                )}
              </For>
              
              <Show when={groupSessions().length === 0}>
                <div class="text-center py-8 border border-dashed border-border/40 rounded-xl text-text-secondary/50 text-xs">
                  No conversation sessions linked to this group. You can drag and drop conversations into this group inside the sidebar to associate them.
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
