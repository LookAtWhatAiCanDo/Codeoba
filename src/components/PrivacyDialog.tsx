import { Show, createMemo, createSignal, onMount } from "solid-js";
import { X, Shield } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../i18n/i18n";
import { MarkdownRenderer } from "./MarkdownRenderer";

// Eager-import all localized markdown files at compile time via Vite
const PRIVACY_MDS = import.meta.glob("../resources/privacy/privacy_*.md", {
  query: "?raw",
  eager: true,
}) as Record<string, { default: string }>;

interface PrivacyDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyDialog = (props: PrivacyDialogProps) => {
  const { t, locale } = useI18n();
  const [backendUrl, setBackendUrl] = createSignal("https://codeoba.com");

  onMount(async () => {
    try {
      const url = await invoke<string>("get_backend_base_url");
      if (url) {
        setBackendUrl(url);
      }
    } catch (err) {
      console.error("Failed to retrieve backend base URL:", err);
    }
  });

  const handleOpenOnline = async () => {
    const url = `${backendUrl()}/privacy/?lang=${locale()}`;
    try {
      await openUrl(url);
    } catch (err) {
      console.error("Failed to open online privacy link:", err);
    }
  };

  // Resolve the markdown string matching the active locale, falling back to en
  const activePrivacyMd = createMemo(() => {
    const currentLocale = locale();
    const key = `../resources/privacy/privacy_${currentLocale}.md`;

    if (PRIVACY_MDS[key]) {
      return PRIVACY_MDS[key].default;
    }

    // Default fallback to English
    return PRIVACY_MDS["../resources/privacy/privacy_en.md"]?.default || "";
  });

  return (
    <Show when={props.isOpen}>
      {/* Modal scrim background */}
      <div
        class="fixed inset-0 bg-black/60 z-[999] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-sm"
        onClick={() => props.onClose()}
      >
        {/* Privacy Dialog box */}
        <div
          class="w-[720px] h-[520px] bg-surface border border-border/80 rounded-2xl flex flex-col overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200 p-6 pt-7"
          onClick={(e) => e.stopPropagation()} // Consume click propagation
        >
          {/* Close button in top-right */}
          <button
            onClick={() => props.onClose()}
            class="absolute top-4 right-4 p-1.5 bg-background hover:bg-surface border border-border/60 rounded-xl text-text-secondary hover:text-text-primary transition-all cursor-pointer z-10"
          >
            <X class="w-4 h-4" />
          </button>

          {/* Header */}
          <div class="flex items-center justify-between mb-4 border-b border-border/60 pb-3 flex-shrink-0">
            <div class="flex items-center gap-2">
              <Shield class="w-5 h-5 text-accent" />
              <span class="font-bold text-text-primary tracking-wide text-base">
                {t("privacy.title")}
              </span>
            </div>

            {/* View online link */}
            <a
              href={`${backendUrl()}/privacy/?lang=${locale()}`}
              onClick={(e) => {
                e.preventDefault();
                handleOpenOnline();
              }}
              title={`${backendUrl()}/privacy/?lang=${locale()}`}
              class="text-xs text-accent hover:underline cursor-pointer mr-8 font-medium flex items-center gap-1 transition-all select-none"
            >
              {t("privacy.viewOnline")}
            </a>
          </div>

          {/* Scrollable Markdown Content Container */}
          <div class="flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0 select-text">
            <div class="bg-background/25 border border-border/40 rounded-xl p-5 mb-1 leading-relaxed">
              <MarkdownRenderer content={activePrivacyMd()} />
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};
export default PrivacyDialog;
