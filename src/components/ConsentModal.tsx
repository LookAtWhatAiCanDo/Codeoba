import { Show } from "solid-js";
import { useI18n } from "../i18n/i18n";
import { AlertCircle, Bug, Shield } from "lucide-solid";

const SHOW_PRE_RELEASE_NOTICE = true;

interface ConsentModalProps {
  isOpen: boolean;
  onDecision: (consented: boolean) => void;
}

export const ConsentModal = (props: ConsentModalProps) => {
  const { t } = useI18n();

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-md">
        <div class="w-[520px] bg-surface border border-border/80 p-6 rounded-2xl flex flex-col gap-5 shadow-2xl relative animate-in zoom-in-95 duration-200">
          {/* Header info */}
          <div class="flex items-center gap-3.5">
            <div class="p-3 bg-accent/10 border border-accent/20 text-accent rounded-xl">
              <Shield class="w-6 h-6" />
            </div>
            <div>
              <h3 class="text-base font-bold text-text-primary uppercase tracking-wider">
                {t("updater.consent.title")}
              </h3>
              <p class="text-xs text-text-secondary/70">{t("updater.consent.subtitle")}</p>
            </div>
          </div>

          {/* Quality Disclaimer Callout */}
          <Show when={SHOW_PRE_RELEASE_NOTICE}>
            <div class="bg-yellow-500/5 border border-yellow-500/20 text-yellow-500/90 rounded-xl p-3.5 text-xs leading-relaxed flex items-start gap-3">
              <AlertCircle class="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p class="font-semibold text-text-primary text-xs mb-1">
                  {t("updater.consent.descQualityTitle")}
                </p>
                <p class="mt-1.5">
                  {(() => {
                    const parts = t("updater.consent.descQualityReport").split("{bugIcon}");
                    return (
                      <>
                        {parts[0]}
                        <span class="inline-flex items-center justify-center w-4 h-4 bg-surface/50 border border-border/60 rounded text-accent align-middle mx-1 -translate-y-[1px]">
                          <Bug class="w-3 h-3" />
                        </span>
                        {parts[1]}
                      </>
                    );
                  })()}
                </p>
              </div>
            </div>
          </Show>

          {/* Description */}
          <div class="bg-background/50 border border-border/40 rounded-xl p-4 space-y-3 text-sm leading-relaxed text-text-secondary">
            <p class="font-semibold pt-2.5 border-t border-border/20 text-text-primary">
              {t("updater.consent.question")}
            </p>
            <p>
              {(() => {
                const parts = t("updater.consent.desc1").split("{domain}");
                return (
                  <>
                    {parts[0]}
                    <span class="font-semibold text-accent">codeoba.com</span>
                    {parts[1]}
                  </>
                );
              })()}
            </p>
          </div>

          {/* Legal Compliance Subtext */}
          <p class="text-xs text-text-secondary/60 text-center leading-relaxed px-4">
            {t("updater.consent.complianceSubtext")}
          </p>

          {/* Actions */}
          <div class="flex gap-3 pt-2">
            <button
              onClick={() => props.onDecision(false)}
              class="flex-1 py-2.5 border border-border bg-background hover:bg-surface rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
            >
              {t("updater.consent.noThanks")}
            </button>
            <button
              onClick={() => props.onDecision(true)}
              class="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-background rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-accent/10"
            >
              {t("updater.consent.enable")}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};
