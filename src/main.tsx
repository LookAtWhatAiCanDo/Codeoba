import "./window-init";
import { render } from "solid-js/web";
import { I18nProvider } from "./i18n/i18n";

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
