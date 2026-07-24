import { createSignal, onMount } from "solid-js";

export const useSearchHistory = (onSearchChange: (query: string) => void) => {
  const [searchHistory, setSearchHistory] = createSignal<string[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = createSignal(false);
  const [activeHistoryIndex, setActiveHistoryIndex] = createSignal<number>(-1);

  let searchBarRef: HTMLDivElement | undefined;
  let dropdownRef: HTMLDivElement | undefined;
  let justFocused = false;
  let lastDeletedQuery: string | null = null;

  onMount(() => {
    try {
      const stored = localStorage.getItem("codeoba-search-history");
      if (stored) {
        setSearchHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load search history", e);
    }
  });

  const saveHistory = (newHistory: string[]) => {
    setSearchHistory(newHistory);
    try {
      localStorage.setItem("codeoba-search-history", JSON.stringify(newHistory));
    } catch (e) {
      console.error("Failed to save search history", e);
    }
  };

  const addSearchToHistory = (query: string) => {
    const q = query.trim();
    if (!q) return;
    const current = searchHistory();
    const filtered = current.filter((item) => item !== q);
    const updated = [q, ...filtered].slice(0, 100);
    saveHistory(updated);
  };

  const removeFromHistory = (e: MouseEvent, itemToRemove: string) => {
    e.stopPropagation();
    lastDeletedQuery = itemToRemove;
    const updated = searchHistory().filter((item) => item !== itemToRemove);
    saveHistory(updated);
    if (updated.length === 0) {
      setShowHistoryDropdown(false);
    }
    if (activeHistoryIndex() >= updated.length) {
      setActiveHistoryIndex(updated.length - 1);
    }
  };

  const clearHistory = () => {
    saveHistory([]);
    setShowHistoryDropdown(false);
  };

  const selectHistoryItem = (item: string) => {
    onSearchChange(item);
    setShowHistoryDropdown(false);
    setActiveHistoryIndex(-1);
  };

  return {
    searchHistory,
    showHistoryDropdown,
    setShowHistoryDropdown,
    activeHistoryIndex,
    setActiveHistoryIndex,
    addSearchToHistory,
    removeFromHistory,
    clearHistory,
    selectHistoryItem,
    setSearchBarRef: (el: HTMLDivElement | undefined) => (searchBarRef = el),
    getSearchBarRef: () => searchBarRef,
    setDropdownRef: (el: HTMLDivElement | undefined) => (dropdownRef = el),
    getDropdownRef: () => dropdownRef,
    setJustFocused: (val: boolean) => (justFocused = val),
    getJustFocused: () => justFocused,
    getLastDeletedQuery: () => lastDeletedQuery,
  };
};
