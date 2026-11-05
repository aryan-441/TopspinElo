import { SlidingTabs, animateSwap } from '../components/CourtMotion';
import { qualifierDraw } from '../services/qualifierDraw';
import { rewindQualification } from '../services/tournamentRecovery';
import { matchAvailability } from '../services/matchAvailability';
import { recognisePdf } from '../services/pdfImport';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, CalendarClock, CalendarDays, Check, ChevronRight, Download, FileJson2, FileSpreadsheet, Pause, Pencil, Play, Plus, Printer, ShieldCheck, Trash2, Trophy, Undo2, UserRoundPlus, Users } from 'lucide-react';
import type { CategoryEntry, Match, Player, Tournament, TournamentCategory, Workspace } from '../types';
import { Dialog } from '../components/Dialog';
import { MatchRecordEditor, StatusPill } from './MatchCenter';
import { createMatch, createTournament, generateCategoryRoundFixtures, generateTournamentFixtures, resolveTeamTie } from '../services/store';

type Props = { workspace: Workspace; players: Map<string, Player>; selectedId: string | null; onSelect: (id: string | null) => void; onCreate: () => void; onOpenMatch: (id: string) => void; onChange: (next: Workspace) => void; onSaveMatch: (match: Match) => void; onDeleteMatch: (matchId: string) => void; toast: (message: string) => void };
type TournamentTab = 'Overview' | 'Draw & matches' | 'Standings' | 'Audit log';
type ImportRow = { rowNumber: number; sourceId: string; sourceOne: string; sourceTwo: string; playerOneId: string; playerTwoId: string; round: string; table: string; category: string; startsAt: string; oneMatch: string; twoMatch: string; group: string };
type GroupSuggestion = { groupName: string; playerName: string; confidence: number | null; page: number | null; entryId: string };
type PendingPlayer = { name: string; categoryId: string; playerId: string; entryId: string; newPlayer: boolean };
type ImportPreview = { fileName: string; rows: ImportRow[]; pendingPlayers?: PendingPlayer[]; groups?: { id: string; name: string; entryIds: string[] }[]; groupAssignments?: GroupSuggestion[]; groupCategoryId?: string; bracketDraft?: { categoryId: string; slots: (string | null)[]; byeSlots: number[]; entryIds: (string | null)[] }; recognizer?: string; warnings?: string[] };
type DrawEntrant = { id: string; name: string; categoryId: string; categoryName: string; kind: TournamentCategory['kind']; playerIds: string[] };
const categoryNames = (tournament: Tournament) => (tournament.categories ?? []).map((category) => typeof category === 'string' ? category : category.name);
const entryLabel = (entry: CategoryEntry, players: Map<string, Player>) => entry.name || entry.playerIds.map((id) => players.get(id)?.name ?? 'Unknown').join(' & ');
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
function pendingImportState(preview: ImportPreview, tournament: Tournament, workspace: Workspace): { tournament: Tournament; workspace: Workspace; players: Map<string, Player> } {
  const pending = preview.pendingPlayers ?? [];
  if (!pending.length) return { tournament, workspace, players: new Map(workspace.players.map((player) => [player.id, player])) };
  const added: Player[] = pending.filter((item) => item.newPlayer).map((item) => ({ id: item.playerId, name: item.name, initials: item.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join(''), hand: null, grip: null, style: null, rating: 1000, ratingBase: 1000, wins: 0, losses: 0, pointsWon: 0, recent: [] }));
  const nextWorkspace = { ...workspace, players: [...workspace.players, ...added] };
  const nextTournament = { ...tournament, entrantIds: [...new Set([...tournament.entrantIds, ...pending.map((item) => item.playerId)])], categories: tournament.categories.map((category) => {
    const entries = pending.filter((item) => item.categoryId === category.id).map((item) => ({ id: item.entryId, name: '', playerIds: [item.playerId] }));
    return entries.length ? { ...category, entries: [...category.entries, ...entries] } : category;
  }) };
  return { tournament: nextTournament, workspace: nextWorkspace, players: new Map(nextWorkspace.players.map((player) => [player.id, player])) };
}
function missingDrawNames(preview: ImportPreview, tournament: Tournament): { name: string; categoryId: string }[] {
  const names: { name: string; categoryId: string }[] = [];
  const add = (name: string, categoryId: string) => {
    const category = tournament.categories.find((item) => item.id === categoryId);
    if (!name.trim() || !category || category.kind !== 'Singles' || sameName(name, 'BYE') || names.some((item) => item.categoryId === categoryId && sameName(item.name, name))) return;
    names.push({ name: name.trim(), categoryId });
  };
  if (preview.bracketDraft) preview.bracketDraft.slots.forEach((name, index) => {
    if (name && !preview.bracketDraft!.entryIds[index] && !preview.bracketDraft!.byeSlots.includes(index + 1)) add(name, preview.bracketDraft!.categoryId);
  });
  else if (!preview.groups && !preview.groupAssignments) preview.rows.forEach((row) => {
    const category = tournament.categories.find((item) => sameName(item.name, row.category));
    if (!category) return;
    if (!row.playerOneId && row.oneMatch === 'missing') add(row.sourceOne, category.id);
    if (!row.playerTwoId && row.twoMatch === 'missing') add(row.sourceTwo, category.id);
  });
  return names;
}

