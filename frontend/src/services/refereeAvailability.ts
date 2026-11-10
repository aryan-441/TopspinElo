import type { Match, Referee, Workspace } from '../types';

export function refereeAvailability(referee: Referee, workspace: Workspace, exceptMatchId?: string) {
  if (!referee.active) return 'Inactive';
  if (referee.unavailableReason) return referee.unavailableReason === 'Marked busy' ? 'Busy · marked unavailable' : 'Away · ' + referee.unavailableReason;
  const live = workspace.matches.find(match => match.id !== exceptMatchId && match.refereeId === referee.id && match.status === 'In progress');
  return live ? 'Busy · ' + (live.table || 'scoring a match') : 'Available';
}

export function matchIncludesReferees(match: Match, workspace: Workspace): boolean {
  return match.tournamentId ? workspace.tournaments.find(t=>t.id===match.tournamentId)?.includeReferees === true : match.includeReferees === true;
}
