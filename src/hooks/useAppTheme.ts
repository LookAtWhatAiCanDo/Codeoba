import { createSignal, createMemo, createEffect, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export function getLuminanceFromHsl(h: number, s: number, l: number) {
  const sPct = s / 100;
  const lPct = l / 100;
  const c = (1 - Math.abs(2 * lPct - 1)) * sPct;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lPct - c / 2;
  let rVal = 0,
    gVal = 0,
    bVal = 0;
  if (h >= 0 && h < 60) {
    rVal = c;
    gVal = x;
    bVal = 0;
  } else if (h >= 60 && h < 120) {
    rVal = x;
    gVal = c;
    bVal = 0;
  } else if (h >= 120 && h < 180) {
    rVal = 0;
    gVal = c;
    bVal = x;
  } else if (h >= 180 && h < 240) {
    rVal = 0;
    gVal = x;
    bVal = c;
  } else if (h >= 240 && h < 300) {
    rVal = x;
    gVal = 0;
    bVal = c;
  } else if (h >= 300 && h < 360) {
    rVal = c;
    gVal = 0;
    bVal = x;
  }
  const r = rVal + m;
  const g = gVal + m;
  const b = bVal + m;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function useAppTheme() {
  const [appearance, setAppearance] = createSignal(
    localStorage.getItem("codeoba-appearance") || "dark"
  );
  const [darkTheme, setDarkTheme] = createSignal(
    localStorage.getItem("codeoba-dark-theme") || "obsidian"
  );
  const [lightTheme, setLightTheme] = createSignal(
    localStorage.getItem("codeoba-light-theme") || "obsidian-light"
  );
  const [systemDark, setSystemDark] = createSignal(
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  onMount(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
    };
    mediaQuery.addEventListener("change", handleSystemThemeChange);
    onCleanup(() => mediaQuery.removeEventListener("change", handleSystemThemeChange));
  });

  const theme = createMemo(() => {
    const appMode = appearance();
    if (appMode === "system") {
      return systemDark() ? darkTheme() : lightTheme();
    }
    return appMode === "dark" ? darkTheme() : lightTheme();
  });

  const activeColorMode = () => {
    const appMode = appearance();
    return appMode === "system" ? (systemDark() ? "dark" : "light") : appMode;
  };

  const getStoredHsl = (
    mode: "dark" | "light",
    prefix: string,
    defH: number,
    defS: number,
    defL: number
  ) => {
    const h = parseInt(
      localStorage.getItem(`codeoba-custom-${mode}-${prefix}-h`) || String(defH),
      10
    );
    const s = parseInt(
      localStorage.getItem(`codeoba-custom-${mode}-${prefix}-s`) || String(defS),
      10
    );
    const l = parseInt(
      localStorage.getItem(`codeoba-custom-${mode}-${prefix}-l`) || String(defL),
      10
    );
    return { h, s, l };
  };

  const [customDarkTheme, setCustomDarkTheme] = createSignal({
    bg: getStoredHsl("dark", "bg", 228, 15, 8),
    surface: getStoredHsl("dark", "surface", 228, 15, 11),
    accent1: getStoredHsl("dark", "accent1", 238, 82, 66),
    accent2: getStoredHsl("dark", "accent2", 244, 79, 58),
  });

  const [customLightTheme, setCustomLightTheme] = createSignal({
    bg: getStoredHsl("light", "bg", 210, 20, 95),
    surface: getStoredHsl("light", "surface", 210, 20, 98),
    accent1: getStoredHsl("light", "accent1", 238, 82, 66),
    accent2: getStoredHsl("light", "accent2", 244, 79, 58),
  });

  let themeSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  const saveThemeToBackend = () => {
    if (themeSaveTimeout) clearTimeout(themeSaveTimeout);
    themeSaveTimeout = setTimeout(() => {
      invoke("save_theme_settings", {
        appearance: appearance(),
        darkTheme: darkTheme(),
        lightTheme: lightTheme(),
      }).catch((err) => console.error("Failed to save theme settings to backend config:", err));

      const activeTheme = theme();
      if (activeTheme === "custom") {
        const isDark = activeColorMode() === "dark";
        const colors = isDark ? customDarkTheme() : customLightTheme();
        invoke("save_custom_theme_bg", {
          mode: isDark ? "dark" : "light",
          h: colors.bg.h,
          s: colors.bg.s,
          l: colors.bg.l,
        }).catch((err) => console.error("Failed to save custom theme bg to backend config:", err));
      }
    }, 250);
  };

  createEffect(() => {
    const activeTheme = theme();
    document.documentElement.setAttribute("data-theme", activeTheme);
    localStorage.setItem("codeoba-appearance", appearance());
    localStorage.setItem("codeoba-dark-theme", darkTheme());
    localStorage.setItem("codeoba-light-theme", lightTheme());
    saveThemeToBackend();

    if (activeTheme === "custom") {
      const isDark = activeColorMode() === "dark";
      const colors = isDark ? customDarkTheme() : customLightTheme();

      const bgStr = `hsl(${colors.bg.h}, ${colors.bg.s}%, ${colors.bg.l}%)`;
      const surfaceStr = `hsl(${colors.surface.h}, ${colors.surface.s}%, ${colors.surface.l}%)`;
      const borderStr = `hsl(${colors.surface.h}, ${colors.surface.s}%, ${isDark ? colors.surface.l + 8 : colors.surface.l - 8}%)`;
      const accentStr = `hsl(${colors.accent1.h}, ${colors.accent1.s}%, ${colors.accent1.l}%)`;
      const accentHoverStr = `hsl(${colors.accent2.h}, ${colors.accent2.s}%, ${colors.accent2.l}%)`;
      const accentLightStr = `hsla(${colors.accent1.h}, ${colors.accent1.s}%, ${colors.accent1.l}%, 0.15)`;

      document.documentElement.style.setProperty("--background", bgStr);
      document.documentElement.style.setProperty("--surface", surfaceStr);
      document.documentElement.style.setProperty("--border", borderStr);
      document.documentElement.style.setProperty("--accent", accentStr);
      document.documentElement.style.setProperty("--accent-hover", accentHoverStr);
      document.documentElement.style.setProperty("--accent-light", accentLightStr);

      const lum = getLuminanceFromHsl(colors.accent1.h, colors.accent1.s, colors.accent1.l);
      const accentTextStr = lum > 0.25 ? (isDark ? "#0d0e12" : "#0f172a") : "#ffffff";
      document.documentElement.style.setProperty("--accent-text", accentTextStr);

      document.documentElement.style.setProperty("--text-primary", isDark ? "#f3f4f6" : "#0f172a");
      document.documentElement.style.setProperty(
        "--text-secondary",
        isDark ? "#d1d5db" : "#475569"
      );
    } else {
      document.documentElement.style.removeProperty("--background");
      document.documentElement.style.removeProperty("--surface");
      document.documentElement.style.removeProperty("--border");
      document.documentElement.style.removeProperty("--accent");
      document.documentElement.style.removeProperty("--accent-hover");
      document.documentElement.style.removeProperty("--accent-light");
      document.documentElement.style.removeProperty("--accent-text");
      document.documentElement.style.removeProperty("--text-primary");
      document.documentElement.style.removeProperty("--text-secondary");
    }
  });

  const handleThemeChange = (newTheme: string) => {
    if (activeColorMode() === "dark") {
      setDarkTheme(newTheme);
    } else {
      setLightTheme(newTheme);
    }
  };

  const currentCustomTheme = () =>
    activeColorMode() === "dark" ? customDarkTheme() : customLightTheme();

  const handleCustomThemeChange = (val: any) => {
    if (activeColorMode() === "dark") {
      setCustomDarkTheme(val);
    } else {
      setCustomLightTheme(val);
    }
  };

  return {
    appearance,
    setAppearance,
    darkTheme,
    setDarkTheme,
    lightTheme,
    setLightTheme,
    systemDark,
    setSystemDark,
    theme,
    activeColorMode,
    customDarkTheme,
    setCustomDarkTheme,
    customLightTheme,
    setCustomLightTheme,
    handleThemeChange,
    currentCustomTheme,
    handleCustomThemeChange,
  };
}
