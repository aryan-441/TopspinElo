import type { TeamSystem } from '../types';

export const teamMatchSequences: Record<TeamSystem, { sides: [number[], number[]][]; doublesAt?: number }> = {
  new_swaythling: { sides: [[[0],[0]],[[1],[1]],[[2],[2]],[[0],[1]],[[1],[0]]] },
  corbillon: { sides: [[[0],[0]],[[1],[1]],[[0,1],[0,1]],[[0],[1]],[[1],[0]]], doublesAt: 2 },
  olympic: { sides: [[[1,2],[1,2]],[[0],[0]],[[2],[2]],[[0],[1]],[[1],[0]]], doublesAt: 0 },
  best_of_7: { sides: [[[0],[0]],[[1],[1]],[[2],[2]],[[0,1],[0,1]],[[0],[1]],[[2],[0]],[[1],[2]]], doublesAt: 3 },
  best_of_9: { sides: [[[0],[0]],[[1],[1]],[[2],[2]],[[1],[0]],[[0],[2]],[[2],[1]],[[1],[2]],[[2],[0]],[[0],[1]]] },
};

export function teamMatchSequence(system: TeamSystem) { return teamMatchSequences[system]; }

export function nextDoublesGameOrder(previousGameOrder: string[]): string[] | null {
  if (previousGameOrder.length !== 4) return null;
  // The pair that received first serves first next game. First server selection is still theirs.
  return [previousGameOrder[1], previousGameOrder[0], previousGameOrder[3], previousGameOrder[2]];
}

export function chooseDoublesFirstServer(nextGameOrder: string[], serverId: string): string[] | null {
  if (nextGameOrder.length !== 4) return null;
  const index = nextGameOrder.indexOf(serverId);
  if (index !== 0 && index !== 2) return null;
  const receiver = index === 0 ? 1 : 3;
  const partnerServer = index === 0 ? 2 : 0;
  const partnerReceiver = index === 0 ? 3 : 1;
  return [nextGameOrder[index], nextGameOrder[receiver], nextGameOrder[partnerServer], nextGameOrder[partnerReceiver]];
}

export function nextDoublesServer(order: string[], currentServer: string): string | null {
  if (order.length !== 4) return null;
  const index = order.indexOf(currentServer);
  return index < 0 ? null : order[(index + 1) % order.length];
}

export function doublesServerAfterPoint(order: string[], currentServer: string, oneScore: number, twoScore: number, pointsPerGame: number): string {
  const deuce = oneScore >= pointsPerGame - 1 && twoScore >= pointsPerGame - 1;
  const interval = deuce ? 1 : pointsPerGame === 11 ? 2 : 5;
  const totalAfterPoint = oneScore + twoScore + 1;
  return totalAfterPoint % interval === 0 ? nextDoublesServer(order, currentServer) ?? currentServer : currentServer;
}
