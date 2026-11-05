import type { Match, Workspace } from '../types';

export type Partnership = { partnerId: string; matches: Match[]; wins: number; losses: number; gamesWon: number; gamesLost: number; scoredGames: number; pointsWon: number; pointsLost: number; opponents: Map<string, { names: string; wins: number; losses: number }> };

export function doublesPartnerships(workspace: Workspace, playerId: string): Partnership[] {
  const names = new Map(workspace.players.map(player => [player.id, player.name]));
  const partnerships = new Map<string, Partnership>();
  for (const match of workspace.matches) {
    if (match.status !== 'Completed' || !match.winnerId) continue;
    const one = match.sideOnePlayerIds ?? [match.playerOneId], two = match.sideTwoPlayerIds ?? [match.playerTwoId];
    if (one.length !== 2 || two.length !== 2) continue;
    const onOne = one.includes(playerId), onTwo = two.includes(playerId);
    if (onOne === onTwo) continue;
    const own = onOne ? one : two, other = onOne ? two : one;
    const partnerId = own.find(id => id !== playerId);
    if (!partnerId) continue;
    const sideOne = match.sideOneId ?? match.playerOneId, sideTwo = match.sideTwoId ?? match.playerTwoId;
    const ownId = onOne ? sideOne : sideTwo;
    const won = match.winnerId === ownId || own.includes(match.winnerId);
    const record: Partnership = partnerships.get(partnerId) ?? { partnerId, matches: [], wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, scoredGames: 0, pointsWon: 0, pointsLost: 0, opponents: new Map() };
    record.matches.push(match); record.wins += Number(won); record.losses += Number(!won);
    const gameTotal = Object.values(match.gamesWon).reduce((sum, count) => sum + count, 0);
    if (gameTotal > 0) { record.gamesWon += match.gamesWon[ownId] ?? 0; record.gamesLost += match.gamesWon[onOne ? sideTwo : sideOne] ?? 0; }
    else for (const game of match.gameResults ?? []) {
      if (game.winnerId === ownId || own.includes(game.winnerId)) record.gamesWon++;
      else record.gamesLost++;
    }
    for (const game of match.gameResults ?? []) {
      record.scoredGames++;
      if (onOne) { record.pointsWon += game.one; record.pointsLost += game.two; }
      else { record.pointsWon += game.two; record.pointsLost += game.one; }
    }
    const opponentKey = [...other].sort().join('|');
    const opponent = record.opponents.get(opponentKey) ?? { names: other.map(id => names.get(id) ?? 'Unknown player').join(' & '), wins: 0, losses: 0 };
    opponent.wins += Number(won); opponent.losses += Number(!won); record.opponents.set(opponentKey, opponent);
    partnerships.set(partnerId, record);
  }
  return [...partnerships.values()].sort((a, b) => b.matches.length - a.matches.length || b.wins - a.wins);
}
