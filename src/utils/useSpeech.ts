import { createSignal, createMemo } from "solid-js";
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

// Global active speechSynthesis utterance reference to avoid overlapping playbacks
let activeUtterance: SpeechSynthesisUtterance | null = null;

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

// Split narrative text into logical block-level chunks (newlines and HTML tags)
export function splitIntoLogicalBlocks(text: string): string[] {
  // First, strip multi-line markdown code blocks from the raw narrative texts
  let clean = text.replace(/```[\s\S]*?```/g, "");

  // Second, convert any HTML tags (e.g. <div>, <span>, </p>) to newlines
  clean = clean.replace(/<[^>]+>/g, "\n");

  // Third, split by newlines, trim, and filter out empty blocks
  return clean
    .split(/\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
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
const [activeReadAloudSessionIds, setActiveReadAloudSessionIds] = createSignal<Set<string>>(
  new Set()
);
const readAloudSessionStates = new Map<string, { lastSentenceCount: number }>();

let currentLanguage = "en";
let currentSentenceStartTime = 0;
let lastSpokenSessionId: string | null = null;

interface SpeechController {
  play: (session?: Session, lang?: string) => void;
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
    if (activeUtterance) {
      activeUtterance.onend = null;
      activeUtterance.onerror = null;
      activeUtterance = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    setIsPlaying(false);
    setIsPaused(false);
    setCurrentSentenceIndex(-1);
    lastSpokenSessionId = null;

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

    const currentItem = list[idx]!;
    let textToSpeak = currentItem.text;

    // Check if the session name changes from the last spoken track
    const currentSessionId = currentItem.sessionId || null;
    const sessionChanged = currentSessionId !== lastSpokenSessionId;

    if (sessionChanged) {
      lastSpokenSessionId = currentSessionId;
      if (currentItem.sessionTitle) {
        textToSpeak = t("readAloud.sessionTransition", {
          sessionTitle: currentItem.sessionTitle,
          text: textToSpeak,
        });
      }
    }

    currentSentenceStartTime = performance.now();

    setIsPlaying(true);
    setIsPaused(false);

    invoke("update_playback_metadata", {
      title: currentItem.text,
      artist: currentItem.sessionTitle || "Untitled Session",
      isPlaying: true,
    }).catch((err) => {
      console.error("[TTS] Failed to update playback metadata:", err);
    });

    if (window.speechSynthesis) {
      if (activeUtterance) {
        activeUtterance.onend = null;
        activeUtterance.onerror = null;
        activeUtterance = null;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);

      // Load custom voice settings from localStorage if available
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
        // Map locale
        if (currentLanguage === "zh-TW") {
          utterance.lang = "zh-TW";
        } else if (currentLanguage === "zh") {
          utterance.lang = "zh-CN";
        } else {
          utterance.lang = currentLanguage;
        }
      }

      // Load speed rate and pitch settings from localStorage
      const savedRate = localStorage.getItem("codeoba-tts-rate");
      if (savedRate) {
        utterance.rate = parseFloat(savedRate);
      }
      const savedPitch = localStorage.getItem("codeoba-tts-pitch");
      if (savedPitch) {
        utterance.pitch = parseFloat(savedPitch);
      }

      utterance.onend = () => {
        if (activeUtterance === utterance) {
          next();
        }
      };

      utterance.onerror = (e) => {
        console.error("[TTS] SpeechSynthesis error:", e);
        if (activeUtterance === utterance) {
          next();
        }
      };

      activeUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("[TTS] Web Speech API not supported in this environment");
      next();
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

  const play = (session?: Session, lang: string = "en") => {
    currentLanguage = lang;

    if (session) {
      if (!isReadAloudActive(session.id)) {
        toggleReadAloud(session.id, {
          sourceId: session.sourceId,
          filePath: session.filePath,
        });
      }
      return;
    }

    // Toggle play/pause
    if (isPlaying()) {
      if (isPaused()) {
        setIsPaused(false);
        if (window.speechSynthesis) window.speechSynthesis.resume();
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
        if (window.speechSynthesis) window.speechSynthesis.pause();
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

  const setLanguage = (lang: string) => {
    currentLanguage = lang;
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

  return {
    isPlaying,
    isPaused,
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
