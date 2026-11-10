import { matchIncludesReferees } from '../services/refereeAvailability';
import { RollingNumber, SlidingTabs } from '../components/CourtMotion';
import { brand } from '../brand';
import { AvailabilityControl } from '../components/AvailabilityControl';

import { ResultEntryDialog } from '../components/ResultEntryDialog';
import { matchAvailability } from '../services/matchAvailability';
import { Fragment, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleHelp, Clock3, Flag, Pencil, Play, Timer, Trash2, Undo2, X } from 'lucide-react';
import type { CategoryEntry, Match, Player, Referee, Workspace } from '../types';
import { Dialog } from '../components/Dialog';
import { chooseDoublesFirstServer, doublesServerAfterPoint, nextDoublesGameOrder } from '../services/tableTennisRules';

type MatchCenterProps = { onUpdateWorkspace: (workspace: Workspace) => void; workspace: Workspace; players: Map<string, Player>; referees?: Referee[]; refereeDesk?: boolean; query: string; onQuery: (value: string) => void; onOpenMatch: (id: string) => void; onCreate: () => void; onSaveMatch: (match: Match) => void; onDeleteMatch: (matchId: string) => void };

export function MatchCenter({ onUpdateWorkspace, workspace, players, referees = [], refereeDesk = false, query, onQuery, onOpenMatch, onCreate, onSaveMatch, onDeleteMatch }: MatchCenterProps) {
  const [filter, setFilter] = useState<'All matches' | Match['status']>('All matches');

  const [scope, setScope] = useState('all');
  const [selectedRefereeId, setActiveRefereeId] = useState('');
  const activeRefereeId = referees.find(referee => referee.active && referee.id === selectedRefereeId)?.id ?? referees.find(referee => referee.active)?.id ?? '';
  const [resultMatch,setResultMatch] = useState<Match | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [deletingMatch, setDeletingMatch] = useState<Match | null>(null);
  const rows = useMemo(() => workspace.matches.filter((match) => {
    const term = query.toLowerCase();
    const names = `${players.get(match.playerOneId)?.name ?? ''} ${players.get(match.playerTwoId)?.name ?? ''} ${match.tournamentName ?? ''} ${match.sideOneLabel ?? ''} ${match.sideTwoLabel ?? ''} ${match.sideOneTeamName ?? ''} ${match.sideTwoTeamName ?? ''}`.toLowerCase();
    return (scope === 'all' || (scope === 'standalone' ? !match.tournamentId : Boolean(match.tournamentId))) && (filter === 'All matches' || match.status === filter) && (!refereeDesk || Boolean(activeRefereeId && referees.some(referee => referee.id === activeRefereeId && referee.active) && match.refereeId === activeRefereeId)) && (!term || names.includes(term));
  }), [workspace.matches, players, query, filter, refereeDesk, activeRefereeId, referees, scope]);
  const active = workspace.matches.filter((match) => match.status === 'In progress').length;
  const scheduled = workspace.matches.filter((match) => match.status === 'Scheduled').length;
  const complete = workspace.matches.filter((match) => match.status === 'Completed').length;
  const groups = new Map<string, Match[]>();
  const keyFor = (m: Match) => m.tournamentId ? 'Tournament matches' : m.playedOn || (/^\d{4}-\d{2}-\d{2}/.test(m.startsAt) ? m.startsAt.slice(0,10) : m.completedAt?.slice(0,10)) || 'Date not recorded';
  for (const match of rows) { const key=keyFor(match); groups.set(key,[...(groups.get(key)??[]),match]); }
  const dateGroups=[...groups].sort(([a],[b])=>a==='Tournament matches'?1:b==='Tournament matches'?-1:a==='Date not recorded'?1:b==='Date not recorded'?-1:b.localeCompare(a));
  const tieSummary = (m: Match) => {
    if (!m.standaloneTeamSystem) return undefined;
    const tie=workspace.matches.filter(other=>other.teamTieId===m.teamTieId);
    const one=tie.filter(other=>other.status==='Completed'&&other.winnerId===other.sideOneId).length;
    const two=tie.filter(other=>other.status==='Completed'&&other.winnerId===other.sideTwoId).length;
    return `${m.sideOneTeamName} ${one} : ${two} ${m.sideTwoTeamName} · First to ${Math.ceil(tie.length/2)} matches`;
  };
  const dateLabel=(key:string)=>/^\d{4}-\d{2}-\d{2}$/.test(key)?new Date(key+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):key;
  return <div className="page-content">
    <div className="page-intro"><div><p className="eyebrow">{refereeDesk ? 'REFEREE DESK' : 'COURT DESK'}</p><h2>{refereeDesk ? 'Your assigned matches' : 'Match schedule'}</h2><p>{refereeDesk ? 'Your assigned matches are here. Open one to record each point.' : 'Track what’s on, start a scorecard, and pick up where a match left off.'}</p></div><div className="match-summary"><span><i className="summary-live-dot" />{active} live</span><span>{scheduled} scheduled</span><span>{complete} complete</span></div></div>
    {refereeDesk && referees.length > 0 && <label className="referee-self-select"><span>Your referee profile</span><select value={activeRefereeId} onChange={(event) => setActiveRefereeId(event.target.value)}>{referees.filter((referee) => referee.active).map((referee) => <option key={referee.id} value={referee.id}>{referee.name}</option>)}</select></label>}
    {refereeDesk && referees.filter(r=>r.id===activeRefereeId).map(referee=><AvailabilityControl key={referee.id} referee={referee} workspace={workspace} onChange={onUpdateWorkspace}/>)}
    {refereeDesk && !referees.length && <p className="referee-note">No referee roster is set up yet. Ask the organiser to add referees and assign matches from the Referees tab.</p>}
    <div className="toolbar-row"><SlidingTabs className="filter-tabs" role="tablist" aria-label="Filter matches">{(['All matches', 'In progress', 'Scheduled', 'Completed'] as const).map((item) => <button key={item} role="tab" aria-selected={filter === item} className={filter === item ? 'filter-tab filter-tab--active' : 'filter-tab'} onClick={() => setFilter(item)}>{item}{item === 'In progress' && active > 0 && <span className="filter-count">{active}</span>}</button>)}</SlidingTabs><label className="search-field"><span className="sr-only">Search matches</span><input type="search" placeholder="Find a player or event" value={query} onChange={(event) => onQuery(event.target.value)} /><CircleHelp size={15} /></label></div>
    <label className="field match-scope"><span>Show matches</span><select value={scope} onChange={e=>setScope(e.target.value)}><option value="all">All matches</option><option value="standalone">Standalone matches · grouped by date</option><option value="tournaments">Tournament matches</option></select></label>
    <p className="table-scroll-hint"><ArrowRight size={13} /> Swipe or use arrow keys to view all columns</p>
    <div className="matches-table-wrap" role="region" aria-label="Scrollable match schedule" tabIndex={0}><table className="data-table matches-table"><thead><tr><th>Match</th><th>Event / round</th><th>Format</th><th>Table</th>{!refereeDesk && <th>Referee</th>}<th>Status</th><th>Score</th><th aria-label="Actions" /></tr></thead><tbody>{dateGroups.map(([date,items])=><Fragment key={date}><tr className="match-date-heading"><th scope="colgroup" colSpan={refereeDesk?7:8}>{dateLabel(date)}{date!=='Tournament matches'&&' · Standalone matches'}</th></tr>{items.map((match) => <MatchRow key={match.id} match={match} players={players} teamSummary={tieSummary(match)} refereeingEnabled={matchIncludesReferees(match,workspace)} availability={matchAvailability(match, workspace)} referee={referees.find((item) => item.id === match.refereeId)} onOpen={() => onOpenMatch(match.id)} onResult={!refereeDesk?()=>setResultMatch(match):undefined} showReferee={!refereeDesk} onEdit={() => setEditingMatch(match)} onDelete={() => setDeletingMatch(match)} />)}</Fragment>)}</tbody></table>
      {!rows.length && <div className="table-empty"><div className="empty-mark"><CircleHelp size={21} /></div><h3>{query ? 'No matches found' : 'Nothing on the schedule yet'}</h3><p>{query ? 'Try another player or event name.' : refereeDesk ? 'Your organiser will create and assign matches here.' : 'Set up a friendly or add a match to an event.'}</p>{!query && !refereeDesk && <button className="button button-primary" onClick={onCreate}>Create a match <ArrowRight size={15} /></button>}</div>}
    </div>
    <p className="table-footnote"><span /> Scores shown are from the current game. Match records are kept with their event history.</p>
    {resultMatch && <ResultEntryDialog match={resultMatch} workspace={workspace} onClose={()=>setResultMatch(null)} onSave={next=>{onSaveMatch(next);setResultMatch(null)}}/>}
    {editingMatch && <MatchRecordEditor match={editingMatch} workspace={workspace} onClose={() => setEditingMatch(null)} onSave={(next) => { onSaveMatch(next); setEditingMatch(null); }} />}
    {deletingMatch && <Dialog title="Remove this match?" eyebrow="ORGANISER OVERRIDE" onClose={() => setDeletingMatch(null)}><p className="dialog-copy">The match leaves the active schedule. Its full record and score events stay in the workspace activity journal and exports.</p><div className="dialog-actions"><button className="button button-quiet" onClick={() => setDeletingMatch(null)}>Keep match</button><button className="button button-danger" onClick={() => { onDeleteMatch(deletingMatch.id); setDeletingMatch(null); }}>Remove match</button></div></Dialog>}
  </div>;
}

