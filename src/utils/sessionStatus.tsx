import type { JSX } from "solid-js";
import { HelpCircle, Clock } from "lucide-solid";

export interface StatusBadge {
  label: string;
  class: string;
  icon: () => JSX.Element;
}

/**
 * A perfectly centered, non-wobbly circular progress spinner.
 * Uses a symmetric SVG with a subtle background track to guarantee
 * stable, balance-wheel-like rotation without subpixel offset wobble.
 */
export const ActiveSpinner = (props: { class?: string }) => (
  <svg
    class={`animate-spin origin-center ${props.class || ""}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="3"
  >
    <circle class="opacity-25" cx="12" cy="12" r="10" />
    <path class="opacity-80" d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round" />
  </svg>
);

/**
 * Single source of truth for the session status badge (label + colors +
 * icon). Rendered by both the sidebar rows and the detail-pane header; this
 * being the only status-to-presentation mapping is what keeps them identical.
 *
 * Status semantics (see the v1 state machine in src-tauri/src/models.rs):
 *   - "active"  — the agent is mid-turn (thinking, running tools/commands).
 *   - "waiting" — the agent asked the user a question and is blocked on the
 *                 answer (hence the question-mark icon).
 *   - "idle"    — turn complete, or the agent app is not running.
 */
export const getStatusBadge = (status: string, t: (key: string) => string): StatusBadge => {
  switch (status) {
    case "active":
      return {
        label: t("sidebar.statusActive"),
        class: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
        icon: () => <ActiveSpinner class="w-3 h-3 flex-shrink-0" />,
      };
    case "waiting":
      return {
        label: t("sidebar.statusQuestion"),
        class: "bg-amber-500/10 border-amber-500/30 text-amber-500",
        icon: () => <HelpCircle class="w-3 h-3 flex-shrink-0" />,
      };
    case "idle":
    default:
      return {
        label: t("sidebar.statusIdle"),
        class: "bg-blue-500/10 border-blue-500/20 text-blue-500",
        icon: () => <Clock class="w-3 h-3 flex-shrink-0" />,
      };
  }
};