export function TournamentsView({ workspace, players, selectedId, onSelect, onCreate, onOpenMatch, onChange, onSaveMatch, onDeleteMatch, toast }: Props) {
  const selected = workspace.tournaments.find((item) => item.id === selectedId);
  const [editingGroups,setEditingGroups] = useState<{categoryId:string; groups: NonNullable<ImportPreview['groups']>} | null>(null);
  const [tab, setTab] = useState<TournamentTab>('Overview');
  const [qualifierEdit,setQualifierEdit] = useState<{categoryId:string; ids:string[]; reason:string} | null>(null);
  const [rewindCategory,setRewindCategory] = useState<string | null>(null);
  const [rewindReason,setRewindReason] = useState('');
  const [reasonAction, setReasonAction] = useState<'pause' | 'resume' | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [readFile,setReadFile] = useState(false);
  useEffect(() => { if (!readFile || importPreview) return; const timer = setTimeout(() => setReadFile(false), 2200); return () => clearTimeout(timer); }, [readFile, importPreview]);
  const [importLoading, setImportLoading] = useState<{ fileName: string; kind: string } | null>(null);
  const [importElapsed, setImportElapsed] = useState(0);
  const [importFailure, setImportFailure] = useState<{ fileName: string; message: string } | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const [bracketNotice, setBracketNotice] = useState('');
  const [scheduleEdit, setScheduleEdit] = useState<Match | null>(null);
  const [fieldEditOpen, setFieldEditOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editingTournament, setEditingTournament] = useState(false);
  const [tournamentJson, setTournamentJson] = useState('');
  const [tournamentJsonError, setTournamentJsonError] = useState('');
  const [deleteTournamentConfirm, setDeleteTournamentConfirm] = useState(false);
  const sorted = useMemo(() => [...workspace.tournaments].sort((a, b) => statusRank(a.status) - statusRank(b.status)), [workspace.tournaments]);
  useEffect(() => {
    if (!importLoading) return;
    const started = Date.now();
    const interval = window.setInterval(() => setImportElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [importLoading]);
  const update = (next: Tournament) => onChange({ ...workspace, tournaments: workspace.tournaments.map((item) => item.id === next.id ? next : item) });
  const importDraw = async (file?: File, allocation = false, categoryId?: string) => {
    if (!selected || !file) return;
    importAbortRef.current?.abort();
    const controller = new AbortController();
    importAbortRef.current = controller;
    setImportFailure(null);
    setBracketNotice('');
    setImportElapsed(0);
    setReadFile(false);
    setImportLoading({ fileName: file.name, kind: /\.pdf$/i.test(file.name) ? allocation ? 'Reading group names and allocations' : 'Reading names and bracket positions' : allocation ? 'Reading group allocation file' : 'Reading fixture file' });
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
    try {
      if (!/\.(pdf|csv|json)$/i.test(file.name)) throw new Error('Choose a PDF for AI recognition, or a CSV/JSON template for structured import.');
      if (/\.pdf$/i.test(file.name)) {
        if (!allocation) {
          const category = selected.categories.find((item) => item.format === 'Knockout' && item.kind === 'Singles' && (!categoryId || item.id === categoryId));
          if (!category) throw new Error('AI bracket import requires a singles Knockout category.');
          const result = await recognisePdf(file, '/api/draw/recognize', controller.signal);
          const draft = result.structureDraft as { bracketSlots: (string | null)[]; byeSlotNumbers: number[]; review: { missingSlots: number[]; duplicateSlots: number[] } };
          const entryIds = draft.bracketSlots.map((name) => { if (!name) return null; const found = category.entries.filter((entry) => entryLabel(entry, players).trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()); return found.length === 1 ? found[0].id : null; });
          setReadFile(true);
          setImportPreview({ fileName: file.name, rows: [], bracketDraft: { categoryId: category.id, slots: draft.bracketSlots, byeSlots: draft.byeSlotNumbers, entryIds }, warnings: ['AI (beta): confirm every name, slot and BYE before applying. Later round connector lines are not read.'] });
          return;
        }
        throw new Error('Group allocations accept spreadsheet files only. AI PDF import is available for knockout brackets.');
      }
      const contents = await file.text();
      if (controller.signal.aborted) return;
      const rows = file.name.toLowerCase().endsWith('.json')
        ? (() => { const data = JSON.parse(contents); return Array.isArray(data) ? data : data.matches ?? data.groups ?? data.workspace?.matches; })()
        : parseDrawCsv(contents);
      if (!Array.isArray(rows)) throw new Error('Choose a CSV or JSON file containing match rows.');
      if (!rows.length) throw new Error('The file has no match rows to review.');
      if (rows.every((item) => item && typeof item === 'object' && ('group' in (item as object) || 'group_name' in (item as object) || 'groupName' in (item as object))) && rows.every((item) => !('player_one' in (item as object) || 'playerOne' in (item as object) || 'player1' in (item as object)))) {
        const category = selected.categories.find((item) => item.groupStage);
        if (!category?.groupStage) throw new Error('This tournament has no group-stage category to receive this allocation.'); if (category.groupStage.advanced) throw new Error('This group stage has already advanced; edit the event data to change its historic allocation.');
        const groupMap = new Map<string, { id: string; name: string; entryIds: string[] }>();
        for (const [index, item] of rows.entries()) {
          const row = Object.fromEntries(Object.entries(item as Record<string, unknown>).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ''), String(value ?? '').trim()]));
          const groupName = row.group || row.groupname || ''; const player = row.player || row.playername || row.entrant || row.entrantname || row.playerid || '';
          const matches = category.entries.filter((entry) => entry.id.toLocaleLowerCase() === player.toLocaleLowerCase() || entryLabel(entry, players).toLocaleLowerCase() === player.toLocaleLowerCase());
          if (!groupName || matches.length !== 1) throw new Error(`Group allocation row ${index + 1}: choose a group and a unique entrant name or ID.`);
          const group = groupMap.get(groupName) ?? { id: crypto.randomUUID(), name: groupName, entryIds: [] };
          if (group.entryIds.includes(matches[0].id)) throw new Error(`${player} appears more than once in ${groupName}.`);
          group.entryIds.push(matches[0].id); groupMap.set(groupName, group);
        }
        const groups = [...groupMap.values()];
        if (groups.length !== category.groupStage.groupCount || groups.some((group) => group.entryIds.length < 2) || new Set(groups.flatMap((group) => group.entryIds)).size !== category.entries.length || groups.flatMap((group) => group.entryIds).some((id) => !category.entries.some((entry) => entry.id === id))) throw new Error('Allocation must include every category entrant exactly once across the configured number of groups, with at least two per group.');
        setImportPreview({ fileName: file.name, rows: [], groups }); return;
      }
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
        const groupValue = row.group || row.groupname || '';
        const first = matchEntrant(firstRaw, category); const second = matchEntrant(secondRaw, category);
        const inferredCategory = category || (first.matched?.categoryId && first.matched?.categoryId === second.matched?.categoryId ? first.matched.categoryName : first.matched?.categoryName ?? second.matched?.categoryName ?? (selected.categories.length === 1 ? selected.categories[0].name : ''));
        const enteredRound = row.round || row.roundname || (row.roundnumber ? `Round ${row.roundnumber}` : '');
        const targetCategory = selected.categories.find((item) => item.name.toLocaleLowerCase() === inferredCategory.toLocaleLowerCase());
        const roundGroup = targetCategory?.groupStage?.groups?.find((candidate) => candidate.name.toLocaleLowerCase() === groupValue.toLocaleLowerCase() || candidate.name.toLocaleLowerCase() === enteredRound.toLocaleLowerCase() || enteredRound.toLocaleLowerCase().startsWith(`${candidate.name.toLocaleLowerCase()} ·`));
        const group = roundGroup?.name ?? groupValue;
        const roundGroupPrefix = group ? `${group} · ` : '';
        const round = group ? (enteredRound.toLocaleLowerCase().startsWith(roundGroupPrefix.toLocaleLowerCase()) ? enteredRound : `${roundGroupPrefix}${enteredRound || 'Round 1'}`) : enteredRound;
        return {
          rowNumber: index + 2,
          sourceId: row.matchid || row.id || '',
          sourceOne: firstRaw,
          sourceTwo: secondRaw,
          playerOneId: first.entryId,
          playerTwoId: second.entryId,
          round,
          table: row.table || '',
          category: inferredCategory,
          startsAt: row.starttime || row.startsat || row.time || 'TBD',
          group,
          oneMatch: first.match,
          twoMatch: second.match,
        };
      });
      setImportPreview({ fileName: file.name, rows: mappedRows });
    } catch (error) {
      if (timedOut || !controller.signal.aborted) {
        const message = timedOut
          ? 'The scan took over a minute. Try a smaller or clearer PDF, or use the CSV draw template.'
          : error instanceof TypeError && /fetch/i.test(error.message)
          ? 'The draw recognition service did not respond. Check that the local recognition service is running, then try again.'
          : error instanceof Error ? error.message : 'Could not read that draw file';
        setImportFailure({ fileName: file.name, message });
        toast(message);
      }
    } finally {
      window.clearTimeout(timeout);
      if (importAbortRef.current === controller) { importAbortRef.current = null; setImportLoading(null); }
    }
  };
  const cancelImportLoading = () => { importAbortRef.current?.abort(); importAbortRef.current = null; setImportLoading(null); };
  const missingNames = importPreview && selected ? missingDrawNames(importPreview, selected) : [];
  const stageMissingPlayers = () => {
    if (!importPreview || !selected || !missingNames.length) return;
    const byName = new Map<string, { playerId: string; newPlayer: boolean }>();
    const pending: PendingPlayer[] = [];
    for (const item of missingNames) {
      const key = item.name.toLocaleLowerCase();
      let person = byName.get(key);
      if (!person) {
        const rosterMatches = workspace.players.filter((player) => sameName(player.name, item.name));
        if (rosterMatches.length > 1) { toast(`${item.name} matches multiple roster profiles. Choose one manually before importing.`); return; }
        person = { playerId: rosterMatches[0]?.id ?? crypto.randomUUID(), newPlayer: !rosterMatches.length };
        byName.set(key, person);
      }
      const entryId = selected.categories.some((category) => category.entries.some((entry) => entry.id === person!.playerId)) ? crypto.randomUUID() : person.playerId;
      pending.push({ name: item.name, categoryId: item.categoryId, playerId: person.playerId, entryId, newPlayer: person.newPlayer });
      person.newPlayer = false;
    }
    const entryFor = (name: string, categoryId: string) => pending.find((item) => item.categoryId === categoryId && sameName(item.name, name))?.entryId;
    setImportPreview({ ...importPreview, pendingPlayers: pending,
      rows: importPreview.rows.map((row) => {
        const categoryId = selected.categories.find((category) => sameName(category.name, row.category))?.id ?? '';
        const one = !row.playerOneId && row.oneMatch === 'missing' ? entryFor(row.sourceOne, categoryId) : undefined;
        const two = !row.playerTwoId && row.twoMatch === 'missing' ? entryFor(row.sourceTwo, categoryId) : undefined;
        return { ...row, playerOneId: one ?? row.playerOneId, playerTwoId: two ?? row.playerTwoId, oneMatch: one ? 'added' : row.oneMatch, twoMatch: two ? 'added' : row.twoMatch };
      }),
      bracketDraft: importPreview.bracketDraft ? { ...importPreview.bracketDraft, entryIds: importPreview.bracketDraft.entryIds.map((id, index) => id ?? entryFor(importPreview.bracketDraft!.slots[index] ?? '', importPreview.bracketDraft!.categoryId) ?? null) } : undefined,
    });
  };
  const importErrors = useMemo(() => {
    if (!importPreview || !selected) return [];
    const pendingState = pendingImportState(importPreview, selected, workspace);
    if (importPreview.bracketDraft) {
      const draft = importPreview.bracketDraft;
      const category = pendingState.tournament.categories.find((item) => item.id === draft.categoryId);
      const ids = draft.entryIds.filter((id): id is string => Boolean(id));
      const errors: string[] = [];
      if (category && selected.categories.some(source => source.groupStage?.advanced && category.name === `${source.name} · Knockout`) && importPreview.pendingPlayers?.length) errors.push('This bracket must use the qualifiers decided by the group results. Correct the names to match those qualifiers; extra players cannot be added.');
      if (!category || draft.slots.length < 2 || (draft.slots.length & (draft.slots.length - 1)) !== 0 || ids.length < 2 || new Set(ids).size !== ids.length || ids.some((id) => !category.entries.some((entry) => entry.id === id)) || draft.entryIds.some((id, index) => !id && !draft.byeSlots.includes(index + 1))) errors.push('Map every non-BYE slot to a distinct entrant in this category.');
      if (importPreview.fileName !== 'Generated qualifier draw' && category) {
        const omitted = category.entries.filter((entry) => !ids.includes(entry.id));
        if (omitted.length) errors.push(`The imported draw is missing ${omitted.length} registered ${omitted.length === 1 ? 'entrant' : 'entrants'}: ${omitted.map((entry) => entryLabel(entry, pendingState.players)).join(', ')}. Add them to the draw or cancel this import.`);
      }
      if (workspace.matches.some((match) => match.tournamentId === selected.id && match.categoryId === draft.categoryId && (match.status !== 'Scheduled' || match.events.length))) errors.push('This category has started play; its draw cannot be replaced.');
      return errors;
    }
    if (importPreview.groupAssignments) return validateGroupSuggestions(importPreview.groupAssignments, importPreview.groupCategoryId, selected, workspace);
    if (importPreview.groups) return validateGroupAllocation(importPreview.groups, importPreview.groupCategoryId ?? selected.categories.find((category) => category.groupStage)?.id, selected, workspace);
    return validateImportPreview(importPreview.rows, pendingState.tournament, pendingState.workspace, pendingState.players);
  }, [importPreview, selected, workspace, players]);
  const applyImport = () => {
    if (!selected || !importPreview || importErrors.length) return;
    const pendingState = pendingImportState(importPreview, selected, workspace);
    const importTournament = pendingState.tournament;
    const importWorkspace = pendingState.workspace;
    const importPlayers = pendingState.players;
    if (importPreview.bracketDraft) {
      const draft = importPreview.bracketDraft;
      const category = importTournament.categories.find((item) => item.id === draft.categoryId)!;
      const slots = draft.entryIds;
      const byeEntryIds = draft.byeSlots.flatMap((slot) => slots[(slot - 1) ^ 1] ? [slots[(slot - 1) ^ 1]!] : []);
      const updatedCategory = { ...category, awaitingDraw:false, entries: category.entries.filter((entry) => slots.includes(entry.id)), bracketSlots: slots, byeEntryIds };
      const replaced = workspace.matches.filter((match) => match.tournamentId === selected.id && match.categoryId === category.id);
      const replacedIds = new Set(replaced.map((match) => match.id));
      const fixtures = generateTournamentFixtures({ ...importTournament, categories: [updatedCategory] }, importWorkspace.players);
      const audit = { id: crypto.randomUUID(), action: 'Knockout draw confirmed', target: `${slots.length} slots · ${fixtures.length} opening matches`, reason: `Reviewed import from ${importPreview.fileName}`, at: new Date().toISOString() };
      const updatedCategories = importTournament.categories.map((current) => current.id === category.id ? updatedCategory : current);
      const entrantIds = [...new Set(updatedCategories.flatMap((item) => item.entries.flatMap((entry) => entry.playerIds)))];
      onChange({ ...importWorkspace, matches: [...fixtures, ...workspace.matches.filter((match) => !replacedIds.has(match.id))], tournaments: workspace.tournaments.map((item) => item.id === selected.id ? { ...importTournament, entrantIds, categories: updatedCategories, matchIds: [...selected.matchIds.filter((id) => !replacedIds.has(id)), ...fixtures.map((match) => match.id)], audit: [audit, ...selected.audit] } : item) });
      setImportPreview(null); toast('Knockout draw confirmed'); return;
    }
    if (importPreview.groups || importPreview.groupAssignments) {
      const base = selected.categories.find((category) => category.groupStage && (!importPreview.groupCategoryId || category.id === importPreview.groupCategoryId)); if (!base) return;
      const replacementError = groupFixtureReplacementError(base, selected, workspace);
      if (replacementError) { toast(replacementError); return; }
      const importedGroups = importPreview.groups ?? (() => {
        const byGroup = new Map<string, { id: string; name: string; entryIds: string[] }>();
        for (const row of importPreview.groupAssignments ?? []) { const group = byGroup.get(row.groupName) ?? { id: crypto.randomUUID(), name: row.groupName, entryIds: [] }; group.entryIds.push(row.entryId); byGroup.set(row.groupName, group); }
        return [...byGroup.values()];
      })();
      const updatedGroupCategory = { ...base, groupStage: { ...base.groupStage!, groups: importedGroups, advanced: false } };
      const oldGroupIds = new Set(selectedMatches.filter((match) => isGroupFixture(match, base)).map((match) => match.id));
      const previousFixtures = selectedMatches.filter(m => oldGroupIds.has(m.id));
      const fixtures = generateTournamentFixtures({ ...selected, categories: [updatedGroupCategory] }, workspace.players).map(match => {
        const existing = previousFixtures.find(m => [m.playerOneId,m.playerTwoId].includes(match.playerOneId) && [m.playerOneId,m.playerTwoId].includes(match.playerTwoId));
        return existing ? { ...existing, round:match.round } : { ...match, tournamentId:selected.id, tournamentName:selected.name };
      });
      const retainedIds = new Set(fixtures.map(m=>m.id));
      const affected = previousFixtures.filter(m=>!retainedIds.has(m.id) && (m.events.length || m.status!=='Scheduled'));
      if (affected.length && !window.confirm('This allocation removes '+affected.length+' started or resolved fixtures from current standings. Their previous records will be kept in the workspace change journal. Apply these group changes?')) return;
      const retainedMatches = workspace.matches.filter((match) => !oldGroupIds.has(match.id));
      const fixtureIds = selected.matchIds.filter((id) => !oldGroupIds.has(id));
      const audit = { id: crypto.randomUUID(), action: 'Group allocation imported', target: `${importedGroups.length} groups · ${base.entries.length} entrants · ${fixtures.length} fixtures regenerated`, reason: `Imported from ${importPreview.fileName}; existing pairings retained their scores and officials`, at: new Date().toISOString() };
      onChange({ ...workspace, matches: [...fixtures, ...retainedMatches], tournaments: workspace.tournaments.map((item) => item.id === selected.id ? { ...selected, categories: selected.categories.map((category) => category.id === base.id ? updatedGroupCategory : category), matchIds: [...fixtureIds, ...fixtures.map((match) => match.id)], audit: [audit, ...selected.audit] } : item) });
      setImportPreview(null); toast('Group allocation imported'); return;
    }
    const imported = importPreview.rows.map((row) => {
      const category = importTournament.categories.find((item) => item.name === row.category)!;
      const one = category.entries.find((entry) => entry.id === row.playerOneId)!;
      const two = category.entries.find((entry) => entry.id === row.playerTwoId)!;
      const match = createMatch({ playerOneId: one.playerIds[0], playerTwoId: two.playerIds[0], format: 'Best of 5', pointsPerGame: 11, gamesToWin: 3, tournamentId: selected.id, table: row.table || undefined }, importWorkspace.players);
      match.sideOneId = one.id; match.sideTwoId = two.id; match.sideOnePlayerIds = one.playerIds; match.sideTwoPlayerIds = two.playerIds; match.sideOneLabel = entryLabel(one, importPlayers); match.sideTwoLabel = entryLabel(two, importPlayers); match.gamesWon = { [one.id]: 0, [two.id]: 0 }; match.score = { [one.id]: 0, [two.id]: 0 }; match.tossWinnerId = one.id; match.categoryId = category.id;
      match.tournamentName = selected.name; match.round = row.round.trim(); match.category = category.name; match.startsAt = row.startsAt.trim() || 'TBD';
      return match;
    });
    const audit = { id: crypto.randomUUID(), action: 'Draw imported', target: `${imported.length} fixtures`, reason: `Imported from ${importPreview.fileName}`, at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    const updatedTournament = { ...importTournament, matchIds: [...selected.matchIds, ...imported.map((match) => match.id)], audit: [audit, ...selected.audit] };
    onChange({ ...importWorkspace, matches: [...imported, ...workspace.matches], tournaments: workspace.tournaments.map((item) => item.id === selected.id ? updatedTournament : item) });
    setImportPreview(null); toast(`${imported.length} draw ${imported.length === 1 ? 'match' : 'matches'} imported`);
  };
  const saveSchedule = (startsAt: string, table: string, reason: string) => {
    if (!scheduleEdit || !selected) return;
    const updatedMatch = { ...scheduleEdit, startsAt: startsAt.trim() || 'TBD', table: table.trim() || undefined };
    const audit = { id: crypto.randomUUID(), action: 'Match schedule overridden', target: `${players.get(scheduleEdit.playerOneId)?.name ?? 'Player one'} vs ${players.get(scheduleEdit.playerTwoId)?.name ?? 'Player two'}`, reason: reason || 'No reason recorded by organiser', at: new Date().toISOString() };
    onChange({ ...workspace, matches: workspace.matches.map((match) => match.id === updatedMatch.id ? updatedMatch : match), tournaments: workspace.tournaments.map((item) => item.id === selected.id ? { ...item, audit: [audit, ...item.audit] } : item) });
    setScheduleEdit(null); toast('Match schedule updated and recorded');
  };
  const reviewState = importPreview && selected ? pendingImportState(importPreview, selected, workspace) : null;
  const reviewEntrants: DrawEntrant[] = reviewState ? reviewState.tournament.categories.flatMap((category) => category.entries.map((entry) => ({ id: entry.id, name: entryLabel(entry, reviewState.players), categoryId: category.id, categoryName: category.name, kind: category.kind, playerIds: entry.playerIds }))) : [];
  const changeBracketSlot = (slotIndex: number, entryId: string | null) => {
    if (!importPreview?.bracketDraft) return;
    const ids = [...importPreview.bracketDraft.entryIds];
    const previous = ids[slotIndex];
    if (previous === entryId) return;
    const otherSlot = entryId ? ids.findIndex((id, index) => index !== slotIndex && id === entryId) : -1;
    if (otherSlot >= 0) {
      ids[otherSlot] = previous;
      ids[slotIndex] = entryId;
      const firstName = reviewEntrants.find((entrant) => entrant.id === previous)?.name ?? 'Empty slot';
      const secondName = reviewEntrants.find((entrant) => entrant.id === entryId)?.name ?? 'Player';
      animateSwap(slotIndex, otherSlot, [firstName, secondName]);
      setBracketNotice(`Swapped ${firstName} and ${secondName} between slots ${slotIndex + 1} and ${otherSlot + 1}.`);
    } else {
      ids[slotIndex] = entryId;
      setBracketNotice(`Slot ${slotIndex + 1} updated.`);
    }
    setImportPreview({ ...importPreview, bracketDraft: { ...importPreview.bracketDraft, entryIds: ids } });
  };
  const pdfState=importLoading?.fileName.toLowerCase().endsWith('.pdf')?"Reading draw…":readFile?"✓ Draw ready":"Import knockout PDF";
  const selectedMatches = selected ? workspace.matches.filter((match) => match.tournamentId === selected.id || selected.matchIds.includes(match.id)) : [];
  const canEditField = Boolean(selected && selected.categories.length === 1 && selected.categories[0].kind === 'Singles');
  const saveField = (entrantIds: string[], reason: string) => {
    if (!selected || !canEditField || entrantIds.length < 2 || new Set(entrantIds).size !== entrantIds.length || entrantIds.some((id) => !workspace.players.some((player) => player.id === id))) return;
    const oldCategory = selected.categories[0];
    const categories = [{ ...oldCategory, entries: entrantIds.map((id) => ({ id, name: '', playerIds: [id], seed: oldCategory.entries.find((entry) => entry.id === id)?.seed })) }];
    const seeds = Object.fromEntries(categories[0].entries.filter((entry) => entry.seed).map((entry) => [entry.id, entry.seed!]));
    const rebuilt = createTournament({ name: selected.name, format: selected.format, date: selected.date, venue: selected.venue, tableCount: selected.tableCount, categories, entrantIds, seeds });
    const fixtures = generateTournamentFixtures(rebuilt, workspace.players).map((match) => ({ ...match, tournamentId: selected.id, tournamentName: selected.name }));
    const oldIds = new Set(selectedMatches.map((match) => match.id));
    const audit = { id: crypto.randomUUID(), action: 'Entrants and draw overridden', target: `${selected.entrantIds.length} → ${entrantIds.length} active fixtures replaced`, reason: reason.trim() || 'No reason recorded by organiser', at: new Date().toISOString() };
    const updatedTournament: Tournament = { ...selected, categories: rebuilt.categories, entrantIds, seeds: rebuilt.seeds, byePlayerIds: rebuilt.byePlayerIds, bracketSlots: rebuilt.bracketSlots, rounds: rebuilt.rounds, matchIds: fixtures.map((match) => match.id), completed: 0, status: 'Upcoming', standings: rebuilt.standings, audit: [audit, ...selected.audit] };
    onChange({ ...workspace, matches: [...fixtures, ...workspace.matches.filter((match) => !oldIds.has(match.id))], tournaments: workspace.tournaments.map((item) => item.id === selected.id ? updatedTournament : item) });
    setFieldEditOpen(false); toast('Draw updated · prior fixtures are preserved in the activity journal');
  };
  const saveTournamentJson = () => {
    if (!selected) return;
    try {
      const value = JSON.parse(tournamentJson) as Tournament;
      if (!value || value.id !== selected.id || typeof value.name !== 'string' || !value.name.trim() || typeof value.date !== 'string' || typeof value.venue !== 'string' || !['Group stage', 'Round robin', 'Knockout'].includes(value.format) || !['Upcoming', 'Running', 'Completed', 'Paused'].includes(value.status) || !Number.isInteger(value.tableCount) || value.tableCount < 1 || !Array.isArray(value.categories) || !Array.isArray(value.entrantIds) || !value.entrantIds.every((id) => typeof id === 'string') || !Array.isArray(value.matchIds) || !value.matchIds.every((id) => typeof id === 'string') || !Array.isArray(value.audit)) throw new Error('Keep the tournament ID and include valid event details, categories, entrants, matches and audit fields.');
      if (!value.categories.every((category) => category && typeof category.id === 'string' && typeof category.name === 'string' && ['Singles', 'Doubles', 'Team'].includes(category.kind) && ['Group stage', 'Round robin', 'Knockout'].includes(category.format) && Array.isArray(category.entries) && category.entries.every((entry) => entry && typeof entry.id === 'string' && typeof entry.name === 'string' && Array.isArray(entry.playerIds) && entry.playerIds.length > 0 && entry.playerIds.every((id) => typeof id === 'string' && players.has(id))))) throw new Error('Each category entry must include its required fields and player IDs from this workspace.');
      onChange({ ...workspace, tournaments: workspace.tournaments.map((item) => item.id === selected.id ? value : item) });
      setEditingTournament(false); setTournamentJsonError(''); toast('Tournament data updated · previous version retained in journal');
    } catch (error) { setTournamentJsonError(error instanceof Error ? error.message : 'Invalid tournament JSON.'); }
  };
  const deleteSelectedTournament = () => {
    if (!selected) return;
    const ids = new Set(selectedMatches.map((match) => match.id));
    onChange({ ...workspace, matches: workspace.matches.filter((match) => !ids.has(match.id)), tournaments: workspace.tournaments.filter((item) => item.id !== selected.id) });
    setDeleteTournamentConfirm(false); onSelect(null); toast('Tournament removed · all records retained in activity journal');
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
        if (category.format !== 'Knockout') return categoryFixtures.every((match) => match.status === 'Completed' || match.status === 'Not played');
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
      <div className="organiser-note"><ShieldCheck size={17} /><span><b>Organiser control stays with you.</b> Edit or remove any match, override tournament data, and review prior versions in the activity journal. Reasons are optional and recorded when supplied.</span></div>
    </> : <>
      <div className="tournament-detail-top"><button className="back-link" onClick={() => onSelect(null)}><Undo2 size={14} /> All tournaments</button><div className="detail-actions"><button className="button button-outline" onClick={() => printTournamentDraw(selected, selectedMatches, players)}><Printer size={15} /> Print / Save PDF</button><button className="button button-outline" title="Includes this tournament and a full browser workspace backup, including other events" onClick={() => exportTournamentPackage(selected, workspace, players)}><Download size={15} /> Export package</button><button className="button button-outline" onClick={() => { setTournamentJson(JSON.stringify(selected, null, 2)); setTournamentJsonError(''); setEditingTournament(true); }}><Pencil size={14} /> Edit event data</button><button className="button button-outline" onClick={() => setDeleteTournamentConfirm(true)}><Trash2 size={14} /> Delete tournament</button><button className="button button-outline" onClick={() => setReasonAction(selected.progressPaused ? 'resume' : 'pause')}>{selected.progressPaused ? <Play size={15} /> : <Pause size={15} />}{selected.progressPaused ? 'Resume progression' : 'Pause progression'}</button><button className="button button-primary" onClick={() => setTab('Draw & matches')}><ArrowRight size={15} /> Choose a match</button></div></div>
      <section className="tournament-detail-hero"><div className="detail-emblem"><Trophy size={22} /></div><div className="detail-title"><div className="detail-title-top"><TournamentStatus status={selected.status} /><span className="format-tag">{selected.format}</span><span className="detail-created">Created {selected.date}</span></div><h2>{selected.name}</h2><p><CalendarDays size={14} /> {selected.date}<i /> <Users size={14} /> {selected.entrantIds.length} entrants<i />{selected.venue}</p><div className="category-chip-row">{categoryNames(selected).map((category) => <span className="category-chip" key={category}>{category}</span>)}<span className="category-chip category-chip--tables">{selected.tableCount ?? 1} tables</span></div></div><div className="detail-progress"><span>EVENT PROGRESS</span><b>{selected.completed}<small> / {selected.matchIds.length || selected.rounds}</small></b><div className="mini-progress"><i style={{ width: `${selected.matchIds.length ? Math.min(100, selected.completed / selected.matchIds.length * 100) : 0}%` }} /></div><small>{selected.matchIds.length ? 'matches complete' : 'rounds to play'}</small></div></section>
      <SlidingTabs className="tournament-tabs" role="tablist" aria-label="Tournament sections">{(['Overview', 'Draw & matches', 'Standings', 'Audit log'] as TournamentTab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'tournament-tab tournament-tab--active' : 'tournament-tab'} onClick={() => setTab(item)}>{item}{item === 'Audit log' && <span>{selected.audit.length}</span>}</button>)}</SlidingTabs>
      {selected.categories.filter(c=>c.groupStage?.advanced).map(c=><button className="button button-outline" key={c.id} onClick={()=>{setRewindCategory(c.id);setRewindReason('')}}>Rewind qualification · {c.name}</button>)}
      {rewindCategory && <Dialog title="Rewind qualification" eyebrow="ORGANISER RECOVERY" onClose={()=>setRewindCategory(null)}><p>Keep the group results and remove the generated knockout stage and its current fixtures. The change journal retains the previous records. Progression will pause so you can edit the groups and results before resuming.</p><label className="field"><span>Reason</span><textarea value={rewindReason} onChange={e=>setRewindReason(e.target.value)}/></label><button className="button button-danger" disabled={!rewindReason.trim()} onClick={()=>{onChange(rewindQualification(workspace,selected.id,rewindCategory,rewindReason));setRewindCategory(null);toast('Qualification rewound. Edit the groups, then resume progression.')}}>Rewind and pause</button></Dialog>}
      {selected.categories.filter(c => c.groupStage && c.groupStage.advanceToKnockout !== false && !c.groupStage.advanced).map(c => <section className="utility-card" key={`locked-${c.id}`}><h3>{c.name} · knockout draw</h3><button className="button button-outline" disabled>Knockout PDF import · locked</button><p>Finish every group match to decide who qualifies. Knockout import unlocks after qualification and must use the players who advance from these groups.</p></section>)}
      {selected.categories.filter(c=>c.awaitingDraw).map(c=><section key={c.id} className="utility-card"><h3>{c.name} · qualifiers ready</h3><p>Review the random draw or import the bracket for these qualifiers before play.</p><button className="button button-primary" onClick={()=>{
        const ids=c.bracketSlots ?? []; setImportPreview({fileName:'Generated qualifier draw',rows:[],bracketDraft:{categoryId:c.id,slots:ids.map(id=>c.entries.find(e=>e.id===id)?.name || players.get(id||'')?.name || null),entryIds:ids,byeSlots:ids.flatMap((id,i)=>id?[]:[i+1])}});
      }}>Review random draw</button> <button className="button button-outline" onClick={()=>{
        const source=selected.categories.find(item=>item.groupStage && c.name===item.name+' · Knockout');
        if(!source?.groupStage?.groups) return;
        const qualifiers=c.entries.map(entry=>({entry,place:c.qualifierPlaces?.[entry.id] ?? 1}));
        const originalGroups=source.groupStage.groups;
        const draw=qualifierDraw(qualifiers,originalGroups,source.groupStage.advancePerGroup);
        update({...selected,categories:selected.categories.map(item=>item.id===c.id?{...c,bracketSlots:draw.bracketSlots,byeEntryIds:draw.bracketSlots.filter((id,i):id is string=>!!id&&!draw.bracketSlots[i^1])}:item)});
      }}>Regenerate draw</button> <button className="button button-outline" onClick={()=>setQualifierEdit({categoryId:c.id,ids:c.entries.map(e=>e.id),reason:''})}>Override qualifiers</button> <label className="button button-outline">Import knockout draw<input type="file" hidden accept=".pdf,application/pdf" onChange={e=>{void importDraw(e.target.files?.[0],false,c.id);e.target.value=''}}/></label></section>)}
      {qualifierEdit && <Dialog title="Override qualifiers" eyebrow="ORGANISER DECISION" onClose={()=>setQualifierEdit(null)}>
      <p>Select the entrants who advance. Each slot must have a different entrant. The reason becomes part of the tournament audit.</p>
      {qualifierEdit.ids.map((id,index)=><label className="field" key={index}><span>Qualifier {index+1}</span><select value={id} onChange={e=>setQualifierEdit({...qualifierEdit,ids:qualifierEdit.ids.map((value,i)=>i===index?e.target.value:value)})}>{selected.categories.find(source=>source.groupStage && selected.categories.some(ko=>ko.id===qualifierEdit.categoryId&&ko.name===source.name+' · Knockout'))?.entries.map(e=><option key={e.id} value={e.id}>{entryLabel(e,players)}</option>)}</select></label>)}
      <label className="field"><span>Reason</span><textarea value={qualifierEdit.reason} onChange={e=>setQualifierEdit({...qualifierEdit,reason:e.target.value})}/></label>
      <button className="button button-primary" disabled={!qualifierEdit.reason.trim()||new Set(qualifierEdit.ids).size!==qualifierEdit.ids.length} onClick={()=>{
        const category=selected.categories.find(c=>c.id===qualifierEdit.categoryId)!;
        const source=selected.categories.find(c=>c.groupStage&&category.name===c.name+' · Knockout')!;
        const replacements=new Map(category.entries.map((entry,i)=>[entry.id,qualifierEdit.ids[i]]));
        const updated={...category,entries:qualifierEdit.ids.map(id=>source.entries.find(e=>e.id===id)!),bracketSlots:category.bracketSlots?.map(id=>id?replacements.get(id)??id:null),byeEntryIds:category.byeEntryIds?.map(id=>replacements.get(id)??id),qualifierPlaces:Object.fromEntries(category.entries.map((e,i)=>[qualifierEdit.ids[i],category.qualifierPlaces?.[e.id]??1]))};
        update({...selected,categories:selected.categories.map(c=>c.id===updated.id?updated:c),audit:[{id:crypto.randomUUID(),action:'Qualification overridden',target:category.name,reason:qualifierEdit.reason.trim(),at:new Date().toISOString()},...selected.audit]});
        setQualifierEdit(null);
      }}>Save qualifier decision</button></Dialog>}
      {tab==='Draw & matches' && selected.categories.filter(c=>c.groupStage?.groups).map(c=><button key={c.id} className="button button-outline" onClick={()=>setEditingGroups({categoryId:c.id,groups:structuredClone(c.groupStage!.groups!)})}>Edit group tables · {c.name}</button>)}
      {editingGroups && <Dialog title="Edit group tables" eyebrow="TOURNAMENT DRAW" size="wide" onClose={()=>setEditingGroups(null)}><div className="group-board">{editingGroups.groups.map(g=>{
        const entries=selected.categories.find(c=>c.id===editingGroups.categoryId)!.entries;
        const change=(ids:string[])=>setEditingGroups({...editingGroups,groups:editingGroups.groups.map(item=>item.id===g.id?{...g,entryIds:ids}:item)});
        return <section key={g.id} className="utility-card"><table className="data-table"><caption>{g.name}</caption><tbody>{g.entryIds.map(id=><tr key={id}><td>{entries.find(e=>e.id===id)?.name || players.get(id)?.name}</td><td><button aria-label={'Remove '+(players.get(id)?.name || id)} onClick={()=>change(g.entryIds.filter(i=>i!==id))}>×</button></td></tr>)}</tbody></table><label>＋ Add player<select value="" onChange={e=>change([...g.entryIds,e.target.value])}><option value="">Choose unassigned player</option>{entries.filter(e=>!editingGroups.groups.some(g=>g.entryIds.includes(e.id))).map(e=><option key={e.id} value={e.id}>{entryLabel(e,players)}</option>)}</select></label></section>
      })}</div><button className="button button-primary" onClick={()=>{setImportPreview({fileName:'Organiser group edits',rows:[],groupCategoryId:editingGroups.categoryId,groups:editingGroups.groups});setEditingGroups(null)}}>Review fixture changes</button></Dialog>}
      {tab === 'Overview' && <TournamentOverview tournament={selected} matches={selectedMatches} workspace={workspace} players={players} onOpenMatch={onOpenMatch} onTab={setTab} onEditField={() => { if (canEditField) setFieldEditOpen(true); else { setTournamentJson(JSON.stringify(selected, null, 2)); setTournamentJsonError(''); setEditingTournament(true); } }} canEditField={canEditField} />}
      {tab === 'Draw & matches' && <TournamentDraw pdfState={pdfState} workspace={workspace} matches={workspace.matches.filter((match) => match.tournamentId === selected.id || selected.matchIds.includes(match.id))} tournamentGroups={selected.categories.flatMap((category) => category.groupStage?.groups ?? [])} hasKnockout={selected.categories.some((category) => category.format === 'Knockout' && category.kind === 'Singles')} players={players} onOpenMatch={onOpenMatch} onImport={(file) => importDraw(file)} onReschedule={setScheduleEdit} onEditMatch={setEditingMatch} onDeleteMatch={onDeleteMatch} onImportAllocation={(file) => importDraw(file, true)} />}
      {tab === 'Standings' && <TournamentStandings tournament={selected} players={players} matches={workspace.matches.filter((match) => match.tournamentId === selected.id || selected.matchIds.includes(match.id))} />}
      {tab === 'Audit log' && <TournamentAudit tournament={selected} />}
    </>}
    {importLoading && <Dialog title="Reading draw" eyebrow="IMPORT IN PROGRESS" onClose={cancelImportLoading}><div className="import-loading" role="status" aria-live="polite"><span className="import-spinner" aria-hidden="true" /><div><strong>{importLoading.kind}</strong><p>{importLoading.fileName}</p><small>{importElapsed >= 20 ? 'This scan is taking longer than usual. You can cancel and try a smaller or clearer file.' : 'The review will open when the scan is ready.'} {importElapsed}s elapsed.</small></div></div><div className="dialog-actions"><button className="button button-quiet" onClick={cancelImportLoading}>Cancel import</button></div></Dialog>}
    {importFailure && <Dialog title="Draw could not be read" eyebrow="IMPORT NEEDS ATTENTION" onClose={() => setImportFailure(null)}><div className="import-failure" role="alert"><AlertTriangle size={20} /><div><strong>{importFailure.fileName}</strong><p>{importFailure.message}</p></div></div><div className="dialog-actions"><button className="button button-primary" onClick={() => setImportFailure(null)}>Close and try again</button></div></Dialog>}
    {importPreview && selected && <ImportDrawDialog preview={importPreview} entrants={reviewEntrants} categories={categoryNames(selected)} errors={importErrors} missingNames={missingNames} bracketNotice={bracketNotice} onAddPlayers={stageMissingPlayers} onBracketChange={changeBracketSlot} onGroupChange={(rowIndex, key, value) => setImportPreview((current) => current?.groupAssignments ? { ...current, groupAssignments: current.groupAssignments.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row) } : current)} onAddGroupRow={() => setImportPreview((current) => current?.groupAssignments ? { ...current, groupAssignments: [...current.groupAssignments, { groupName: current.groupAssignments.at(-1)?.groupName ?? 'Group A', playerName: '', confidence: null, page: null, entryId: '' }] } : current)} onRemoveGroupRow={(rowIndex) => setImportPreview((current) => current?.groupAssignments ? { ...current, groupAssignments: current.groupAssignments.filter((_, index) => index !== rowIndex) } : current)} onChange={(rowIndex, key, value) => setImportPreview((current) => current ? { ...current, rows: current.rows.map((row, index) => rowIndex === index ? { ...row, [key]: value, ...(key === 'playerOneId' ? { oneMatch: 'manual' } : key === 'playerTwoId' ? { twoMatch: 'manual' } : {}) } : row) } : current)} onClose={() => setImportPreview(null)} onApply={applyImport} />}
    {scheduleEdit && selected && <ScheduleDialog match={scheduleEdit} tableCount={selected.tableCount ?? 1} onClose={() => setScheduleEdit(null)} onSave={saveSchedule} />}
    {fieldEditOpen && selected && <EditFieldDialog tournament={selected} players={workspace.players} pendingFixtureCount={selectedMatches.length} onClose={() => setFieldEditOpen(false)} onSave={saveField} />}
    {editingMatch && <MatchRecordEditor match={editingMatch} workspace={workspace} onClose={() => setEditingMatch(null)} onSave={(match) => { onSaveMatch(match); setEditingMatch(null); toast('Match corrected and the former record retained in the journal'); }} />}
    {editingTournament && selected && <TournamentRecordEditor value={tournamentJson} error={tournamentJsonError} onChange={(value) => { setTournamentJson(value); setTournamentJsonError(''); }} onClose={() => setEditingTournament(false)} onSave={saveTournamentJson} />}
    {deleteTournamentConfirm && selected && <Dialog title="Delete tournament?" eyebrow="ORGANISER OVERRIDE" onClose={() => setDeleteTournamentConfirm(false)}><p className="dialog-copy">The tournament and its {selectedMatches.length} active matches will leave the current workspace. Full before/after records are retained in the activity journal and workspace export.</p><div className="dialog-actions"><button className="button button-quiet" onClick={() => setDeleteTournamentConfirm(false)}>Keep tournament</button><button className="button button-danger" onClick={deleteSelectedTournament}>Delete tournament</button></div></Dialog>}
    {reasonAction && <ReasonDialog action={reasonAction} onClose={() => setReasonAction(null)} onConfirm={commitProgression} />}
  </div>;
}