function MatchRow({ match, players, referee, onOpen, showReferee, onEdit, onDelete, onResult, refereeingEnabled, availability, teamSummary }: { teamSummary?: string; availability: { ready: boolean; reason?: string }; refereeingEnabled:boolean; onResult?:()=>void; match: Match; players: Map<string, Player>; referee?: Referee; onOpen: () => void; showReferee: boolean; onEdit: () => void; onDelete: () => void }) {
  const one = players.get(match.playerOneId); const two = players.get(match.playerTwoId);
  const oneId = match.sideOneId ?? match.playerOneId, twoId = match.sideTwoId ?? match.playerTwoId;
  const scoreOne = match.status === 'Completed' ? match.gamesWon[oneId] ?? 0 : match.score[oneId] ?? 0;
  const scoreTwo = match.status === 'Completed' ? match.gamesWon[twoId] ?? 0 : match.score[twoId] ?? 0;
  return <tr className={`match-row ${availability.ready ? '' : 'match-row--waiting'}`} onClick={availability.ready ? onOpen : undefined} tabIndex={availability.ready ? 0 : -1} onKeyDown={(event) => { if (availability.ready && (event.key === 'Enter' || event.key === ' ')) onOpen(); }}>
    <td><div className="match-cell-players"><span className="avatar avatar--tiny">{one?.initials ?? 'P1'}</span><div className="match-name-stack"><b className={match.winnerId === oneId ? 'winner-name' : ''}>{match.sideOneLabel ?? one?.name ?? 'Player one'}</b><b className={match.winnerId === twoId ? 'winner-name' : ''}>{match.sideTwoLabel ?? two?.name ?? 'Player two'}</b></div><span className="vs-mark">vs</span></div></td>
    <td><span className="event-name">{match.tournamentName ?? 'Standalone match'}</span><small className="event-round">{teamSummary || [match.category, match.round ?? 'Unassigned'].filter(Boolean).join(' · ')}</small></td>
    <td><span className="format-tag">{match.format}</span></td>
    <td><span className="table-label">{match.table ?? '-'}</span></td>
    {showReferee && <td><span className="table-label">{refereeingEnabled ? referee?.name ?? 'Unassigned' : 'Not included'}</span></td>}
    <td><StatusPill status={match.status} /></td>
    <td><span className={`score-chip ${match.status === 'In progress' ? 'score-chip--live' : ''}`}>{match.resultDetail==='winner'?'Winner recorded':<>{scoreOne}<i>–</i>{scoreTwo}</>}</span></td>
    <td><div className="row-actions">{onResult&&<button className="button button-quiet" disabled={!availability.ready} title={availability.reason} onClick={e=>{e.stopPropagation();onResult()}}>Enter result</button>}<button className="row-open" title={availability.reason ?? "Open score and match log"} disabled={!availability.ready} aria-label={`${availability.ready ? "Open score and match log" : "Waiting to play"} for ${one?.name} versus ${two?.name}`} onClick={(event) => { event.stopPropagation(); onOpen(); }}>Log <ArrowRight size={16} /></button>{showReferee && <><button className="icon-button" aria-label="Edit match data" onClick={(event) => { event.stopPropagation(); onEdit(); }}><Pencil size={14} /></button><button className="icon-button" aria-label="Remove match" onClick={(event) => { event.stopPropagation(); onDelete(); }}><Trash2 size={14} /></button></>}</div></td>
  </tr>;
}

