import "./window-init";
import { render } from "solid-js/web";

// Dynamically import App so window-init can run first and show the skeleton instantly
import("./App").then(({ default: App }) => {
  const container = document.getElementById("root") as HTMLElement;
  if (container) {
    container.innerHTML = "";
  }
  render(() => <App />, container);
});