function TournamentOverview({ tournament, matches, workspace, players, onOpenMatch, onTab, onEditField, canEditField }: { tournament: Tournament; matches: Match[]; workspace: Workspace; players: Map<string, Player>; onOpenMatch: (id: string) => void; onTab: (tab: TournamentTab) => void; onEditField: () => void; canEditField: boolean }) {
  const readyMatches = matches.filter((match) => (match.status === 'Scheduled' || match.status === 'In progress') && matchAvailability(match, workspace).ready).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return <div className="tournament-overview-grid"><section className="tournament-section"><div className="section-head"><div><p className="eyebrow">ON THE TABLE</p><h3>Ready to play</h3><p className="section-caption">Choose any ready fixture. The listed order does not control which match you play.</p></div><button className="quiet-link" onClick={() => onTab('Draw & matches')}>Full draw <ArrowRight size={14} /></button></div>{readyMatches.length ? <div className="tournament-match-list">{readyMatches.map((match) => <TournamentMatchRow key={match.id} match={match} players={players} onClick={() => onOpenMatch(match.id)} />)}</div> : <div className="empty-draw"><span className="empty-mark"><Activity size={18} /></span><div><b>{tournament.status === 'Completed' ? 'Tournament complete' : matches.length ? 'No matches ready yet' : 'No fixtures yet'}</b><span>{tournament.status === 'Completed' ? 'Every match is finished. Open the full draw or standings to review the results.' : matches.length ? 'Review qualification or resolve the preceding matches to continue.' : 'Add a draw or create a match for this event.'}</span></div></div>}</section>
    <section className="tournament-section control-section"><div className="section-head"><div><p className="eyebrow">ORGANISER CONTROL</p><h3>Event settings</h3></div><span className="settings-symbol"><Activity size={15} /></span></div><div className="setting-line"><span>Format</span><b>{tournament.format}</b></div><div className="setting-line"><span>Venue tables</span><b>{tournament.tableCount ?? 1}</b></div><div className="setting-line"><span>Categories</span><b>{categoryNames(tournament).length}</b></div><div className="setting-line"><span>Automatic progression</span><b className={tournament.progressPaused ? 'state-off' : 'state-on'}><i />{tournament.progressPaused ? 'Paused' : 'Available'}</b></div><div className="setting-line"><span>Entrants</span><b>{tournament.entrantIds.length} players</b></div>{tournament.tieBreaks.length > 0 && <div className="tie-break-box"><span>STANDINGS ORDER</span><p>{tournament.tieBreaks.join(' < ')} <ChevronRight size={13} /></p></div>}<button className="control-audit-link" onClick={() => onTab('Audit log')}>Review change history <ArrowRight size={14} /></button></section>
    <section className="entrant-strip"><div><p className="eyebrow">THE FIELD</p><h3>{tournament.entrantIds.length} entrants</h3><small className="field-edit-hint">{canEditField ? 'Quick editor available · previous draw stays in history' : 'Advanced event editor can change categories and entrants'}</small></div><div className="entrant-avatars">{tournament.entrantIds.slice(0, 6).map((id) => <span className="avatar avatar--tiny" key={id}>{players.get(id)?.initials ?? '?'}</span>)}{tournament.entrantIds.length > 6 && <span className="avatar avatar--tiny entrant-more">+{tournament.entrantIds.length - 6}</span>}</div><span className="entrant-strip-spacer" /><button className="button button-outline field-edit-button" onClick={onEditField}>{canEditField ? 'Edit entrants' : 'Edit event data'}</button><button className="quiet-link" onClick={() => onTab('Standings')}>Standings <ArrowRight size={14} /></button></section>
  </div>;
}

