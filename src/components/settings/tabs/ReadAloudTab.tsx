import { createSignal, For, Show } from "solid-js";
import { Play, Edit2, Check, X } from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";
import { useSpeech } from "../../../utils/useSpeech";
import { Category } from "../types";

export interface ReadAloudTabProps {
  activeCategory: Category;
  voices: SpeechSynthesisVoice[];
  selectedAssistantVoiceName: string;
  onAssistantVoiceChange: (val: string) => void;
  selectedUserVoiceName: string;
  onUserVoiceChange: (val: string) => void;
  assistantSpeechRate: number;
  onAssistantRateChange: (val: number) => void;
  assistantSpeechPitch: number;
  onAssistantPitchChange: (val: number) => void;
  userSpeechRate: number;
  onUserRateChange: (val: number) => void;
  userSpeechPitch: number;
  onUserPitchChange: (val: number) => void;
  onResetAssistantVoice: () => void;
  onResetUserVoice: () => void;
  onResetReadAloudDefaults: () => void;
  testText: string;
  setTestText: (text: string) => void;
  rules: Record<string, string>;
  onAddRule: (e: Event) => void;
  newWord: string;
  setNewWord: (val: string) => void;
  newReplacement: string;
  setNewReplacement: (val: string) => void;
  editingWord: string | null;
  setEditingWord: (val: string | null) => void;
  editWordVal: string;
  setEditWordVal: (val: string) => void;
  editRepVal: string;
  setEditRepVal: (val: string) => void;
  onSaveEdit: (oldWord: string) => void;
  onDeleteRule: (word: string) => void;
  onResetRules: () => void;
  onTestVoice: (speaker?: "assistant" | "user") => void;
  onResetTestText: () => void;
}

