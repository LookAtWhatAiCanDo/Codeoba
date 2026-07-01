import "./window-init";
import { render } from "solid-js/web";
import { I18nProvider } from "./i18n/i18n";

// Global input suggestions disable helper
if (typeof window !== "undefined") {
  const disableSuggestions = (el: Element) => {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.setAttribute("autocomplete", "off");
      el.setAttribute("autocorrect", "off");
      el.setAttribute("autocapitalize", "off");
      el.setAttribute("spellcheck", "false");
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          disableSuggestions(node);
          const inputs = node.querySelectorAll("input, textarea");
          inputs.forEach(disableSuggestions);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("input, textarea").forEach(disableSuggestions);
  });
}

// Dynamically import App so window-init can run first and show the skeleton instantly
import("./App").then(({ default: App }) => {
  const container = document.getElementById("root") as HTMLElement;
  if (container) {
    container.innerHTML = "";
  }
  render(() => (
    <I18nProvider>
      <App />
    </I18nProvider>
  ), container);
});