function TournamentDraw({ pdfState, workspace, matches, tournamentGroups, hasKnockout, players, onOpenMatch, onImport, onImportAllocation, onReschedule, onEditMatch, onDeleteMatch }: { pdfState: string; workspace: Workspace; matches: Match[]; tournamentGroups: { id: string; name: string; entryIds: string[] }[]; hasKnockout: boolean; players: Map<string, Player>; onOpenMatch: (id: string) => void; onImport: (file?: File) => void; onImportAllocation: (file?: File) => void; onReschedule: (match: Match) => void; onEditMatch: (match: Match) => void; onDeleteMatch: (id: string) => void }) {
  const [roundFilter, setRoundFilter] = useState('All rounds');
  const importRef = useRef<HTMLInputElement>(null); const fixtureRef = useRef<HTMLInputElement>(null); const allocationRef = useRef<HTMLInputElement>(null);
  const rounds = [...new Set(matches.map((match) => match.round ?? 'Unassigned'))];
  const filtered = matches.filter((match) => roundFilter === 'All rounds' || match.round === roundFilter);
  const grouped = filtered.reduce<Record<string, Match[]>>((groups, match) => { const key = match.round ?? 'Unassigned'; (groups[key] ??= []).push(match); return groups; }, {});
  return <section className="tournament-section draw-section"><div className="section-head"><div><p className="eyebrow">DRAW CONTROL</p><h3>Draw & matches</h3><p className="section-caption">Choose any ready match in the current round. To bring in an existing schedule, upload a match list. Download an example spreadsheet, fill one row per match, then upload it. Group allocation files assign each player to a group. PDF recognition is only for knockout brackets.</p></div><div className="draw-toolbar"><select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)} aria-label="Filter by round"><option>All rounds</option>{rounds.map((round) => <option key={round}>{round}</option>)}</select><button className="button button-outline template-button" onClick={() => downloadDrawTemplate('csv', tournamentGroups.length > 0)}><FileSpreadsheet size={14} /><span>Example spreadsheet</span></button><details><summary>Advanced data format</summary><button className="button button-outline template-button" onClick={() => downloadDrawTemplate('json', tournamentGroups.length > 0)}><FileJson2 size={14} /><span>Example data file (.json)</span></button><p>For software exports: fill the matches list, then use Upload match list.</p></details>{tournamentGroups.length > 0 && <><button className="button button-outline template-button" onClick={() => downloadGroupAllocationTemplate('csv')}><FileSpreadsheet size={14} /><span>Example group spreadsheet</span></button><details><summary>Advanced group data</summary><button className="button button-outline template-button" onClick={() => downloadGroupAllocationTemplate('json')}><FileJson2 size={14} /><span>Example group data (.json)</span></button><p>For software exports: fill the groups list, then use Upload group allocation.</p></details><button className="button button-outline" onClick={() => allocationRef.current?.click()}><Plus size={14} /> Upload group allocation</button><input ref={allocationRef} type="file" className="sr-only" accept=".csv,.json,text/csv,application/json" onChange={(event) => { onImportAllocation(event.target.files?.[0]); event.target.value = ''; }} /></>}<button className="button button-outline" onClick={() => fixtureRef.current?.click()}><Plus size={15} /> Upload match list</button><input ref={fixtureRef} type="file" className="sr-only" accept=".csv,.json,text/csv,application/json" onChange={(event) => { onImport(event.target.files?.[0]); event.target.value = ''; }} />{hasKnockout && <><button className="button ai-import-button" onClick={() => importRef.current?.click()}><Plus size={15} /> {pdfState} <span className="beta-tag">AI · 20 MB MAX</span></button><input ref={importRef} type="file" className="sr-only" accept=".pdf,application/pdf" onChange={(event) => { onImport(event.target.files?.[0]); event.target.value = ''; }} /></>}</div></div>
    {Object.keys(grouped).length ? <div className="draw-groups">{Object.entries(grouped).map(([round, items]) => <div className="draw-group" key={round}><div className="draw-group-title"><span>{round}</span><i /><small>{items.length} matches</small></div>{items.map((match) => <div className="tournament-match-shell" key={match.id}><TournamentMatchRow match={match} players={players} onClick={() => onOpenMatch(match.id)} disabled={!matchAvailability(match, workspace).ready} waitingReason={matchAvailability(match, workspace).reason} expanded /><span className="match-category-badge">{match.category ?? 'Unassigned'}</span><button className="reschedule-button" onClick={() => onReschedule(match)} aria-label={`Reschedule ${players.get(match.playerOneId)?.name} versus ${players.get(match.playerTwoId)?.name}`}><CalendarClock size={14} /><span>Reschedule</span></button><button className="reschedule-button" onClick={() => onEditMatch(match)} aria-label="Edit full match record"><Pencil size={14} /><span>Edit record</span></button><button className="reschedule-button" onClick={() => onDeleteMatch(match.id)} aria-label="Remove match from draw"><Trash2 size={14} /><span>Remove</span></button></div>)}</div>)}</div> : <div className="empty-draw"><span className="empty-mark"><Trophy size={18} /></span><div><b>No matches in this draw</b><span>Import a CSV or JSON draw, or create category entrants to generate fixtures.</span></div>{hasKnockout && <button className="button ai-import-button" onClick={() => importRef.current?.click()}><Plus size={14} /> {pdfState} <span className="beta-tag">AI · 20 MB MAX</span></button>}</div>}
  </section>;
}