export function MatchRecordEditor({ match, workspace, onClose, onSave }: { match: Match; workspace: Workspace; onClose: () => void; onSave: (match: Match) => void }) {
  const [resultOpen,setResultOpen] = useState(false);
  const players = workspace.players; const playerById = new Map(players.map((player) => [player.id, player]));
  const category = workspace.tournaments.find((tournament) => tournament.id === match.tournamentId)?.categories.find((item) => item.id === match.categoryId);
  const isTeam = category?.kind === 'Team' || Boolean(match.standaloneTeamSystem);
  const standaloneSides: CategoryEntry[] = [
    { id: (isTeam ? match.teamOneId : match.sideOneId) ?? match.playerOneId, name: (isTeam ? match.sideOneTeamName : match.sideOneLabel) ?? playerById.get(match.playerOneId)?.name ?? 'Side one', playerIds: (isTeam ? match.sideOneTeamRosterIds : match.sideOnePlayerIds) ?? [match.playerOneId] },
    { id: (isTeam ? match.teamTwoId : match.sideTwoId) ?? match.playerTwoId, name: (isTeam ? match.sideTwoTeamName : match.sideTwoLabel) ?? playerById.get(match.playerTwoId)?.name ?? 'Side two', playerIds: (isTeam ? match.sideTwoTeamRosterIds : match.sideTwoPlayerIds) ?? [match.playerTwoId] },
  ];
  const entries: CategoryEntry[] = category?.entries ?? (isTeam || match.category === 'Doubles' ? standaloneSides : players.map((player) => ({ id: player.id, name: player.name, playerIds: [player.id] })));
  const initialOne = isTeam ? match.teamOneId : match.sideOneId ?? match.playerOneId; const initialTwo = isTeam ? match.teamTwoId : match.sideTwoId ?? match.playerTwoId;
  const [oneEntryId, setOneEntryId] = useState(initialOne ?? entries[0]?.id ?? ''); const [twoEntryId, setTwoEntryId] = useState(initialTwo ?? entries[1]?.id ?? '');
  const [status, setStatus] = useState<Match['status']>(match.status); const [startsAt, setStartsAt] = useState(match.startsAt); const [table, setTable] = useState(match.table ?? ''); const [round, setRound] = useState(match.round ?? '');
  const [gamesOne, setGamesOne] = useState(String(match.gamesWon[match.sideOneId ?? match.playerOneId] ?? 0)); const [gamesTwo, setGamesTwo] = useState(String(match.gamesWon[match.sideTwoId ?? match.playerTwoId] ?? 0));
  const [scoreOne, setScoreOne] = useState(String(match.score[match.sideOneId ?? match.playerOneId] ?? 0)); const [scoreTwo, setScoreTwo] = useState(String(match.score[match.sideTwoId ?? match.playerTwoId] ?? 0));
  const [winner, setWinner] = useState(match.winnerId === (match.sideOneId ?? match.playerOneId) ? 'one' : match.winnerId === (match.sideTwoId ?? match.playerTwoId) ? 'two' : '');
  const [refereeId, setRefereeId] = useState(match.refereeId ?? ''); const [clearPreviousResult, setClearPreviousResult] = useState(true); const [advanced, setAdvanced] = useState(false); const [text, setText] = useState(() => JSON.stringify(match, null, 2)); const [error, setError] = useState('');
  const oneEntry = entries.find((entry) => entry.id === oneEntryId); const twoEntry = entries.find((entry) => entry.id === twoEntryId);
  const titleFor = (entry: { id: string; name: string; playerIds: string[] } | undefined) => entry?.name || entry?.playerIds.map((id) => playerById.get(id)?.name ?? 'Unknown').join(' & ') || 'Choose entrant';
  const validJson = (value: Match) => {
    if (!value || value.id !== match.id || typeof value.playerOneId !== 'string' || typeof value.playerTwoId !== 'string' || value.playerOneId === value.playerTwoId || !players.some((player) => player.id === value.playerOneId) || !players.some((player) => player.id === value.playerTwoId)) throw new Error('Keep this match ID and use two different player IDs from this workspace.');
    if (!['Scheduled', 'In progress', 'Completed', 'Postponed', 'Not played'].includes(value.status) || !Array.isArray(value.events) || !value.score || !value.gamesWon || typeof value.format !== 'string' || typeof value.startsAt !== 'string' || typeof value.serverId !== 'string' || typeof value.tossWinnerId !== 'string' || !Number.isInteger(value.gamesToWin) || value.gamesToWin < 1 || ![11, 21].includes(value.pointsPerGame) || !Object.values(value.score).every((score) => Number.isFinite(score) && score >= 0) || !Object.values(value.gamesWon).every((games) => Number.isFinite(games) && games >= 0)) throw new Error('Check status, score, game format and event fields.');
  };
  const saveAdvanced = () => { try { const value = JSON.parse(text) as Match; validJson(value); onSave(value); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid match JSON.'); } };
  const saveQuick = () => {
    if (!oneEntry || !twoEntry || oneEntry.id === twoEntry.id) { setError('Choose two different entrants.'); return; }
    const teamLineup = (entry: CategoryEntry, current: string[] | undefined) => current?.length && current.every(id=>entry.playerIds.includes(id)) ? current : current?.length === 2 ? entry.doublesPlayerIds ?? entry.playerIds.slice(0,2) : [entry.playerIds[0]];
    const sideOnePlayers = isTeam ? teamLineup(oneEntry,match.sideOnePlayerIds) : oneEntry.playerIds;
    const sideTwoPlayers = isTeam ? teamLineup(twoEntry,match.sideTwoPlayerIds) : twoEntry.playerIds;
    const newOneSideId = isTeam ? match.sideOneId ?? match.playerOneId : oneEntry.id; const newTwoSideId = isTeam ? match.sideTwoId ?? match.playerTwoId : twoEntry.id;
    const participantsChanged = oneEntry.id !== initialOne || twoEntry.id !== initialTwo;
    const reset = participantsChanged && clearPreviousResult;
    const winnerId = reset ? undefined : winner === 'one' ? newOneSideId : winner === 'two' ? newTwoSideId : undefined;
    const next: Match = { ...match, playedOn: !match.tournamentId && /^\d{4}-\d{2}-\d{2}/.test(startsAt) ? startsAt.slice(0,10) : match.playedOn, playerOneId: sideOnePlayers[0], playerTwoId: sideTwoPlayers[0], sideOneId: newOneSideId, sideTwoId: newTwoSideId, sideOnePlayerIds: sideOnePlayers, sideTwoPlayerIds: sideTwoPlayers, sideOneLabel: titleFor(oneEntry), sideTwoLabel: titleFor(twoEntry), sideOneTeamName: isTeam ? oneEntry.name : undefined, sideTwoTeamName: isTeam ? twoEntry.name : undefined, sideOneTeamRosterIds: isTeam ? oneEntry.playerIds : undefined, sideTwoTeamRosterIds: isTeam ? twoEntry.playerIds : undefined, teamOneId: isTeam ? oneEntry.id : undefined, teamTwoId: isTeam ? twoEntry.id : undefined, refereeId: refereeId || undefined, startsAt: startsAt.trim() || 'TBD', table: table.trim() || undefined, round: round.trim() || 'Unassigned', status: reset ? 'Scheduled' : status, gamesWon: { [newOneSideId]: reset ? 0 : Math.max(0, Number(gamesOne) || 0), [newTwoSideId]: reset ? 0 : Math.max(0, Number(gamesTwo) || 0) }, score: { [newOneSideId]: reset ? 0 : Math.max(0, Number(scoreOne) || 0), [newTwoSideId]: reset ? 0 : Math.max(0, Number(scoreTwo) || 0) }, winnerId, events: reset ? [] : match.events.map((event) => ({ ...event, winnerId: event.winnerId === match.sideOneId ? newOneSideId : event.winnerId === match.sideTwoId ? newTwoSideId : event.winnerId })), gameResults: reset ? [] : match.gameResults?.map((game) => ({ ...game, winnerId: game.winnerId === match.sideOneId ? newOneSideId : game.winnerId === match.sideTwoId ? newTwoSideId : game.winnerId })), serverId: sideOnePlayers.includes(match.serverId) || sideTwoPlayers.includes(match.serverId) ? match.serverId : sideOnePlayers[0], tossWinnerId: match.tossWinnerId === match.sideTwoId ? newTwoSideId : newOneSideId, doublesOrder: reset ? undefined : match.doublesOrder, awaitingDoublesServerChoice: reset ? false : match.awaitingDoublesServerChoice };
    onSave(next);
  };
  if(resultOpen) return <ResultEntryDialog match={match} workspace={workspace} onClose={()=>setResultOpen(false)} onSave={onSave}/>;
  return <Dialog title="Edit match" eyebrow="ORGANISER OVERRIDE · SNAPSHOT SAVED" size="wide" onClose={onClose}><p className="dialog-copy">Change this fixture and its result at any time. Replacing participants clears the old score by default; the prior record remains in the activity journal.</p>{advanced ? <><label className="field"><span>Full match record · JSON</span><textarea className="json-editor" rows={18} spellCheck={false} value={text} onChange={(event) => { setText(event.target.value); setError(''); }} /></label></> : <div className="form-stack"><div className="form-row"><label className="field"><span>Side one {isTeam ? 'team' : 'entrant'}</span><select value={oneEntryId} onChange={(event) => setOneEntryId(event.target.value)}>{entries.map((entry) => <option key={entry.id} value={entry.id}>{titleFor(entry)}</option>)}</select></label><label className="field"><span>Side two {isTeam ? 'team' : 'entrant'}</span><select value={twoEntryId} onChange={(event) => setTwoEntryId(event.target.value)}>{entries.map((entry) => <option key={entry.id} value={entry.id}>{titleFor(entry)}</option>)}</select></label></div><div className="form-row"><label className="field"><span>Round</span><input value={round} onChange={(event) => setRound(event.target.value)} /></label><label className="field"><span>Start time</span><input value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label className="field"><span>Table</span><input value={table} onChange={(event) => setTable(event.target.value)} /></label></div><div className="form-row"><label className="field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as Match['status'])}>{['Scheduled', 'In progress', 'Completed', 'Postponed', 'Not played'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="field"><span>Winner</span><select value={winner} onChange={(event) => setWinner(event.target.value)}><option value="">No winner</option><option value="one">{titleFor(oneEntry)}</option><option value="two">{titleFor(twoEntry)}</option></select></label><label className="field"><span>Referee</span><select value={refereeId} onChange={(event) => setRefereeId(event.target.value)}><option value="">Unassigned</option>{workspace.referees.map((referee) => <option key={referee.id} value={referee.id}>{referee.name}</option>)}</select></label></div><div className="form-row"><label className="field"><span>Games · side one</span><input type="number" min="0" value={gamesOne} onChange={(event) => setGamesOne(event.target.value)} /></label><label className="field"><span>Games · side two</span><input type="number" min="0" value={gamesTwo} onChange={(event) => setGamesTwo(event.target.value)} /></label><label className="field"><span>Current points · side one</span><input type="number" min="0" value={scoreOne} onChange={(event) => setScoreOne(event.target.value)} /></label><label className="field"><span>Current points · side two</span><input type="number" min="0" value={scoreTwo} onChange={(event) => setScoreTwo(event.target.value)} /></label></div>{isTeam && <p className="profile-empty">For team ties, the selected team supplies the lineup players; adjust detailed lineup/service data in the advanced record.</p>}{<label className="checkbox-field"><input type="checkbox" checked={clearPreviousResult} onChange={(event) => setClearPreviousResult(event.target.checked)} /><span>Clear the previous result and point history if participants change</span></label>}</div>}{error && <p className="inline-message" role="alert">{error}</p>}<div className="dialog-actions"><button className="button button-outline" onClick={()=>setResultOpen(true)}>Record a result</button><button className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-quiet" onClick={() => { setText(JSON.stringify(match, null, 2)); setAdvanced((value) => !value); setError(''); }}>{advanced ? 'Quick editor' : 'Advanced JSON'}</button><button className="button button-primary" onClick={advanced ? saveAdvanced : saveQuick}><Pencil size={14} /> Save match changes</button></div></Dialog>;
}

export function StatusPill({ status }: { status: Match['status'] }) {
  const className = status === 'In progress' ? 'status-pill status-pill--live' : status === 'Completed' ? 'status-pill status-pill--complete' : status === 'Postponed' ? 'status-pill status-pill--paused' : status === 'Not played' ? 'status-pill status-pill--not-played' : 'status-pill status-pill--scheduled';
  return <span className={className}><i />{status}</span>;
}

type LiveProps = { match: Match; players: Map<string, Player>; canNominateDoubles?: boolean; onBack: () => void; onChange: (match: Match) => void; toast: (message: string) => void };

export function LiveScoring({ match, players, canNominateDoubles = true, onBack, onChange, toast }: LiveProps) {
  const oneId = match.sideOneId ?? match.playerOneId; const twoId = match.sideTwoId ?? match.playerTwoId;
  const onePlayer = players.get(match.playerOneId)!; const twoPlayer = players.get(match.playerTwoId)!;
  const rosterOne = match.sideOneTeamRosterIds ?? match.sideOnePlayerIds ?? [match.playerOneId];
  const rosterTwo = match.sideTwoTeamRosterIds ?? match.sideTwoPlayerIds ?? [match.playerTwoId];
  const [lineupOne, setLineupOne] = useState(match.sideOnePlayerIds ?? [match.playerOneId]);
  const [lineupTwo, setLineupTwo] = useState(match.sideTwoPlayerIds ?? [match.playerTwoId]);
  const oneLabel = (match.doublesNominationPending ? lineupOne.map((id) => players.get(id)?.name).filter(Boolean).join(' & ') : match.sideOneLabel) || onePlayer.name;
  const twoLabel = (match.doublesNominationPending ? lineupTwo.map((id) => players.get(id)?.name).filter(Boolean).join(' & ') : match.sideTwoLabel) || twoPlayer.name;
  const one = { ...onePlayer, id: oneId, name: oneLabel }; const two = { ...twoPlayer, id: twoId, name: twoLabel };
  const [tossWinner, setTossWinner] = useState(match.tossWinnerId || one.id);
  const [serveChoice, setServeChoice] = useState<'serve' | 'receive'>('serve');
  const [firstServerSelection, setFirstServerSelection] = useState(match.serverId);
  const [firstReceiverSelection, setFirstReceiverSelection] = useState('');
  const [nextGameServerChoice, setNextGameServerChoice] = useState(match.doublesOrder?.[0] ?? '');
  const [undoOpen, setUndoOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [mobileActions, setMobileActions] = useState(false);
  const scoreOne = match.score[one.id] ?? 0; const scoreTwo = match.score[two.id] ?? 0;
  const gameWinner = match.status === 'In progress' ? findGameWinner(match) : undefined;
  const matchWinner = match.winnerId === oneId ? one : match.winnerId === twoId ? two : undefined;
  const inProgress = match.status === 'In progress';
  const currentGameIndex = (match.gameResults?.length ?? 0) + 1;
  const servingPlayer = players.get(match.serverId) ?? one;
  const servingSideId = (match.sideOnePlayerIds ?? [match.playerOneId]).includes(match.serverId) ? one.id : two.id;
  const updateMatch = (next: Match) => onChange(next);
  const chosenServingSide = serveChoice === 'serve' ? tossWinner : tossWinner === one.id ? two.id : one.id;
  const chosenServingLineup = chosenServingSide === one.id ? lineupOne : lineupTwo;
  const chosenReceivingLineup = chosenServingSide === one.id ? lineupTwo : lineupOne;
  const isDoubles = chosenServingLineup.length === 2 && chosenReceivingLineup.length === 2;

  const startMatch = () => {
    if (match.doublesNominationPending && !canNominateDoubles) { toast('The doubles pair can be nominated after the preceding singles finish'); return; }
    const servers = chosenServingLineup, receivers = chosenReceivingLineup;
    const server = servers.includes(firstServerSelection) ? firstServerSelection : servers[0];
    const receiver = receivers.includes(firstReceiverSelection) ? firstReceiverSelection : receivers[0];
    const doublesOrder = isDoubles ? [server, receiver, servers.find((id) => id !== server)!, receivers.find((id) => id !== receiver)!] : undefined;
    const nextOneLabel = lineupOne.map((id) => players.get(id)?.name).filter(Boolean).join(' & ');
    const nextTwoLabel = lineupTwo.map((id) => players.get(id)?.name).filter(Boolean).join(' & ');
    updateMatch({ ...match, status: 'In progress', startRatings: { [one.id]: one.rating, [two.id]: two.rating }, tossWinnerId: tossWinner, serverId: server, doublesOrder, sideOnePlayerIds: lineupOne, sideTwoPlayerIds: lineupTwo, sideOneLabel: nextOneLabel, sideTwoLabel: nextTwoLabel, doublesNominationPending: false });
    toast('Match started');
  };

  const addPoint = (winnerId: string, kind: 'Point' | 'Fault' = 'Point') => {
    if (!inProgress || gameWinner || match.awaitingDoublesServerChoice) return;
    const before = { ...match.score };
    const nextScore = { ...before, [winnerId]: (before[winnerId] ?? 0) + 1 };
    const nextServer = serverForNextPoint(match, before, match.serverId);
    const event: Match['events'][number] = { id: crypto.randomUUID(), serverId: match.serverId, game: (match.gameResults?.length ?? 0) + 1, recordedAt: new Date().toISOString(), winnerId, score: `${nextScore[one.id]}–${nextScore[two.id]}`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), kind };
    updateMatch({ ...match, score: nextScore, serverId: nextServer, events: [event, ...match.events] });
    if (kind === 'Fault') toast('Fault recorded · point awarded to receiver');
  };

  const addLet = () => {
    if (!inProgress || gameWinner || match.awaitingDoublesServerChoice) return;
    const event: Match['events'][number] = { id: crypto.randomUUID(), winnerId: match.serverId, score: `${scoreOne}–${scoreTwo}`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), kind: 'Let' };
    updateMatch({ ...match, events: [event, ...match.events] });
    toast('Let recorded · replay the point');
  };

  const undoPoint = (reason: string) => {
    const latestPoint = scoreOne + scoreTwo > 0 ? match.events.find(event => (event.kind === 'Point' || event.kind === 'Fault') && (event.game == null || event.game === (match.gameResults?.length ?? 0) + 1)) : undefined;
    if (!latestPoint) { toast('There is no point to undo'); setUndoOpen(false); return; }
    const [oneScore, twoScore] = latestPoint.score.split('–').map(Number);
    const beforeScore = latestPoint.winnerId === one.id ? { ...match.score, [one.id]: Math.max(0, oneScore - 1) } : { ...match.score, [two.id]: Math.max(0, twoScore - 1) };
    const totalAfter = oneScore + twoScore;
    const oneBefore = beforeScore[one.id] ?? 0; const twoBefore = beforeScore[two.id] ?? 0;
    const atDeuceBeforePoint = oneBefore >= match.pointsPerGame - 1 && twoBefore >= match.pointsPerGame - 1;
    const serviceInterval = atDeuceBeforePoint ? 1 : match.pointsPerGame === 11 ? 2 : 5;
    const serverChangedAfterPoint = totalAfter % serviceInterval === 0;
    const previousServerId = serverChangedAfterPoint ? match.doublesOrder?.length === 4 ? match.doublesOrder[(match.doublesOrder.indexOf(match.serverId) + 3) % 4] : match.serverId === match.playerOneId ? match.playerTwoId : match.playerOneId : match.serverId;
    const next = { ...match, score: beforeScore, serverId: previousServerId, events: [{ id: crypto.randomUUID(), winnerId: latestPoint.winnerId, score: latestPoint.score, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), reason, reversedEvent: latestPoint, recordedAt: new Date().toISOString(), game:latestPoint.game, reversedEventId: latestPoint.id, kind: 'Correction' as const }, ...match.events.filter((event) => event.id !== latestPoint.id)] };
    updateMatch(next); setUndoOpen(false); toast(`Last point removed · ${reason}`);
  };

  const acceptGame = () => {
    if (!gameWinner) return;
    const nextGames = { ...match.gamesWon, [gameWinner]: (match.gamesWon[gameWinner] ?? 0) + 1 };
    const matchWon = nextGames[gameWinner] >= match.gamesToWin;
    const completedGame = { one: scoreOne, two: scoreTwo, winnerId: gameWinner };
    const nextOrder = match.doublesOrder?.length === 4 ? nextDoublesGameOrder(match.doublesOrder) ?? undefined : undefined;
    const nextServer = nextOrder?.[0] ?? (match.serverId === match.playerOneId ? match.playerTwoId : match.playerOneId);
    updateMatch({ ...match, gamesWon: nextGames, completedAt: matchWon ? new Date().toISOString() : undefined, gameResults: [...(match.gameResults ?? []), completedGame], score: matchWon ? match.score : { [one.id]: 0, [two.id]: 0 }, status: matchWon ? 'Completed' : 'In progress', winnerId: matchWon ? gameWinner : undefined, serverId: nextServer, doublesOrder: nextOrder, awaitingDoublesServerChoice: !matchWon && Boolean(nextOrder), events: match.events });
    toast(matchWon ? 'Match result recorded' : 'Game confirmed · next game is ready');
  };

  const confirmNextGameServer = () => {
    const order = match.doublesOrder;
    if (!order || order.length !== 4) return;
    const serverIndex = order.indexOf(nextGameServerChoice);
    if (serverIndex !== 0 && serverIndex !== 2) return;
    const nextOrder = chooseDoublesFirstServer(order, nextGameServerChoice);
    if (!nextOrder) return;
    updateMatch({ ...match, doublesOrder: nextOrder, serverId: nextOrder[0], awaitingDoublesServerChoice: false });
  };

  return <div className="scoring-screen">
    <header className="scoring-topbar"><button className="scoring-back" onClick={onBack}><ArrowLeft size={17} /> <span>Match desk</span></button><span className="scoring-brand">TopspinElo</span><div className="scoring-top-right"><StatusPill status={match.status} /><button className="icon-button scoring-help" onClick={() => setHelpOpen(true)} aria-label="Scoring help"><CircleHelp size={18} /></button></div></header>
    <main className="scoring-layout">
      {match.status === 'Not played' && <div className="not-played-banner"><b>Not played</b><span>The team tie was decided by the required majority of individual matches.</span></div>}
      <section className="scoring-main">
        <div className="scoring-match-meta"><div><p className="eyebrow">{match.tournamentName ?? 'CLUB MATCH'} <span className="eyebrow-rule" /> {match.round ?? 'FRIENDLY'}</p><h1>{one.name} <span>vs</span> {two.name}</h1><p className="scoring-meta-line"><span>{match.table ?? 'Table unassigned'}</span><i />{match.format}<i />First to {match.pointsPerGame}<i />{match.goldenPoint ? 'Golden point' : 'Deuce · win by two'}</p></div></div>
        {!inProgress && match.status !== 'Completed' && match.status !== 'Not played' && <section className="toss-panel"><div><p className="eyebrow">BEFORE THE FIRST SERVE</p><h2>{match.doublesNominationPending ? 'Confirm the doubles pair' : 'Confirm the toss'}</h2><p>{match.doublesNominationPending && !canNominateDoubles ? 'The nominated pair can be selected after the preceding singles are complete.' : 'The toss winner chooses to serve or receive first. In doubles, choose the first server and receiver; partners then rotate in the ITTF order.'}</p></div><div className="toss-controls"><div className="toss-player-choice"><span>Toss winner</span><div className="choice-pair"><button className={tossWinner === one.id ? 'choice-button choice-button--selected' : 'choice-button'} onClick={() => setTossWinner(one.id)}>{one.name}</button><button className={tossWinner === two.id ? 'choice-button choice-button--selected' : 'choice-button'} onClick={() => setTossWinner(two.id)}>{two.name}</button></div></div><div className="serve-choice"><span>Choice</span><div className="choice-pair choice-pair--short"><button className={serveChoice === 'serve' ? 'choice-button choice-button--selected' : 'choice-button'} onClick={() => setServeChoice('serve')}>Serve</button><button className={serveChoice === 'receive' ? 'choice-button choice-button--selected' : 'choice-button'} onClick={() => setServeChoice('receive')}>Receive</button></div></div>{match.doublesNominationPending && <div className="doubles-nomination"><label className="field"><span>{one.name} · doubles player 1</span><select value={lineupOne[0] ?? ''} onChange={(event) => setLineupOne([event.target.value, lineupOne[1] ?? ''])} disabled={!canNominateDoubles}>{rosterOne.map((id) => <option key={id} value={id}>{players.get(id)?.name}</option>)}</select></label><label className="field"><span>Doubles player 2</span><select value={lineupOne[1] ?? ''} onChange={(event) => setLineupOne([lineupOne[0] ?? '', event.target.value])} disabled={!canNominateDoubles}>{rosterOne.filter((id) => id !== lineupOne[0]).map((id) => <option key={id} value={id}>{players.get(id)?.name}</option>)}</select></label><label className="field"><span>{two.name} · doubles player 1</span><select value={lineupTwo[0] ?? ''} onChange={(event) => setLineupTwo([event.target.value, lineupTwo[1] ?? ''])} disabled={!canNominateDoubles}>{rosterTwo.map((id) => <option key={id} value={id}>{players.get(id)?.name}</option>)}</select></label><label className="field"><span>Doubles player 2</span><select value={lineupTwo[1] ?? ''} onChange={(event) => setLineupTwo([lineupTwo[0] ?? '', event.target.value])} disabled={!canNominateDoubles}>{rosterTwo.filter((id) => id !== lineupTwo[0]).map((id) => <option key={id} value={id}>{players.get(id)?.name}</option>)}</select></label></div>}{isDoubles && <div className="doubles-service-order"><label className="field"><span>First server</span><select value={chosenServingLineup.includes(firstServerSelection) ? firstServerSelection : chosenServingLineup[0]} onChange={(event) => setFirstServerSelection(event.target.value)}>{chosenServingLineup.map((id) => <option key={id} value={id}>{players.get(id)?.name}</option>)}</select></label><label className="field"><span>First receiver</span><select value={chosenReceivingLineup.includes(firstReceiverSelection) ? firstReceiverSelection : chosenReceivingLineup[0]} onChange={(event) => setFirstReceiverSelection(event.target.value)}>{chosenReceivingLineup.map((id) => <option key={id} value={id}>{players.get(id)?.name}</option>)}</select></label></div>}<button className="button button-primary" onClick={startMatch} disabled={(match.doublesNominationPending && (!canNominateDoubles || lineupOne.length !== 2 || lineupTwo.length !== 2 || new Set(lineupOne).size !== 2 || new Set(lineupTwo).size !== 2))}><Play size={15} fill="currentColor" /> Start match</button></div></section>}

        <div className={`scorecard ${match.status === 'Completed' ? 'scorecard--complete' : ''}`}>
          <div className="scorecard-top"><span><i className={inProgress ? 'score-live-dot' : 'score-done-dot'} />{match.status === 'Completed' ? 'FINAL SCORE' : inProgress ? `GAME ${currentGameIndex}` : 'MATCH RESULT'}</span><span>{match.status === 'Completed' ? 'Recorded' : `${match.pointsPerGame} POINT GAME`}</span></div>
          <div className="scorecard-players">
            <div className="scorecard-player"><div className="scorecard-person"><span className={`score-big-avatar ${matchWinner?.id === one.id ? 'score-big-avatar--winner' : ''}`}>{one.initials}</span><div><b>{one.name}</b>{match.sideOneTeamName && <small>{match.sideOneTeamName} · A/B/C lineup</small>}<small>{[one.style, one.hand && one.hand.toLowerCase() + ' handed'].filter(Boolean).join(' · ') || 'Playing details not specified'}</small></div></div><span className="game-score">{match.gamesWon[one.id] ?? 0}</span><span className={`point-score ${!inProgress || servingSideId !== one.id ? 'point-score--muted' : ''}`}><RollingNumber value={scoreOne}/></span></div>
            <div className="scorecard-divider"><span /><span>SETS</span><span>POINTS</span></div>
            <div className="scorecard-player"><div className="scorecard-person"><span className={`score-big-avatar score-big-avatar--second ${matchWinner?.id === two.id ? 'score-big-avatar--winner' : ''}`}>{two.initials}</span><div><b>{two.name}</b>{match.sideTwoTeamName && <small>{match.sideTwoTeamName} · X/Y/Z lineup</small>}<small>{[two.style, two.hand && two.hand.toLowerCase() + ' handed'].filter(Boolean).join(' · ') || 'Playing details not specified'}</small></div></div><span className="game-score">{match.gamesWon[two.id] ?? 0}</span><span className={`point-score point-score--second ${!inProgress || servingSideId !== two.id ? 'point-score--muted' : ''}`}><RollingNumber value={scoreTwo}/></span></div>
          </div>
          {match.status === 'Completed' && <div className="match-final-strip"><Check size={16} /><span><b>{matchWinner?.name}</b> won the match</span><span>{match.format} · {match.gamesWon[one.id]}–{match.gamesWon[two.id]}</span></div>}
          {inProgress && <div className="serve-bar"><span className="serve-ball">●</span><span><b>{servingPlayer.name}</b> to serve next</span><span className="serve-bar-note">Serve changes automatically</span></div>}
        </div>

        {inProgress && <>
          {match.awaitingDoublesServerChoice ? <div className="game-won-banner"><div><span className="eyebrow">NEXT GAME · DOUBLES</span><b>The serving pair chooses its first server</b><small>The first receiver is determined by the service order from the previous game.</small></div><label className="field"><span>First server</span><select value={nextGameServerChoice} onChange={(event) => setNextGameServerChoice(event.target.value)}>{[match.doublesOrder?.[0], match.doublesOrder?.[2]].filter((id): id is string => Boolean(id)).map((id) => <option key={id} value={id}>{players.get(id)?.name}</option>)}</select></label><button className="button button-primary" onClick={confirmNextGameServer}><Check size={15} /> Confirm server</button></div> : gameWinner ? <div className="game-won-banner"><div><span className="eyebrow">GAME POINT</span><b>{(gameWinner === one.id ? one.name : two.name)} takes the game</b></div><button className="button button-primary" onClick={acceptGame}><Check size={16} /> Confirm game result</button><button className="undo-game" onClick={() => setUndoOpen(true)}><Undo2 size={15} /> Undo last point</button></div> : <div className="score-controls"><div className="score-control-heading"><span>POINT WON BY</span><span>Tap a side to add a point</span></div><div className="point-buttons"><button className="point-button" onClick={() => addPoint(one.id)}><span className="point-plus">+</span><span><small>POINT FOR</small><b>{one.name}</b></span><span className="point-shortcut">A</span></button><span className="point-separator">OR</span><button className="point-button point-button--orange" onClick={() => addPoint(two.id)}><span className="point-plus">+</span><span><small>POINT FOR</small><b>{two.name}</b></span><span className="point-shortcut">L</span></button></div><div className="score-secondary-actions"><button onClick={addLet}><span className="let-icon">↻</span> Let · replay point</button><button onClick={() => { const servingSide = (match.sideOnePlayerIds ?? [match.playerOneId]).includes(match.serverId) ? one.id : two.id; addPoint(servingSide === one.id ? two.id : one.id, 'Fault'); }}><Flag size={14} /> Fault · point to receiver</button><button onClick={() => setUndoOpen(true)} disabled={!match.events.some((event) => event.kind === 'Point' || event.kind === 'Fault')}><Undo2 size={14} /> Undo last point</button></div></div>}
        </>}
        <div className="game-history"><div className="section-head"><div><p className="eyebrow">MATCH RECORD</p><h3>Games so far</h3></div><span className="small-meta">Best of {match.gamesToWin * 2 - 1}</span></div><div className="game-history-list">{match.gameResults?.length ? match.gameResults.map((game, index) => <div className="game-history-row" key={`${index}-${game.winnerId}`}><span className="game-number">GAME {String(index + 1).padStart(2, '0')}</span><span className={game.winnerId === one.id ? 'game-result game-result--winner' : 'game-result'}>{game.one}</span><i>–</i><span className={game.winnerId === two.id ? 'game-result game-result--winner' : 'game-result'}>{game.two}</span><span className="game-winner-name">{players.get(game.winnerId)?.name} won</span><Check size={15} /></div>) : <div className="history-placeholder"><span>GAMES WILL APPEAR HERE</span><span>Each accepted result is kept in the match record.</span></div>}</div></div>
      </section>

      <aside className={`scoring-aside ${mobileActions ? 'scoring-aside--open' : ''}`}>
        <div className="aside-head"><div><p className="eyebrow">POINT BY POINT</p><h3>Match timeline</h3></div><span className="timeline-count">{match.events.length}</span><button className="timeline-mobile-close icon-button" onClick={() => setMobileActions(false)} aria-label="Close timeline"><X size={17} /></button></div>
        <div className="timeline-info"><span><Timer size={14} /> {match.events[0]?.time ?? 'Awaiting first point'}</span>{match.events.length > 12 && <button onClick={() => setShowAllEvents((shown) => !shown)}><ChevronDown size={14} /> {showAllEvents ? 'Show recent' : `All ${match.events.length} events`}</button>}</div>
        <div className="timeline-list">{match.events.length ? (showAllEvents ? match.events : match.events.slice(0, 12)).map((event, index) => <div className={`timeline-event ${event.kind === 'Correction' ? 'timeline-event--correction' : ''}`} key={event.id}><div className="timeline-rail"><span className={`timeline-node timeline-node--${event.kind.toLowerCase()}`}>{event.kind === 'Let' ? '↻' : event.kind === 'Fault' ? '!' : event.kind === 'Correction' ? '↶' : index + 1}</span>{index < (showAllEvents ? match.events.length : Math.min(match.events.length, 12)) - 1 && <i />}</div><div className="timeline-copy"><b>{event.kind === 'Point' ? `${players.get(event.winnerId)?.name} won point` : event.kind === 'Fault' ? `Fault · point to ${players.get(event.winnerId)?.name}` : event.kind === 'Let' ? 'Let · replay point' : 'Point taken back from ' + (players.get(event.winnerId)?.name ?? 'player') + ' · ' + (event.reason || 'Reason not recorded')}</b><span>{event.score} <i>·</i> {event.time}</span></div></div>) : <div className="timeline-empty"><div className="timeline-empty-mark">○</div><b>No points recorded yet</b><span>The timeline will build as the match is scored.</span></div>}</div>
        <div className="timeline-footer"><span><Clock3 size={14} /> Started {inProgress ? 'today' : 'not started'}</span><span>{match.events.length} recorded events</span></div>
      </aside>
      <button className="mobile-timeline-fab" onClick={() => setMobileActions(true)}><Timer size={16} /> Match timeline <span>{match.events.length}</span></button>
    </main>
    <footer className="app-footer scoring-footer"><span>TopspinElo</span><a href={`mailto:${brand.supportEmail}`}>Support · {brand.supportEmail}</a><span>© Aryan Arora 2026</span></footer>
    {undoOpen && <UndoDialog onClose={() => setUndoOpen(false)} onConfirm={undoPoint} />}
    {helpOpen && <ScoringHelpDialog onClose={() => setHelpOpen(false)} />}
  </div>;
}

function UndoDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return <Dialog title="Undo the last point?" eyebrow="CORRECTION" onClose={onClose}><form className="form-stack" noValidate onSubmit={(event) => { event.preventDefault(); if (reason.trim()) onConfirm(reason.trim()); }}><p className="dialog-copy">This adds a correction to the match timeline and removes the most recent point from the score.</p><label className="field"><span>Reason for correction</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Point was awarded to the wrong player" required maxLength={160} /></label><div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Keep point</button><button className="button button-danger" type="submit" disabled={!reason.trim()}><Undo2 size={15} /> Undo point</button></div></form></Dialog>;
}

