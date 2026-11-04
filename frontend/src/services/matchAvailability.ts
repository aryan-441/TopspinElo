import type { Match, Workspace } from '../types';

/** A fixture can be chosen as soon as both sides and its prerequisite round are known. */
export function matchAvailability(match: Match, workspace: Workspace): { ready: boolean; reason?: string } {
  if (match.status === 'Completed') return { ready: true };
  if (match.status === 'Postponed' || match.status === 'Not played') return { ready: false, reason: 'Change this match’s status before playing it.' };
  const known = new Set(workspace.players.map((player) => player.id));
  if (!known.has(match.playerOneId) || !known.has(match.playerTwoId) || match.playerOneId === match.playerTwoId || [match.sideOneLabel, match.sideTwoLabel].some((label) => label && /^(TBD|to be decided|winner of|\?)\b/i.test(label.trim()))) {
    return { ready: false, reason: 'Waiting for both players to be known.' };
  }
  const tournament = workspace.tournaments.find((item) => item.id === match.tournamentId);
  const category = tournament?.categories.find((item) => item.id === match.categoryId);
  if (category?.format === 'Knockout') {
    const round = Number(match.round?.match(/\bRound\s+(\d+)\b/i)?.[1] ?? 1);
    if (round > 1) {
      const preceding = workspace.matches.filter((item) => item.tournamentId === match.tournamentId && item.categoryId === match.categoryId && Number(item.round?.match(/\bRound\s+(\d+)\b/i)?.[1] ?? 1) === round - 1);
      if (preceding.some((item) => item.status !== 'Completed' && item.status !== 'Not played')) return { ready: false, reason: `Finish Round ${round - 1} before opening this round.` };
    }
  }
  return { ready: true };
}
