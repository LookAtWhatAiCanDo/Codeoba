import { For } from "solid-js";

export const DetailSkeleton = () => {
  return (
    <div class="flex-grow h-full flex flex-col bg-background/95 min-w-0 animate-pulse">
      {/* Header Skeleton */}
      <div
        class="px-6 border-b border-border/60 flex items-center justify-between flex-shrink-0"
        style={{ height: "4.75rem" }}
      >
        <div class="flex flex-col gap-2">
          <div class="h-3.5 w-40 bg-surface rounded" />
          <div class="h-2.5 w-60 bg-surface rounded" />
        </div>
      </div>

      {/* Messages Scroll Area Skeleton */}
      <div class="flex-grow px-8 py-6 space-y-6 overflow-y-auto">
        <div class="p-4 bg-surface/30 border border-border/40 rounded-2xl flex gap-6">
          <div class="h-4 w-24 bg-surface rounded" />
          <div class="h-4 w-32 bg-surface rounded" />
          <div class="h-4 w-20 bg-surface rounded" />
        </div>

        <For each={[1, 2]}>
          {(_i) => (
            <div class="space-y-4">
              <div class="flex flex-col items-start max-w-2xl">
                <div class="h-3 w-16 bg-surface rounded mb-2 ml-3" />
                <div class="w-96 h-12 bg-surface border border-border/50 rounded-2xl" />
              </div>
              <div class="flex flex-col items-start max-w-3xl pl-6">
                <div class="h-3 w-20 bg-surface rounded mb-2 ml-3" />
                <div class="w-full h-32 bg-surface/50 border border-border/30 rounded-2xl" />
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