function serverForNextPoint(match: Match, scoreBefore: Record<string, number>, currentServer: string) {
  const one = match.sideOneId ?? match.playerOneId, two = match.sideTwoId ?? match.playerTwoId;
  const totalAfter = (scoreBefore[one] ?? 0) + (scoreBefore[two] ?? 0) + 1;
  const atDeuce = (scoreBefore[one] ?? 0) >= match.pointsPerGame - 1 && (scoreBefore[two] ?? 0) >= match.pointsPerGame - 1;
  const interval = atDeuce ? 1 : match.pointsPerGame === 11 ? 2 : 5;
  if (match.doublesOrder?.length === 4) return doublesServerAfterPoint(match.doublesOrder, currentServer, scoreBefore[one] ?? 0, scoreBefore[two] ?? 0, match.pointsPerGame);
  if (totalAfter % interval !== 0) return currentServer;
  return currentServer === match.playerOneId ? match.playerTwoId : match.playerOneId;
}

function findGameWinner(match: Match): string | undefined {
  const sideOne = match.sideOneId ?? match.playerOneId, sideTwo = match.sideTwoId ?? match.playerTwoId;
  const one = match.score[sideOne] ?? 0; const two = match.score[sideTwo] ?? 0;
  const target = match.pointsPerGame;
  if (one >= target && one - two >= (match.goldenPoint ? 1 : 2)) return sideOne;
  if (two >= target && two - one >= (match.goldenPoint ? 1 : 2)) return sideTwo;
  return undefined;
}

function ScoringHelpDialog({ onClose }: { onClose: () => void }) {
  return <Dialog title="Using the scorecard" eyebrow="SCORING GUIDE" onClose={onClose}>
    <div className="scoring-help-copy"><p>Confirm who won the toss and whether they chose to serve or receive, then start the match.</p><p>Tap the player who won each point. TopspinElo rotates service, applies win-by-two at deuce, and records lets, faults and corrections in the timeline.</p><p>When a game reaches its winning score, confirm the game result to continue. The match is recorded when a player reaches the configured games-to-win total.</p></div>
    <div className="dialog-actions"><button className="button button-primary" onClick={onClose}>Got it</button></div>
  </Dialog>;
}
