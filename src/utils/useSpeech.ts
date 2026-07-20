import { createSignal, createMemo, createEffect, untrack } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Session } from "../types";
import { parseAssistantMessage } from "./messageParser";
import { useI18n } from "../i18n/i18n";

export interface SpeechItem {
  globalIndex: number;
  turnIndex: number;
  blockIndex?: number;
  text: string;
  timestamp: number;
  sessionId?: string;
  sessionTitle?: string;
}

let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudio: HTMLAudioElement | null = null;

function getSharedAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!activeAudio) {
    activeAudio = new Audio();
  }
  return activeAudio;
}

// Permanent cache for the static "Session" label
let staticSessionLabelCache: string | null = null;
let cachedVoiceForLabel: string | null = null;
let cachedLanguageForLabel: string | null = null;

// Keep a small look-ahead cache for pre-fetched offline TTS audio (Map of text -> base64 data)
const prefetchCache = new Map<string, string>();
const activeSynthesisPromises = new Map<string, Promise<string>>();

function setInPrefetchCache(text: string, base64Data: string) {
  if (prefetchCache.size >= 8) {
    const oldestKey = prefetchCache.keys().next().value;
    if (oldestKey !== undefined) {
      prefetchCache.delete(oldestKey);
    }
  }
  prefetchCache.set(text, base64Data);
}

function getOfflineSpeech(text: string, voiceName: string): Promise<string> {
  const cached = prefetchCache.get(text);
  if (cached) return Promise.resolve(cached);

  const existingPromise = activeSynthesisPromises.get(text);
  if (existingPromise) return existingPromise;

  const promise = invoke<string>("generate_offline_speech", {
    text,
    voice: voiceName,
  })
    .then((base64Data) => {
      setInPrefetchCache(text, base64Data);
      activeSynthesisPromises.delete(text);
      return base64Data;
    })
    .catch((err) => {
      activeSynthesisPromises.delete(text);
      throw err;
    });

  activeSynthesisPromises.set(text, promise);
  return promise;
}

function triggerPrefetch(nextText: string, voiceName: string) {
  if (!nextText || prefetchCache.has(nextText) || activeSynthesisPromises.has(nextText)) return;
  getOfflineSpeech(nextText, voiceName).catch((err) => {
    console.warn("[TTS Prefetch] Failed to pre-fetch next sentence:", err);
  });
}

// Speech sanitation helper to strip markdown, inline code, bold/italics, blockquotes, list markers
export function sanitizeBlockForSpeech(text: string): string {
  let clean = text;

  // 1. Remove markdown images: ![[caption]](url) or ![caption](url)
  clean = clean.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");

  // 2. Remove markdown links: [label](url) -> label
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 3. Remove inline code backticks: `code` -> code
  clean = clean.replace(/`([^`]+)`/g, "$1");

  // 4. Remove bold/italic markers
  clean = clean.replace(/\*\*([^*]+)\*\*/g, "$1");
  clean = clean.replace(/\*([^*]+)\*/g, "$1");
  clean = clean.replace(/__([^_]+)__/g, "$1");
  clean = clean.replace(/_([^_]+)_/g, "$1");

  // 5. Remove list item prefixes, blockquote markers, and heading hashes
  clean = clean.replace(/^[-*+]\s+/g, "");
  clean = clean.replace(/^\d+\.\s+/g, "");
  clean = clean.replace(/^>\s+/g, "");
  clean = clean.replace(/^#{1,6}\s+/g, "");
  clean = clean.replace(/\s+#{1,6}$/g, "");

  return clean.trim();
}

export const DEFAULT_KOKORO_VOICE = "af_heart";

export const DEFAULT_PRONUNCIATIONS: Record<string, string> = {
  newline: "new line",
  newlines: "new lines",
  codeoba: "code oh bu",
  src: "source",
  tauri: "tor ee",
  tts: "tee tee ess",
  rs: "are ess",
  js: "jay ess",
  ts: "tee ess",
  tsx: "tee ess ex",
  jsx: "jay ess ex",
  css: "see ess ess",
  html: "aitch tee em ell",
  json: "jay son",
  toml: "ta mul",
  yml: "yeh mul",
  yaml: "yeh mul",
  md: "em dee",
  gb: "gee bee",
  npm: "en pee em",
};

export function splitCamelCase(word: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (i > 0) {
      const prev = word[i - 1];
      const next = word[i + 1];
      const isLetter = /[a-zA-Z]/.test(ch) && /[a-zA-Z]/.test(prev);
      const isNewWord =
        isLetter &&
        ((prev === prev.toLowerCase() && ch === ch.toUpperCase()) ||
          (prev === prev.toUpperCase() &&
            ch === ch.toUpperCase() &&
            next &&
            next === next.toLowerCase()));
      if (isNewWord) {
        if (current) {
          parts.push(current);
          current = "";
        }
      }
    }
    current += ch;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

export function expandAcronym(part: string): string {
  if (part.length >= 2 && /^[A-Z]+$/.test(part)) {
    return part.split("").join(" ");
  }
  return part;
}

export function processToken(token: string): string {
  const parts = token.split(/[-_]+/);
  const result: string[] = [];
  for (const part of parts) {
    const subParts = splitCamelCase(part);
    for (const subPart of subParts) {
      const expanded = expandAcronym(subPart);
      result.push(expanded);
    }
  }
  return result.join(" ");
}

export function applyPronunciations(text: string): string {
  let rules: Record<string, string> = {};
  try {
    const saved = localStorage.getItem("codeoba-tts-pronunciations");
    if (saved) {
      rules = JSON.parse(saved);
      // Merge missing defaults
      let changed = false;
      for (const key of Object.keys(DEFAULT_PRONUNCIATIONS)) {
        if (!(key in rules)) {
          rules[key] = DEFAULT_PRONUNCIATIONS[key];
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem("codeoba-tts-pronunciations", JSON.stringify(rules));
      }
    } else {
      rules = DEFAULT_PRONUNCIATIONS;
      localStorage.setItem("codeoba-tts-pronunciations", JSON.stringify(DEFAULT_PRONUNCIATIONS));
    }
  } catch (e) {
    rules = DEFAULT_PRONUNCIATIONS;
  }

  let result = text;
  const sortedKeys = Object.keys(rules).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const replacement = rules[key];
    if (!key || typeof replacement !== "string") continue;
    const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedKey}\\b`, "gi");
    result = result.replace(regex, replacement);
  }

  let output = "";
  let token = "";
  for (let i = 0; i < result.length; i++) {
    const ch = result[i];
    if (/[a-zA-Z0-9'’\-_]/.test(ch)) {
      token += ch;
    } else {
      if (token) {
        output += processToken(token);
        token = "";
      }
      output += ch;
    }
  }
  if (token) {
    output += processToken(token);
  }

  return output;
}

