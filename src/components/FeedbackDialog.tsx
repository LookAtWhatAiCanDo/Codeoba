import { createSignal, Show, onMount, createEffect } from "solid-js";
import { X, Send, CheckCircle2, MessageSquare, AlertCircle } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { logFE } from "../utils/logger";
import { useI18n } from "../i18n/i18n";

interface FeedbackDialogProps {
  isOpen: boolean;
  onClose: () => void;
  appVersion: string;
}

async function generateSignature(timestamp: number): Promise<string> {
  const secret = "codeoba-feedback-shared-secret-key-2026";
  const data = `${secret}-${timestamp}`;
  const msgBuffer = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function FeedbackDialog(props: FeedbackDialogProps) {
  const { t } = useI18n();

  const [message, setMessage] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [attachDiagnostics, setAttachDiagnostics] = createSignal(true);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [submitSuccess, setSubmitSuccess] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [backendUrl, setBackendUrl] = createSignal("https://codeoba.com");

  createEffect(() => {
    logFE("info", `FeedbackDialog: props.isOpen changed to ${props.isOpen}`);
  });

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

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!message().trim()) {
      setErrorMsg(t("feedback.messagePlaceholder"));
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const diagnostics = attachDiagnostics()
      ? {
          appVersion: props.appVersion,
          os: navigator.userAgent.includes("Mac")
            ? "macOS"
            : navigator.userAgent.includes("Win")
              ? "Windows"
              : "Linux",
          userAgent: navigator.userAgent,
        }
      : null;

    const bodyPayload = JSON.stringify({
      message: message(),
      email: email().trim() || null,
      diagnostics,
    });

    try {
      const url = `${backendUrl()}/api/feedback`;
      logFE("info", `FeedbackDialog: Attempting submission to ${url}...`);

      const timestamp = Date.now();
      const signature = await generateSignature(timestamp);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-App-Signature": signature,
          "X-App-Timestamp": String(timestamp),
        },
        body: bodyPayload,
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      logFE("info", "FeedbackDialog: Feedback submitted successfully");
      setSubmitSuccess(true);
      setMessage("");
      setEmail("");

      // Auto close after 2 seconds on success
      setTimeout(() => {
        props.onClose();
        setSubmitSuccess(false);
      }, 2000);
    } catch (err: any) {
      const errMsg = err.message || String(err);
      logFE("error", `FeedbackDialog: Failed to submit feedback: ${errMsg}`);
      console.error("Feedback submit error:", err);
      setErrorMsg(t("feedback.errorMsg", { error: errMsg }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Show when={props.isOpen}>
      {/* Modal scrim background */}
      <div
        class="fixed inset-0 bg-black/60 z-[999] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-sm"
        onClick={() => props.onClose()}
      >
        {/* Dialog Box */}
        <div
          class="w-[500px] bg-surface border border-border/80 rounded-2xl flex flex-col p-6 shadow-2xl relative animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()} // Consume clicks
        >
          {/* Close Button */}
          <button
            onClick={() => props.onClose()}
            class="absolute top-4 right-4 p-1.5 bg-background hover:bg-surface border border-border/60 rounded-xl text-text-secondary hover:text-text-primary transition-all cursor-pointer"
          >
            <X class="w-4 h-4" />
          </button>

          <Show
            when={submitSuccess()}
            fallback={
              <form onSubmit={handleSubmit} class="flex flex-col gap-4">
                <div class="flex items-center gap-2 mb-1">
                  <MessageSquare class="w-5 h-5 text-accent" />
                  <h3 class="text-base font-bold text-text-primary">{t("feedback.title")}</h3>
                </div>
                <p class="text-xs text-text-secondary leading-relaxed">{t("feedback.desc")}</p>

                {errorMsg() && (
                  <div class="bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl flex items-center gap-2 text-xs text-red-400">
                    <AlertCircle class="w-4 h-4 flex-shrink-0" />
                    <span>{errorMsg()}</span>
                  </div>
                )}

                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-semibold text-text-secondary">
                    {t("feedback.messageLabel")}
                  </label>
                  <textarea
                    value={message()}
                    onInput={(e) => setMessage(e.currentTarget.value)}
                    placeholder={t("feedback.messagePlaceholder")}
                    rows="4"
                    required
                    class="w-full bg-background border border-border/60 hover:border-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl px-3 py-2 text-xs text-text-primary placeholder-text-muted focus:outline-none transition-all resize-none"
                  />
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-semibold text-text-secondary">
                    {t("feedback.emailLabel")}
                  </label>
                  <input
                    type="email"
                    value={email()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                    placeholder={t("feedback.emailPlaceholder")}
                    class="w-full bg-background border border-border/60 hover:border-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl px-3 py-2 text-xs text-text-primary placeholder-text-muted focus:outline-none transition-all"
                  />
                </div>

                <div class="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id="attach-diag"
                    checked={attachDiagnostics()}
                    onChange={(e) => setAttachDiagnostics(e.currentTarget.checked)}
                    class="accent-accent"
                  />
                  <label
                    for="attach-diag"
                    class="text-xs text-text-secondary cursor-pointer select-none"
                  >
                    {t("feedback.attachDiagnostics")}
                  </label>
                </div>

                <div class="flex gap-3 justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => props.onClose()}
                    class="px-4 py-2 border border-border/60 hover:border-border text-text-secondary hover:text-text-primary rounded-xl text-xs font-semibold cursor-pointer transition-all"
                  >
                    {t("feedback.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting()}
                    class="px-4 py-2 bg-accent hover:bg-accent/90 border border-accent/20 rounded-xl text-xs font-bold text-background hover:text-background disabled:opacity-60 flex items-center gap-1.5 cursor-pointer transition-all shadow-md"
                  >
                    <Send class="w-3.5 h-3.5" />
                    {isSubmitting() ? t("feedback.submitting") : t("feedback.submit")}
                  </button>
                </div>
              </form>
            }
          >
            {/* Success State */}
            <div class="flex flex-col items-center justify-center py-8 text-center gap-3 animate-in fade-in duration-300">
              <CheckCircle2 class="w-12 h-12 text-green-500 animate-bounce" />
              <h3 class="text-base font-bold text-text-primary">{t("feedback.thankYou")}</h3>
              <p class="text-xs text-text-secondary">{t("feedback.success")}</p>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
