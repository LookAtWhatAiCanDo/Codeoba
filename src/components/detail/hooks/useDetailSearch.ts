import { createSignal, createMemo, Accessor } from "solid-js";
import { Session } from "../../../types";

export interface SearchMatch {
  turnIndex: number;
  turnId: string;
  text: string;
}

export const useDetailSearch = (
  session: Accessor<Session | null>,
  searchQueryProp?: Accessor<string | undefined>,
  matchCaseProp?: Accessor<boolean | undefined>,
  wholeWordProp?: Accessor<boolean | undefined>,
  useRegexProp?: Accessor<boolean | undefined>
) => {
  const [showDetailSearch, setShowDetailSearch] = createSignal(false);
  const [detailSearchQuery, setDetailSearchQuery] = createSignal("");
  const [detailMatchCase, setDetailMatchCase] = createSignal(false);
  const [detailWholeWord, setDetailWholeWord] = createSignal(false);
  const [detailUseRegex, setDetailUseRegex] = createSignal(false);
  const [activeMatchIndex, setActiveMatchIndex] = createSignal(0);

  const activeSearchQuery = createMemo(() => {
    if (showDetailSearch()) {
      return detailSearchQuery();
    }
    return searchQueryProp ? searchQueryProp() || "" : "";
  });

  const activeMatchCase = createMemo(() => {
    if (showDetailSearch()) {
      return detailMatchCase();
    }
    return matchCaseProp ? matchCaseProp() || false : false;
  });

  const activeWholeWord = createMemo(() => {
    if (showDetailSearch()) {
      return detailWholeWord();
    }
    return wholeWordProp ? wholeWordProp() || false : false;
  });

  const activeUseRegex = createMemo(() => {
    if (showDetailSearch()) {
      return detailUseRegex();
    }
    return useRegexProp ? useRegexProp() || false : false;
  });

  const searchMatches = createMemo(() => {
    const q = detailSearchQuery();
    const s = session();
    if (!s || !q || q.trim() === "") return [];

    const mc = detailMatchCase();
    const ww = detailWholeWord();
    const rx = detailUseRegex();

    let regex: RegExp;
    try {
      const flags = mc ? "g" : "gi";
      let pattern = q;
      if (!rx) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
      if (ww) {
        pattern = `\\b${pattern}\\b`;
      }
      regex = new RegExp(pattern, flags);
    } catch (e) {
      return [];
    }

    const matchesList: SearchMatch[] = [];
    s.turns.forEach((turn, turnIndex) => {
      const turnId = turn.turnId || String(turnIndex);

      // Find all matches in userMessage
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(turn.userMessage)) !== null) {
        if (match[0] === "") {
          regex.lastIndex++;
          continue;
        }
        matchesList.push({
          turnIndex,
          turnId,
          text: match[0],
        });
      }

      // Find all matches in assistantMessage
      regex.lastIndex = 0;
      while ((match = regex.exec(turn.assistantMessage)) !== null) {
        if (match[0] === "") {
          regex.lastIndex++;
          continue;
        }
        matchesList.push({
          turnIndex,
          turnId,
          text: match[0],
        });
      }
    });

    return matchesList;
  });

  const navigateToMatch = (
    index: number,
    scrollContainerRef: HTMLDivElement | undefined,
    setIsJumping: (val: boolean) => void
  ) => {
    const matchesList = searchMatches();
    if (matchesList.length === 0) return;

    let targetIndex = index;
    if (targetIndex >= matchesList.length) {
      targetIndex = 0;
    } else if (targetIndex < 0) {
      targetIndex = matchesList.length - 1;
    }
    setActiveMatchIndex(targetIndex);

    const match = matchesList[targetIndex];

    setIsJumping(true);

    setTimeout(() => {
      const el = document.getElementById(match.turnId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });

        // Correct offset shifts via direct scrollTop setting
        setTimeout(() => {
          if (scrollContainerRef) {
            scrollContainerRef.scrollTop =
              el.offsetTop - scrollContainerRef.clientHeight / 2 + el.offsetHeight / 2;
          }
        }, 250);

        setTimeout(() => {
          setIsJumping(false);
          const allMarks = scrollContainerRef?.querySelectorAll("mark");
          if (allMarks) {
            allMarks.forEach((m) => {
              m.className = "bg-yellow-500/30 text-text-primary rounded px-0.5";
            });

            const turnEl = document.getElementById(match.turnId);
            if (turnEl) {
              const turnMarks = turnEl.querySelectorAll("mark");
              let matchIndexInTurn = 0;
              for (let i = 0; i < targetIndex; i++) {
                if (matchesList[i].turnId === match.turnId) {
                  matchIndexInTurn++;
                }
              }

              const activeMark = turnMarks[matchIndexInTurn];
              if (activeMark) {
                activeMark.className =
                  "bg-accent text-white font-semibold rounded px-0.5 ring-2 ring-accent/50";
                activeMark.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }
          }
        }, 800);
      }
    }, 150);
  };

  return {
    showDetailSearch,
    setShowDetailSearch,
    detailSearchQuery,
    setDetailSearchQuery,
    detailMatchCase,
    setDetailMatchCase,
    detailWholeWord,
    setDetailWholeWord,
    detailUseRegex,
    setDetailUseRegex,
    activeMatchIndex,
    setActiveMatchIndex,
    activeSearchQuery,
    activeMatchCase,
    activeWholeWord,
    activeUseRegex,
    searchMatches,
    navigateToMatch,
  };
};
