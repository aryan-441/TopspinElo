import type { Match } from '../types';

export type Rate = { won: number; total: number };
export function completeGameEvents(events: Match['events'], one: number, two: number, match: Match) {
  let previousOne = 0;
  let previousTwo = 0;
  for (const event of [...events].reverse()) {
    const [a,b] = event.score.split('–').map(Number);
    const expectedOne = previousOne + Number(event.winnerId === match.playerOneId);
    const expectedTwo = previousTwo + Number(event.winnerId === match.playerTwoId);
    if (a !== expectedOne || b !== expectedTwo) return false;
    previousOne = a;
    previousTwo = b;
  }
  return previousOne === one && previousTwo === two;
}

export function calculatePlayerMetrics(matches: Match[], player: string, serviceFilter = 'All', situation = 'All') {
  const rates: Record<string, Rate> = {};
  function count(name:string, won:boolean) {
    const row = rates[name] ??= {won:0,total:0};
    row.total++; if(won) row.won++;
  }

  const pressure=new Map<string,Rate>();
  let bestComeback = 0, largestMargin = 0;
  for(const m of matches) {
    const first = player === m.playerOneId;
    const won = m.winnerId === player;
    count('Matches won',won);
    const opponentId = first ? m.playerTwoId : m.playerOneId;
    const target = m.pointsPerGame;
    if (m.resultDetail === 'match-score') {
      rates['Games won'] ??= { won:0,total:0 };
      rates['Games won'].won += m.gamesWon[player] ?? 0;
      rates['Games won'].total += Object.values(m.gamesWon).reduce((sum,n)=>sum+n,0);
    }
    let ownGames=0, otherGames=0;
    let greatestGameDeficit=0;
    (m.gameResults ?? []).forEach((g,index) => {
      const own = first ? g.one : g.two, other = first ? g.two : g.one;
      const gameWon = own > other;
      count('Games won',gameWon);
      const deuce = Math.min(own,other)>=target-1;
      if(deuce) count('Deuce games won',gameWon);
      const deciding = ownGames === m.gamesToWin-1 && otherGames === m.gamesToWin-1;
      if(deciding) count('Deciding games won',gameWon);
      if(deciding && deuce) count('Deciding deuce games won',gameWon);
      const events=m.events.filter(e=>e.game===index+1 && (e.kind==='Point'||e.kind==='Fault'));
      if(completeGameEvents(events, g.one, g.two, m)) {
        let deficit=0, lead=0;
        for(const e of events) {
          const scores=e.score.split('–').map(Number);
          const p= scores[first?0:1], o=scores[first?1:0];
          const pointWon=e.winnerId===player;
          const before=p-Number(pointWon), against=o-Number(!pointWon);
          deficit=Math.max(deficit,against-before); lead=Math.max(lead,before-against);
          if(before>=target-1 && before>against) {
            count('Game points converted',pointWon);
            if(ownGames===m.gamesToWin-1) count('Match points converted',pointWon);
          }
          if(against>=target-1 && against>before) {
            count('Game points saved',pointWon);
            if(otherGames===m.gamesToWin-1) count('Match points saved',pointWon);
          }
        }
        if(deficit>=3) count('Games won after trailing by 3+',gameWon);
        if(lead>=3) count('Games lost after leading by 3+',!gameWon);
        if(gameWon) bestComeback=Math.max(bestComeback,deficit);
      }
      greatestGameDeficit=Math.max(greatestGameDeficit,otherGames-ownGames);
      if(gameWon) {ownGames++;largestMargin=Math.max(largestMargin,own-other)} else otherGames++;
    });
    if(greatestGameDeficit>=1) count('Matches won after trailing in games',won);
    for(const e of m.events.filter(e=>e.kind==='Point'||e.kind==='Fault')) {
      const won=e.winnerId===player;

      const [a,b]=e.score.split('–').map(Number);
      const before=a-Number(e.winnerId===m.playerOneId), against=b-Number(e.winnerId===m.playerTwoId);
      const atDeuce=Math.min(before,against)>=target-1;
      if(serviceFilter==='Serve' && e.serverId!==player || serviceFilter==='Receive' && e.serverId!==opponentId || situation==='Deuce' && !atDeuce || situation==='Before deuce' && atDeuce) continue;
      count('Recorded points won',won);
      const mine=first?before:against, theirs=first?against:before;
      const key=(mine>=target-1?'Game point territory':mine>=target-3?'Closing points':'Early game')+' / '+(mine===theirs?'Level':mine>theirs?'Ahead':'Behind');
      const cell=pressure.get(key)??{won:0,total:0};cell.total++;cell.won+=Number(won);pressure.set(key,cell);
      const deuce=Math.min(before,against)>=target-1;
      if(deuce) count('Deuce points won',won);
      if(before===against && [9,10].includes(before)) count('Points at '+before+'–'+against,won);
      if(e.serverId===player || e.serverId===opponentId) {
        const service=e.serverId===player?'Serving':'Receiving';
        count(service,won); if(deuce) count(service+' at deuce',won);
      }
    }
  }

  return { rates, pressure, bestComeback, largestMargin };
}
