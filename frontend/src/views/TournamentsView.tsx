import { useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, CalendarClock, CalendarDays, Check, ChevronRight, CircleHelp, Download, FileJson2, FileSpreadsheet, Pause, Play, Plus, ShieldCheck, Trophy, Undo2, Users } from 'lucide-react';
import type { CategoryEntry, Match, Player, Tournament, TournamentCategory, Workspace } from '../types';
import { Dialog } from '../components/Dialog';
import { StatusPill } from './MatchCenter';
import { createMatch, createTournament, generateCategoryRoundFixtures, generateTournamentFixtures, resolveTeamTie } from '../services/store';

type Props = { workspace: Workspace; players: Map<string, Player>; selectedId: string | null; onSelect: (id: string | null) => void; onCreate: () => void; onOpenMatch: (id: string) => void; onChange: (next: Workspace) => void; toast: (message: string) => void };
type TournamentTab = 'Overview' | 'Draw & matches' | 'Standings' | 'Audit log';
type ImportRow = { rowNumber: number; sourceId: string; playerOneId: string; playerTwoId: string; round: string; table: string; category: string; startsAt: string; oneMatch: string; twoMatch: string };
type ImportPreview = { fileName: string; rows: ImportRow[] };
type DrawEntrant = { id: string; name: string; categoryId: string; categoryName: string; kind: TournamentCategory['kind']; playerIds: string[] };
const categoryNames = (tournament: Tournament) => (tournament.categories ?? []).map((category) => typeof category === 'string' ? category : category.name);
const entryLabel = (entry: CategoryEntry, players: Map<string, Player>) => entry.name || entry.playerIds.map((id) => players.get(id)?.name ?? 'Unknown').join(' & ');

