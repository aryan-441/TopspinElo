import type { CategoryEntry, Match, Player, TeamSystem } from '../types';
import { createTournament, generateCategoryRoundFixtures } from './store';
export { validGameScore } from './tableTennisRules';

export type StandaloneSetup = {
  kind: 'Singles' | 'Doubles' | 'Team'; one: string[]; two: string[];
  oneName: string; twoName: string; teamSystem: TeamSystem;
  gamesToWin: number; pointsPerGame: 11 | 21; goldenPoint: boolean;
  playedOn: string; table: string; includeReferees: boolean; refereeId?: string;
};

export function createStandaloneMatches(input: StandaloneSetup, players: Player[]): Match[] {
  const count = input.kind === 'Singles' ? 1 : input.kind === 'Doubles' || input.teamSystem === 'corbillon' ? 2 : 3;
  const ids = [...input.one, ...input.two];
  if (input.one.length !== count || input.two.length !== count || new Set(ids).size !== count * 2 || ids.some(id => !players.some(p => p.id === id && !p.archivedAt))) throw new Error('Choose a different active player for each place.');
  if (![1,2,3,4,5].includes(input.gamesToWin) || ![11,21].includes(input.pointsPerGame)) throw new Error('Choose a supported match format.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.playedOn) || !Number.isFinite(Date.parse(input.playedOn)) || new Date(input.playedOn+'T12:00:00Z').toISOString().slice(0,10)!==input.playedOn) throw new Error('Choose a valid match date.');
  if (input.kind === 'Team' && (!input.oneName.trim() || !input.twoName.trim())) throw new Error('Give both teams a name.');
  const entry = (side: string[], name: string): CategoryEntry => ({id: input.kind === 'Singles' ? side[0] : crypto.randomUUID(), name: input.kind === 'Team' ? name.trim() : side.map(id => players.find(p => p.id === id)!.name).join(' & '), playerIds: side});
  const entries = [entry(input.one, input.oneName),entry(input.two,input.twoName)];
  const category = {id:crypto.randomUUID(),name:input.kind,kind:input.kind,format:'Knockout' as const,entries,teamSystem:input.teamSystem};
  // Reuse the same participant and team-rubber construction without saving a tournament or draw.
  const context = createTournament({name:'Standalone match',format:'Knockout',date:input.playedOn,venue:'',entrantIds:ids,categories:[category],tableCount:1});
  return generateCategoryRoundFixtures(context,category,entries.map(e=>e.id),1,players).map((m,i)=>({...m,tournamentId:undefined,tournamentName:undefined,categoryId:undefined,bracketOrder:undefined,round:input.kind === 'Team' ? `${m.sideOneTeamName} vs ${m.sideTwoTeamName} · Match ${i+1}` : 'Standalone match',standaloneTeamSystem:input.kind === 'Team'?input.teamSystem:undefined,doublesNominationPending:false,format:`Best of ${input.gamesToWin*2-1}`,gamesToWin:input.gamesToWin,pointsPerGame:input.pointsPerGame,goldenPoint:input.goldenPoint,playedOn:input.playedOn,startsAt:input.playedOn,table:input.table.trim()||undefined,includeReferees:input.includeReferees,refereeId:input.includeReferees?input.refereeId:undefined}));
}
