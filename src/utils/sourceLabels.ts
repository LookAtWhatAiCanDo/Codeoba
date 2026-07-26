import { SourceMetadata } from "../types";

/**
 * Display label for a source id, resolved from the backend-provided source metadata.
 *
 * `SourceMetadata.displayName` originates from each adapter's `Source::display_name()`, so
 * the backend stays the single source of truth: adding or renaming an adapter needs no
 * frontend change. Never derive a label with CSS `capitalize` or a hardcoded table — the
 * first mis-cases in several locales and cannot produce "Antigravity IDE" from
 * `antigravity_ide`, and the second silently drifts from the backend.
 *
 * Falls back to the raw id so an unknown source is still identifiable rather than blank.
 */
export function getSourceDisplayName(sources: SourceMetadata[], sourceId: string): string {
  const found = sources.find((s) => s.id === sourceId);
  return found ? found.displayName : sourceId;
}

/**
 * Returns consistent Tailwind badge color/border styles for source badges.
 */
export function getSourceStyle(sourceId: string): string {
  switch (sourceId.toLowerCase()) {
    case "claude":
      return "bg-amber-500/10 text-amber-500 border-amber-500/30";
    case "antigravity":
      return "bg-cyan-500/10 text-cyan-500 border-cyan-500/30";
    case "cursor":
      return "bg-blue-500/10 text-blue-500 border-blue-500/30";
    case "copilot":
      return "bg-purple-500/10 text-purple-500 border-purple-500/30";
    case "codex":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/30";
    default:
      return "bg-surface text-text-secondary border-border/40";
  }
}
