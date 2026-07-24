import { For, Show } from "solid-js";
import { logFE } from "../../../utils/logger";
import { Session } from "../../../types";

export interface DateMilestone {
  label: string;
  index: number;
  turnId: string;
}

export interface DateTimelineOverlayProps {
  session: Session | null;
  dateMilestones: DateMilestone[];
  activeMilestone: DateMilestone | null;
  scrollPercent: number;
  onMilestoneClick: (milestone: DateMilestone) => void;
}

export const DateTimelineOverlay = (props: DateTimelineOverlayProps) => {
  return (
    <Show when={props.session && props.session.turns.length > 0 && props.dateMilestones.length > 1}>
      <div class="absolute right-8 top-24 bottom-10 w-24 flex flex-row items-stretch justify-end z-40 pointer-events-none select-none">
        <div class="relative w-full h-full">
          {/* Vertical Track Line */}
          <div class="absolute right-[3px] top-0 bottom-0 w-[1px] bg-border/20 rounded-full" />
          {/* Active Track Highlight */}
          <div
            class="absolute right-[3px] top-0 w-[1px] bg-accent rounded-full transition-all duration-150"
            style={{ height: `${props.scrollPercent}%` }}
          />

          <For each={props.dateMilestones}>
            {(milestone) => {
              const pct = () => {
                const total = props.session!.turns.length;
                if (total <= 1) return 0;
                return (milestone.index / (total - 1)) * 100;
              };
              const isActive = () => props.activeMilestone?.turnId === milestone.turnId;

              return (
                <div
                  class="absolute right-0 flex items-center gap-2 transform -translate-y-1/2 cursor-pointer group pointer-events-auto py-1.5 px-3 hover:bg-accent/10 hover:border hover:border-accent/20 rounded-md transition-all duration-150"
                  style={{ top: `${pct()}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    logFE("info", `Timeline: clicked milestone index ${milestone.index}`);
                    props.onMilestoneClick(milestone);
                  }}
                >
                  <span
                    class={`text-[0.5625rem] font-mono font-bold tracking-wider transition-all duration-150 uppercase whitespace-nowrap bg-background/80 px-1 py-0.5 rounded shadow-sm ${
                      isActive()
                        ? "text-accent font-extrabold scale-105 border border-accent/25"
                        : "text-text-secondary/60 group-hover:text-accent"
                    }`}
                  >
                    {milestone.label}
                  </span>
                  <div
                    class={`rounded-full border border-background transition-all duration-150 flex-shrink-0 ${
                      isActive()
                        ? "w-2.5 h-2.5 bg-accent scale-110 shadow-sm shadow-accent/50"
                        : "w-1.5 h-1.5 bg-border/40 group-hover:bg-accent group-hover:scale-125"
                    }`}
                  />
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </Show>
  );
};
