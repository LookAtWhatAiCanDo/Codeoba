import "./window-init";
import { render } from "solid-js/web";
import { I18nProvider } from "./i18n/i18n";

// Global input suggestions disable helper.
// `spellcheck` is inherited, so disabling it on the root turns off squiggles for every descendant
// editable element. The remaining attributes are applied via a single delegated focus listener,
// which fires only when an input is focused — far cheaper than a lifetime MutationObserver that
// re-scans the whole DOM subtree on every mutation.
if (typeof window !== "undefined") {
  document.documentElement.setAttribute("spellcheck", "false");

  document.addEventListener(
    "focusin",
    (e) => {
      const el = e.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.setAttribute("autocomplete", "off");
        el.setAttribute("autocorrect", "off");
        el.setAttribute("autocapitalize", "off");
        el.setAttribute("spellcheck", "false");
      }
    },
    true
  );
}

// Dynamically import App so window-init can run first and show the skeleton instantly
import("./App").then(({ default: App }) => {
  const container = document.getElementById("root") as HTMLElement;
  if (container) {
    container.innerHTML = "";
  }
  render(
    () => (
      <I18nProvider>
        <App />
      </I18nProvider>
    ),
    container
  );
});