// Split narrative text into logical block-level chunks (newlines and HTML tags)
export function splitIntoLogicalBlocks(text: string): string[] {
  // First, strip multi-line markdown code blocks from the raw narrative texts
  let clean = text.replace(/```[\s\S]*?```/g, "");

  // Second, convert block-level layout HTML tags to newlines
  clean = clean.replace(/<\/?(div|p|blockquote|pre|br)(?:\s+[^>]*)?>/gi, "\n");

  // Third, expand angle-bracketed words/tags to their inner word (e.g. <li> -> li, </li> -> li, <audio> -> audio)
  clean = clean.replace(/<\/([a-zA-Z0-9_-]+)>/g, " $1 ");
  clean = clean.replace(/<([a-zA-Z0-9_-]+)>/g, " $1 ");

  const lines = clean.split(/\r?\n/).map((line) => line.trim());
  const blocks: string[] = [];

  for (const line of lines) {
    if (line.length === 0) continue;

    // Strip leading blockquote character so it isn't spoken as "greater than"
    let processedLine = line;
    if (processedLine.startsWith(">")) {
      processedLine = processedLine.substring(1).trim();
    }
    processedLine = processedLine.replace(/</g, " less than ").replace(/>/g, " greater than ");

    const trimmed = processedLine.trim();
    if (trimmed.length > 0) {
      blocks.push(trimmed);
    }
  }

  return blocks;
}

// Helper to extract clean high-level speech items from a session
export function extractSpeechItems(session: Session): SpeechItem[] {
  const items: SpeechItem[] = [];
  if (!session.turns) return items;

  let globalIndex = 0;
  for (let turnIndex = 0; turnIndex < session.turns.length; turnIndex++) {
    const turn = session.turns[turnIndex]!;

    // Extract high-level text excluding tools from the assistantMessage property of Turn
    const parsed = parseAssistantMessage(turn.assistantMessage || "");
    const narrativeTexts = parsed
      .filter((part) => part.type === "text")
      .map((part) => part.content)
      .join("\n");

    const blocks = splitIntoLogicalBlocks(narrativeTexts);
    let blockIndex = 0;
    for (const rawBlock of blocks) {
      // Skip horizontal rules (e.g. ---, ***, ___)
      if (/^[-*_]{3,}$/.test(rawBlock)) continue;

      const sanitized = sanitizeBlockForSpeech(rawBlock);
      // Skip blocks that contain no letters or numbers in any language
      if (sanitized && /\p{L}|\p{N}/u.test(sanitized)) {
        items.push({
          globalIndex: globalIndex++,
          turnIndex,
          blockIndex: blockIndex++,
          text: sanitized,
          timestamp: turn.timestamp || session.timestamp || Date.now(),
        });
      }
    }
  }

  return items;
}

const [sentences, setSentences] = createSignal<SpeechItem[]>([]);
const [currentSentenceIndex, setCurrentSentenceIndex] = createSignal(-1);
const [isPlaying, setIsPlaying] = createSignal(false);
const [isPaused, setIsPaused] = createSignal(false);
const [isPreparingSpeech, setIsPreparingSpeech] = createSignal(false);
const [activeReadAloudSessionIds, setActiveReadAloudSessionIds] = createSignal<Set<string>>(
  new Set()
);
const readAloudSessionStates = new Map<string, { lastSentenceCount: number }>();

let currentLanguage = "en";
let currentSentenceStartTime = 0;
let lastSpokenSessionId: string | null = null;
let activePlayTaskId = 0;

interface SpeechController {
  play: (session?: Session, lang?: string) => void | Promise<void>;
  stop: () => void;
  next: () => void;
  prev: () => void;
  isPlaying: () => boolean;
  isPaused: () => boolean;
}

let activeSpeechController: SpeechController | null = null;

