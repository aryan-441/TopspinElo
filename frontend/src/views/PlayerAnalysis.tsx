import { useState } from 'react';
import type { Workspace, Match } from '../types';

type Rate = { won: number; total: number };
export function PlayerAnalysis({workspace}: {workspace: Workspace}) {
  const [player,setPlayer] = useState(workspace.players[0]?.id ?? '');
  const [filters,setFilters] = useState<Record<string,string>>({});
  const [from,setFrom] = useState('');
  const [until,setUntil] = useState('');
  const [compare,setCompare]=useState('');
  const [serviceFilter,setServiceFilter]=useState('All');
  const [situation,setSituation]=useState('All');
  const [detail,setDetail] = useState(false);
  const singles = workspace.matches.filter(m => m.status === 'Completed' && m.winnerId &&
    [m.playerOneId,m.playerTwoId].includes(player) && !m.teamTieId &&
    (m.sideOnePlayerIds?.length ?? 1) === 1 && (m.sideTwoPlayerIds?.length ?? 1) === 1);
  const opponent = (m: Match) => workspace.players.find(p => p.id === (m.playerOneId === player ? m.playerTwoId : m.playerOneId));
  const facets = (m: Match): Record<string,string> => {
    const p = opponent(m);
    const t = workspace.tournaments.find(t => t.id === m.tournamentId);
    const ownRating=m.startRatings?.[player], otherRating=p && m.startRatings?.[p.id];
    const Level=ownRating==null || otherRating==null ? '' : otherRating>ownRating ? 'Higher rated' : otherRating<ownRating ? 'Lower rated' : 'Equal rating';
    return {Level,Opponent:p?.name ?? '', Hand:p?.hand ?? '', Grip:p?.grip ?? '', Style:p?.style ?? '', Tournament:t?.name ?? 'Club match', Stage:t?.categories.find(c => c.id === m.categoryId)?.format ?? '', Format:m.format, Outcome:m.winnerId === player ? 'Win' : 'Loss'};
  };
  const date = (m: Match) => (m.completedAt ?? m.events.find(e => e.recordedAt)?.recordedAt)?.slice(0,10) ?? '';
  const matches = singles.filter(m => Object.entries(filters).every(([k,v]) => !v || facets(m)[k] === v) && (!from || date(m) >= from) && (!until || (!!date(m) && date(m) <= until)));
  const rates: Record<string, Rate> = {};
  function count(name:string, won:boolean) {
    const row = rates[name] ??= {won:0,total:0};
    row.total++; if(won) row.won++;
  }
  const trend: boolean[] = [];
  const pressure=new Map<string,Rate>();
  let bestComeback = 0, largestMargin = 0;
  for(const m of matches) {
    const first = player === m.playerOneId;
    const won = m.winnerId === player;
    count('Matches won',won);
    const opponentId = first ? m.playerTwoId : m.playerOneId;
    const target = m.pointsPerGame;
    let ownGames=0, otherGames=0;
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
      if(events.length === own+other) {
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
      if(gameWon) {ownGames++;largestMargin=Math.max(largestMargin,own-other)} else otherGames++;
    });
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
  const instant=(m:Match)=>m.completedAt ?? m.events.find(e=>e.recordedAt)?.recordedAt ?? '';
  const dated=matches.filter(m=>date(m)).sort((a,b)=>instant(a).localeCompare(instant(b)));
  dated.forEach(m=>trend.push(m.winnerId===player));
  const labels=['Matches won','Games won','Recorded points won','Serving','Receiving','Deuce games won','Deuce points won','Deciding games won','Game points converted','Game points saved','Match points converted','Match points saved','Deciding deuce games won','Games won after trailing by 3+','Games lost after leading by 3+','Serving at deuce','Receiving at deuce','Points at 9–9','Points at 10–10'];
  const [breakdown,setBreakdown]=useState('Hand');
  const sections=new Map<string,Rate>();
  const partners=new Map<string,Rate>();
  for(const m of matches){
    const key=facets(m)[breakdown] || 'Unspecified';
    const row=sections.get(key) ?? {won:0,total:0}; row.total++;row.won+=Number(m.winnerId===player);sections.set(key,row);
  }
  for(const m of workspace.matches){
    if(m.status!=='Completed'||!m.winnerId) continue;
    const side=[m.sideOnePlayerIds,m.sideTwoPlayerIds].find(ids=>ids?.length===2 && ids.includes(player));
    const partner=side?.find(id=>id!==player); if(!partner) continue;
    const row=partners.get(partner) ?? {won:0,total:0};
    row.total++; row.won+=Number(m.winnerId===(side===m.sideOnePlayerIds ? m.sideOneId??m.playerOneId : m.sideTwoId??m.playerTwoId)); partners.set(partner,row);
  }
  let streak=0, longestWin=0, longestLoss=0;
  const trendRows=dated.map((m,i)=>{
    const win=m.winnerId===player;
    streak=win?Math.max(0,streak)+1:Math.min(0,streak)-1;longestWin=Math.max(streak,longestWin);longestLoss=Math.max(-streak,longestLoss);
    const events=m.events.filter(e=>e.kind==='Point'||e.kind==='Fault');
    const percent=(items:typeof events)=>items.length?Math.round(100*items.filter(e=>e.winnerId===player).length/items.length):null;
    return {m,winRate:Math.round(trend.slice(0,i+1).filter(Boolean).length*100/(i+1)),points:percent(events),serve:percent(events.filter(e=>e.serverId===player)),receive:percent(events.filter(e=>e.serverId && e.serverId!==player)),deuce:percent(events.filter(e=>{const [a,b]=e.score.split('–').map(Number);return Math.min(a-Number(e.winnerId===m.playerOneId),b-Number(e.winnerId===m.playerTwoId))>=m.pointsPerGame-1})),rating:m.startRatings?.[player]};
  });
  const margins=matches.flatMap(m=>(m.gameResults??[]).map(g=>m.playerOneId===player?g.one-g.two:g.two-g.one));
  const mean=margins.reduce((a,b)=>a+b,0)/Math.max(1,margins.length);
  const deviation=margins.length>1?Math.sqrt(margins.reduce((a,b)=>a+(b-mean)**2,0)/margins.length):null;
  const compareIds=[player,compare].filter(Boolean);
  const closest=matches.filter(m=>m.gameResults?.length && m.gameResults.length===Object.values(m.gamesWon).reduce((a,b)=>a+b,0)).map(m=>({m,margin:Math.abs(m.gameResults!.reduce((n,g)=>n+g.one-g.two,0))})).sort((a,b)=>a.margin-b.margin);
  return <section className="stats-section analysis"><p className="eyebrow">PLAYER ANALYSIS · SINGLES</p><h3>Where are points won?</h3><div className="analysis-filters"><label>Player<select value={player} onChange={e=>{setPlayer(e.target.value);setFilters({});setCompare('')}}>{workspace.players.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
  {['Opponent','Level','Hand','Grip','Style','Tournament','Stage','Format','Outcome'].map(k=><label key={k}>{k}<select value={filters[k]||''} onChange={e=>setFilters({...filters,[k]:e.target.value})}><option value="">All</option>{[...new Set(singles.map(m=>facets(m)[k]).filter(Boolean))].sort().map(v=><option key={v}>{v}</option>)}</select></label>)}<label>From (UTC)<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Through (UTC)<input type="date" value={until} onChange={e=>setUntil(e.target.value)}/></label></div>
  <p>{matches.length} completed singles matches. Opponent filters use current profile details. Date filters include matches with dated points.</p><details><summary>Point sample filters</summary><p>These apply to point win rates and the score heatmap. Match and game records use the full selected matches.</p><label>Service <select value={serviceFilter} onChange={e=>setServiceFilter(e.target.value)}>{['All','Serve','Receive'].map(x=><option key={x}>{x}</option>)}</select></label> <label>Score <select value={situation} onChange={e=>setSituation(e.target.value)}>{['All','Deuce','Before deuce'].map(x=><option key={x}>{x}</option>)}</select></label></details><div className="metric-board">{labels.map(label=>{const r=rates[label];return <div key={label}><small>{label}</small><strong>{r?Math.round(100*r.won/r.total)+'%':'—'}</strong><span>{r?r.won+' of '+r.total:'No recorded sample'}</span>{r&&<meter value={r.won} max={r.total}/>}</div>})}</div>
  <h4>Win rate by <select aria-label="Compare results by" value={breakdown} onChange={e=>setBreakdown(e.target.value)}>{['Hand','Grip','Style','Opponent','Level','Tournament','Stage','Format'].map(v=><option key={v}>{v}</option>)}</select></h4><div className="metric-board">{[...sections].map(([key,r])=><div key={key}><b>{key}</b><meter value={r.won} max={r.total}/><span>{r.won} wins in {r.total} matches</span></div>)}</div>
  <h4>Points by score situation</h4><div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>Your score</th>{['Behind','Level','Ahead'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{['Early game','Closing points','Game point territory'].map(stage=><tr key={stage}><th>{stage}</th>{['Behind','Level','Ahead'].map(state=>{const row=pressure.get(stage+' / '+state);return <td key={state} style={{background:row?'rgba(55,156,166,'+(0.08+0.45*row.won/row.total)+')':undefined}}>{row?Math.round(100*row.won/row.total)+'% ('+row.won+'/'+row.total+')':'—'}</td>})}</tr>)}</tbody></table></div>
  <h4>Training notes</h4>{rates.Serving?.total>=20 && rates.Receiving?.total>=20 ? <p>You won {rates.Serving.won} of {rates.Serving.total} points on serve and {rates.Receiving.won} of {rates.Receiving.total} on receive. Review the {rates.Serving.won/rates.Serving.total < rates.Receiving.won/rates.Receiving.total?'serve':'receive'} points in the match logs with your coach.</p>:<p>Record at least 20 service points and 20 receiving points in this selection to compare the two.</p>}
  <h4>Performance over time</h4>{trendRows.length>0 && <svg viewBox="0 0 410 112" role="img" aria-label="Cumulative match win rate from zero to 100 percent" style={{width:'100%',maxHeight:160,background:'var(--pine-soft)'}}><polyline fill="none" stroke="var(--pine)" strokeWidth="3" points={trendRows.map((r,i)=>(5+i*400/Math.max(1,trendRows.length-1))+','+(105-r.winRate)).join(' ')}/>{trendRows.map((r,i)=><circle key={r.m.id} cx={5+i*400/Math.max(1,trendRows.length-1)} cy={105-r.winRate} r={3} fill="var(--orange)"><title>{date(r.m)} · {r.winRate}% wins</title></circle>)}</svg>}
  <details><summary>Trend data and rating history</summary><div style={{overflowX:'auto'}}><table className="data-table"><thead><tr>{['Date','Win rate','Points won','Serve','Receive','Deuce','Starting rating'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{trendRows.map(r=><tr key={r.m.id}><td>{date(r.m)}</td>{[r.winRate,r.points,r.serve,r.receive,r.deuce].map((v,i)=><td key={i}>{v==null?'—':v+'%'}</td>)}<td>{r.rating??'—'}</td></tr>)}</tbody></table></div></details>
  <p>Longest dated streaks · {longestWin} wins · {longestLoss} losses.</p>
  {closest[0]&&<p>Closest on total points: vs {opponent(closest[0].m)?.name}, a margin of {closest[0].margin}.</p>}
  <p>Game margin consistency · {deviation===null?'At least two scored games needed':deviation.toFixed(1)+' points standard deviation across '+margins.length+' games'}. Smaller values mean more similar game margins.</p>
  <details><summary>Compare two players · career singles</summary><select aria-label="Comparison player" value={compare} onChange={e=>setCompare(e.target.value)}><option value="">Select another player</option>{workspace.players.filter(p=>p.id!==player).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{compareIds.map(id=>{const p=workspace.players.find(p=>p.id===id);const rows=workspace.matches.filter(m=>m.status==='Completed'&&m.winnerId&&!m.teamTieId&&(m.sideOnePlayerIds?.length??1)===1&&(m.sideTwoPlayerIds?.length??1)===1&&[m.playerOneId,m.playerTwoId].includes(id));return <p key={id}>{p?.name} · {rows.filter(m=>m.winnerId===id).length} wins from {rows.length} matches · rating {p?.rating}</p>})}</details>
  <details><summary>Doubles partnerships · all recorded doubles</summary>{partners.size?[...partners].map(([id,row])=><p key={id}>{workspace.players.find(p=>p.id===id)?.name} · {row.won} wins in {row.total} matches</p>):<p>No completed doubles matches with recorded lineups.</p>}</details>
  <h4>Recent results in order</h4><p>{trend.length?trend.slice(-20).map(w=>w?'W':'L').join(' · '):'No dated results in this selection.'}</p>
  <p>Largest recorded winning game margin: {largestMargin || '—'} points. Largest verified comeback: {bestComeback || '—'} points behind.</p>
  <button className="button button-outline" onClick={()=>setDetail(!detail)}>{detail?'Hide':'Show'} match history</button>{detail&&matches.map(m=><p key={m.id}>{date(m)||'Date unavailable'} · vs {opponent(m)?.name} · {m.winnerId===player?'Won':'Lost'} · {m.tournamentName||'Club match'}</p>)}</section>
}
