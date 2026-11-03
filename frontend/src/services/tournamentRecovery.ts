import type { Workspace } from '../types';

export function rewindQualification(workspace: Workspace, tournamentId: string, categoryId: string, reason: string): Workspace {
  if (!reason.trim()) throw new Error('Enter a reason for rewinding qualification.');
  const tournament = workspace.tournaments.find(item => item.id === tournamentId);
  const source = tournament?.categories.find(item => item.id === categoryId && item.groupStage);
  if (!tournament || !source) throw new Error('Choose a group-stage category.');
  const downstream = new Set(tournament.categories.filter(item => item.name === source.name + ' · Knockout').map(item => item.id));
  const removed = new Set(workspace.matches.filter(match => match.tournamentId === tournamentId && downstream.has(match.categoryId ?? '')).map(match => match.id));
  const updated = {
    ...tournament,
    categories: tournament.categories.filter(item => !downstream.has(item.id)).map(item => item.id === source.id ? {...item, groupStage:{...item.groupStage!, advanced:false}} : item),
    matchIds: tournament.matchIds.filter(id => !removed.has(id)),
    progressPaused:true,
    status:'Paused' as const,
    audit:[{id:crypto.randomUUID(), action:'Qualification rewound', target:source.name, reason:reason.trim(), at:new Date().toISOString()},...tournament.audit]
  };
  return {...workspace, matches:workspace.matches.filter(match => !removed.has(match.id)), tournaments:workspace.tournaments.map(item => item.id === tournamentId ? updated : item)};
}
