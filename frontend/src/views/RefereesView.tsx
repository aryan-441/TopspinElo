import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CircleDot, Plus, Shield, Trash2, UserRound } from 'lucide-react';
import type { Referee, Workspace } from '../types';

export function RefereesView({ workspace, onChange, toast }: { workspace: Workspace; onChange: (workspace: Workspace) => void; toast: (message: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const referees = workspace.referees ?? [];
  const matches = useMemo(() => [...workspace.matches].filter((match) => match.status === 'Scheduled' || match.status === 'In progress').sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [workspace.matches]);
  const addReferee = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const referee: Referee = { id: crypto.randomUUID(), name: trimmed, email: email.trim() || undefined, active: true };
    onChange({ ...workspace, referees: [...referees, referee] });
    setName(''); setEmail(''); toast(`${trimmed} added to the referee list`);
  };
  const assign = (matchId: string, refereeId: string) => {
    const match = workspace.matches.find((item) => item.id === matchId);
    const assigned = referees.find((referee) => referee.id === refereeId);
    const tournament = match?.tournamentId ? workspace.tournaments.find((item) => item.id === match.tournamentId) : undefined;
    const audit = tournament ? { id: crypto.randomUUID(), action: refereeId ? 'Referee assigned' : 'Referee assignment cleared', target: `${workspace.players.find((player) => player.id === match?.playerOneId)?.name ?? 'Player'} vs ${workspace.players.find((player) => player.id === match?.playerTwoId)?.name ?? 'Player'}${match?.category ? ` · ${match.category}` : ''}`, reason: refereeId ? `Assigned to ${assigned?.name ?? 'referee'}` : 'Cleared from match', at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : undefined;
    onChange({ ...workspace, matches: workspace.matches.map((item) => item.id === matchId ? { ...item, refereeId: refereeId || undefined } : item), tournaments: tournament && audit ? workspace.tournaments.map((item) => item.id === tournament.id ? { ...item, audit: [audit, ...item.audit] } : item) : workspace.tournaments });
    toast(refereeId ? 'Referee assigned to match' : 'Match assignment cleared');
  };
  const remove = (referee: Referee) => {
    onChange({ ...workspace, referees: referees.filter((item) => item.id !== referee.id), matches: workspace.matches.map((match) => match.refereeId === referee.id ? { ...match, refereeId: undefined } : match) });
    toast(`${referee.name} removed; their match assignments were cleared`);
  };
  return <div className="page-content referee-page">
    <div className="page-intro"><div><p className="eyebrow">OFFICIALS & COURTS</p><h2>Referees</h2><p>Keep your officials together and give each upcoming match a clear owner.</p></div><span className="small-meta">{referees.length} REGISTERED</span></div>
    <div className="referee-layout">
      <section className="stats-section referee-roster"><div className="section-head"><div><p className="eyebrow">OFFICIALS</p><h3>Referee roster</h3></div><span className="small-meta">{referees.filter((referee) => referee.active).length} ACTIVE</span></div>
        <form className="referee-add-form" onSubmit={addReferee}><label className="field"><span>Referee name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" maxLength={70} required /></label><label className="field"><span>Email <small>Optional</small></span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="name@example.com" maxLength={120} /></label><button className="button button-primary" type="submit" disabled={!name.trim()}><Plus size={15} /> Add referee</button></form>
        {referees.length ? <div className="referee-list">{referees.map((referee) => { const assignmentCount = workspace.matches.filter((match) => match.refereeId === referee.id && match.status !== 'Completed').length; return <div className="referee-card" key={referee.id}><span className="referee-avatar"><UserRound size={17} /></span><span className="referee-person"><b>{referee.name}</b><small>{referee.email || 'No email added'}</small></span><span className="referee-assignment-count"><b>{assignmentCount}</b><small>assigned</small></span><button className="icon-button referee-remove" aria-label={`Remove ${referee.name}`} title="Remove referee and clear assignments" onClick={() => remove(referee)}><Trash2 size={15} /></button></div>; })}</div> : <div className="referee-empty"><Shield size={20} /><b>No referees added yet</b><span>Add officials here, then assign them to upcoming matches.</span></div>}
      </section>
      <section className="stats-section referee-assignments"><div className="section-head"><div><p className="eyebrow">MATCH CONTROL</p><h3>Assign matches</h3></div><span className="small-meta">{matches.length} UPCOMING / LIVE</span></div>
        {matches.length ? <div className="referee-match-list">{matches.map((match) => { const first = workspace.players.find((player) => player.id === match.playerOneId); const second = workspace.players.find((player) => player.id === match.playerTwoId); return <div className="referee-match-row" key={match.id}><span className={`referee-match-state ${match.status === 'In progress' ? 'referee-match-state--live' : ''}`}><CircleDot size={14} /></span><span className="referee-match-copy"><b>{first?.name ?? 'Player'} <i>vs</i> {second?.name ?? 'Player'}</b><small>{match.tournamentName || 'Friendly match'}{match.category ? ` · ${match.category}` : ''} · {match.table || 'No table'}</small></span><select aria-label={`Assign referee for ${first?.name ?? 'player'} versus ${second?.name ?? 'player'}`} value={match.refereeId ?? ''} onChange={(event) => assign(match.id, event.target.value)}><option value="">Unassigned</option>{referees.filter((referee) => referee.active).map((referee) => <option key={referee.id} value={referee.id}>{referee.name}</option>)}</select></div>; })}</div> : <div className="referee-empty"><CircleDot size={20} /><b>No upcoming matches</b><span>Scheduled and live matches will appear here.</span></div>}
        {!referees.length && matches.length > 0 && <p className="referee-note">Add referees to enable assignments. Matches remain unassigned until then.</p>}
      </section>
    </div>
    <p className="referee-storage-note">This preview stores the roster and assignments in this browser. Shared updates between devices need the later sign-in and database phase.</p>
  </div>;
}