function ImportDrawDialog({ preview, entrants, categories, errors, missingNames, bracketNotice, onAddPlayers, onChange, onBracketChange, onGroupChange, onAddGroupRow, onRemoveGroupRow, onClose, onApply }: { preview: ImportPreview; entrants: DrawEntrant[]; categories: string[]; errors: string[]; missingNames: { name: string; categoryId: string }[]; bracketNotice: string; onAddPlayers: () => void; onChange: (rowIndex: number, key: 'playerOneId' | 'playerTwoId' | 'category', value: string) => void; onBracketChange: (slotIndex: number, entryId: string | null) => void; onGroupChange: (rowIndex: number, key: 'entryId' | 'groupName', value: string) => void; onAddGroupRow: () => void; onRemoveGroupRow: (rowIndex: number) => void; onClose: () => void; onApply: () => void }) {
  const groupEntrants = entrants.filter((entrant) => entrant.categoryId === preview.groupCategoryId);
  const bracketEntrants = preview.bracketDraft ? entrants.filter((entrant) => entrant.categoryId === preview.bracketDraft!.categoryId) : [];
  const omittedEntrants = preview.bracketDraft ? bracketEntrants.filter((entrant) => !preview.bracketDraft!.entryIds.includes(entrant.id) && !preview.pendingPlayers?.some((pending) => pending.entryId === entrant.id)) : [];
  return <Dialog title={preview.groups || preview.groupAssignments ? 'Review group allocation' : preview.bracketDraft ? 'Review knockout draw' : 'Review fixtures'} eyebrow="NON-DESTRUCTIVE PREVIEW" onClose={onClose} size={preview.bracketDraft ? 'review' : 'wide'}>
    <div className="import-review-summary"><FileSpreadsheet size={17} /><span><b>{preview.fileName}</b><small>{preview.bracketDraft ? `${preview.bracketDraft.slots.length} knockout slots · awaiting confirmation` : preview.groupAssignments ? `${preview.groupAssignments.length} OCR name suggestions · nothing has changed yet` : preview.groups ? `${preview.groups.length} groups · ${preview.groups.reduce((sum, group) => sum + group.entryIds.length, 0)} assignments found · nothing has changed yet` : `${preview.rows.length} fixtures found · nothing has been added yet`}</small></span></div>
    {missingNames.length > 0 && <div className="import-missing-players" role="alert"><AlertTriangle size={21} /><div><strong>{missingNames.length} {missingNames.length === 1 ? 'name is' : 'names are'} not in this tournament</strong><p>{missingNames.map((item) => item.name).join(', ')}</p><p>Add these entrants to the tournament and create any missing player profiles, or cancel the import. New profiles will have no hand, grip or playing style until you fill them in. Nothing is saved until you apply the reviewed draw.</p><button className="button button-primary" type="button" onClick={onAddPlayers}><UserRoundPlus size={15} /> Add {missingNames.length === 1 ? 'player' : 'players'} to this import</button></div></div>}
    {Boolean(preview.pendingPlayers?.length) && <p className="import-staged-note"><Check size={15} /> {preview.pendingPlayers!.length} {preview.pendingPlayers!.length === 1 ? 'entrant' : 'entrants'} staged. They will be saved only when you apply the draw.</p>}
    {preview.bracketDraft && <section className="bracket-review">
      <div className="bracket-review-intro"><div><h3>Set the opening bracket</h3><p>Check each detected name and BYE. Choose a player for every occupied slot.</p><p>Choosing someone already placed in another slot swaps the two players automatically.</p></div><div className="bracket-review-count"><b>{preview.bracketDraft.slots.length}</b><span>SLOTS</span></div></div>
      {omittedEntrants.length > 0 && preview.fileName !== 'Generated qualifier draw' && <div className="bracket-review-caution" role="alert"><AlertTriangle size={17} /><p><b>The imported draw omits registered entrants: {omittedEntrants.map((entrant) => entrant.name).join(', ')}.</b> Place each one in a non-BYE slot or cancel the import. No tournament data has changed.</p></div>}
      {errors.length > 0 && <div className="import-review-errors" role="alert"><AlertTriangle size={17} /><div><b>Finish mapping before applying</b><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
      <p className="bracket-swap-notice" role="status" aria-live="polite">{bracketNotice ? <><Check size={15} /> {bracketNotice}</> : 'Changes stay in this review until you apply the bracket.'}</p>
      <div className="import-review-table-wrap" role="region" aria-label="Review knockout bracket slots" tabIndex={0}><table className="data-table import-review-table"><thead><tr><th>SLOT</th><th>DETECTED</th><th>FINAL PLAYER</th></tr></thead><tbody>{preview.bracketDraft.slots.map((name, index) => <tr key={index}><td><b>{index + 1}</b></td><td>{preview.bracketDraft!.byeSlots.includes(index + 1) ? <span className="bye-tag">BYE</span> : name || <span className="import-missing">Not read</span>}</td><td>{preview.bracketDraft!.byeSlots.includes(index + 1) ? <span className="bracket-bye-label">BYE · no match</span> : <select aria-label={`Player in slot ${index + 1}`} value={preview.bracketDraft!.entryIds[index] ?? ''} onChange={(event) => onBracketChange(index, event.target.value || null)}><option value="">Choose player</option>{bracketEntrants.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>}</td></tr>)}</tbody></table></div>
    </section>}
    {(preview.groups || preview.groupAssignments) && <div className="import-review-errors"><div><b>{preview.groupAssignments ? 'Review OCR suggestions and map each name' : 'Review imported allocation'}</b>
      {errors.length > 0 && <ul role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
      {preview.groups && <ul>{preview.groups.map((group) => <li key={group.id}>{group.name}: {group.entryIds.map((id) => entrants.find((entrant) => entrant.id === id)?.name ?? id).join(', ')}</li>)}</ul>}
      {preview.groupAssignments && <><p>OCR text is an unverified draft. Confirm every mapping; rows below 80% confidence deserve extra review. Add missed players, remove false detections, and correct group labels before applying. This beta expects clear “Group A” or “Pool 1” headings and has not been qualified on representative group scans. Recogniser: {preview.recognizer ?? 'unknown'}.</p>{preview.warnings?.length ? <ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}<div className="import-review-table-wrap" role="region" aria-label="Review OCR group allocation" tabIndex={0}><table className="data-table import-review-table"><thead><tr><th>GROUP</th><th>OCR NAME</th><th>CONFIDENCE</th><th>ROSTER MATCH</th><th /></tr></thead><tbody>{preview.groupAssignments.map((row, index) => <tr key={`${row.groupName}-${row.page ?? 'manual'}-${index}`}><td><label className="sr-only" htmlFor={`group-name-${index}`}>Group for {row.playerName || 'manual player entry'}</label><input id={`group-name-${index}`} value={row.groupName} onChange={(event) => onGroupChange(index, 'groupName', event.target.value)} /></td><td>{row.playerName || 'Manual roster entry'} {row.page !== null && <small>p. {row.page}</small>}</td><td>{row.confidence === null ? 'Manual / unknown' : `${Math.round(row.confidence * 100)}%`}</td><td><label className="sr-only" htmlFor={`group-map-${index}`}>Map {row.playerName || 'manual entry'} in {row.groupName} to a registered entrant</label><select id={`group-map-${index}`} value={row.entryId} onChange={(event) => onGroupChange(index, 'entryId', event.target.value)}><option value="">Choose roster player</option>{groupEntrants.map((entrant) => <option key={entrant.id} value={entrant.id}>{entrant.name}</option>)}</select></td><td><button type="button" className="icon-button" aria-label={`Remove ${row.playerName || 'manual'} suggestion`} onClick={() => onRemoveGroupRow(index)}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div><button type="button" className="button button-outline" onClick={onAddGroupRow}><Plus size={14} /> Add missing player</button></>}
      <p className="import-review-note">Applying replaces this category’s generated group fixtures and any unsaved schedule choices. Imports are blocked if a group match has started or an entrant has a recorded schedule override.</p>
      </div></div>}
    {!preview.groups && !preview.groupAssignments && !preview.bracketDraft && <>
    {errors.length > 0 && <div className="import-review-errors" role="alert"><AlertTriangle size={16} /><div><b>Resolve these issues before importing</b><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
    <p className="table-scroll-hint"><ArrowRight size={13} /> Swipe or use arrow keys to review all fields</p>
    <div className="import-review-table-wrap" role="region" aria-label="Scrollable imported draw preview" tabIndex={0}><table className="data-table import-review-table"><thead><tr><th>ROW</th><th>PLAYER ONE</th><th></th><th>PLAYER TWO</th><th>CATEGORY</th><th>GROUP</th><th>ROUND</th><th>TABLE</th></tr></thead><tbody>{preview.rows.map((row, index) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><label className="sr-only" htmlFor={`import-one-${row.rowNumber}`}>Player one for row {row.rowNumber}</label><select id={`import-one-${row.rowNumber}`} value={row.playerOneId} onChange={(event) => onChange(index, 'playerOneId', event.target.value)}><option value="">{row.oneMatch === 'ambiguous' ? 'Choose matching name' : 'Map to roster player'}</option>{entrants.map((player) => <option key={player.id} value={player.id}>{player.name} · {player.id.slice(0, 6)}</option>)}</select></td><td>vs</td><td><label className="sr-only" htmlFor={`import-two-${row.rowNumber}`}>Player two for row {row.rowNumber}</label><select id={`import-two-${row.rowNumber}`} value={row.playerTwoId} onChange={(event) => onChange(index, 'playerTwoId', event.target.value)}><option value="">{row.twoMatch === 'ambiguous' ? 'Choose matching name' : 'Map to roster player'}</option>{entrants.map((player) => <option key={player.id} value={player.id}>{player.name} · {player.id.slice(0, 6)}</option>)}</select></td><td><label className="sr-only" htmlFor={`import-category-${row.rowNumber}`}>Category for row {row.rowNumber}</label><select id={`import-category-${row.rowNumber}`} value={row.category} onChange={(event) => onChange(index, 'category', event.target.value)}><option value="">Choose category</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></td><td>{row.group || '-'}</td><td>{row.round || <span className="import-missing">Missing</span>}</td><td>{row.table || '-'}</td></tr>)}</tbody></table></div>
    <p className="import-review-note">Fixtures are appended to this tournament. Existing matches and results are kept. Duplicate fixtures and multiple fixtures per player in one round are blocked.</p>
    </>}
    <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel import</button><button className="button button-primary" type="button" onClick={onApply} disabled={errors.length > 0}><Check size={15} /> {preview.bracketDraft ? 'Apply reviewed knockout bracket' : preview.groups || preview.groupAssignments ? 'Apply group allocation' : `Import ${preview.rows.length} fixtures`}</button></div>
  </Dialog>;
}

function ScheduleDialog({ match, tableCount, onClose, onSave }: { match: Match; tableCount: number; onClose: () => void; onSave: (startsAt: string, table: string, reason: string) => void }) {
  const [startsAt, setStartsAt] = useState(match.startsAt === 'TBD' ? '' : match.startsAt);
  const [table, setTable] = useState(match.table ?? '');
  const [reason, setReason] = useState('');
  return <Dialog title="Reschedule match" eyebrow="ORGANISER CHANGE" onClose={onClose}>
    <form className="form-stack" noValidate onSubmit={(event) => { event.preventDefault(); onSave(startsAt, table, reason.trim()); }}>
      <p className="dialog-copy">Change the start time or table. Your reason will be kept in this tournament’s audit log.</p>
      <label className="field"><span>Start time</span><input autoFocus value={startsAt} onChange={(event) => setStartsAt(event.target.value)} placeholder="e.g. 10:30 or TBD" maxLength={40} /></label>
      <label className="field"><span>Table</span><select value={table} onChange={(event) => setTable(event.target.value)}><option value="">Unassigned</option>{Array.from({ length: Math.max(1, tableCount) }, (_, index) => `Table ${String(index + 1).padStart(2, '0')}`).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="field"><span>Reason (optional, included in history)</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Table became unavailable" maxLength={160} /></label>
      <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><CalendarClock size={15} /> Save schedule</button></div>
    </form>
  </Dialog>;
}

function EditFieldDialog({ tournament, players, pendingFixtureCount, onClose, onSave }: { tournament: Tournament; players: Player[]; pendingFixtureCount: number; onClose: () => void; onSave: (entrantIds: string[], reason: string) => void }) {
  const [entrantIds, setEntrantIds] = useState(tournament.entrantIds);
  const [reason, setReason] = useState('');
  const toggle = (id: string) => setEntrantIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <Dialog title="Edit tournament entrants" eyebrow="SAFE DRAW CHANGE" onClose={onClose} size="wide">
    <form className="form-stack" noValidate onSubmit={(event) => { event.preventDefault(); if (entrantIds.length >= 2) onSave(entrantIds, reason.trim()); }}>
      <p className="dialog-copy">This override rebuilds the active singles draw, even after play has started. Previous fixtures and results remain in the activity journal and export for review.</p>
      <div className="field-edit-count"><Users size={16} /><span><b>{entrantIds.length} entrants selected</b><small>{pendingFixtureCount} active fixtures will be replaced; prior records stay recoverable</small></span></div>
      <div className="entrant-picker"><div className="entrant-picker-head"><span>Choose the field</span><small>At least 2 players</small></div><div className="entrant-list">{players.map((player) => <label className={`entrant-option ${entrantIds.includes(player.id) ? 'entrant-option--selected' : ''}`} key={player.id}><input type="checkbox" checked={entrantIds.includes(player.id)} onChange={() => toggle(player.id)} /><span className="avatar avatar--tiny">{player.initials}</span><span>{player.name}</span><span className="entrant-rating">{player.rating}</span></label>)}</div></div>
      <label className="field"><span>Reason (optional, included in history)</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. A player can no longer attend" maxLength={160} /></label>
      <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={entrantIds.length < 2}><Users size={15} /> Override active draw</button></div>
    </form>
  </Dialog>;
}

function TournamentRecordEditor({ value, error, onChange, onClose, onSave }: { value: string; error: string; onChange: (value: string) => void; onClose: () => void; onSave: () => void }) {
  return <Dialog title="Edit tournament record" eyebrow="ORGANISER OVERRIDE · SNAPSHOT SAVED" size="wide" onClose={onClose}><p className="dialog-copy">Edit categories, entrant pools, seeds, bracket positions, table count, event details and progression fields. The previous event record is retained in the workspace activity journal.</p><label className="field"><span>Full tournament record · JSON</span><textarea className="json-editor" rows={22} spellCheck={false} value={value} onChange={(event) => onChange(event.target.value)} /></label>{error && <p className="inline-message" role="alert">{error}</p>}<div className="dialog-actions"><button className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" onClick={onSave}><Pencil size={14} /> Save event changes</button></div></Dialog>;
}

function exportTournamentPackage(tournament: Tournament, workspace: Workspace, players: Map<string, Player>) {
  const matches = workspace.matches.filter((match) => match.tournamentId === tournament.id || tournament.matchIds.includes(match.id));
  const matchIds = new Set(matches.map((match) => match.id));
  const activityLog = workspace.activityLog.filter((event) => event.entityId === tournament.id || matchIds.has(event.entityId));
  const packageData = { schemaVersion: 2, exportedAt: new Date().toISOString(), source: 'TopspinElo local preview', recoveryNote: 'The workspace field is a complete backup of this browser workspace, including other events. Restore it through Settings.', tournament, entrants: tournament.entrantIds.map((id) => players.get(id)).filter(Boolean), matches, referees: workspace.referees, activityLog, workspace };
  const url = URL.createObjectURL(new Blob([JSON.stringify(packageData, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `topspin-elo-${slug(tournament.name)}-tournament.json`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printTournamentDraw(tournament: Tournament, matches: Match[], players: Map<string, Player>) {
  const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
  const byCategory = new Map<string, Match[]>();
  for (const match of matches) byCategory.set(match.category ?? 'Draw', [...(byCategory.get(match.category ?? 'Draw') ?? []), match]);
  const sections = [...byCategory.entries()].map(([category, rows]) => `<section><h2>${escape(category)}</h2><table><thead><tr><th>Round</th><th>Match</th><th>Table</th><th>Time</th><th>Status</th></tr></thead><tbody>${rows.map((match) => `<tr><td>${escape(match.round)}</td><td>${escape(match.sideOneLabel ?? players.get(match.playerOneId)?.name)} <span>vs</span> ${escape(match.sideTwoLabel ?? players.get(match.playerTwoId)?.name)}</td><td>${escape(match.table || '-')}</td><td>${escape(match.startsAt === 'TBD' ? 'To be assigned' : match.startsAt)}</td><td>${escape(match.status)}</td></tr>`).join('')}</tbody></table></section>`).join('');
  const byes = tournament.categories.flatMap((category) => (category.byeEntryIds ?? []).map((entryId) => {
    const entry = category.entries.find((item) => item.id === entryId);
    return entry ? `${category.name}: ${entry.name || entry.playerIds.map((id) => players.get(id)?.name).filter(Boolean).join(' & ')}` : '';
  }).filter(Boolean));
  const popup = window.open('', '_blank');
  if (!popup) return;
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(tournament.name)} draw</title><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{font:12px/1.45 Arial,sans-serif;color:#20332a}header{border-bottom:2px solid #315c40;padding-bottom:12px;margin-bottom:20px}h1{font-size:22px;margin:0 0 6px}header p{margin:0;color:#56665c}h2{font-size:15px;margin:22px 0 8px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{text-align:left;padding:7px 6px;border-bottom:1px solid #dce4dc;vertical-align:top}th{background:#eff4ed;color:#42594a;font-size:9px;text-transform:uppercase;letter-spacing:.04em}td span{color:#7c887e;padding:0 4px}.byes{margin-top:20px;padding:10px 12px;background:#f5f7f3;border:1px solid #dce4dc}.byes h2{margin:0 0 6px}.byes ul{margin:0;padding-left:18px;columns:2}@media print{button{display:none}}</style></head><body><header><h1>${escape(tournament.name)}</h1><p>${escape(tournament.date)} · ${escape(tournament.venue || 'Venue to be confirmed')} · ${escape(tournament.format)}</p></header>${sections || '<p>The draw has no fixtures yet.</p>'}${byes.length ? `<aside class="byes"><h2>Byes</h2><ul>${byes.map((bye) => `<li>${escape(bye)}</li>`).join('')}</ul></aside>` : ''}<script>window.onload=()=>window.print()<\/script></body></html>`);
  popup.document.close();
}

function slug(value: string) { return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event'; }

function groupFixtureReplacementError(category: TournamentCategory, tournament: Tournament, workspace: Workspace): string | undefined {
  if (category.groupStage?.advanced && tournament.categories.some(c=>c.name===category.name+' · Knockout' && workspace.matches.some(m=>m.tournamentId===tournament.id && m.categoryId===c.id))) return 'A knockout draw already uses these results. Review the event before replacing its qualifying groups.';
  return undefined;
}

function isGroupFixture(match: Match, category: TournamentCategory): boolean {
  const one = match.sideOneId ?? match.playerOneId, two = match.sideTwoId ?? match.playerTwoId;
  return match.categoryId === category.id && Boolean(category.groupStage?.groups?.some((group) => group.entryIds.includes(one) && group.entryIds.includes(two)));
}

function validateGroupAllocation(groups: { id: string; name: string; entryIds: string[] }[], categoryId: string | undefined, tournament: Tournament, workspace: Workspace): string[] {
  const category = tournament.categories.find((item) => item.id === categoryId && item.groupStage);
  if (!category?.groupStage) return ['The allocation has no matching group-stage category.'];
  const errors: string[] = [];
  if (category.groupStage.advanced) errors.push('This group stage has already advanced and cannot be replaced.');
  if (groups.length !== category.groupStage.groupCount || groups.some((group) => group.entryIds.length < 2)) errors.push('Allocation must match the configured group count and contain at least two entrants per group.');
  const ids = groups.flatMap((group) => group.entryIds);
  if (ids.length !== category.entries.length || new Set(ids).size !== category.entries.length || category.entries.some((entry) => !ids.includes(entry.id))) errors.push('The allocation must include every category entrant exactly once.');
  const replacementError = groupFixtureReplacementError(category, tournament, workspace);
  if (replacementError) errors.push(replacementError);
  return errors;
}

function validateGroupSuggestions(rows: GroupSuggestion[], categoryId: string | undefined, tournament: Tournament, workspace: Workspace): string[] {
  const category = tournament.categories.find((item) => item.id === categoryId && item.groupStage);
  if (!category?.groupStage) return ['The scanned allocation has no matching group-stage category.'];
  if (category.groupStage.advanced) return ['This group stage has already advanced and cannot be replaced from an import.'];
  const errors: string[] = [];
  if (rows.some((row) => !row.entryId)) errors.push('Map every OCR suggestion to a registered entrant.');
  if (rows.some((row) => !row.groupName.trim())) errors.push('Choose a group for every OCR suggestion.');
  const ids = rows.map((row) => row.entryId).filter(Boolean);
  if (new Set(ids).size !== ids.length) errors.push('A roster entrant is mapped more than once.');
  const names = [...new Set(rows.map((row) => row.groupName.trim().toLocaleLowerCase()).filter(Boolean))];
  if (names.length !== category.groupStage.groupCount) errors.push(`The scan contains ${names.length} groups; this category expects ${category.groupStage.groupCount}.`);
  const groupCounts = new Map<string, number>();
  for (const row of rows) groupCounts.set(row.groupName.trim().toLocaleLowerCase(), (groupCounts.get(row.groupName.trim().toLocaleLowerCase()) ?? 0) + 1);
  if ([...groupCounts.values()].some((count) => count < 2)) errors.push('Every group needs at least two entrants.');
  if (ids.length !== category.entries.length || category.entries.some((entry) => !ids.includes(entry.id))) errors.push('The allocation must include every category entrant exactly once.');
  const replacementError = groupFixtureReplacementError(category, tournament, workspace);
  if (replacementError) errors.push(replacementError);
  return errors;
}

function validateImportPreview(rows: ImportRow[], tournament: Tournament, workspace: Workspace, players: Map<string, Player>): string[] {
  const errors: string[] = []; const sourceIds = new Set<string>();
  const pairs = new Set<string>(); const groupPairs = new Set<string>(); const playedByRound = new Set<string>();
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
    const explicitGroup = row.group || (round.includes(' · ') ? round.split(' · ')[0] : '');
    if (category?.groupStage?.groups?.length) {
      const assigned = category.groupStage.groups.find((group) => group.entryIds.includes(row.playerOneId) && group.entryIds.includes(row.playerTwoId));
      if (!assigned) errors.push(`Row ${row.rowNumber}: both entrants must be assigned to the same group.`);
      else if (explicitGroup && assigned.name.toLocaleLowerCase() !== explicitGroup.toLocaleLowerCase()) errors.push(`Row ${row.rowNumber}: the round is tagged ${explicitGroup}, but both entrants are assigned to ${assigned.name}.`);
    }
    if (!round || !category || !one || !two || row.playerOneId === row.playerTwoId) continue;
    const pair = [row.playerOneId, row.playerTwoId].sort().join('|'); const pairKey = `${round.toLocaleLowerCase()}|${pair}`;
    if (pairs.has(pairKey)) errors.push(`Round ${round}: the same fixture appears more than once in this file.`);
    pairs.add(pairKey);
    if (existing.some((match) => match.categoryId === category.id && (match.round ?? '').toLocaleLowerCase() === round.toLocaleLowerCase() && [match.sideOneId ?? match.playerOneId, match.sideTwoId ?? match.playerTwoId].sort().join('|') === pair)) errors.push(`Round ${round}: ${entryLabel(one, players)} vs ${entryLabel(two, players)} already exists in this tournament.`);
    if (category.groupStage?.groups?.length) {
      const group = category.groupStage.groups.find((candidate) => candidate.entryIds.includes(row.playerOneId) && candidate.entryIds.includes(row.playerTwoId));
      if (group) {
        const groupPairKey = `${category.id}|${group.id}|${pair}`;
        if (groupPairs.has(groupPairKey)) errors.push(`${group.name}: ${entryLabel(one, players)} vs ${entryLabel(two, players)} appears more than once in this round robin.`);
        groupPairs.add(groupPairKey);
        if (existing.some((match) => match.categoryId === category.id && [match.sideOneId ?? match.playerOneId, match.sideTwoId ?? match.playerTwoId].sort().join('|') === pair)) errors.push(`${group.name}: ${entryLabel(one, players)} vs ${entryLabel(two, players)} already exists in this group round robin.`);
      }
    }
    for (const playerId of [...one.playerIds, ...two.playerIds]) {
      const key = `${round.toLocaleLowerCase()}|${playerId}`;
      if (playedByRound.has(key)) errors.push(`Round ${round}: ${players.get(playerId)?.name} appears in more than one fixture.`);
      playedByRound.add(key);
    }
  }
  return [...new Set(errors)];
}

function downloadDrawTemplate(type: 'csv' | 'json', includeGroups = false) {
  const isCsv = type === 'csv';
  const sample = { player_one: '', player_two: '', category: '', ...(includeGroups ? { group: 'Group A' } : {}), round: includeGroups ? 'Group A · Round 1' : 'Round 1', table: '', start_time: '' };
  const body = isCsv ? `${includeGroups ? 'player_one,player_two,category,group,round,table,start_time' : 'player_one,player_two,category,round,table,start_time'}\n` : JSON.stringify({ schema_version: 1, matches: [sample] }, null, 2);
  const url = URL.createObjectURL(new Blob([body], { type: isCsv ? 'text/csv;charset=utf-8' : 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `topspin-elo-draw-template.${type}`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadGroupAllocationTemplate(type: 'csv' | 'json') {
  const isCsv = type === 'csv';
  const body = isCsv ? 'group,player,seed\nGroup A,,\nGroup B,,\n' : JSON.stringify({ schema_version: 1, groups: [{ group: 'Group A', player: '', seed: 1 }, { group: 'Group B', player: '', seed: 2 }] }, null, 2);
  const url = URL.createObjectURL(new Blob([body], { type: isCsv ? 'text/csv;charset=utf-8' : 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `topspin-elo-group-allocation-template.${type}`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function TournamentStandings({ tournament, players, matches }: { tournament: Tournament; players: Map<string, Player>; matches: Match[] }) {
  return <>{tournament.categories.map((category) => {
    const entries = new Map(category.entries.map((entry) => [entry.id, entry]));
    const entryName = (id: string) => { const entry = entries.get(id); return entry?.name || entry?.playerIds.map((playerId) => players.get(playerId)?.name ?? 'Unknown').join(' & ') || 'Unknown entrant'; };
    const rows = [...(category.standings ?? [])].sort((a, b) => b.wins - a.wins || (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost) || b.gamesWon - a.gamesWon || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst));
    const fixtures = matches.filter((match) => match.categoryId === category.id);
    const progression = category.entries.map((entry) => {
      const entryMatches = fixtures.filter((match) => match.sideOneId === entry.id || match.sideTwoId === entry.id || match.teamOneId === entry.id || match.teamTwoId === entry.id);
      const current = entryMatches.sort((a, b) => Number(a.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1) - Number(b.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1)).at(-1);
      const bye = category.byeEntryIds?.includes(entry.id);
      return { entry, state: bye && !current ? 'Bye · advances' : current?.round ?? 'Awaiting draw', status: current?.status ?? 'Scheduled' };
    });
    const groupRows = category.groupStage?.groups?.map((group) => ({ group, rows: rows.filter((row) => group.entryIds.includes(row.playerId)) })) ?? [];
    const renderTable = (tableRows: typeof rows, label: string) => <><p className="table-scroll-hint"><ArrowRight size={13} /> Swipe or use arrow keys to view all columns</p><div className="standings-table-wrap" role="region" aria-label={`${label} standings`} tabIndex={0}><table className="data-table standings-table"><thead><tr><th>POS</th><th>ENTRY</th><th>PLAYED</th><th>W</th><th>L</th><th>GAMES</th><th>DIFF</th><th>POINTS</th></tr></thead><tbody>{tableRows.map((row, index) => <tr key={row.playerId}><td><span className={`rank ${index === 0 ? 'rank--first' : ''}`}>{String(index + 1).padStart(2, '0')}</span></td><td><div className="standing-player"><span className="avatar avatar--tiny">{entries.get(row.playerId)?.playerIds.map((id) => players.get(id)?.initials).filter(Boolean).join('/') || entryName(row.playerId).slice(0, 2).toUpperCase()}</span><b>{entryName(row.playerId)}</b>{index === 0 && row.played > 0 && <span className="leader-mark">LEADER</span>}</div></td><td>{row.played}</td><td className="win-cell">{row.wins}</td><td>{row.losses}</td><td>{row.gamesWon}–{row.gamesLost}</td><td>{row.gamesWon - row.gamesLost > 0 ? '+' : ''}{row.gamesWon - row.gamesLost}</td><td>{row.pointsFor}–{row.pointsAgainst}</td></tr>)}</tbody></table></div><p className="table-footnote"><span /> Rankings use match wins, game difference, games won, then point difference. Head-to-head results break ties at the advancement line; any remaining tie blocks automatic advancement.</p></>;
    return <section className="tournament-section standings-section" key={category.id}><div className="section-head"><div><p className="eyebrow">{category.kind.toUpperCase()} · {category.format.toUpperCase()}</p><h3>{category.name}</h3><p className="section-caption">{category.kind === 'Team' ? `ITTF ${category.teamSystem?.replaceAll('_', ' ') ?? 'team'} system` : `${category.entries.length} registered entrants`}</p></div></div>
      {category.format === 'Knockout' ? <><div className="progression-note"><ShieldCheck size={17} /><span>Advancement is tracked independently for this category. Team ties stop when a team wins the required majority of individual matches.</span></div><div className="progression-entrants">{progression.map(({ entry, state, status }, index) => <div className="progression-entrant" key={entry.id}><span className="seed-number">{String(index + 1).padStart(2, '0')}</span><span className="avatar avatar--tiny">{entry.playerIds.map((id) => players.get(id)?.initials).filter(Boolean).join('/') || entry.name.slice(0, 2).toUpperCase()}</span><b>{entryName(entry.id)}</b><span className="entrant-rating">{entry.seed ? `Seed ${entry.seed}` : 'Unseeded'}</span><span className="progression-status">{state} · {status}</span></div>)}</div></> : groupRows.length ? <>{groupRows.map(({ group, rows: groupStandings }) => <div className="group-standings" key={group.id}><h4>{group.name}<span>Top {category.groupStage?.advancePerGroup} advance</span></h4>{renderTable(groupStandings, `${category.name} ${group.name}`)}</div>)}</> : renderTable(rows, category.name)}
    </section>;
  })}</>;
}

function TournamentAudit({ tournament }: { tournament: Tournament }) {
  return <section className="tournament-section audit-section"><div className="section-head"><div><p className="eyebrow">ORGANISER HISTORY</p><h3>Audit log</h3><p className="section-caption">Changes and the reason recorded with each one.</p></div><span className="audit-count">{tournament.audit.length} entries</span></div>{tournament.audit.length ? <div className="audit-list">{tournament.audit.map((entry) => <div className="audit-row" key={entry.id}><span className="audit-icon"><Activity size={15} /></span><div className="audit-copy"><b>{entry.action}</b><span>{entry.target}</span><small>Reason: {entry.reason}</small></div><time>{entry.at}</time></div>)}</div> : <div className="empty-draw"><span className="empty-mark"><ShieldCheck size={18} /></span><div><b>No organiser changes yet</b><span>Edits, corrections and progression decisions will be recorded here.</span></div></div>}</section>;
}

function TournamentMatchRow({ match, players, onClick, disabled = false, waitingReason, expanded = false }: { match: Match; players: Map<string, Player>; onClick: () => void; disabled?: boolean; waitingReason?: string; expanded?: boolean }) {
  const one = players.get(match.playerOneId); const two = players.get(match.playerTwoId);
  const oneId = match.sideOneId ?? match.playerOneId, twoId = match.sideTwoId ?? match.playerTwoId;
  return <button className={`tournament-match-row ${expanded ? 'tournament-match-row--expanded' : ''}`} onClick={onClick} disabled={disabled} title={waitingReason} aria-label={`${disabled ? 'Waiting: ' : match.status === 'Completed' ? 'View log: ' : 'Open match: '}${match.sideOneLabel ?? one?.name ?? 'Player one'} versus ${match.sideTwoLabel ?? two?.name ?? 'Player two'}`}><div className="tournament-match-time"><b>{match.startsAt}</b><small>{match.table ?? 'No table'}{match.teamTieOrder !== undefined ? ` · Tie match ${match.teamTieOrder + 1}` : ''}</small></div><div className="tournament-match-pair"><span><b className={match.winnerId === oneId ? 'winner-name' : ''}>{match.sideOneLabel ?? one?.name ?? 'Player one'}{match.sideOneTeamName ? ` · ${match.sideOneTeamName}` : ''}</b><span>{match.gamesWon[oneId] ?? 0}</span></span><span><b className={match.winnerId === twoId ? 'winner-name' : ''}>{match.sideTwoLabel ?? two?.name ?? 'Player two'}{match.sideTwoTeamName ? ` · ${match.sideTwoTeamName}` : ''}</b><span>{match.gamesWon[twoId] ?? 0}</span></span></div><StatusPill status={match.status} />{disabled ? <small className="match-waiting">Waiting</small> : <ArrowRight className="match-row-arrow" size={15} />}</button>;
}

function TournamentStatus({ status }: { status: Tournament['status'] }) {
  const className = status === 'Running' ? 'tournament-status tournament-status--running' : status === 'Completed' ? 'tournament-status tournament-status--complete' : status === 'Paused' ? 'tournament-status tournament-status--paused' : 'tournament-status tournament-status--upcoming';
  return <span className={className}><i />{status}</span>;
}

function ReasonDialog({ action, onClose, onConfirm }: { action: 'pause' | 'resume'; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState(''); const isPause = action === 'pause';
  return <Dialog title={isPause ? 'Pause progression?' : 'Resume progression?'} eyebrow="ORGANISER DECISION" onClose={onClose}><form className="form-stack" noValidate onSubmit={(event) => { event.preventDefault(); onConfirm(reason.trim()); }}><p className="dialog-copy">{isPause ? 'Automatic advancement will stop. Matches and scores remain available for manual edits.' : 'Automatic progression will be available again after this decision is recorded.'}</p><label className="field"><span>Reason (optional, included in history)</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={isPause ? 'e.g. Review a disputed result' : 'e.g. Schedule confirmed'} maxLength={160} /></label><div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">{isPause ? <Pause size={15} /> : <Play size={15} />}{isPause ? 'Pause progression' : 'Resume progression'}</button></div></form></Dialog>;
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
