import { useState } from 'react';
import type { Workspace, Match } from '../types';

import { calculatePlayerMetrics, type Rate } from '../services/playerMetrics';
export function PlayerAnalysis({workspace,onOpenMatch}: {workspace: Workspace; onOpenMatch?: (id:string)=>void}) {
  const [player,setPlayer] = useState(workspace.players[0]?.id ?? '');
  const [filters,setFilters] = useState<Record<string,string>>({});
  const [from,setFrom] = useState('');
  const [until,setUntil] = useState('');
  const [compare,setCompare]=useState('');
  const [serviceFilter,setServiceFilter]=useState('All');
  const [situation,setSituation]=useState('All');
  const [chartMetric,setChartMetric] = useState<'winRate' | 'points' | 'serve' | 'receive' | 'deuce' | 'rating'>('winRate');
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
  const { rates, pressure, bestComeback, largestMargin } = calculatePlayerMetrics(matches, player, serviceFilter, situation);
  const trend: boolean[] = [];
  const instant=(m:Match)=>m.completedAt ?? m.events.find(e=>e.recordedAt)?.recordedAt ?? '';
  const dated=matches.filter(m=>date(m)).sort((a,b)=>instant(a).localeCompare(instant(b)));
  dated.forEach(m=>trend.push(m.winnerId===player));
  const labels=['Matches won','Matches won after trailing in games','Games won','Recorded points won','Serving','Receiving','Deuce games won','Deuce points won','Deciding games won','Game points converted','Game points saved','Match points converted','Match points saved','Deciding deuce games won','Games won after trailing by 3+','Games lost after leading by 3+','Serving at deuce','Receiving at deuce','Points at 9–9','Points at 10–10'];
  const [breakdown,setBreakdown]=useState('Hand');
  const sections=new Map<string,Rate>();
  for(const m of matches){
    const key=facets(m)[breakdown] || 'Unspecified';
    const row=sections.get(key) ?? {won:0,total:0}; row.total++;row.won+=Number(m.winnerId===player);sections.set(key,row);
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
  <p>{matches.length} completed singles matches. {rates['Matches won'] && rates['Matches won'].total<10?'Small sample. Treat comparisons as descriptive.':''} Opponent filters use current profile details. Date filters include matches with dated points.</p><details><summary>Point sample filters</summary><p>These apply to point win rates and the score heatmap. Match and game records use the full selected matches.</p><label>Service <select value={serviceFilter} onChange={e=>setServiceFilter(e.target.value)}>{['All','Serve','Receive'].map(x=><option key={x}>{x}</option>)}</select></label> <label>Score <select value={situation} onChange={e=>setSituation(e.target.value)}>{['All','Deuce','Before deuce'].map(x=><option key={x}>{x}</option>)}</select></label></details><div className="metric-board">{labels.map(label=>{const r=rates[label];return <div key={label}><small>{label}</small><strong>{r?Math.round(100*r.won/r.total)+'%':'—'}</strong><span>{r?r.won+' of '+r.total:'No recorded sample'}</span>{r&&<meter value={r.won} max={r.total}/>}</div>})}</div>
  <h4>Win rate by <select aria-label="Compare results by" value={breakdown} onChange={e=>setBreakdown(e.target.value)}>{['Hand','Grip','Style','Opponent','Level','Tournament','Stage','Format'].map(v=><option key={v}>{v}</option>)}</select></h4><div className="metric-board">{[...sections].map(([key,r])=><div key={key}><b>{key}</b><meter value={r.won} max={r.total}/><span>{r.won} wins in {r.total} matches</span></div>)}</div>
  <h4>Points by score situation</h4><div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>Your score</th>{['Behind','Level','Ahead'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{['Early game','Closing points','Game point territory'].map(stage=><tr key={stage}><th>{stage}</th>{['Behind','Level','Ahead'].map(state=>{const row=pressure.get(stage+' / '+state);return <td key={state} style={{background:row?'rgba(55,156,166,'+(0.08+0.45*row.won/row.total)+')':undefined}}>{row?Math.round(100*row.won/row.total)+'% ('+row.won+'/'+row.total+')':'—'}</td>})}</tr>)}</tbody></table></div>
  <details><summary>Metric definitions and data coverage</summary><p>A deuce game has both sides reach target minus one, such as 10–10 in an 11-point game. Deuce points start with both players on at least target minus one. Game points are opportunities to end a game on the next point. Match points additionally require the player to be one game from winning the match. Comebacks and lost leads use a three-point threshold and require a complete, verified sequence. Each opportunity contributes once to its denominator. A dash is missing evidence, and 0% is a recorded sample with no successes.</p><p>Point filters affect point rates and the heatmap. History and comparisons show their own scope. Opponent attributes are current profile values, and historical ratings appear only when recorded at match start. Matches without dates are excluded by date filters. All calculations run in this browser.</p></details>
  <h4>Training notes</h4>{rates.Serving?.total>=20 && rates.Receiving?.total>=20 ? <p>You won {rates.Serving.won} of {rates.Serving.total} points on serve and {rates.Receiving.won} of {rates.Receiving.total} on receive. Review the {rates.Serving.won/rates.Serving.total < rates.Receiving.won/rates.Receiving.total?'serve':'receive'} points in the match logs with your coach.</p>:<p>Record at least 20 service points and 20 receiving points in this selection to compare the two.</p>}
  {rates['Matches won']?.total>=20 && [...sections].filter(([name,row])=>name!=='Unspecified'&&row.total>=10).map(([name,row])=>{
    const baseline=rates['Matches won'].won/rates['Matches won'].total;
    return row.won/row.total<baseline-0.1?<p key={name}>In this selection, your win rate for {name} is {Math.round(row.won/row.total*100)}% across {row.total} matches, compared with {Math.round(baseline*100)}% overall. Review those matches for training ideas. This is a descriptive comparison.</p>:null;
  })}
  <h4>Performance over time</h4><label>Chart metric <select value={chartMetric} onChange={e=>setChartMetric(e.target.value as typeof chartMetric)}>{Object.entries({winRate:'Cumulative win rate',points:'Point win rate',serve:'Serving',receive:'Receiving',deuce:'Deuce points',rating:'Recorded rating'}).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  {trendRows.length>0 && <div className="trend-plot"><span>{chartMetric==='rating' ? 'Rating at match start' : '0–100% · each dot is a match'}</span><svg viewBox="0 0 410 125" role="img" aria-label={'Historical '+chartMetric+' chart'}><line x1="5" y1="105" x2="405" y2="105" stroke="var(--line-dark)"/><line x1="5" y1="5" x2="405" y2="5" stroke="var(--line-dark)"/>{trendRows.map((r,i)=>{
    const value=r[chartMetric];
    if(value==null) return null;
    const max=chartMetric==='rating'?Math.max(1,...trendRows.map(row=>row.rating??0)):100;
    const x=5+i*400/Math.max(1,trendRows.length-1), y=105-value/max*100;
    const previous=trendRows[i-1]?.[chartMetric];
    return <g key={r.m.id}>{previous!=null&&<line x1={5+(i-1)*400/Math.max(1,trendRows.length-1)} y1={105-previous/max*100} x2={x} y2={y} stroke="var(--pine)" strokeWidth="2"/>}<circle tabIndex={0} cx={x} cy={y} r={4} fill="var(--orange)"><title>{date(r.m)} · vs {opponent(r.m)?.name} · {value}{chartMetric==='rating'?'':'%'}</title></circle></g>
  })}</svg></div>}
  <details><summary>Trend data and rating history</summary><div style={{overflowX:'auto'}}><table className="data-table"><thead><tr>{['Date','Win rate','Points won','Serve','Receive','Deuce','Starting rating'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{trendRows.map(r=><tr key={r.m.id}><td>{date(r.m)}</td>{[r.winRate,r.points,r.serve,r.receive,r.deuce].map((v,i)=><td key={i}>{v==null?'—':v+'%'}</td>)}<td>{r.rating??'—'}</td></tr>)}</tbody></table></div></details>
  <p>Longest dated streaks · {longestWin} wins · {longestLoss} losses.</p>
  {closest[0]&&<p>Closest on total points: vs {opponent(closest[0].m)?.name}, a margin of {closest[0].margin}.</p>}
  <details open><summary>Records and tournament achievements</summary>
  <p>Selected match record · {rates['Matches won']?.won ?? 0} wins and {(rates['Matches won']?.total??0)-(rates['Matches won']?.won??0)} losses. Games · {rates['Games won']?.won??0} won and {(rates['Games won']?.total??0)-(rates['Games won']?.won??0)} lost.</p>
  <p>Points from game scores · {matches.reduce((n,m)=>n+(m.gameResults??[]).reduce((t,g)=>t+(m.playerOneId===player?g.one:g.two),0),0)} won and {matches.reduce((n,m)=>n+(m.gameResults??[]).reduce((t,g)=>t+(m.playerOneId===player?g.two:g.one),0),0)} lost.</p>
  {workspace.tournaments.filter(t=>t.entrantIds.includes(player)).map(t=>{
    const rows=matches.filter(m=>m.tournamentId===t.id);
    const finals=rows.filter(m=>t.categories.some(c=>c.id===m.categoryId&&c.format==='Knockout'&&Number(m.round?.match(/Round\s+(\d+)/i)?.[1])===Math.ceil(Math.log2(Math.max(2,c.entries.length)))));
    return <p key={t.id}><b>{t.name}</b> · {rows.filter(m=>m.winnerId===player).length} wins from {rows.length} selected matches {finals.some(m=>m.winnerId===player)?'· Category champion':''}</p>
  })}
  </details>
  <p>Average absolute game margin · {margins.length?(margins.reduce((sum,value)=>sum+Math.abs(value),0)/margins.length).toFixed(1):'—'} points. Smaller margins describe closer games.</p>
  <p>Game margin consistency · {deviation===null?'At least two scored games needed':deviation.toFixed(1)+' points standard deviation across '+margins.length+' games'}. Smaller values mean more similar game margins.</p>
  <details><summary>Compare two players · career singles</summary><select aria-label="Comparison player" value={compare} onChange={e=>setCompare(e.target.value)}><option value="">Select another player</option>{workspace.players.filter(p=>p.id!==player).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{compareIds.map(id=>{const p=workspace.players.find(p=>p.id===id);const rows=workspace.matches.filter(m=>m.status==='Completed'&&m.winnerId&&!m.teamTieId&&(m.sideOnePlayerIds?.length??1)===1&&(m.sideTwoPlayerIds?.length??1)===1&&[m.playerOneId,m.playerTwoId].includes(id));return <p key={id}>{p?.name} · {rows.filter(m=>m.winnerId===id).length} wins from {rows.length} matches · rating {p?.rating}</p>})}</details>
  <h4>Recent results in order</h4><p>{trend.length?trend.slice(-20).map(w=>w?'W':'L').join(' · '):'No dated results in this selection.'}</p>
  <p>Largest recorded winning game margin: {largestMargin || '—'} points. Largest verified comeback: {bestComeback || '—'} points behind.</p>
  <button className="button button-outline" onClick={()=>setDetail(!detail)}>{detail?'Hide':'Show'} match history</button>{detail&&matches.map(m=><p key={m.id}>{date(m)||'Date unavailable'} · vs {opponent(m)?.name} · {m.winnerId===player?'Won':'Lost'} · {m.tournamentName||'Club match'} {onOpenMatch&&<button className="button button-quiet" onClick={()=>onOpenMatch(m.id)}>Open match log</button>}</p>)}</section>
}
