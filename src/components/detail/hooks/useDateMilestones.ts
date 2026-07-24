import { createMemo, Accessor } from "solid-js";
import { formatDateWithSetting, formatTimeWithSetting } from "../../../utils/format";
import { Session } from "../../../types";

export interface DateMilestone {
  label: string;
  index: number;
  turnId: string;
}

export const useDateMilestones = (
  session: Accessor<Session | null>,
  activeTurnIdx: Accessor<number>,
  dateFormatProp?: Accessor<string | undefined>,
  timeFormatProp?: Accessor<string | undefined>,
  showSecondsProp?: Accessor<boolean | undefined>,
  localeProp?: Accessor<string>
) => {
  const dateMilestones = createMemo(() => {
    const s = session();
    if (!s) return [];
    const milestones: DateMilestone[] = [];
    const turns = s.turns;
    if (turns.length === 0) return [];

    const loc = localeProp ? localeProp() : "en";
    const dateFormat = dateFormatProp ? dateFormatProp() || "system" : "system";
    const timeFormat = timeFormatProp ? timeFormatProp() || "system" : "system";
    const showSeconds = showSecondsProp ? showSecondsProp() || false : false;

    const isDifferentDay = (t1: number, t2: number) => {
      const d1 = new Date(t1);
      const d2 = new Date(t2);
      return (
        d1.getDate() !== d2.getDate() ||
        d1.getMonth() !== d2.getMonth() ||
        d1.getFullYear() !== d2.getFullYear()
      );
    };

    const formatMilestoneLabel = (timeMs: number, forceDate: boolean) => {
      const d = new Date(timeMs);
      if (forceDate) {
        return formatDateWithSetting(d, dateFormat, loc);
      }
      return formatTimeWithSetting(d, timeFormat, showSeconds, loc);
    };

    let firstTime = turns[0].timestamp;
    if (firstTime < 20000000000) firstTime *= 1000;
    let lastTime = turns[turns.length - 1].timestamp;
    if (lastTime < 20000000000) lastTime *= 1000;

    const targetGapMin = 2;

    milestones.push({
      label: formatMilestoneLabel(firstTime, true),
      index: 0,
      turnId: turns[0].turnId,
    });

    let lastMilestoneTime = firstTime;
    let lastMilestoneIndex = 0;

    for (let i = 1; i < turns.length; i++) {
      let turnTime = turns[i].timestamp;
      if (turnTime < 20000000000) turnTime *= 1000;

      const diffMin = (turnTime - lastMilestoneTime) / (1000 * 60);
      const diffDay = isDifferentDay(turnTime, lastMilestoneTime);

      const pct = (i / (turns.length - 1)) * 100;
      const lastPct = (lastMilestoneIndex / (turns.length - 1)) * 100;
      const diffPct = pct - lastPct;

      if (diffDay || (diffMin >= targetGapMin && diffPct >= 5)) {
        milestones.push({
          label: formatMilestoneLabel(turnTime, diffDay),
          index: i,
          turnId: turns[i].turnId,
        });
        lastMilestoneTime = turnTime;
        lastMilestoneIndex = i;
      }
    }

    if (turns.length > 1 && lastMilestoneIndex !== turns.length - 1) {
      const lastIndex = turns.length - 1;
      let lastTurnTime = turns[lastIndex].timestamp;
      if (lastTurnTime < 20000000000) lastTurnTime *= 1000;

      const lastPct = (lastMilestoneIndex / (turns.length - 1)) * 100;
      const diffPct = 100 - lastPct;

      if (diffPct >= 4) {
        milestones.push({
          label: formatMilestoneLabel(
            lastTurnTime,
            isDifferentDay(lastTurnTime, lastMilestoneTime)
          ),
          index: lastIndex,
          turnId: turns[lastIndex].turnId,
        });
      } else {
        const lastM = milestones[milestones.length - 1];
        if (lastM) {
          lastM.label = formatMilestoneLabel(
            lastTurnTime,
            isDifferentDay(lastTurnTime, lastMilestoneTime - 60000)
          );
          lastM.index = lastIndex;
          lastM.turnId = turns[lastIndex].turnId;
        }
      }
    }

    return milestones;
  });

  const activeMilestone = createMemo(() => {
    const milestones = dateMilestones();
    const activeIdx = activeTurnIdx();

    let activeM = milestones[0] || null;
    for (let i = 0; i < milestones.length; i++) {
      if (milestones[i].index <= activeIdx) {
        activeM = milestones[i];
      } else {
        break;
      }
    }
    return activeM;
  });

  return {
    dateMilestones,
    activeMilestone,
  };
};
