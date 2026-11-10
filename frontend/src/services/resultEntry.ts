import { validGameScore } from './tableTennisRules';
import type { Match, Workspace } from '../types';

export function enterResult(match: Match, detail: 'winner' | 'match-score' | 'game-scores', input: string, winnerSide = ''): Match {
  const one = match.sideOneId ?? match.playerOneId;
  const two = match.sideTwoId ?? match.playerTwoId;
  const gamesWon = { [one]: 0, [two]: 0 };
  const gameResults: NonNullable<Match['gameResults']> = [];
  let winnerId = winnerSide;
  const pairs = (detail === 'winner' ? '' : input).trim().split(/[,;\s]+/).filter(Boolean).map(value => {
    const pair = value.match(/^(\d+)[–—-](\d+)$/);
    if (!pair) throw new Error('Enter scores as 11-3 11-7 11-5, or a match score such as 3-0.');
    return [Number(pair[1]), Number(pair[2])];
  });
  if (detail === 'match-score') {
    if (pairs.length !== 1) throw new Error('Enter one overall game score.');
    const [a,b] = pairs[0];
    if (a === b || Math.max(a,b) !== match.gamesToWin || Math.min(a,b) >= match.gamesToWin) throw new Error('The winning side must reach '+match.gamesToWin+' games.');
    gamesWon[one] = a;
    gamesWon[two] = b;
    winnerId = a>b ? one : two;
  }
  if (detail === 'game-scores') {
    if (!pairs.length) throw new Error('Enter the individual game scores.');
    for (const [a,b] of pairs) {
      if (gamesWon[one] === match.gamesToWin || gamesWon[two] === match.gamesToWin) throw new Error('Remove games entered after the match was won.');
      if (!validGameScore(a,b,match.pointsPerGame,match.goldenPoint)) throw new Error(match.goldenPoint ? `Golden-point games finish at ${match.pointsPerGame}; a one-point winning margin is allowed.` : 'Each game must finish at the target with a two-point lead, or two clear after deuce.');
      const winner = a>b ? one : two;
      gamesWon[winner]++;
      gameResults.push({one:a,two:b,winnerId:winner});
    }
    if (Math.max(...Object.values(gamesWon)) !== match.gamesToWin) throw new Error('The game scores do not complete this match.');
    winnerId = gamesWon[one]>gamesWon[two] ? one : two;
  }
  if (![one,two].includes(winnerId)) throw new Error('Choose the winning player or side.');
  return {...match,status:'Completed',winnerId,gamesWon,gameResults,score:{[one]:0,[two]:0},events:[],completedAt:match.completedAt??new Date().toISOString(),resultDetail:detail};
}

/** Replay completed singles in chronological order so corrections never award Elo twice. */
export function replayRatings(workspace: Workspace): Workspace {
  const ratings = new Map(workspace.players.map(player => [player.id,player.ratingBase ?? player.rating]));
  const snapshots = new Map<string, Record<string,number>>();
  const singles = workspace.matches.filter(match => match.status === 'Completed' && match.winnerId && !match.teamTieId && (match.sideOnePlayerIds?.length??1) === 1 && (match.sideTwoPlayerIds?.length??1) === 1);
  singles.sort((a,b)=>(a.completedAt??'').localeCompare(b.completedAt??'')||a.id.localeCompare(b.id));
  for (const match of singles) {
    const a = ratings.get(match.playerOneId), b = ratings.get(match.playerTwoId);
    if (a == null || b == null) continue;
    snapshots.set(match.id,{[match.playerOneId]:a,[match.playerTwoId]:b});
    const expected = 1/(1+10**((b-a)/400));
    const delta = Math.round(32*((match.winnerId===(match.sideOneId??match.playerOneId)?1:0)-expected));
    ratings.set(match.playerOneId,a+delta);
    ratings.set(match.playerTwoId,b-delta);
  }
  return {...workspace,players:workspace.players.map(player=>({...player,ratingBase:player.ratingBase??player.rating,rating:ratings.get(player.id)??player.rating})),
    matches:workspace.matches.map(match=>snapshots.has(match.id)?{...match,startRatings:snapshots.get(match.id)}:match)};
}


export function recordedPointsWon(matches: Match[], playerId: string): number {
  return matches.reduce((total,match)=>{
    const first=(match.sideOnePlayerIds??[match.playerOneId]).includes(playerId);
    const second=(match.sideTwoPlayerIds??[match.playerTwoId]).includes(playerId);
    if (!first && !second) return total;
    if (match.gameResults?.length) return total+match.gameResults.reduce((n,game)=>n+(first?game.one:game.two),0);
    const side=first?match.sideOneId??match.playerOneId:match.sideTwoId??match.playerTwoId;
    return total+match.events.filter(event=>(event.kind==='Point'||event.kind==='Fault')&&event.winnerId===side).length;
  },0);
}
