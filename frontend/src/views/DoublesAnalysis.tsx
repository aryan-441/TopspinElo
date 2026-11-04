import { useState } from 'react';
import type { Workspace } from '../types';
import { doublesPartnerships } from '../services/doublesMetrics';

export function DoublesAnalysis({ workspace, onOpenMatch }: { workspace: Workspace; onOpenMatch: (id: string) => void }) {
  const [playerId, setPlayerId] = useState(workspace.players[0]?.id ?? '');
  const [partnerId, setPartnerId] = useState('');
  const partnerships = doublesPartnerships(workspace, playerId);
  const shown = partnerId ? partnerships.filter(row => row.partnerId === partnerId) : partnerships;
  const playerName = (id: string) => workspace.players.find(player => player.id === id)?.name ?? 'Unknown player';
  const total = partnerships.reduce((sum, row) => sum + row.matches.length, 0);
  return <section className="stats-section doubles-analysis" aria-labelledby="doubles-title">
    <div className="section-head"><div><p className="eyebrow">PARTNERSHIP ANALYSIS</p><h3 id="doubles-title">Doubles, together</h3><p className="section-caption">See what each partnership has recorded, from match outcomes to scored games.</p></div><span className="small-meta">{total} COMPLETED DOUBLES MATCHES</span></div>
    <div className="doubles-filters"><label className="field"><span>Player</span><select value={playerId} onChange={event => { setPlayerId(event.target.value); setPartnerId(''); }}>{workspace.players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><label className="field"><span>Partner</span><select value={partnerId} onChange={event => setPartnerId(event.target.value)}><option value="">All partners</option>{partnerships.map(row => <option key={row.partnerId} value={row.partnerId}>{playerName(row.partnerId)}</option>)}</select></label></div>
    {shown.length ? <div className="doubles-cards">{shown.map(row => {
      const opponents = [...row.opponents.entries()].sort((a, b) => b[1].wins + b[1].losses - a[1].wins - a[1].losses);
      return <article className="doubles-card" key={row.partnerId}><div className="doubles-card-head"><div><span className="eyebrow">WITH {playerName(row.partnerId).toUpperCase()}</span><h4>{playerName(playerId)} <span>&</span> {playerName(row.partnerId)}</h4></div><strong>{Math.round(row.wins / row.matches.length * 100)}%<small>match win rate</small></strong></div>
        <div className="doubles-figures"><div><b>{row.wins}–{row.losses}</b><span>matches</span></div><div><b>{row.gamesWon + row.gamesLost ? `${row.gamesWon}–${row.gamesLost}` : '—'}</b><span>games recorded</span></div><div><b>{row.scoredGames ? `${row.pointsWon}–${row.pointsLost}` : '—'}</b><span>points from scored games</span></div></div>
        <div className="doubles-opponents"><h5>Against other pairs</h5>{opponents.map(([key, opponent]) => <p key={key}><span>{opponent.names}</span><b>{opponent.wins}–{opponent.losses}</b></p>)}</div>
        <details><summary>Match history</summary>{[...row.matches].reverse().map(match => <p key={match.id}>{match.completedAt?.slice(0, 10) || 'Date unavailable'} · {match.tournamentName || 'Club match'} · {match.gameResults?.length ? `${match.gameResults.length} scored games` : 'Result only'} <button type="button" className="button button-quiet" onClick={() => onOpenMatch(match.id)}>Open match log</button></p>)}</details>
      </article>;
    })}</div> : <div className="empty-draw"><div><b>No completed doubles partnerships for this player</b><span>When a doubles match is completed with both pairs recorded, its result will appear here.</span></div></div>}
    <p className="doubles-data-note">Match win rate uses completed doubles results. Game totals need a game score; point totals need individual game scores. Serve and receive rates need a complete point timeline with individual server IDs, so they are not inferred from a final result.</p>
  </section>;
}
