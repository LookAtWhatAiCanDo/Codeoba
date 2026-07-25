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
