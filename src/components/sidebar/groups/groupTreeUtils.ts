import { Session, GroupTask, ConversationGroup } from "../../../types";

export type { GroupTask, ConversationGroup };

export interface GroupTreeNode {
  segment: string;
  fullName: string;
  children: GroupTreeNode[];
  isPinned: boolean;
  directSessionCount: number;
  recursiveSessionCount: number;
  directActiveCount: number;
  directArchivedCount: number;
  directDeletedCount: number;
  recursiveActiveCount: number;
  recursiveArchivedCount: number;
  recursiveDeletedCount: number;
  containsPinnedSessions: boolean;
}

export function buildGroupTree(
  groups: ConversationGroup[],
  pinnedSessionIds: Set<string>,
  sessions: Session[]
): GroupTreeNode[] {
  const rootNodes: GroupTreeNode[] = [];
  const sessionsMap = new Map<string, Session>();
  for (const s of sessions) {
    sessionsMap.set(s.id, s);
  }

  for (const group of groups) {
    const parts = group.name.split("/");
    let currentLevel = rootNodes;
    let currentFullName = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentFullName = currentFullName === "" ? part : `${currentFullName}/${part}`;

      let node = currentLevel.find((n) => n.segment.toLowerCase() === part.toLowerCase());
      if (!node) {
        node = {
          segment: part,
          fullName: currentFullName,
          children: [],
          isPinned: false,
          directSessionCount: 0,
          recursiveSessionCount: 0,
          directActiveCount: 0,
          directArchivedCount: 0,
          directDeletedCount: 0,
          recursiveActiveCount: 0,
          recursiveArchivedCount: 0,
          recursiveDeletedCount: 0,
          containsPinnedSessions: false,
        };
        currentLevel.push(node);
      } else {
        currentFullName = node.fullName;
      }

      if (i === parts.length - 1) {
        node.isPinned = group.isPinned;
        let directActive = 0;
        let directArchived = 0;
        let directDeleted = 0;
        if (group.sessionIds) {
          for (const id of group.sessionIds) {
            const session = sessionsMap.get(id);
            if (session) {
              if (session.isDeleted) {
                directDeleted++;
              } else if (session.isArchived) {
                directArchived++;
              } else {
                directActive++;
              }
            }
          }
        }
        node.directActiveCount = directActive;
        node.directArchivedCount = directArchived;
        node.directDeletedCount = directDeleted;
        node.directSessionCount = directActive + directArchived + directDeleted;
        node.containsPinnedSessions = (group.sessionIds || []).some((id) =>
          pinnedSessionIds.has(id)
        );
      }
      currentLevel = node.children;
    }
  }

  function finalizeNode(node: GroupTreeNode): [number, number, number, number, boolean] {
    let childSessionsCount = 0;
    let childActiveCount = 0;
    let childArchivedCount = 0;
    let childDeletedCount = 0;
    let childHasPinnedSessions = false;

    for (const child of node.children) {
      const [cCount, cActive, cArchived, cDeleted, cPinned] = finalizeNode(child);
      childSessionsCount += cCount;
      childActiveCount += cActive;
      childArchivedCount += cArchived;
      childDeletedCount += cDeleted;
      if (cPinned) {
        childHasPinnedSessions = true;
      }
    }

    node.recursiveSessionCount = node.directSessionCount + childSessionsCount;
    node.recursiveActiveCount = node.directActiveCount + childActiveCount;
    node.recursiveArchivedCount = node.directArchivedCount + childArchivedCount;
    node.recursiveDeletedCount = node.directDeletedCount + childDeletedCount;
    node.containsPinnedSessions = node.containsPinnedSessions || childHasPinnedSessions;

    node.children.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.segment.toLowerCase().localeCompare(b.segment.toLowerCase());
    });

    return [
      node.recursiveSessionCount,
      node.recursiveActiveCount,
      node.recursiveArchivedCount,
      node.recursiveDeletedCount,
      node.containsPinnedSessions,
    ];
  }

  for (const root of rootNodes) {
    finalizeNode(root);
  }

  rootNodes.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return a.segment.toLowerCase().localeCompare(b.segment.toLowerCase());
  });

  return rootNodes;
}