export function TournamentsView({ workspace, players, selectedId, onSelect, onCreate, onOpenMatch, onChange, toast }: Props) {
  const selected = workspace.tournaments.find((item) => item.id === selectedId);
  const [tab, setTab] = useState<TournamentTab>('Overview');
  const [reasonAction, setReasonAction] = useState<'pause' | 'resume' | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [scheduleEdit, setScheduleEdit] = useState<Match | null>(null);
  const [fieldEditOpen, setFieldEditOpen] = useState(false);
  const sorted = useMemo(() => [...workspace.tournaments].sort((a, b) => statusRank(a.status) - statusRank(b.status)), [workspace.tournaments]);
  const update = (next: Tournament) => onChange({ ...workspace, tournaments: workspace.tournaments.map((item) => item.id === next.id ? next : item) });
  const importDraw = async (file?: File) => {
    if (!selected || !file) return;
    try {
      const contents = await file.text();
      const rows = file.name.toLowerCase().endsWith('.json')
        ? (() => { const data = JSON.parse(contents); return Array.isArray(data) ? data : data.matches ?? data.workspace?.matches; })()
        : parseDrawCsv(contents);
      if (!Array.isArray(rows)) throw new Error('Choose a CSV or JSON file containing match rows.');
      if (!rows.length) throw new Error('The file has no match rows to review.');
      const entrants: DrawEntrant[] = selected.categories.flatMap((category) => category.entries.map((entry) => ({ id: entry.id, name: entryLabel(entry, players), categoryId: category.id, categoryName: category.name, kind: category.kind, playerIds: entry.playerIds })));
      const matchEntrant = (value: string, categoryName: string) => {
        const normalized = value.trim().toLocaleLowerCase();
        const pool = categoryName ? entrants.filter((entrant) => entrant.categoryName.toLocaleLowerCase() === categoryName.toLocaleLowerCase()) : entrants;
        const exactId = pool.find((entrant) => entrant.id.toLocaleLowerCase() === normalized);
        const exactNames = pool.filter((entrant) => entrant.name.trim().toLocaleLowerCase() === normalized);
        return { entryId: exactId?.id ?? (exactNames.length === 1 ? exactNames[0].id : ''), matched: exactId ?? (exactNames.length === 1 ? exactNames[0] : undefined), match: exactId ? 'id' : exactNames.length === 1 ? 'name' : exactNames.length > 1 ? 'ambiguous' : 'missing' };
      };
      const mappedRows: ImportRow[] = rows.map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Row ${index + 2} must be an object with player_one, player_two, and round fields.`);
        const row = Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ''), String(value ?? '').trim()]));
        const firstRaw = row.playerone ?? row.playeronename ?? row.playeroneid ?? row.player1 ?? row.player1name ?? row.playera ?? row.home ?? '';
        const secondRaw = row.playertwo ?? row.playertwoname ?? row.playertwoid ?? row.player2 ?? row.player2name ?? row.playerb ?? row.away ?? '';
        const category = row.category || row.division || '';
        const first = matchEntrant(firstRaw, category); const second = matchEntrant(secondRaw, category);
        const inferredCategory = category || (first.matched?.categoryId === second.matched?.categoryId ? first.matched?.categoryName ?? '' : '');
        return {
          rowNumber: index + 2,
          sourceId: row.matchid || row.id || '',
          playerOneId: first.entryId,
          playerTwoId: second.entryId,
          round: row.round || row.roundname || '',
          table: row.table || '',
          category: inferredCategory,
          startsAt: row.starttime || row.startsat || row.time || 'TBD',
          oneMatch: first.match,
          twoMatch: second.match,
        };
      });
      setImportPreview({ fileName: file.name, rows: mappedRows });
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not read that draw file'); }
  };
  const importErrors = useMemo(() => importPreview && selected ? validateImportPreview(importPreview.rows, selected, workspace, players) : [], [importPreview, selected, workspace, players]);
  const applyImport = () => {
    if (!selected || !importPreview || importErrors.length) return;
    const imported = importPreview.rows.map((row) => {
      const category = selected.categories.find((item) => item.name === row.category)!;
      const one = category.entries.find((entry) => entry.id === row.playerOneId)!;
      const two = category.entries.find((entry) => entry.id === row.playerTwoId)!;
      const match = createMatch({ playerOneId: one.playerIds[0], playerTwoId: two.playerIds[0], format: 'Best of 5', pointsPerGame: 11, gamesToWin: 3, tournamentId: selected.id, table: row.table || undefined }, workspace.players);
      match.sideOneId = one.id; match.sideTwoId = two.id; match.sideOnePlayerIds = one.playerIds; match.sideTwoPlayerIds = two.playerIds; match.sideOneLabel = entryLabel(one, players); match.sideTwoLabel = entryLabel(two, players); match.gamesWon = { [one.id]: 0, [two.id]: 0 }; match.score = { [one.id]: 0, [two.id]: 0 }; match.tossWinnerId = one.id; match.categoryId = category.id;
      match.tournamentName = selected.name; match.round = row.round.trim(); match.category = category.name; match.startsAt = row.startsAt.trim() || 'TBD';
      return match;
    });
    const audit = { id: crypto.randomUUID(), action: 'Draw imported', target: `${imported.length} fixtures`, reason: `Imported from ${importPreview.fileName}`, at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    const updatedTournament = { ...selected, matchIds: [...selected.matchIds, ...imported.map((match) => match.id)], audit: [audit, ...selected.audit] };
    onChange({ ...workspace, matches: [...imported, ...workspace.matches], tournaments: workspace.tournaments.map((item) => item.id === selected.id ? updatedTournament : item) });
    setImportPreview(null); toast(`${imported.length} draw ${imported.length === 1 ? 'match' : 'matches'} imported`);
  };
  const saveSchedule = (startsAt: string, table: string, reason: string) => {
    if (!scheduleEdit || !selected || scheduleEdit.status === 'Completed') return;
    const updatedMatch = { ...scheduleEdit, startsAt: startsAt.trim() || 'TBD', table: table.trim() || undefined };
    const audit = { id: crypto.randomUUID(), action: 'Match rescheduled', target: `${players.get(scheduleEdit.playerOneId)?.name ?? 'Player one'} vs ${players.get(scheduleEdit.playerTwoId)?.name ?? 'Player two'}`, reason, at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    onChange({ ...workspace, matches: workspace.matches.map((match) => match.id === updatedMatch.id ? updatedMatch : match), tournaments: workspace.tournaments.map((item) => item.id === selected.id ? { ...item, audit: [audit, ...item.audit] } : item) });
    setScheduleEdit(null); toast('Match schedule updated and recorded');
  };
  const selectedMatches = selected ? workspace.matches.filter((match) => match.tournamentId === selected.id || selected.matchIds.includes(match.id)) : [];
  const canEditField = Boolean(selected && selected.status === 'Upcoming' && selected.categories.length === 1 && selected.categories[0].kind === 'Singles' && selectedMatches.every((match) => match.status === 'Scheduled' && !match.winnerId && !match.events.length && !match.gameResults?.length));
  const saveField = (entrantIds: string[], reason: string) => {
    if (!selected || !canEditField || entrantIds.length < 2 || new Set(entrantIds).size !== entrantIds.length || entrantIds.some((id) => !workspace.players.some((player) => player.id === id))) return;
    const oldCategory = selected.categories[0];
    const categories = [{ ...oldCategory, entries: entrantIds.map((id) => ({ id, name: '', playerIds: [id], seed: oldCategory.entries.find((entry) => entry.id === id)?.seed })) }];
    const seeds = Object.fromEntries(categories[0].entries.filter((entry) => entry.seed).map((entry) => [entry.id, entry.seed!]));
    const rebuilt = createTournament({ name: selected.name, format: selected.format, date: selected.date, venue: selected.venue, tableCount: selected.tableCount, categories, entrantIds, seeds });
    const fixtures = generateTournamentFixtures(rebuilt, workspace.players).map((match) => ({ ...match, tournamentId: selected.id, tournamentName: selected.name }));
    const oldIds = new Set(selectedMatches.map((match) => match.id));
    const audit = { id: crypto.randomUUID(), action: 'Entrants and draw updated', target: `${selected.entrantIds.length} → ${entrantIds.length} entrants · ${oldIds.size} pending fixtures replaced`, reason, at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    const updatedTournament: Tournament = { ...selected, categories: rebuilt.categories, entrantIds, seeds: rebuilt.seeds, byePlayerIds: rebuilt.byePlayerIds, bracketSlots: rebuilt.bracketSlots, rounds: rebuilt.rounds, matchIds: fixtures.map((match) => match.id), completed: 0, status: 'Upcoming', standings: rebuilt.standings, audit: [audit, ...selected.audit] };
    onChange({ ...workspace, matches: [...fixtures, ...workspace.matches.filter((match) => !oldIds.has(match.id))], tournaments: workspace.tournaments.map((item) => item.id === selected.id ? updatedTournament : item) });
    setFieldEditOpen(false); toast('Entrants and pending draw updated and recorded');
  };
  const commitProgression = (reason: string) => {
    if (!selected || !reasonAction) return;
    const paused = reasonAction === 'pause';
    const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const audit = { id: crypto.randomUUID(), action: paused ? 'Progression paused' : 'Progression resumed', target: 'Tournament', reason, at };
    if (paused) update({ ...selected, progressPaused: true, status: 'Paused', audit: [audit, ...selected.audit] });
    else {
      let matches = workspace.matches;
      let auditEntries = [audit, ...selected.audit];
      let generatedCount = 0;
      for (const category of selected.categories.filter((item) => item.format === 'Knockout')) {
        const fixtures = matches.filter((match) => match.tournamentId === selected.id && match.categoryId === category.id);
        const roundNumber = Math.max(1, ...fixtures.map((match) => Number(match.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1)));
        const roundMatches = fixtures.filter((match) => Number(match.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1) === roundNumber);
        const hasNext = fixtures.some((match) => Number(match.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1) > roundNumber);
        const finalRound = roundNumber >= Math.ceil(Math.log2(Math.max(2, category.entries.length)));
        if (hasNext || finalRound || !roundMatches.length) continue;
        const qualifiers = new Map<number, string>();
        if (roundNumber === 1) for (const entryId of category.byeEntryIds ?? []) { const slot = (category.bracketSlots ?? []).indexOf(entryId); if (slot >= 0) qualifiers.set(Math.floor(slot / 2), entryId); }
        if (category.kind === 'Team') {
          const ties = new Map<string, Match[]>();
          for (const match of roundMatches) if (match.teamTieId) ties.set(match.teamTieId, [...(ties.get(match.teamTieId) ?? []), match]);
          if (!ties.size || [...ties.values()].some((tie) => !resolveTeamTie(tie, category.teamSystem ?? 'new_swaythling').winnerId)) continue;
          for (const tie of ties.values()) { const winner = resolveTeamTie(tie, category.teamSystem ?? 'new_swaythling').winnerId; if (winner) qualifiers.set(tie[0].bracketOrder ?? 0, winner); }
        } else {
          if (roundMatches.some((match) => match.status !== 'Completed' || !match.winnerId)) continue;
          for (const match of roundMatches) qualifiers.set(match.bracketOrder ?? 0, match.winnerId === match.sideOneId ? match.sideOneId! : match.sideTwoId!);
        }
        const next = generateCategoryRoundFixtures(selected, category, [...qualifiers.entries()].sort((a, b) => a[0] - b[0]).map(([, id]) => id), roundNumber + 1, workspace.players);
        if (next.length) { matches = [...next, ...matches]; generatedCount += next.length; auditEntries.unshift({ id: crypto.randomUUID(), action: 'Category round generated', target: `${category.name} · Round ${roundNumber + 1} · ${next.length} fixtures`, reason: 'Completed category round advanced after progression resumed', at }); }
      }
      const matchIds = [...selected.matchIds, ...matches.filter((match) => match.tournamentId === selected.id && !selected.matchIds.includes(match.id)).map((match) => match.id)];
      const eventMatches = matches.filter((match) => match.tournamentId === selected.id);
      const hasStarted = eventMatches.some((match) => match.status !== 'Scheduled' || match.events.length > 0);
      const allDone = selected.categories.every((category) => {
        const categoryFixtures = eventMatches.filter((match) => match.categoryId === category.id);
        if (!categoryFixtures.length) return false;
        if (category.format === 'Round robin') return categoryFixtures.every((match) => match.status === 'Completed' || match.status === 'Not played');
        const lastRound = Math.max(...categoryFixtures.map((match) => Number(match.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1)));
        return lastRound >= Math.ceil(Math.log2(Math.max(2, category.entries.length))) && categoryFixtures.filter((match) => Number(match.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1) === lastRound).every((match) => match.status === 'Completed' || match.status === 'Not played');
      });
      const status = allDone ? 'Completed' : hasStarted ? 'Running' : 'Upcoming';
      onChange({ ...workspace, matches, tournaments: workspace.tournaments.map((item) => item.id === selected.id ? { ...selected, matchIds, progressPaused: false, status, audit: auditEntries } : item) });
      setReasonAction(null); toast(generatedCount ? `Progression resumed · ${generatedCount} next-round ${generatedCount === 1 ? 'fixture' : 'fixtures'} created` : 'Automatic progression resumed');
      return;
    }
    setReasonAction(null); toast('Automatic progression paused');
  };
  return <div className="page-content tournaments-page">
    {!selected ? <>
      <div className="page-intro"><div><p className="eyebrow">EVENT CONTROL</p><h2>Tournaments</h2><p>Plan a draw, follow the day and keep organiser decisions visible.</p></div><button className="button button-primary" onClick={onCreate}><Plus size={16} /> Create tournament</button></div>
      <div className="tournament-summary-line"><span><i className="summary-live-dot" />{workspace.tournaments.filter((item) => item.status === 'Running').length} running</span><span>{workspace.tournaments.filter((item) => item.status === 'Upcoming').length} upcoming</span><span>{workspace.tournaments.filter((item) => item.status === 'Completed').length} completed</span></div>
      <div className="tournament-list">{sorted.map((tournament) => <button className="tournament-row" key={tournament.id} onClick={() => { onSelect(tournament.id); setTab('Overview'); }}><span className={`tournament-emblem tournament-emblem--${tournament.format === 'Knockout' ? 'knockout' : 'round'}`}><Trophy size={19} /></span><span className="tournament-row-main"><span><b>{tournament.name}</b><span className="format-tag">{tournament.format}</span></span><small>{tournament.venue} <i>·</i> {tournament.date}</small></span><span className="tournament-row-entrants"><Users size={15} />{tournament.entrantIds.length} entrants</span><span className="tournament-progress-col"><b>{tournament.completed}<small> / {tournament.matchIds.length || tournament.rounds}</small></b><span className="mini-progress"><i style={{ width: `${Math.min(100, tournament.matchIds.length ? tournament.completed / tournament.matchIds.length * 100 : 0)}%` }} /></span><small>{tournament.matchIds.length ? 'matches complete' : 'rounds'}</small></span><TournamentStatus status={tournament.status} /><span className="row-open"><ArrowRight size={16} /></span></button>)}</div>
      {!workspace.tournaments.length && <div className="table-empty"><span className="empty-mark"><Trophy size={20} /></span><h3>No tournaments yet</h3><p>Create a tournament to start managing entrants, rounds and results.</p><button className="button button-primary" onClick={onCreate}>Create tournament <ArrowRight size={15} /></button></div>}
      <div className="organiser-note"><ShieldCheck size={17} /><span><b>Organiser control stays with you.</b> Draws can be changed, progression paused and results corrected with a reason kept in the audit history.</span></div>
    </> : <>
      <div className="tournament-detail-top"><button className="back-link" onClick={() => onSelect(null)}><Undo2 size={14} /> All tournaments</button><div className="detail-actions"><button className="button button-outline" onClick={() => exportTournamentPackage(selected, workspace, players)}><Download size={15} /> Export package</button><button className="button button-outline" onClick={() => setReasonAction(selected.progressPaused ? 'resume' : 'pause')}>{selected.progressPaused ? <Play size={15} /> : <Pause size={15} />}{selected.progressPaused ? 'Resume progression' : 'Pause progression'}</button><button className="button button-primary" onClick={() => { const nextMatch = selected.matchIds.map((id) => workspace.matches.find((match) => match.id === id)).filter((match): match is Match => Boolean(match && match.status !== 'Completed')).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]; if (nextMatch) onOpenMatch(nextMatch.id); else toast('No playable match is scheduled yet'); }}><CircleHelp size={15} /> Open next match</button></div></div>
      <section className="tournament-detail-hero"><div className="detail-emblem"><Trophy size={22} /></div><div className="detail-title"><div className="detail-title-top"><TournamentStatus status={selected.status} /><span className="format-tag">{selected.format}</span><span className="detail-created">Created {selected.date}</span></div><h2>{selected.name}</h2><p><CalendarDays size={14} /> {selected.date}<i /> <Users size={14} /> {selected.entrantIds.length} entrants<i />{selected.venue}</p><div className="category-chip-row">{categoryNames(selected).map((category) => <span className="category-chip" key={category}>{category}</span>)}<span className="category-chip category-chip--tables">{selected.tableCount ?? 1} tables</span></div></div><div className="detail-progress"><span>EVENT PROGRESS</span><b>{selected.completed}<small> / {selected.matchIds.length || selected.rounds}</small></b><div className="mini-progress"><i style={{ width: `${selected.matchIds.length ? Math.min(100, selected.completed / selected.matchIds.length * 100) : 0}%` }} /></div><small>{selected.matchIds.length ? 'matches complete' : 'rounds to play'}</small></div></section>
      <div className="tournament-tabs" role="tablist" aria-label="Tournament sections">{(['Overview', 'Draw & matches', 'Standings', 'Audit log'] as TournamentTab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'tournament-tab tournament-tab--active' : 'tournament-tab'} onClick={() => setTab(item)}>{item}{item === 'Audit log' && <span>{selected.audit.length}</span>}</button>)}</div>
      {tab === 'Overview' && <TournamentOverview tournament={selected} matches={selectedMatches} players={players} onOpenMatch={onOpenMatch} onTab={setTab} onEditField={() => setFieldEditOpen(true)} canEditField={canEditField} />}
      {tab === 'Draw & matches' && <TournamentDraw matches={workspace.matches.filter((match) => match.tournamentId === selected.id || selected.matchIds.includes(match.id))} players={players} onOpenMatch={onOpenMatch} onImport={importDraw} onReschedule={setScheduleEdit} />}
      {tab === 'Standings' && <TournamentStandings tournament={selected} players={players} matches={workspace.matches.filter((match) => match.tournamentId === selected.id || selected.matchIds.includes(match.id))} />}
      {tab === 'Audit log' && <TournamentAudit tournament={selected} />}
    </>}
    {importPreview && selected && <ImportDrawDialog preview={importPreview} entrants={selected.categories.flatMap((category) => category.entries.map((entry) => ({ id: entry.id, name: entryLabel(entry, players), categoryId: category.id, categoryName: category.name, kind: category.kind, playerIds: entry.playerIds })))} categories={categoryNames(selected)} errors={importErrors} onChange={(rowIndex, key, value) => setImportPreview((current) => current ? { ...current, rows: current.rows.map((row, index) => rowIndex === index ? { ...row, [key]: value, ...(key === 'playerOneId' ? { oneMatch: 'manual' } : key === 'playerTwoId' ? { twoMatch: 'manual' } : {}) } : row) } : current)} onClose={() => setImportPreview(null)} onApply={applyImport} />}
    {scheduleEdit && selected && <ScheduleDialog match={scheduleEdit} tableCount={selected.tableCount ?? 1} onClose={() => setScheduleEdit(null)} onSave={saveSchedule} />}
    {fieldEditOpen && selected && <EditFieldDialog tournament={selected} players={workspace.players} pendingFixtureCount={selectedMatches.length} onClose={() => setFieldEditOpen(false)} onSave={saveField} />}
    {reasonAction && <ReasonDialog action={reasonAction} onClose={() => setReasonAction(null)} onConfirm={commitProgression} />}
  </div>;
}

function TournamentOverview({ tournament, matches, players, onOpenMatch, onTab, onEditField, canEditField }: { tournament: Tournament; matches: Match[]; players: Map<string, Player>; onOpenMatch: (id: string) => void; onTab: (tab: TournamentTab) => void; onEditField: () => void; canEditField: boolean }) {
  const nextMatches = [...matches].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 4);
  return <div className="tournament-overview-grid"><section className="tournament-section"><div className="section-head"><div><p className="eyebrow">ON THE TABLE</p><h3>Next matches</h3></div><button className="quiet-link" onClick={() => onTab('Draw & matches')}>Full draw <ArrowRight size={14} /></button></div>{nextMatches.length ? <div className="tournament-match-list">{nextMatches.map((match) => <TournamentMatchRow key={match.id} match={match} players={players} onClick={() => onOpenMatch(match.id)} />)}</div> : <div className="empty-draw"><span className="empty-mark"><Activity size={18} /></span><div><b>No fixtures yet</b><span>Add a draw or create a match for this event.</span></div></div>}</section>
    <section className="tournament-section control-section"><div className="section-head"><div><p className="eyebrow">ORGANISER CONTROL</p><h3>Event settings</h3></div><span className="settings-symbol"><Activity size={15} /></span></div><div className="setting-line"><span>Format</span><b>{tournament.format}</b></div><div className="setting-line"><span>Venue tables</span><b>{tournament.tableCount ?? 1}</b></div><div className="setting-line"><span>Categories</span><b>{categoryNames(tournament).length}</b></div><div className="setting-line"><span>Automatic progression</span><b className={tournament.progressPaused ? 'state-off' : 'state-on'}><i />{tournament.progressPaused ? 'Paused' : 'Available'}</b></div><div className="setting-line"><span>Entrants</span><b>{tournament.entrantIds.length} players</b></div>{tournament.tieBreaks.length > 0 && <div className="tie-break-box"><span>STANDINGS ORDER</span><p>{tournament.tieBreaks.join(' < ')} <ChevronRight size={13} /></p></div>}<button className="control-audit-link" onClick={() => onTab('Audit log')}>Review change history <ArrowRight size={14} /></button></section>
    <section className="entrant-strip"><div><p className="eyebrow">THE FIELD</p><h3>{tournament.entrantIds.length} entrants</h3><small className="field-edit-hint">{canEditField ? 'Pending draw can be safely rebuilt' : 'Field locks when a match starts'}</small></div><div className="entrant-avatars">{tournament.entrantIds.slice(0, 6).map((id) => <span className="avatar avatar--tiny" key={id}>{players.get(id)?.initials ?? '?'}</span>)}{tournament.entrantIds.length > 6 && <span className="avatar avatar--tiny entrant-more">+{tournament.entrantIds.length - 6}</span>}</div><span className="entrant-strip-spacer" /><button className="button button-outline field-edit-button" onClick={onEditField} disabled={!canEditField}>Edit entrants</button><button className="quiet-link" onClick={() => onTab('Standings')}>Standings <ArrowRight size={14} /></button></section>
  </div>;
}

function TournamentDraw({ matches, players, onOpenMatch, onImport, onReschedule }: { matches: Match[]; players: Map<string, Player>; onOpenMatch: (id: string) => void; onImport: (file?: File) => void; onReschedule: (match: Match) => void }) {
  const [roundFilter, setRoundFilter] = useState('All rounds');
  const importRef = useRef<HTMLInputElement>(null);
  const rounds = [...new Set(matches.map((match) => match.round ?? 'Unassigned'))];
  const filtered = matches.filter((match) => roundFilter === 'All rounds' || match.round === roundFilter);
  const grouped = filtered.reduce<Record<string, Match[]>>((groups, match) => { const key = match.round ?? 'Unassigned'; (groups[key] ??= []).push(match); return groups; }, {});
  return <section className="tournament-section draw-section"><div className="section-head"><div><p className="eyebrow">DRAW CONTROL</p><h3>Draw & matches</h3><p className="section-caption">Review each fixture. Open a match to score, reschedule or record a result.</p></div><div className="draw-toolbar"><select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)} aria-label="Filter by round"><option>All rounds</option>{rounds.map((round) => <option key={round}>{round}</option>)}</select><button className="button button-outline template-button" onClick={() => downloadDrawTemplate('csv')}><FileSpreadsheet size={14} /><span>CSV template</span></button><button className="button button-outline template-button" onClick={() => downloadDrawTemplate('json')}><FileJson2 size={14} /><span>JSON template</span></button><button className="button button-outline" onClick={() => importRef.current?.click()}><Plus size={15} /> Import draw</button><input ref={importRef} type="file" className="sr-only" accept=".csv,.json,text/csv,application/json" onChange={(event) => { onImport(event.target.files?.[0]); event.target.value = ''; }} /></div></div>
    {Object.keys(grouped).length ? <div className="draw-groups">{Object.entries(grouped).map(([round, items]) => <div className="draw-group" key={round}><div className="draw-group-title"><span>{round}</span><i /><small>{items.length} matches</small></div>{items.map((match) => <div className="tournament-match-shell" key={match.id}><TournamentMatchRow match={match} players={players} onClick={() => onOpenMatch(match.id)} expanded /><span className="match-category-badge">{match.category ?? 'Unassigned'}</span><button className="reschedule-button" onClick={() => onReschedule(match)} disabled={match.status === 'Completed' || match.status === 'Not played'} aria-label={`Reschedule ${players.get(match.playerOneId)?.name} versus ${players.get(match.playerTwoId)?.name}`}><CalendarClock size={14} /><span>Reschedule</span></button></div>)}</div>)}</div> : <div className="empty-draw"><span className="empty-mark"><Trophy size={18} /></span><div><b>No matches in this draw</b><span>Import a CSV or JSON draw, or create category entrants to generate fixtures.</span></div><button className="button button-outline" onClick={() => importRef.current?.click()}><Plus size={14} /> Import draw</button></div>}
  </section>;
}

function ImportDrawDialog({ preview, entrants, categories, errors, onChange, onClose, onApply }: { preview: ImportPreview; entrants: DrawEntrant[]; categories: string[]; errors: string[]; onChange: (rowIndex: number, key: 'playerOneId' | 'playerTwoId' | 'category', value: string) => void; onClose: () => void; onApply: () => void }) {
  return <Dialog title="Review imported draw" eyebrow="NON-DESTRUCTIVE PREVIEW" onClose={onClose} size="wide">
    <div className="import-review-summary"><FileSpreadsheet size={17} /><span><b>{preview.fileName}</b><small>{preview.rows.length} fixtures found · nothing has been added yet</small></span></div>
    {errors.length > 0 && <div className="import-review-errors" role="alert"><AlertTriangle size={16} /><div><b>Resolve these issues before importing</b><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
    <p className="table-scroll-hint"><ArrowRight size={13} /> Swipe or use arrow keys to review all fields</p>
    <div className="import-review-table-wrap" role="region" aria-label="Scrollable imported draw preview" tabIndex={0}><table className="data-table import-review-table"><thead><tr><th>ROW</th><th>PLAYER ONE</th><th></th><th>PLAYER TWO</th><th>CATEGORY</th><th>ROUND</th><th>TABLE</th></tr></thead><tbody>{preview.rows.map((row, index) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><label className="sr-only" htmlFor={`import-one-${row.rowNumber}`}>Player one for row {row.rowNumber}</label><select id={`import-one-${row.rowNumber}`} value={row.playerOneId} onChange={(event) => onChange(index, 'playerOneId', event.target.value)}><option value="">{row.oneMatch === 'ambiguous' ? 'Choose matching name' : 'Map to roster player'}</option>{entrants.map((player) => <option key={player.id} value={player.id}>{player.name} · {player.id.slice(0, 6)}</option>)}</select></td><td>vs</td><td><label className="sr-only" htmlFor={`import-two-${row.rowNumber}`}>Player two for row {row.rowNumber}</label><select id={`import-two-${row.rowNumber}`} value={row.playerTwoId} onChange={(event) => onChange(index, 'playerTwoId', event.target.value)}><option value="">{row.twoMatch === 'ambiguous' ? 'Choose matching name' : 'Map to roster player'}</option>{entrants.map((player) => <option key={player.id} value={player.id}>{player.name} · {player.id.slice(0, 6)}</option>)}</select></td><td><label className="sr-only" htmlFor={`import-category-${row.rowNumber}`}>Category for row {row.rowNumber}</label><select id={`import-category-${row.rowNumber}`} value={row.category} onChange={(event) => onChange(index, 'category', event.target.value)}><option value="">Choose category</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></td><td>{row.round || <span className="import-missing">Missing</span>}</td><td>{row.table || '—'}</td></tr>)}</tbody></table></div>
    <p className="import-review-note">Fixtures are appended to this tournament. Existing matches and results are kept. Duplicate fixtures and multiple fixtures per player in one round are blocked.</p>
    <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel import</button><button className="button button-primary" type="button" onClick={onApply} disabled={errors.length > 0}><Check size={15} /> Import {preview.rows.length} fixtures</button></div>
  </Dialog>;
}

function ScheduleDialog({ match, tableCount, onClose, onSave }: { match: Match; tableCount: number; onClose: () => void; onSave: (startsAt: string, table: string, reason: string) => void }) {
  const [startsAt, setStartsAt] = useState(match.startsAt === 'TBD' ? '' : match.startsAt);
  const [table, setTable] = useState(match.table ?? '');
  const [reason, setReason] = useState('');
  return <Dialog title="Reschedule match" eyebrow="ORGANISER CHANGE" onClose={onClose}>
    <form className="form-stack" noValidate onSubmit={(event) => { event.preventDefault(); if (reason.trim()) onSave(startsAt, table, reason.trim()); }}>
      <p className="dialog-copy">Change the start time or table. Your reason will be kept in this tournament’s audit log.</p>
      <label className="field"><span>Start time</span><input autoFocus value={startsAt} onChange={(event) => setStartsAt(event.target.value)} placeholder="e.g. 10:30 or TBD" maxLength={40} /></label>
      <label className="field"><span>Table</span><select value={table} onChange={(event) => setTable(event.target.value)}><option value="">Unassigned</option>{Array.from({ length: Math.max(1, tableCount) }, (_, index) => `Table ${String(index + 1).padStart(2, '0')}`).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="field"><span>Reason for this change</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Table became unavailable" maxLength={160} required /></label>
      <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!reason.trim()}><CalendarClock size={15} /> Save schedule</button></div>
    </form>
  </Dialog>;
}

function EditFieldDialog({ tournament, players, pendingFixtureCount, onClose, onSave }: { tournament: Tournament; players: Player[]; pendingFixtureCount: number; onClose: () => void; onSave: (entrantIds: string[], reason: string) => void }) {
  const [entrantIds, setEntrantIds] = useState(tournament.entrantIds);
  const [reason, setReason] = useState('');
  const toggle = (id: string) => setEntrantIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <Dialog title="Edit tournament entrants" eyebrow="SAFE DRAW CHANGE" onClose={onClose} size="wide">
    <form className="form-stack" noValidate onSubmit={(event) => { event.preventDefault(); if (entrantIds.length >= 2 && reason.trim()) onSave(entrantIds, reason.trim()); }}>
      <p className="dialog-copy">This event has not started. Changing the field rebuilds its pending {tournament.format.toLowerCase()} draw. No match results will be removed.</p>
      <div className="field-edit-count"><Users size={16} /><span><b>{entrantIds.length} entrants selected</b><small>{pendingFixtureCount} pending {pendingFixtureCount === 1 ? 'fixture' : 'fixtures'} will be replaced</small></span></div>
      <div className="entrant-picker"><div className="entrant-picker-head"><span>Choose the field</span><small>At least 2 players</small></div><div className="entrant-list">{players.map((player) => <label className={`entrant-option ${entrantIds.includes(player.id) ? 'entrant-option--selected' : ''}`} key={player.id}><input type="checkbox" checked={entrantIds.includes(player.id)} onChange={() => toggle(player.id)} /><span className="avatar avatar--tiny">{player.initials}</span><span>{player.name}</span><span className="entrant-rating">{player.rating}</span></label>)}</div></div>
      <label className="field"><span>Reason for this change</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. A player can no longer attend" required maxLength={160} /></label>
      <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={entrantIds.length < 2 || !reason.trim()}><Users size={15} /> Rebuild pending draw</button></div>
    </form>
  </Dialog>;
}

function exportTournamentPackage(tournament: Tournament, workspace: Workspace, players: Map<string, Player>) {
  const matches = workspace.matches.filter((match) => match.tournamentId === tournament.id || tournament.matchIds.includes(match.id));
  const matchIds = new Set(matches.map((match) => match.id));
  const activityLog = workspace.activityLog.filter((event) => event.entityId === tournament.id || matchIds.has(event.entityId));
  const packageData = { schemaVersion: 2, exportedAt: new Date().toISOString(), source: 'Rallydesk local preview', tournament, entrants: tournament.entrantIds.map((id) => players.get(id)).filter(Boolean), matches, activityLog };
  const url = URL.createObjectURL(new Blob([JSON.stringify(packageData, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `rallydesk-${slug(tournament.name)}-tournament.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(value: string) { return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event'; }

function validateImportPreview(rows: ImportRow[], tournament: Tournament, workspace: Workspace, players: Map<string, Player>): string[] {
  const errors: string[] = []; const sourceIds = new Set<string>();
  const pairs = new Set<string>(); const playedByRound = new Set<string>();
  const existing = workspace.matches.filter((match) => match.tournamentId === tournament.id || tournament.matchIds.includes(match.id));
  for (const row of rows) {
    const round = row.round.trim(); const category = tournament.categories.find((item) => item.name === row.category);
    if (categoryNames(tournament).length > 1 && !row.category) errors.push(`Row ${row.rowNumber}: choose a category for this fixture.`);
    if (row.sourceId) {
      if (sourceIds.has(row.sourceId)) errors.push(`Row ${row.rowNumber}: source match ID ${row.sourceId} is duplicated in this file.`);
      else sourceIds.add(row.sourceId);
      if (workspace.matches.some((match) => match.id === row.sourceId)) errors.push(`Row ${row.rowNumber}: source match ID ${row.sourceId} already exists in this workspace.`);
    }
    if (row.category && !category) errors.push(`Row ${row.rowNumber}: choose a category from this tournament.`);
    if (category?.kind === 'Team') errors.push(`Row ${row.rowNumber}: import each team tie through the team draw template; individual team lineup fixtures are generated by the selected ITTF system.`);
    const one = category?.entries.find((entry) => entry.id === row.playerOneId), two = category?.entries.find((entry) => entry.id === row.playerTwoId);
    if (!row.playerOneId || !one) errors.push(`Row ${row.rowNumber}: map side one to an entrant registered in this category (${row.oneMatch === 'ambiguous' ? 'the name is duplicated' : 'no exact category entrant match was found'}).`);
    if (!row.playerTwoId || !two) errors.push(`Row ${row.rowNumber}: map side two to an entrant registered in this category (${row.twoMatch === 'ambiguous' ? 'the name is duplicated' : 'no exact category entrant match was found'}).`);
    if (row.playerOneId && row.playerOneId === row.playerTwoId) errors.push(`Row ${row.rowNumber}: choose two different players.`);
    if (!round) errors.push(`Row ${row.rowNumber}: add a round name.`);
    if (!round || !category || !one || !two || row.playerOneId === row.playerTwoId) continue;
    const pair = [row.playerOneId, row.playerTwoId].sort().join('|'); const pairKey = `${round.toLocaleLowerCase()}|${pair}`;
    if (pairs.has(pairKey)) errors.push(`Round ${round}: the same fixture appears more than once in this file.`);
    pairs.add(pairKey);
    if (existing.some((match) => match.categoryId === category.id && (match.round ?? '').toLocaleLowerCase() === round.toLocaleLowerCase() && [match.sideOneId ?? match.playerOneId, match.sideTwoId ?? match.playerTwoId].sort().join('|') === pair)) errors.push(`Round ${round}: ${entryLabel(one, players)} vs ${entryLabel(two, players)} already exists in this tournament.`);
    for (const playerId of [...one.playerIds, ...two.playerIds]) {
      const key = `${round.toLocaleLowerCase()}|${playerId}`;
      if (playedByRound.has(key)) errors.push(`Round ${round}: ${players.get(playerId)?.name} appears in more than one fixture.`);
      playedByRound.add(key);
    }
  }
  return [...new Set(errors)];
}

function downloadDrawTemplate(type: 'csv' | 'json') {
  const isCsv = type === 'csv';
  const body = isCsv ? 'player_one,player_two,category,round,table,start_time\n' : JSON.stringify({ schema_version: 1, matches: [{ player_one: '', player_two: '', category: '', round: 'Round 1', table: '', start_time: '' }] }, null, 2);
  const url = URL.createObjectURL(new Blob([body], { type: isCsv ? 'text/csv;charset=utf-8' : 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `rallydesk-draw-template.${type}`; link.click(); URL.revokeObjectURL(url);
}

function TournamentStandings({ tournament, players, matches }: { tournament: Tournament; players: Map<string, Player>; matches: Match[] }) {
  return <>{tournament.categories.map((category) => {
    const entries = new Map(category.entries.map((entry) => [entry.id, entry]));
    const entryName = (id: string) => { const entry = entries.get(id); return entry?.name || entry?.playerIds.map((playerId) => players.get(playerId)?.name ?? 'Unknown').join(' & ') || 'Unknown entrant'; };
    const rows = [...(category.standings ?? [])].sort((a, b) => b.wins - a.wins || (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost) || b.gamesWon - a.gamesWon);
    const fixtures = matches.filter((match) => match.categoryId === category.id);
    const progression = category.entries.map((entry) => {
      const entryMatches = fixtures.filter((match) => match.sideOneId === entry.id || match.sideTwoId === entry.id || match.teamOneId === entry.id || match.teamTwoId === entry.id);
      const current = entryMatches.sort((a, b) => Number(a.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1) - Number(b.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1)).at(-1);
      const bye = category.byeEntryIds?.includes(entry.id);
      return { entry, state: bye && !current ? 'Bye · advances' : current?.round ?? 'Awaiting draw', status: current?.status ?? 'Scheduled' };
    });
    return <section className="tournament-section standings-section" key={category.id}><div className="section-head"><div><p className="eyebrow">{category.kind.toUpperCase()} · {category.format.toUpperCase()}</p><h3>{category.name}</h3><p className="section-caption">{category.kind === 'Team' ? `ITTF ${category.teamSystem?.replaceAll('_', ' ') ?? 'team'} system` : `${category.entries.length} registered entrants`}</p></div></div>
      {category.format === 'Knockout' ? <><div className="progression-note"><ShieldCheck size={17} /><span>Advancement is tracked independently for this category. Team ties stop when a team wins the required majority of individual matches.</span></div><div className="progression-entrants">{progression.map(({ entry, state, status }, index) => <div className="progression-entrant" key={entry.id}><span className="seed-number">{String(index + 1).padStart(2, '0')}</span><span className="avatar avatar--tiny">{entry.playerIds.map((id) => players.get(id)?.initials).filter(Boolean).join('/') || entry.name.slice(0, 2).toUpperCase()}</span><b>{entryName(entry.id)}</b><span className="entrant-rating">{entry.seed ? `Seed ${entry.seed}` : 'Unseeded'}</span><span className="progression-status">{state} · {status}</span></div>)}</div></> : <><p className="table-scroll-hint"><ArrowRight size={13} /> Swipe or use arrow keys to view all columns</p><div className="standings-table-wrap" role="region" aria-label={`${category.name} standings`} tabIndex={0}><table className="data-table standings-table"><thead><tr><th>POS</th><th>ENTRY</th><th>PLAYED</th><th>W</th><th>L</th><th>GAMES</th><th>DIFF</th><th>POINTS</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.playerId}><td><span className={`rank ${index === 0 ? 'rank--first' : ''}`}>{String(index + 1).padStart(2, '0')}</span></td><td><div className="standing-player"><span className="avatar avatar--tiny">{entries.get(row.playerId)?.playerIds.map((id) => players.get(id)?.initials).filter(Boolean).join('/') || entryName(row.playerId).slice(0, 2).toUpperCase()}</span><b>{entryName(row.playerId)}</b>{index === 0 && row.played > 0 && <span className="leader-mark">LEADER</span>}</div></td><td>{row.played}</td><td className="win-cell">{row.wins}</td><td>{row.losses}</td><td>{row.gamesWon}–{row.gamesLost}</td><td>{row.gamesWon - row.gamesLost > 0 ? '+' : ''}{row.gamesWon - row.gamesLost}</td><td>{row.pointsFor}–{row.pointsAgainst}</td></tr>)}</tbody></table></div><p className="table-footnote"><span /> Rankings use match wins, game difference and games won.</p></>}
    </section>;
  })}</>;
}

function TournamentAudit({ tournament }: { tournament: Tournament }) {
  return <section className="tournament-section audit-section"><div className="section-head"><div><p className="eyebrow">ORGANISER HISTORY</p><h3>Audit log</h3><p className="section-caption">Changes and the reason recorded with each one.</p></div><span className="audit-count">{tournament.audit.length} entries</span></div>{tournament.audit.length ? <div className="audit-list">{tournament.audit.map((entry) => <div className="audit-row" key={entry.id}><span className="audit-icon"><Activity size={15} /></span><div className="audit-copy"><b>{entry.action}</b><span>{entry.target}</span><small>Reason: {entry.reason}</small></div><time>{entry.at}</time></div>)}</div> : <div className="empty-draw"><span className="empty-mark"><ShieldCheck size={18} /></span><div><b>No organiser changes yet</b><span>Edits, corrections and progression decisions will be recorded here.</span></div></div>}</section>;
}

function TournamentMatchRow({ match, players, onClick, expanded = false }: { match: Match; players: Map<string, Player>; onClick: () => void; expanded?: boolean }) {
  const one = players.get(match.playerOneId); const two = players.get(match.playerTwoId);
  const oneId = match.sideOneId ?? match.playerOneId, twoId = match.sideTwoId ?? match.playerTwoId;
  return <button className={`tournament-match-row ${expanded ? 'tournament-match-row--expanded' : ''}`} onClick={onClick}><div className="tournament-match-time"><b>{match.startsAt}</b><small>{match.table ?? 'No table'}{match.teamTieOrder !== undefined ? ` · Tie match ${match.teamTieOrder + 1}` : ''}</small></div><div className="tournament-match-pair"><span><b className={match.winnerId === oneId ? 'winner-name' : ''}>{match.sideOneLabel ?? one?.name ?? 'Player one'}{match.sideOneTeamName ? ` · ${match.sideOneTeamName}` : ''}</b><span>{match.gamesWon[oneId] ?? 0}</span></span><span><b className={match.winnerId === twoId ? 'winner-name' : ''}>{match.sideTwoLabel ?? two?.name ?? 'Player two'}{match.sideTwoTeamName ? ` · ${match.sideTwoTeamName}` : ''}</b><span>{match.gamesWon[twoId] ?? 0}</span></span></div><StatusPill status={match.status} /><ArrowRight className="match-row-arrow" size={15} /></button>;
}

function TournamentStatus({ status }: { status: Tournament['status'] }) {
  const className = status === 'Running' ? 'tournament-status tournament-status--running' : status === 'Completed' ? 'tournament-status tournament-status--complete' : status === 'Paused' ? 'tournament-status tournament-status--paused' : 'tournament-status tournament-status--upcoming';
  return <span className={className}><i />{status}</span>;
}

function ReasonDialog({ action, onClose, onConfirm }: { action: 'pause' | 'resume'; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState(''); const isPause = action === 'pause';
  return <Dialog title={isPause ? 'Pause progression?' : 'Resume progression?'} eyebrow="ORGANISER DECISION" onClose={onClose}><form className="form-stack" noValidate onSubmit={(event) => { event.preventDefault(); if (reason.trim()) onConfirm(reason.trim()); }}><p className="dialog-copy">{isPause ? 'Automatic advancement will stop. Matches and scores remain available for manual edits.' : 'Automatic progression will be available again after this decision is recorded.'}</p><label className="field"><span>Reason for this change</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={isPause ? 'e.g. Review a disputed result' : 'e.g. Schedule confirmed'} required maxLength={160} /></label><div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!reason.trim()}>{isPause ? <Pause size={15} /> : <Play size={15} />}{isPause ? 'Pause progression' : 'Resume progression'}</button></div></form></Dialog>;
}

function statusRank(status: Tournament['status']) { return status === 'Running' ? 0 : status === 'Paused' ? 1 : status === 'Upcoming' ? 2 : 3; }


function parseDrawCsv(source: string): Record<string, string>[] {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const parseLine = (line: string) => {
    const cells: string[] = []; let cell = ''; let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
      else cell += char;
    }
    cells.push(cell.trim());
    return cells;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(parseLine(line).map((value, index) => [headers[index] ?? `column_${index}`, value])));
}