export const ReadAloudTab = (props: ReadAloudTabProps) => {
  const { t } = useI18n();
  const speech = useSpeech();
  const [confirmResetReadAloud, setConfirmResetReadAloud] = createSignal(false);

  return (
    <Show when={props.activeCategory === "read-aloud"}>
      {/* Read Aloud Settings Tab */}
      <div class="space-y-3 animate-in fade-in duration-200">
        <h3 class="text-sm font-bold uppercase tracking-wider text-text-secondary mb-2 select-none">
          {t("settings.readAloud.title")}
        </h3>

        {/* Voice: Assistant Settings Group */}
        <div class="bg-surface/30 border border-border/50 rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="text-xs font-bold text-text-primary">
                {t("settings.readAloud.voiceAssistant")}
              </h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.readAloud.voiceAssistantDesc")}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <select
                value={props.selectedAssistantVoiceName}
                onChange={(e) => props.onAssistantVoiceChange(e.currentTarget.value)}
                class="bg-background border border-border/80 rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent font-medium cursor-pointer max-w-xs"
              >
                <option value="">{t("settings.readAloud.defaultVoice")}</option>
                <For each={props.voices}>
                  {(voice) => (
                    <option value={voice.name}>
                      {voice.name} ({voice.lang})
                    </option>
                  )}
                </For>
              </select>
              <button
                type="button"
                onClick={props.onResetAssistantVoice}
                class="text-[0.625rem] text-text-secondary/60 hover:text-accent font-semibold transition-colors whitespace-nowrap cursor-pointer px-1 py-0.5"
                title={t("settings.readAloud.resetVoice")}
              >
                {t("settings.readAloud.resetVoice")}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-2 border-t border-border/30">
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[0.625rem] font-medium text-text-secondary">
                <span>{t("settings.readAloud.rate")}</span>
                <span class="font-bold text-text-primary">
                  {props.assistantSpeechRate.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={props.assistantSpeechRate}
                onInput={(e) => props.onAssistantRateChange(parseFloat(e.currentTarget.value))}
                class="w-full accent-accent h-1.5 bg-background rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div class="space-y-1">
              <div class="flex items-center justify-between text-[0.625rem] font-medium text-text-secondary">
                <span>{t("settings.readAloud.pitch")}</span>
                <span class="font-bold text-text-primary">
                  {props.assistantSpeechPitch.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={props.assistantSpeechPitch}
                onInput={(e) => props.onAssistantPitchChange(parseFloat(e.currentTarget.value))}
                class="w-full accent-accent h-1.5 bg-background rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Voice: User Settings Group */}
        <div class="bg-surface/30 border border-border/50 rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="text-xs font-bold text-text-primary">
                {t("settings.readAloud.voiceUser")}
              </h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.readAloud.voiceUserDesc")}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <select
                value={props.selectedUserVoiceName}
                onChange={(e) => props.onUserVoiceChange(e.currentTarget.value)}
                class="bg-background border border-border/80 rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent font-medium cursor-pointer max-w-xs"
              >
                <option value="">{t("settings.readAloud.defaultVoice")}</option>
                <For each={props.voices}>
                  {(voice) => (
                    <option value={voice.name}>
                      {voice.name} ({voice.lang})
                    </option>
                  )}
                </For>
              </select>
              <button
                type="button"
                onClick={props.onResetUserVoice}
                class="text-[0.625rem] text-text-secondary/60 hover:text-accent font-semibold transition-colors whitespace-nowrap cursor-pointer px-1 py-0.5"
                title={t("settings.readAloud.resetVoice")}
              >
                {t("settings.readAloud.resetVoice")}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-2 border-t border-border/30">
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[0.625rem] font-medium text-text-secondary">
                <span>{t("settings.readAloud.rate")}</span>
                <span class="font-bold text-text-primary">{props.userSpeechRate.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={props.userSpeechRate}
                onInput={(e) => props.onUserRateChange(parseFloat(e.currentTarget.value))}
                class="w-full accent-accent h-1.5 bg-background rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div class="space-y-1">
              <div class="flex items-center justify-between text-[0.625rem] font-medium text-text-secondary">
                <span>{t("settings.readAloud.pitch")}</span>
                <span class="font-bold text-text-primary">{props.userSpeechPitch.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={props.userSpeechPitch}
                onInput={(e) => props.onUserPitchChange(parseFloat(e.currentTarget.value))}
                class="w-full accent-accent h-1.5 bg-background rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Voice Testing controls */}
        <div class="bg-surface/30 border border-border/50 rounded-2xl py-3.5 px-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="text-xs font-bold text-text-primary">{t("settings.readAloud.test")}</h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.readAloud.testDesc")}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 w-full min-w-0">
            <input
              type="text"
              maxLength={300}
              value={props.testText}
              onInput={(e) => {
                props.setTestText(e.currentTarget.value);
                localStorage.setItem("codeoba-tts-test-text", e.currentTarget.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  props.onTestVoice();
                }
              }}
              class="bg-background border border-border/80 rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent flex-1 min-w-0 font-medium"
              placeholder={t("settings.readAloud.testSaying")}
            />
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={props.onResetTestText}
                class="px-2.5 py-1.5 bg-background hover:bg-surface border border-border rounded-xl text-text-secondary hover:text-text-primary text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
                title={t("settings.readAloud.testReset")}
              >
                {t("settings.readAloud.testReset")}
              </button>
              <button
                type="button"
                onClick={() => props.onTestVoice("assistant")}
                class="px-3 py-1.5 bg-background hover:bg-surface border border-border/80 hover:border-accent/40 rounded-xl text-text-primary text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
              >
                {t("settings.readAloud.testAssistant")}
              </button>
              <button
                type="button"
                onClick={() => props.onTestVoice("user")}
                class="px-3 py-1.5 bg-background hover:bg-surface border border-border/80 hover:border-accent/40 rounded-xl text-text-primary text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
              >
                {t("settings.readAloud.testUser")}
              </button>
            </div>
          </div>
        </div>

        {/* Pronunciation rules dictionary editor */}
        <div class="bg-surface/30 border border-border/50 rounded-2xl py-3.5 px-4 space-y-3">
          <div>
            <h4 class="text-xs font-bold text-text-primary">
              {t("settings.readAloud.pronunciations")}
            </h4>
            <p class="text-[0.625rem] text-text-secondary/70">
              {t("settings.readAloud.pronunciationsDesc")}
            </p>
          </div>

          <div class="max-h-40 overflow-y-auto border border-border/50 rounded-xl bg-background/50 divide-y divide-border/30">
            <For each={Object.keys(props.rules).sort()}>
              {(word) => {
                const isEditing = () => props.editingWord === word;
                return (
                  <div class="flex items-center justify-between px-3 py-2 text-xs gap-3">
                    <Show
                      when={isEditing()}
                      fallback={
                        <>
                          <div class="flex items-center gap-2 min-w-0 flex-1">
                            <span class="font-mono text-accent/90 font-medium truncate">
                              {word}
                            </span>
                            <span class="text-text-secondary/50 font-medium">➔</span>
                            <span class="text-text-secondary truncate">{props.rules[word]}</span>
                          </div>
                          <div class="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => speech.speakDirectText(props.rules[word])}
                              class="text-text-secondary/50 hover:text-accent transition-colors p-1"
                              title={t("readAloud.speechPlay")}
                            >
                              <Play class="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                props.setEditingWord(word);
                                props.setEditWordVal(word);
                                props.setEditRepVal(props.rules[word] || "");
                              }}
                              class="text-text-secondary/50 hover:text-accent transition-colors p-1"
                              title={t("common.edit")}
                            >
                              <Edit2 class="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => props.onDeleteRule(word)}
                              class="text-text-secondary/50 hover:text-red-500 transition-colors p-1"
                              title={t("common.delete")}
                            >
                              <X class="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      }
                    >
                      <div class="flex items-center gap-2 min-w-0 flex-1">
                        <input
                          type="text"
                          value={props.editWordVal}
                          onInput={(e) => props.setEditWordVal(e.currentTarget.value)}
                          class="bg-background border border-border/80 rounded-xl px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent w-24 font-mono font-medium"
                        />
                        <span class="text-text-secondary/50 font-medium">➔</span>
                        <input
                          type="text"
                          value={props.editRepVal}
                          onInput={(e) => props.setEditRepVal(e.currentTarget.value)}
                          class="bg-background border border-border/80 rounded-xl px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent flex-1 font-medium"
                        />
                      </div>
                      <div class="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => props.onSaveEdit(word)}
                          class="text-green-500 hover:text-green-600 transition-colors p-1"
                          title={t("common.save")}
                        >
                          <Check class="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => props.setEditingWord(null)}
                          class="text-text-secondary/50 hover:text-text-primary transition-colors p-1"
                          title={t("common.cancel")}
                        >
                          <X class="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
            <Show when={Object.keys(props.rules).length === 0}>
              <div class="text-center py-4 text-text-secondary/50 text-xs">
                No pronunciations defined.
              </div>
            </Show>
          </div>

          <form onSubmit={props.onAddRule} class="flex items-center gap-2 w-full min-w-0">
            <input
              type="text"
              placeholder={t("settings.readAloud.pronunciationsPlaceholderWord")}
              value={props.newWord}
              onInput={(e) => props.setNewWord(e.currentTarget.value)}
              class="bg-background border border-border/80 rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent flex-1 min-w-0 font-medium"
            />
            <input
              type="text"
              placeholder={t("settings.readAloud.pronunciationsPlaceholderReplacement")}
              value={props.newReplacement}
              onInput={(e) => props.setNewReplacement(e.currentTarget.value)}
              class="bg-background border border-border/80 rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent flex-1 min-w-0 font-medium"
            />
            <button
              type="submit"
              class="px-3 py-1.5 bg-accent hover:bg-accent-hover text-accent-text rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
            >
              {t("settings.readAloud.pronunciationsAdd")}
            </button>
          </form>

          <div class="flex justify-start">
            <button
              type="button"
              onClick={props.onResetRules}
              class="text-[0.625rem] text-accent hover:underline font-semibold"
            >
              {t("settings.readAloud.pronunciationsReset")}
            </button>
          </div>
        </div>

        <div class="flex justify-end pt-1 border-t border-border/20">
          <Show
            when={confirmResetReadAloud()}
            fallback={
              <button
                type="button"
                onClick={() => setConfirmResetReadAloud(true)}
                class="px-3 py-1.5 bg-background hover:bg-surface border border-border/80 rounded-xl text-text-secondary hover:text-red-400 transition-all text-xs font-semibold cursor-pointer"
              >
                {t("settings.readAloud.reset")}
              </button>
            }
          >
            <div class="flex items-center gap-2 animate-in fade-in duration-150">
              <span class="text-xs text-red-400 font-medium select-none">
                {t("settings.readAloud.confirmResetAll")}
              </span>
              <button
                type="button"
                onClick={() => {
                  props.onResetReadAloudDefaults();
                  setConfirmResetReadAloud(false);
                }}
                class="px-3 py-1 bg-red-500/90 hover:bg-red-600 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                {t("common.confirm")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmResetReadAloud(false)}
                class="px-3 py-1 bg-background hover:bg-surface border border-border/80 text-text-secondary hover:text-text-primary rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                {t("common.cancel")}
              </button>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
};
