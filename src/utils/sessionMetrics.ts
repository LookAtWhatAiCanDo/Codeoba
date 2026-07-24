import { Session } from "../types";

export const getSessionComputeTimeMs = (session: Session): number => {
  let totalMs = 0;
  for (const turn of session.turns) {
    const extra = turn.extraData;
    const msStr = extra ? extra["computeTimeMs"] : null;
    const ms = msStr ? parseInt(msStr, 10) : null;
    if (ms !== null && !isNaN(ms) && ms > 0) {
      totalMs += Math.min(900000, ms);
    } else if (turn.assistantMessage && turn.assistantMessage.length > 0) {
      const estMs = Math.round((turn.assistantMessage.length / 120.0) * 1000.0);
      totalMs += Math.max(2000, Math.min(60000, estMs));
    }
  }
  return totalMs;
};

export const getSessionTokensCount = (session: Session): number => {
  let total = 0;
  let hasRealTokens = false;
  for (const turn of session.turns) {
    if (
      (turn.inputTokens !== undefined && turn.inputTokens !== null) ||
      (turn.outputTokens !== undefined && turn.outputTokens !== null)
    ) {
      hasRealTokens = true;
      total += (turn.inputTokens || 0) + (turn.outputTokens || 0);
    }
  }
  if (hasRealTokens) return total;

  let charCount = 0;
  for (const turn of session.turns) {
    charCount += (turn.userMessage || "").length + (turn.assistantMessage || "").length;
  }
  return Math.round(charCount / 4);
};

export const formatSpeed = (tokens: number, ms: number): string => {
  if (ms <= 0) return "0.0 t/s";
  const tps = (tokens * 1000.0) / ms;
  return `${tps.toFixed(1)} t/s`;
};

export const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
};

export const getSessionModels = (session: Session): string[] => {
  const models: string[] = [];
  for (const turn of session.turns) {
    const extra = turn.extraData;
    const m = extra ? extra["model"] : null;
    if (m && !models.includes(m)) {
      models.push(m);
    }
  }
  return models;
};