export function useSpeech() {
  const { t } = useI18n();

  const activeSessionId = createMemo(() => {
    const list = sentences();
    const idx = currentSentenceIndex();
    if (idx >= 0 && idx < list.length) {
      return list[idx]!.sessionId;
    }
    return undefined;
  });

  const pastHistory = createMemo(() => {
    const list = sentences();
    const idx = currentSentenceIndex();
    const history: { index: number; text: string }[] = [];
    if (idx <= 0) return history;
    for (let i = idx - 1; i >= 0 && history.length < 10; i--) {
      history.push({ index: i, text: list[i]!.text });
    }
    return history;
  });

  const futureHistory = createMemo(() => {
    const list = sentences();
    const idx = currentSentenceIndex();
    const history: { index: number; text: string }[] = [];
    if (idx < 0 || idx >= list.length - 1) return history;
    for (let i = idx + 1; i < list.length && history.length < 10; i++) {
      history.push({ index: i, text: list[i]!.text });
    }
    return history;
  });

  const activeTurnIndex = createMemo(() => {
    const list = sentences();
    const idx = currentSentenceIndex();
    if (idx >= 0 && idx < list.length) {
      return list[idx]!.turnIndex;
    }
    return -1;
  });

  const stop = () => {
    activePlayTaskId++;
    if (activeUtterance) {
      activeUtterance.onend = null;
      activeUtterance.onerror = null;
      activeUtterance = null;
    }
    if (activeAudio) {
      activeAudio.onended = null;
      activeAudio.onerror = null;
      activeAudio.pause();
      activeAudio.src = "";
      try {
        activeAudio.load();
      } catch (e) {
        // ignore load error
      }
    }
    if (
      window.speechSynthesis &&
      (window.speechSynthesis.speaking || window.speechSynthesis.pending)
    ) {
      window.speechSynthesis.cancel();
    }

    setIsPlaying(false);
    setIsPaused(false);
    setIsPreparingSpeech(false);
    setCurrentSentenceIndex(-1);
    lastSpokenSessionId = null;

    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
    }

    invoke("update_playback_metadata", {
      title: "",
      artist: "",
      isPlaying: false,
    }).catch((err) => {
      console.error("[TTS] Failed to update playback metadata:", err);
    });
  };

  const playCurrent = () => {
    const list = sentences();
    const idx = currentSentenceIndex();
    if (idx < 0 || idx >= list.length) {
      stop();
      return;
    }

    const taskId = ++activePlayTaskId;
    setIsPreparingSpeech(true);
    const currentItem = list[idx]!;
    const provider = localStorage.getItem("codeoba-tts-provider") || "system";
    const savedVoiceName = localStorage.getItem("codeoba-tts-voice") || DEFAULT_KOKORO_VOICE;

    // Check if the session name changes from the last spoken track
    const currentSessionId = currentItem.sessionId || null;
    const sessionChanged = currentSessionId !== lastSpokenSessionId;

    if (provider === "offline-kokoro") {
      // 1. Prefetch up to 2 sentences ahead (staggered to prevent sustained CPU load)
      for (let offset = 1; offset <= 2; offset++) {
        const nextIdx = idx + offset;
        if (nextIdx < list.length) {
          const nextItem = list[nextIdx]!;
          const nextSessionChanged =
            (nextItem.sessionId || null) !==
            (nextIdx === idx + 1 ? currentSessionId : list[idx + 1]?.sessionId || null);
          setTimeout(() => {
            if (taskId !== activePlayTaskId) return;
            if (isPlaying() && !isPaused()) {
              if (nextSessionChanged && nextItem.sessionTitle) {
                const label = t("readAloud.sessionLabel");
                triggerPrefetch(applyPronunciations(label), savedVoiceName);
                triggerPrefetch(applyPronunciations(nextItem.sessionTitle), savedVoiceName);
              }
              triggerPrefetch(applyPronunciations(nextItem.text), savedVoiceName);
            }
          }, offset * 600);
        }
      }

      // 2. Prefetch 1 sentence backward for responsive prev/back navigation (staggered)
      if (idx - 1 >= 0) {
        const prevItem = list[idx - 1]!;
        const prevSessionChanged =
          (prevItem.sessionId || null) !== (idx - 2 >= 0 ? list[idx - 2]!.sessionId || null : null);
        setTimeout(() => {
          if (taskId !== activePlayTaskId) return;
          if (isPlaying() && !isPaused()) {
            if (prevSessionChanged && prevItem.sessionTitle) {
              const label = t("readAloud.sessionLabel");
              triggerPrefetch(applyPronunciations(label), savedVoiceName);
              triggerPrefetch(applyPronunciations(prevItem.sessionTitle), savedVoiceName);
            }
            triggerPrefetch(applyPronunciations(prevItem.text), savedVoiceName);
          }
        }, 1800);
      }
    }

    currentSentenceStartTime = performance.now();

    setIsPlaying(true);
    setIsPaused(false);

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentItem.text,
        artist: currentItem.sessionTitle || "Untitled Session",
        album: "Codeoba Read Aloud",
      });
      navigator.mediaSession.playbackState = "playing";
      navigator.mediaSession.setActionHandler("play", () => {
        play();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        play();
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        next();
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        prev();
      });
    }

    invoke("update_playback_metadata", {
      title: currentItem.text,
      artist: currentItem.sessionTitle || "Untitled Session",
      isPlaying: true,
    }).catch((err) => {
      console.error("[TTS] Failed to update playback metadata:", err);
    });

    if (activeUtterance) {
      activeUtterance.onend = null;
      activeUtterance.onerror = null;
      activeUtterance = null;
    }
    if (activeAudio) {
      activeAudio.onended = null;
      activeAudio.onerror = null;
      activeAudio.pause();
      activeAudio.src = "";
      try {
        activeAudio.load();
      } catch (e) {
        // ignore load error
      }
    }
    let cancelCalled = false;
    if (
      window.speechSynthesis &&
      (window.speechSynthesis.speaking || window.speechSynthesis.pending)
    ) {
      window.speechSynthesis.cancel();
      cancelCalled = true;
    }

    const playAudioData = (base64Data: string, onDone: () => void) => {
      if (taskId !== activePlayTaskId) return;
      // Guard: make sure we are still on the same item index
      const currentList = untrack(() => sentences());
      const currentIdx = untrack(() => currentSentenceIndex());
      if (currentIdx !== idx || currentList[currentIdx]!.text !== currentItem.text) {
        return;
      }

      setIsPreparingSpeech(false);

      const audio = getSharedAudio();
      if (!audio) {
        onDone();
        return;
      }

      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = `data:audio/wav;base64,${base64Data}`;

      const savedRate = localStorage.getItem("codeoba-tts-rate");
      if (savedRate) {
        audio.playbackRate = parseFloat(savedRate);
      }

      audio.onended = () => {
        if (taskId !== activePlayTaskId) return;
        if (activeAudio === audio) {
          onDone();
        }
      };

      audio.onerror = (e) => {
        console.error("[TTS] Offline audio playback error:", e);
        if (taskId !== activePlayTaskId) return;
        if (activeAudio === audio) {
          onDone();
        }
      };

      if (isPaused()) {
        audio.pause();
      } else {
        audio.play().catch((err) => {
          console.error("[TTS] Failed to play offline audio:", err);
          if (taskId !== activePlayTaskId) return;
          onDone();
        });
      }
    };

    const speakSystemText = (text: string, onDone: () => void) => {
      if (taskId !== activePlayTaskId) return;
      setIsPreparingSpeech(false);
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(text);
        const savedVoiceName = localStorage.getItem("codeoba-tts-voice");
        let voiceAssigned = false;
        if (savedVoiceName) {
          const voices = window.speechSynthesis.getVoices();
          const matchedVoice = voices.find((v) => v.name === savedVoiceName);
          if (matchedVoice) {
            utterance.voice = matchedVoice;
            utterance.lang = matchedVoice.lang;
            voiceAssigned = true;
          }
        }

        if (!voiceAssigned) {
          if (currentLanguage === "zh-TW") {
            utterance.lang = "zh-TW";
          } else if (currentLanguage === "zh") {
            utterance.lang = "zh-CN";
          } else {
            utterance.lang = currentLanguage;
          }
        }

        const savedRate = localStorage.getItem("codeoba-tts-rate");
        if (savedRate) {
          utterance.rate = parseFloat(savedRate);
        }
        const savedPitch = localStorage.getItem("codeoba-tts-pitch");
        if (savedPitch) {
          utterance.pitch = parseFloat(savedPitch);
        }

        utterance.onend = () => {
          if (taskId !== activePlayTaskId) return;
          if (activeUtterance === utterance) {
            onDone();
          }
        };

        utterance.onerror = (e) => {
          console.error("[TTS] SpeechSynthesis error:", e);
          if (taskId !== activePlayTaskId) return;
          if (activeUtterance === utterance) {
            onDone();
          }
        };

        activeUtterance = utterance;
        if (cancelCalled) {
          setTimeout(() => {
            if (taskId !== activePlayTaskId) return;
            if (activeUtterance === utterance) {
              window.speechSynthesis.speak(utterance);
            }
          }, 50);
        } else {
          window.speechSynthesis.speak(utterance);
        }
      } else {
        console.warn("[TTS] Web Speech API not supported in this environment");
        onDone();
      }
    };

    const playActualSentence = () => {
      if (taskId !== activePlayTaskId) return;
      lastSpokenSessionId = currentSessionId;
      const processedSentence = applyPronunciations(currentItem.text);
      if (provider === "offline-kokoro") {
        getOfflineSpeech(processedSentence, savedVoiceName)
          .then((base64Data) => {
            if (taskId !== activePlayTaskId) return;
            playAudioData(base64Data, next);
          })
          .catch((err) => {
            console.error("[TTS] Offline sentence synthesis failed:", err);
            if (taskId !== activePlayTaskId) return;
            next();
          });
      } else {
        speakSystemText(processedSentence, next);
      }
    };

    if (sessionChanged && currentItem.sessionTitle) {
      const part1Text = applyPronunciations(t("readAloud.sessionLabel"));
      const part2Text = applyPronunciations(currentItem.sessionTitle);
      const processedSentence = applyPronunciations(currentItem.text);

      // Reset static label cache if voice or language settings have changed
      const currentLang = currentLanguage;
      if (cachedVoiceForLabel !== savedVoiceName || cachedLanguageForLabel !== currentLang) {
        staticSessionLabelCache = null;
        cachedVoiceForLabel = savedVoiceName;
        cachedLanguageForLabel = currentLang;
      }

      // Concurrently queue Part 2 and Part 3 synthesis in the background on transition start
      if (provider === "offline-kokoro") {
        triggerPrefetch(part2Text, savedVoiceName);
        triggerPrefetch(processedSentence, savedVoiceName);
      }

      const playPart2 = () => {
        if (taskId !== activePlayTaskId) return;

        if (provider === "offline-kokoro") {
          getOfflineSpeech(part2Text, savedVoiceName)
            .then((base64Data) => {
              if (taskId !== activePlayTaskId) return;
              playAudioData(base64Data, playActualSentence);
            })
            .catch((err) => {
              console.error("[TTS] Offline transition part2 synthesis failed:", err);
              if (taskId !== activePlayTaskId) return;
              playActualSentence();
            });
        } else {
          speakSystemText(part2Text, playActualSentence);
        }
      };

      const playPart1 = () => {
        if (taskId !== activePlayTaskId) return;
        if (provider === "offline-kokoro") {
          if (staticSessionLabelCache) {
            playAudioData(staticSessionLabelCache, playPart2);
          } else {
            getOfflineSpeech(part1Text, savedVoiceName)
              .then((base64Data) => {
                if (taskId !== activePlayTaskId) return;
                staticSessionLabelCache = base64Data;
                playAudioData(base64Data, playPart2);
              })
              .catch((err) => {
                console.error("[TTS] Offline transition part1 synthesis failed:", err);
                if (taskId !== activePlayTaskId) return;
                playPart2();
              });
          }
        } else {
          speakSystemText(part1Text, playPart2);
        }
      };

      playPart1();
    } else {
      playActualSentence();
    }
  };

  const updateAndSortSentences = (combinedList: SpeechItem[]) => {
    // 1. Remember the active item if any
    const list = sentences();
    const currIdx = currentSentenceIndex();
    const activeItem = currIdx >= 0 && currIdx < list.length ? list[currIdx] : null;

    // 2. Sort chronologically:
    //    a) timestamp ascending
    //    b) turnIndex ascending (if same session and timestamp)
    //    c) blockIndex ascending (if same turn/session and timestamp)
    const sorted = [...combinedList].sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      if (a.sessionId === b.sessionId) {
        if (a.turnIndex !== b.turnIndex) {
          return a.turnIndex - b.turnIndex;
        }
        const aBlock = a.blockIndex ?? 0;
        const bBlock = b.blockIndex ?? 0;
        return aBlock - bBlock;
      }
      return 0;
    });

    // 3. Re-assign global index contiguous coordinates
    const reindexed = sorted.map((item, idx) => ({
      ...item,
      globalIndex: idx,
    }));

    // 4. Update the currentSentenceIndex to the active item's new position
    if (activeItem) {
      const newActiveIdx = reindexed.findIndex(
        (item) =>
          item.text === activeItem.text &&
          item.sessionId === activeItem.sessionId &&
          item.turnIndex === activeItem.turnIndex &&
          item.timestamp === activeItem.timestamp
      );
      if (newActiveIdx !== -1) {
        setCurrentSentenceIndex(newActiveIdx);
      }
    }

    setSentences(reindexed);
    return reindexed;
  };

  const play = async (session?: Session, lang: string = "en") => {
    currentLanguage = lang;

    const togglePlayPause = () => {
      if (isPlaying()) {
        const provider = localStorage.getItem("codeoba-tts-provider") || "system";
        if (isPaused()) {
          setIsPaused(false);
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
          if (provider === "offline-kokoro") {
            if (activeAudio) {
              activeAudio.play().catch((err) => {
                console.error("[TTS] Failed to play offline audio:", err);
              });
            }
          } else {
            if (window.speechSynthesis) window.speechSynthesis.resume();
          }
          const list = sentences();
          const idx = currentSentenceIndex();
          const currentItem = idx >= 0 && idx < list.length ? list[idx] : null;
          invoke("update_playback_metadata", {
            title: currentItem ? currentItem.text : "",
            artist: currentItem ? currentItem.sessionTitle || "Untitled Session" : "",
            isPlaying: true,
          }).catch((err) => {
            console.error("[TTS] Failed to update playback metadata:", err);
          });
        } else {
          setIsPaused(true);
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "paused";
          }
          if (provider === "offline-kokoro") {
            if (activeAudio) {
              activeAudio.pause();
            }
          } else {
            if (window.speechSynthesis) window.speechSynthesis.pause();
          }
          const list = sentences();
          const idx = currentSentenceIndex();
          const currentItem = idx >= 0 && idx < list.length ? list[idx] : null;
          invoke("update_playback_metadata", {
            title: currentItem ? currentItem.text : "",
            artist: currentItem ? currentItem.sessionTitle || "Untitled Session" : "",
            isPlaying: false,
          }).catch((err) => {
            console.error("[TTS] Failed to update playback metadata:", err);
          });
        }
      } else {
        const list = sentences();
        if (list.length > 0) {
          const idx = currentSentenceIndex();
          setCurrentSentenceIndex(idx >= 0 ? idx : 0);
          playCurrent();
        }
      }
    };

    if (session) {
      if (!isReadAloudActive(session.id)) {
        await toggleReadAloud(session.id, {
          sourceId: session.sourceId,
          filePath: session.filePath,
        });
      }

      const list = sentences();
      const hasSessionItems = list.some((item) => item.sessionId === session.id);

      if (!hasSessionItems) {
        try {
          const fullSession = await invoke<Session | null>("get_session", {
            sourceId: session.sourceId,
            filePath: session.filePath,
          });
          if (fullSession) {
            const allSessionItems = extractSpeechItems(fullSession).map((item) => ({
              ...item,
              sessionId: fullSession.id,
              sessionTitle: fullSession.threadName || "Untitled Session",
            }));

            const combined = [...list];
            allSessionItems.forEach((item) => {
              const exists = combined.some(
                (existing) =>
                  existing.sessionId === session.id &&
                  existing.turnIndex === item.turnIndex &&
                  existing.blockIndex === item.blockIndex
              );
              if (!exists) {
                combined.push(item);
              }
            });

            const sortedList = updateAndSortSentences(combined);
            const playIndex = sortedList.findIndex((item) => item.sessionId === session.id);
            if (playIndex !== -1) {
              setCurrentSentenceIndex(playIndex);
              playCurrent();
            }
          }
        } catch (err) {
          console.error("Failed to load session for play start:", err);
        }
      } else {
        if (!isPlaying()) {
          const firstSessionItemIdx = list.findIndex((item) => item.sessionId === session.id);
          if (firstSessionItemIdx !== -1) {
            setCurrentSentenceIndex(firstSessionItemIdx);
            playCurrent();
          }
        } else {
          togglePlayPause();
        }
      }
      return;
    }

    togglePlayPause();
  };

  const next = () => {
    const list = sentences();
    const nextIdx = currentSentenceIndex() + 1;
    if (nextIdx < list.length) {
      setCurrentSentenceIndex(nextIdx);
      playCurrent();
    } else {
      stop();
    }
  };

  const prev = () => {
    const elapsed = performance.now() - currentSentenceStartTime;
    if (elapsed > 2000) {
      playCurrent();
    } else {
      const prevIdx = currentSentenceIndex() - 1;
      if (prevIdx >= 0) {
        setCurrentSentenceIndex(prevIdx);
        playCurrent();
      } else {
        playCurrent();
      }
    }
  };

  const isReadAloudActive = (sessionId: string) => {
    return activeReadAloudSessionIds().has(sessionId);
  };

  const toggleReadAloud = async (
    sessionId: string,
    session?: { sourceId: string; filePath: string }
  ) => {
    const current = new Set(activeReadAloudSessionIds());
    if (current.has(sessionId)) {
      current.delete(sessionId);
      setActiveReadAloudSessionIds(current);
      readAloudSessionStates.delete(sessionId);
    } else {
      current.add(sessionId);
      setActiveReadAloudSessionIds(current);

      let initialCount = 0;
      if (session) {
        try {
          const fullSession = await invoke<Session | null>("get_session", {
            sourceId: session.sourceId,
            filePath: session.filePath,
          });
          if (fullSession) {
            initialCount = extractSpeechItems(fullSession).length;
          }
        } catch (e) {
          console.error("Failed to load session for read aloud count initialization", e);
        }
      }
      readAloudSessionStates.set(sessionId, { lastSentenceCount: initialCount });
    }
  };

  const handleReadAloudSessionUpdate = (session: Session) => {
    const state = readAloudSessionStates.get(session.id);
    if (!state) return;

    const allItems = extractSpeechItems(session);
    if (allItems.length > state.lastSentenceCount) {
      const newItems = allItems.slice(state.lastSentenceCount);
      const currentList = sentences();

      const combined = [...currentList];
      newItems.forEach((item) => {
        const exists = combined.some(
          (existing) =>
            existing.sessionId === session.id &&
            existing.turnIndex === item.turnIndex &&
            existing.blockIndex === item.blockIndex
        );
        if (exists) return;

        combined.push({
          globalIndex: 0,
          turnIndex: item.turnIndex,
          blockIndex: item.blockIndex,
          text: item.text,
          timestamp: item.timestamp,
          sessionId: session.id,
          sessionTitle: session.threadName || "Untitled Session",
        });
      });

      const wasPlaying = isPlaying();
      const sortedList = updateAndSortSentences(combined);
      readAloudSessionStates.set(session.id, { lastSentenceCount: allItems.length });

      // If nothing was playing, start from the first of the newly added items
      if (!wasPlaying && newItems.length > 0) {
        const firstNewItem = newItems[0]!;
        const newStartIdx = sortedList.findIndex(
          (item) =>
            item.text === firstNewItem.text &&
            item.sessionId === session.id &&
            item.turnIndex === firstNewItem.turnIndex &&
            item.timestamp === firstNewItem.timestamp
        );
        if (newStartIdx !== -1) {
          setCurrentSentenceIndex(newStartIdx);
          playCurrent();
        }
      }
    }
  };

  const removeSentence = (index: number) => {
    const list = sentences();
    const targetIdx = list.findIndex((s) => s.globalIndex === index);
    if (targetIdx === -1) return;

    // If removing the active sentence, skip or stop
    if (currentSentenceIndex() === index) {
      if (list.length <= 1) {
        stop();
      } else {
        next();
      }
    }

    const updated = list.filter((s) => s.globalIndex !== index);

    // Re-index the remaining sentences so indices remain contiguous 0..N-1
    const reindexed = updated.map((item, idx) => ({
      ...item,
      globalIndex: idx,
    }));

    // Re-align currentSentenceIndex if necessary
    const currIdx = currentSentenceIndex();
    if (currIdx > index) {
      setCurrentSentenceIndex(currIdx - 1);
    } else if (currIdx === index) {
      if (reindexed.length === 0) {
        setCurrentSentenceIndex(-1);
      } else {
        const newActiveIdx = Math.min(targetIdx, reindexed.length - 1);
        setCurrentSentenceIndex(newActiveIdx);
      }
    }

    setSentences(reindexed);
  };

  const playFromHere = async (
    sessionId: string,
    turnIndex: number,
    clickedText: string,
    session: { sourceId: string; filePath: string }
  ) => {
    try {
      // 1. Fetch full session to get all turns/blocks
      const fullSession = await invoke<Session | null>("get_session", {
        sourceId: session.sourceId,
        filePath: session.filePath,
      });
      if (!fullSession) return;

      // 2. Extract speech items for the entire session
      const allSessionItems = extractSpeechItems(fullSession).map((item) => ({
        ...item,
        sessionId: fullSession.id,
        sessionTitle: fullSession.threadName || "Untitled Session",
      }));

      // 3. Find the starting item by matching turnIndex and clickedText
      const cleanClicked = clickedText.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      let startIdx = -1;
      if (cleanClicked) {
        startIdx = allSessionItems.findIndex((item) => {
          if (item.turnIndex !== turnIndex) return false;
          const cleanItemText = item.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
          return cleanItemText.includes(cleanClicked) || cleanClicked.includes(cleanItemText);
        });
      }

      // Fallback to first item of the turn if text match fails
      if (startIdx === -1) {
        startIdx = allSessionItems.findIndex((item) => item.turnIndex === turnIndex);
      }

      if (startIdx === -1) return; // No matching turn or block found

      // 4. Get the slice of items from the starting point to the end of the session
      const itemsToInsert = allSessionItems.slice(startIdx);

      // 5. Merge items into the current sentences playlist
      const currentList = sentences();
      const combined = [...currentList];

      itemsToInsert.forEach((item) => {
        const exists = combined.some(
          (existing) =>
            existing.sessionId === sessionId &&
            existing.turnIndex === item.turnIndex &&
            existing.blockIndex === item.blockIndex
        );
        if (!exists) {
          combined.push(item);
        }
      });

      // 6. Sort and update the playlist
      const sortedList = updateAndSortSentences(combined);

      // 7. Find the new index of the first item to start speaking
      const firstItem = itemsToInsert[0]!;
      const playIndex = sortedList.findIndex(
        (item) =>
          item.sessionId === sessionId &&
          item.turnIndex === firstItem.turnIndex &&
          item.blockIndex === firstItem.blockIndex
      );

      if (playIndex !== -1) {
        // Enable read aloud state for this session if not active
        if (!isReadAloudActive(sessionId)) {
          toggleReadAloud(sessionId, {
            sourceId: session.sourceId,
            filePath: session.filePath,
          });
        }

        // Jump and play
        setCurrentSentenceIndex(playIndex);
        playCurrent();
      }
    } catch (err) {
      console.error("Failed to play from here:", err);
    }
  };

  const goToIndex = (index: number) => {
    const list = sentences();
    if (index >= 0 && index < list.length) {
      setCurrentSentenceIndex(index);
      playCurrent();
    }
  };

  const clearReadAloudHistory = () => {
    stop();
    setSentences([]);
    setCurrentSentenceIndex(-1);
  };

  const speakDirectText = async (rawText: string): Promise<void> => {
    stop();
    const taskId = activePlayTaskId;
    const text = applyPronunciations(rawText);
    const provider = localStorage.getItem("codeoba-tts-provider") || "system";

    if (provider === "offline-kokoro") {
      const savedVoiceName = localStorage.getItem("codeoba-tts-voice") || DEFAULT_KOKORO_VOICE;
      try {
        const base64Data = await invoke<string>("generate_offline_speech", {
          text,
          voice: savedVoiceName,
        });

        // Guard: check if we were cancelled while synthesizing
        if (taskId !== activePlayTaskId) {
          return;
        }

        const audio = getSharedAudio();
        if (!audio) return;

        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.src = `data:audio/wav;base64,${base64Data}`;

        const savedRate = localStorage.getItem("codeoba-tts-rate");
        if (savedRate) {
          audio.playbackRate = parseFloat(savedRate);
        }

        setIsPlaying(true);
        setIsPaused(false);

        return new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            stop();
            resolve();
          };
          audio.onerror = () => {
            stop();
            reject(new Error("Audio playback failed"));
          };
          audio.play().catch((err) => {
            stop();
            reject(err);
          });
        });
      } catch (err) {
        stop();
        throw err;
      }
    } else {
      if (!window.speechSynthesis) {
        throw new Error("Web Speech API not supported");
      }

      const utterance = new SpeechSynthesisUtterance(text);
      const savedVoiceName = localStorage.getItem("codeoba-tts-voice");
      let voiceAssigned = false;
      if (savedVoiceName) {
        const voices = window.speechSynthesis.getVoices();
        const matchedVoice = voices.find((v) => v.name === savedVoiceName);
        if (matchedVoice) {
          utterance.voice = matchedVoice;
          utterance.lang = matchedVoice.lang;
          voiceAssigned = true;
        }
      }

      if (!voiceAssigned) {
        utterance.lang = currentLanguage;
      }

      const savedRate = localStorage.getItem("codeoba-tts-rate");
      if (savedRate) {
        utterance.rate = parseFloat(savedRate);
      }
      const savedPitch = localStorage.getItem("codeoba-tts-pitch");
      if (savedPitch) {
        utterance.pitch = parseFloat(savedPitch);
      }

      setIsPlaying(true);
      setIsPaused(false);

      return new Promise<void>((resolve, reject) => {
        utterance.onend = () => {
          stop();
          resolve();
        };
        utterance.onerror = (e) => {
          stop();
          reject(e);
        };

        activeUtterance = utterance;
        window.speechSynthesis.speak(utterance);
      });
    }
  };

  const setLanguage = (lang: string) => {
    if (currentLanguage !== lang) {
      currentLanguage = lang;
      staticSessionLabelCache = null;
      cachedLanguageForLabel = lang;

      const provider = localStorage.getItem("codeoba-tts-provider") || "system";
      if (provider === "offline-kokoro") {
        const savedVoiceName = localStorage.getItem("codeoba-tts-voice") || DEFAULT_KOKORO_VOICE;
        const labelText = t("readAloud.sessionLabel");
        const processedLabel = applyPronunciations(labelText);

        invoke<string>("generate_offline_speech", {
          text: processedLabel,
          voice: savedVoiceName,
        })
          .then((base64Data) => {
            staticSessionLabelCache = base64Data;
          })
          .catch((err) => {
            console.warn("[TTS Language Change] Failed to pre-cache session label:", err);
          });
      }
    }
  };

  const controller: SpeechController = {
    play,
    stop,
    next,
    prev,
    isPlaying,
    isPaused,
  };
  activeSpeechController = controller;

  createEffect(() => {
    const list = sentences();
    if (list.length > 0) {
      const provider = localStorage.getItem("codeoba-tts-provider") || "system";
      const savedVoiceName = localStorage.getItem("codeoba-tts-voice") || DEFAULT_KOKORO_VOICE;
      if (provider === "offline-kokoro") {
        const idx = currentSentenceIndex();
        const targetIdx = idx >= 0 ? idx : 0;
        if (targetIdx < list.length) {
          const item = list[targetIdx]!;
          const currentSessionId = item.sessionId || null;
          if (currentSessionId !== lastSpokenSessionId && item.sessionTitle) {
            const label = t("readAloud.sessionLabel");
            triggerPrefetch(applyPronunciations(label), savedVoiceName);
            triggerPrefetch(applyPronunciations(item.sessionTitle), savedVoiceName);
          } else {
            const processedText = applyPronunciations(item.text);
            triggerPrefetch(processedText, savedVoiceName);
          }
        }
      }
    }
  });

  // Pre-initialize the offline TTS engine and pre-cache the static "Session" label on start
  createEffect(() => {
    const provider = localStorage.getItem("codeoba-tts-provider") || "system";
    if (provider === "offline-kokoro") {
      const savedVoiceName = localStorage.getItem("codeoba-tts-voice") || DEFAULT_KOKORO_VOICE;
      if (cachedVoiceForLabel !== savedVoiceName) {
        staticSessionLabelCache = null;
        cachedVoiceForLabel = savedVoiceName;
      }

      invoke("prewarm_offline_speech")
        .then(() => {
          if (!staticSessionLabelCache) {
            const labelText = t("readAloud.sessionLabel");
            const processedLabel = applyPronunciations(labelText);
            cachedLanguageForLabel = currentLanguage;
            return getOfflineSpeech(processedLabel, savedVoiceName);
          }
        })
        .then((base64Data) => {
          if (base64Data) {
            staticSessionLabelCache = base64Data;
          }
        })
        .catch((err) => {
          console.warn("[TTS Prewarm] Eager initialization failed:", err);
        });
    }
  });

  return {
    isPlaying,
    isPaused,
    isPreparingSpeech,
    currentSentenceIndex,
    activeTurnIndex,
    activeSessionId,
    sentences,
    pastHistory,
    futureHistory,
    play,
    stop,
    next,
    prev,
    isReadAloudActive,
    toggleReadAloud,
    handleReadAloudSessionUpdate,
    playFromHere,
    goToIndex,
    clearReadAloudHistory,
    speakDirectText,
    removeSentence,
    setLanguage,
  };
}

// Listen to OS-level media keys
if (typeof window !== "undefined") {
  listen<string>("system-media-action", (event) => {
    const action = event.payload;
    console.log("[TTS] system-media-action received event payload:", action);
    if (!activeSpeechController) {
      console.warn("[TTS] system-media-action received but no active speech controller registered");
      return;
    }
    if (action === "Toggle") {
      activeSpeechController.play();
    } else if (action === "Play") {
      if (activeSpeechController.isPaused() || !activeSpeechController.isPlaying()) {
        activeSpeechController.play();
      }
    } else if (action === "Pause") {
      if (activeSpeechController.isPlaying() && !activeSpeechController.isPaused()) {
        activeSpeechController.play();
      }
    } else if (action === "Next") {
      activeSpeechController.next();
    } else if (action === "Previous") {
      activeSpeechController.prev();
    } else if (action === "Stop") {
      activeSpeechController.stop();
    }
  }).catch((err) => {
    console.error("Failed to register system-media-action listener:", err);
  });
}
