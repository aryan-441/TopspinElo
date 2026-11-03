import { qualifierDraw } from './services/qualifierDraw';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowRight, Bell, ChartNoAxesCombined, CircleDot, ClipboardList, Download, Image, Info, Menu, Plus, Settings2, Table2, Trophy, UserRound, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { assignSeededGroups, createMatch, createPlayer, createTournament, generateCategoryRoundFixtures, generateTournamentFixtures, loadWorkspace, normalizeWorkspace, recordWorkspaceChanges, resetWorkspace, resolveTeamTie, saveWorkspace } from './services/store';
import type { CategoryEntry, CategoryKind, Match, PageId, Player, Standing, TeamSystem, Tournament, TournamentCategory, TournamentGroup, Workspace } from './types';
import { Overview } from './views/Overview';
import { MatchCenter, LiveScoring } from './views/MatchCenter';
import { PlayersView } from './views/PlayersView';
import { RefereesView } from './views/RefereesView';
import { TournamentsView } from './views/TournamentsView';
import { StatisticsView } from './views/StatisticsView';
import { ClubGuide, AboutView, ExportsView, SettingsView } from './views/UtilityViews';
import { Dialog } from './components/Dialog';

type NavItem = { id: PageId; label: string; icon: LucideIcon };
const mainNav: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: Table2 },
  { id: 'matches', label: 'Matches', icon: CircleDot },
  { id: 'tournaments', label: 'Tournaments', icon: Trophy },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'referees', label: 'Referees', icon: UserRound },
  { id: 'statistics', label: 'Statistics', icon: ChartNoAxesCombined },
];
const workspaceNav: NavItem[] = [
  { id: 'exports', label: 'Exports & recovery', icon: Download },
  { id: 'settings', label: 'Settings', icon: Settings2 },
  { id: 'guide', label: 'Club guide', icon: ClipboardList },
  { id: 'about', label: 'About Rallydesk', icon: Info },
];
const pageTitles: Record<PageId, string> = {
  overview: 'Rallydesk', matches: 'Matches', tournaments: 'Tournaments', players: 'Players', referees: 'Referees', statistics: 'Statistics', exports: 'Exports & recovery', settings: 'Workspace settings', about: 'About Rallydesk', guide: 'Club guide',
};

type CreateDialog = 'player' | 'match' | 'tournament' | null;

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(loadWorkspace);
  const [page, setPage] = useState<PageId>('overview');
  const [createDialog, setCreateDialog] = useState<CreateDialog>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const previousMobileNav = useRef(false);
  const [query, setQuery] = useState('');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [workspaceRole, setWorkspaceRole] = useState<'organiser' | 'referee'>(() => { try { return localStorage.getItem('rallydesk-view') === 'referee' ? 'referee' : 'organiser'; } catch { return 'organiser'; } });
  const setRole = (role: 'organiser' | 'referee') => { setWorkspaceRole(role); try { localStorage.setItem('rallydesk-view', role); } catch { /* The view remains usable when storage is unavailable. */ } };
  const visibleNav = workspaceRole === 'referee' ? mainNav.filter((item) => item.id === 'matches' || item.id === 'statistics') : mainNav;
  const activePlayers = workspace.players.filter((player) => !player.archivedAt);

  useEffect(() => { if (!saveWorkspace(workspace)) setToast('This browser blocked workspace storage. Changes may not persist after reload.'); }, [workspace]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (previousMobileNav.current === mobileNav) return;
    previousMobileNav.current = mobileNav;
    if (mobileNav) mobileCloseRef.current?.focus();
    else mobileMenuRef.current?.focus();
  }, [mobileNav]);
  useEffect(() => {
    if (!mobileNav) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobileNav(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])');
      if (!focusable?.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1]; const active = document.activeElement;
      if (event.shiftKey && (active === first || !sidebarRef.current?.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !sidebarRef.current?.contains(active))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileNav]);

  const playerById = useMemo(() => new Map(workspace.players.map((player) => [player.id, player])), [workspace.players]);
  const activeMatch = workspace.matches.find((match) => match.id === activeMatchId) ?? null;

  useEffect(() => {
    document.title = activeMatch ? 'Live scoring — Rallydesk' : page === 'overview' ? 'Rallydesk — Table Tennis Manager' : `${pageTitles[page]} — Rallydesk`;
  }, [activeMatch?.id, page]);

  const update = (mutator: (current: Workspace) => Workspace) => setWorkspace((current) => recordWorkspaceChanges(current, mutator(structuredClone(current))));
  const saveScoredMatch = (next: Match) => update((current) => {
    let matches = current.matches.map((match) => match.id === next.id ? next : match);
    if (next.teamTieId) {
      const event = current.tournaments.find((tournament) => tournament.id === next.tournamentId);
      const category = event?.categories.find((item) => item.id === next.categoryId);
      if (category?.kind === 'Team') {
        const tied = matches.filter((match) => match.teamTieId === next.teamTieId);
        const resolution = resolveTeamTie(tied, category.teamSystem ?? 'new_swaythling');
        const resolvedById = new Map(resolution.matches.map((match) => [match.id, match]));
        matches = matches.map((match) => resolvedById.get(match.id) ?? match);
      }
    }
    const finished = matches.filter((match) => match.status === 'Completed' && match.winnerId);
    const players = current.players.map((player) => {
      const played = finished.filter((match) => (match.sideOnePlayerIds ?? [match.playerOneId]).includes(player.id) || (match.sideTwoPlayerIds ?? [match.playerTwoId]).includes(player.id));
      const wins = played.filter((match) => match.winnerId === (match.sideOneId ?? match.playerOneId) && (match.sideOnePlayerIds ?? [match.playerOneId]).includes(player.id) || match.winnerId === (match.sideTwoId ?? match.playerTwoId) && (match.sideTwoPlayerIds ?? [match.playerTwoId]).includes(player.id));
      return {
        ...player,
        wins: wins.length,
        losses: played.length - wins.length,
        pointsWon: matches.filter((match) => (match.sideOnePlayerIds ?? [match.playerOneId]).includes(player.id) || (match.sideTwoPlayerIds ?? [match.playerTwoId]).includes(player.id)).flatMap((match) => match.events.filter((event) => event.winnerId === (match.sideOneId ?? match.playerOneId) && (match.sideOnePlayerIds ?? [match.playerOneId]).includes(player.id) || event.winnerId === (match.sideTwoId ?? match.playerTwoId) && (match.sideTwoPlayerIds ?? [match.playerTwoId]).includes(player.id))).filter((event) => event.kind === 'Point' || event.kind === 'Fault').length,
        recent: played.slice(0, 5).map((match) => (wins.includes(match) ? 'W' as const : 'L' as const)),
      };
    });
    const tournaments = current.tournaments.map((tournament) => {
      let eventMatches = matches.filter((match) => match.tournamentId === tournament.id || tournament.matchIds.includes(match.id));
      const generatedCategories: TournamentCategory[] = [];
      const categories: TournamentCategory[] = tournament.categories.map((category) => {
        let categoryMatches = eventMatches.filter((match) => match.categoryId === category.id);
        const progressionCategory = category.format === 'Knockout' ? category : tournament.categories.find((item) => item.name === `${category.name} · Knockout`);
        if (category.groupStage?.advanceToKnockout !== false && category.groupStage && !category.groupStage.advanced && !tournament.progressPaused) {
          const existingKnockout = tournament.categories.find((item) => item.name === `${category.name} · Knockout`);
          if (existingKnockout) category.groupStage = { ...category.groupStage, advanced: true };
          const groups = category.groupStage.groups ?? [];
          const groupFixtures = categoryMatches.filter((match) => groups.some((group) => match.round?.startsWith(`${group.name} ·`)));
          const importedFixturesExist = hasCompleteGroupRoundRobin(groups, categoryMatches, category.id);
          const allResultsComplete = importedFixturesExist && groupFixtures.every((match) => match.status === 'Completed' && Boolean(match.winnerId));
          if (allResultsComplete && !existingKnockout) {
            const qualifiers: { entry: CategoryEntry; place: number }[] = [];
            let unresolvedTie = false;
            for (const group of groups) {
              const entries = category.entries.filter((entry) => group.entryIds.includes(entry.id));
              const fixtures = groupFixtures.filter((match) => match.round?.startsWith(`${group.name} ·`));
              const standings = calculateCategoryStandings({ ...category, entries }, fixtures).sort(compareGroupStandings);
              const n = category.groupStage.advancePerGroup;
              const initialBoundary = standings[n - 1], nextStanding = standings[n];
              if (initialBoundary && nextStanding && sameGroupStanding(initialBoundary, nextStanding)) {
                const tiedPlayers = standings.filter((standing) => sameGroupStanding(standing, initialBoundary));
                const tiedIds = new Set(tiedPlayers.map((standing) => standing.playerId));
                const tieBreakMatches = fixtures.filter((match) => tiedIds.has(match.sideOneId ?? match.playerOneId) && tiedIds.has(match.sideTwoId ?? match.playerTwoId));
                const headToHead = calculateCategoryStandings({ ...category, entries: entries.filter((entry) => tiedIds.has(entry.id)) }, tieBreakMatches).sort(compareGroupStandings);
                const firstTiedIndex = standings.findIndex((standing) => sameGroupStanding(standing, initialBoundary));
                standings.splice(firstTiedIndex, tiedPlayers.length, ...headToHead);
                if (standings[n - 1] && standings[n] && sameGroupStanding(standings[n - 1], standings[n])) unresolvedTie = true;
              }
              standings.slice(0, n).forEach((standing, index) => {
                const entry = entries.find((item) => item.id === standing.playerId);
                if (entry) qualifiers.push({ entry, place: index + 1 });
              });
            }
            if (!unresolvedTie && qualifiers.length >= 2) {
              const {ordered, bracketSlots} = qualifierDraw(qualifiers, groups, category.groupStage.advancePerGroup);
              const knockoutId = crypto.randomUUID();
              const knockout: TournamentCategory = {
                id: knockoutId, name: `${category.name} · Knockout`, kind: 'Singles', format: 'Knockout',
                entries: ordered.map(({ entry }, index) => ({ ...entry, seed: index + 1 })), bracketSlots,
                byeEntryIds: bracketSlots.filter((id, i): id is string => !!id && !bracketSlots[i ^ 1]), tieBreaks: category.tieBreaks,
              };
              knockout.awaitingDraw = true;
              generatedCategories.push(knockout);
              category.groupStage = { ...category.groupStage, advanced: true };

            }
          }
        }
        if (progressionCategory && !progressionCategory.awaitingDraw && !tournament.progressPaused) {
          const rounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, progressionCategory.entries.length))));
          const roundFixtures = eventMatches.filter((match) => match.categoryId === progressionCategory.id);
          const roundNumber = Math.max(1, ...roundFixtures.map((match) => Number(match.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1)));
          const roundMatches = roundFixtures.filter((match) => Number(match.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1) === roundNumber);
          const hasNext = roundFixtures.some((match) => Number(match.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1) > roundNumber);
          let qualifiers = new Map<number, string>();
          if (roundNumber === 1) {
            for (const entryId of progressionCategory.byeEntryIds ?? []) { const slot = (progressionCategory.bracketSlots ?? []).indexOf(entryId); if (slot >= 0) qualifiers.set(Math.floor(slot / 2), entryId); }
          }
          if (progressionCategory.kind === 'Team') {
            const ties = new Map<string, Match[]>();
            for (const fixture of roundMatches) if (fixture.teamTieId) ties.set(fixture.teamTieId, [...(ties.get(fixture.teamTieId) ?? []), fixture]);
            const resolutions = [...ties.values()].map((tie) => resolveTeamTie(tie, progressionCategory.teamSystem ?? 'new_swaythling'));
            if (roundMatches.length && resolutions.every((result) => Boolean(result.winnerId))) {
              [...ties.values()].forEach((tie) => {
                const winner = resolveTeamTie(tie, progressionCategory.teamSystem ?? 'new_swaythling').winnerId;
                const bracketOrder = tie[0].bracketOrder ?? 0;
                if (winner) qualifiers.set(bracketOrder, winner);
              });
              if (!hasNext && roundNumber < rounds) {
                const next = generateCategoryRoundFixtures(tournament, progressionCategory, [...qualifiers.entries()].sort((a, b) => a[0] - b[0]).map(([, id]) => id), roundNumber + 1, current.players);
                matches = [...next, ...matches]; eventMatches = [...next, ...eventMatches]; categoryMatches = [...next, ...categoryMatches];
                tournament.matchIds = [...tournament.matchIds, ...next.map((fixture) => fixture.id)];
              }
            }
          } else if (roundMatches.length && roundMatches.every((match) => match.status === 'Completed' && match.winnerId)) {
            roundMatches.forEach((match, index) => qualifiers.set(match.bracketOrder ?? index, match.winnerId === match.sideOneId ? match.sideOneId! : match.sideTwoId!));
            if (!hasNext && roundNumber < rounds) {
              const next = generateCategoryRoundFixtures(tournament, progressionCategory, [...qualifiers.entries()].sort((a, b) => a[0] - b[0]).map(([, id]) => id), roundNumber + 1, current.players);
              matches = [...next, ...matches]; eventMatches = [...next, ...eventMatches]; categoryMatches = [...next, ...categoryMatches];
              tournament.matchIds = [...tournament.matchIds, ...next.map((fixture) => fixture.id)];
            }
          }
        }
        return { ...category, standings: calculateCategoryStandings(category, categoryMatches) };
      });
      const allCategories: TournamentCategory[] = [...categories, ...generatedCategories];
      eventMatches = matches.filter((match) => match.tournamentId === tournament.id || tournament.matchIds.includes(match.id));
      const resolved = eventMatches.filter((match) => match.status === 'Completed' || match.status === 'Not played');
      const complete = allCategories.every((category) => {
        const rows = eventMatches.filter((match) => match.categoryId === category.id);
        if (!rows.length) return false;
        if (category.format !== 'Knockout') return rows.every((match) => match.status === 'Completed' || match.status === 'Not played') && (category.groupStage?.advanceToKnockout === false || !category.groupStage || category.groupStage.advanced);
        const maxRound = Math.max(...rows.map((match) => Number(match.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1)));
        return rows.filter((match) => Number(match.round?.match(/Round\s+(\d+)/i)?.[1] ?? 1) === maxRound).every((match) => match.status === 'Completed' || match.status === 'Not played') && maxRound >= Math.ceil(Math.log2(Math.max(2, category.entries.length)));
      });
      const allRows = new Map(tournament.standings.map((standing) => [standing.playerId, standing]));
      for (const category of allCategories) for (const row of category.standings ?? []) allRows.set(row.playerId, row);
      return { ...tournament, categories: allCategories, standings: [...allRows.values()], completed: resolved.length, status: tournament.progressPaused ? 'Paused' as const : complete ? 'Completed' as const : resolved.length ? 'Running' as const : tournament.status };
    });
    return { ...current, matches, players, tournaments };
  });
  const deleteMatch = (matchId: string) => update((current) => {
    const matches = current.matches.filter((match) => match.id !== matchId);
    const finished = matches.filter((match) => match.status === 'Completed' && match.winnerId);
    const players = current.players.map((player) => {
      const played = finished.filter((match) => (match.sideOnePlayerIds ?? [match.playerOneId]).includes(player.id) || (match.sideTwoPlayerIds ?? [match.playerTwoId]).includes(player.id));
      const wins = played.filter((match) => match.winnerId === (match.sideOneId ?? match.playerOneId) && (match.sideOnePlayerIds ?? [match.playerOneId]).includes(player.id) || match.winnerId === (match.sideTwoId ?? match.playerTwoId) && (match.sideTwoPlayerIds ?? [match.playerTwoId]).includes(player.id));
      return { ...player, wins: wins.length, losses: played.length - wins.length, recent: played.slice(0, 5).map((match) => wins.includes(match) ? 'W' as const : 'L' as const), pointsWon: matches.filter((match) => (match.sideOnePlayerIds ?? [match.playerOneId]).includes(player.id) || (match.sideTwoPlayerIds ?? [match.playerTwoId]).includes(player.id)).flatMap((match) => match.events.filter((event) => event.kind === 'Point' || event.kind === 'Fault').filter((event) => event.winnerId === (match.sideOneId ?? match.playerOneId) && (match.sideOnePlayerIds ?? [match.playerOneId]).includes(player.id) || event.winnerId === (match.sideTwoId ?? match.playerTwoId) && (match.sideTwoPlayerIds ?? [match.playerTwoId]).includes(player.id))).length };
    });
    const tournaments = current.tournaments.map((tournament) => {
      const eventMatches = matches.filter((match) => match.tournamentId === tournament.id || tournament.matchIds.includes(match.id));
      const categories = tournament.categories.map((category) => ({ ...category, standings: calculateCategoryStandings(category, eventMatches.filter((match) => match.categoryId === category.id)) }));
      const audit = { id: crypto.randomUUID(), action: 'Fixture removed from active draw', target: matchId, reason: 'Removed by organiser; full fixture preserved in workspace activity journal', at: new Date().toISOString() };
      const completed = eventMatches.filter((match) => match.status === 'Completed' || match.status === 'Not played').length;
      return { ...tournament, matchIds: tournament.matchIds.filter((id) => id !== matchId), categories, completed, status: eventMatches.length && completed === eventMatches.length ? 'Completed' as const : eventMatches.some((match) => match.status === 'Completed' || match.status === 'In progress') ? 'Running' as const : 'Upcoming' as const, audit: [audit, ...tournament.audit] };
    });
    return { ...current, matches, players, tournaments };
  });
  const openMatchSetup = () => {
    if (activePlayers.length < 2) { setPage('players'); setToast('Add at least two active players before setting up a match'); return; }
    setCreateDialog('match');
  };
  const openTournamentSetup = () => {
    if (activePlayers.length < 2) { setPage('players'); setToast('Add at least two active players before creating a tournament'); return; }
    setCreateDialog('tournament');
  };
  const createNewPlayer = (name: string, hand: Player['hand'], grip: Player['grip'], style: Player['style']) => {
    const player = createPlayer(name, hand, grip, style);
    update((current) => ({ ...current, players: [player, ...current.players] }));
    setCreateDialog(null);
    setSelectedPlayerId(player.id);
    setPage('players');
    setToast(`${player.name} added to the player list`);
  };
  const createNewMatch = (input: Pick<Match, 'playerOneId' | 'playerTwoId' | 'format' | 'pointsPerGame' | 'gamesToWin' | 'tournamentId' | 'table'>) => {
    if (input.playerOneId === input.playerTwoId) { setToast('Choose two different players'); return; }
    const match = createMatch(input, workspace.players);
    const tournament = workspace.tournaments.find((item) => item.id === input.tournamentId);
    if (tournament) match.tournamentName = tournament.name;
    update((current) => ({ ...current, matches: [match, ...current.matches], tournaments: current.tournaments.map((item) => item.id === input.tournamentId ? { ...item, matchIds: [match.id, ...item.matchIds] } : item) }));
    setCreateDialog(null);
    setActiveMatchId(match.id);
    setToast('Match created. Confirm the toss and first server to begin.');
  };
  const createNewTournament = (input: Pick<Tournament, 'name' | 'format' | 'date' | 'venue' | 'entrantIds'> & { categories: TournamentCategory[]; tableCount: number }) => {
    const tournament = createTournament(input);
    for (const category of tournament.categories) if (category.groupStage?.groups?.length) {
      const seeds = category.groupStage.groups.map((group) => group.entryIds.map((id) => category.entries.find((entry) => entry.id === id)?.seed).filter((seed): seed is number => seed !== undefined));
      const placed = seeds.flat();
      if (placed.length && new Set(placed).size !== placed.length) { setToast(`${category.name}: imported groups cannot place the same seed in more than one group`); return; }
    }
    const fixtures = generateTournamentFixtures(tournament, workspace.players);
    tournament.matchIds = fixtures.map((match) => match.id);
    update((current) => ({ ...current, matches: [...fixtures, ...current.matches], tournaments: [tournament, ...current.tournaments] }));
    setCreateDialog(null);
    setSelectedTournamentId(tournament.id);
    setPage('tournaments');
    setToast(`${tournament.name} created · ${fixtures.length} opening fixtures generated`);
  };
  const replaceWorkspace = (next: Workspace) => { setWorkspace((current) => recordWorkspaceChanges(current, normalizeWorkspace(next))); setToast('Workspace updated'); };
  const reset = () => { setWorkspace((current) => recordWorkspaceChanges(current, resetWorkspace())); setPage('overview'); setSelectedPlayerId(null); setSelectedTournamentId(null); setToast('Workspace cleared · recovery history retained'); };

  if (activeMatch) {
    const canNominateDoubles = !activeMatch.doublesNominationPending || workspace.matches.filter((match) => match.teamTieId === activeMatch.teamTieId && (match.teamTieOrder ?? 0) < (activeMatch.teamTieOrder ?? 0)).every((match) => match.status === 'Completed');
    return <LiveScoring match={activeMatch} players={playerById} canNominateDoubles={canNominateDoubles} onBack={() => setActiveMatchId(null)} onChange={saveScoredMatch} toast={setToast} />;
  }

  return (
    <div className="app-frame">
      {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside ref={sidebarRef} id="rallydesk-sidebar" aria-label="Primary navigation" className={`sidebar ${mobileNav ? 'sidebar--open' : ''}`}>
        <div className="brand-lockup"><span className="brand-mark"><i /><i /><i /></span><span>rally<span className="brand-light">desk</span><small>CLUB OPERATIONS</small></span><button ref={mobileCloseRef} className="mobile-close icon-button" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
        <div className="role-switch" aria-label="Choose workspace interface"><span className="role-switch-label">WORKSPACE VIEW</span><div role="group" aria-label="Workspace interface"><button type="button" aria-pressed={workspaceRole === 'organiser'} className={workspaceRole === 'organiser' ? 'role-switch-active' : ''} onClick={() => { setRole('organiser'); if (page === 'matches') setPage('overview'); }}>Organiser</button><button type="button" aria-pressed={workspaceRole === 'referee'} className={workspaceRole === 'referee' ? 'role-switch-active' : ''} onClick={() => { setRole('referee'); setPage('matches'); }}>Referee</button></div></div>
        <button className="club-switcher" onClick={() => setPage('settings')}><span className="club-monogram">{workspace.clubName?.trim().charAt(0).toUpperCase() || '＋'}</span><span><b>{workspace.clubName || 'Add your club name'}</b><small>Workspace settings</small></span><span className="switch-caret">⌄</span></button>
        <nav aria-label="Main navigation">
          <p className="nav-label">{workspaceRole === 'referee' ? 'MATCH DESK' : 'CLUB'}</p>
          {visibleNav.map((item) => <NavButton key={item.id} item={item} active={page === item.id} count={item.id === 'matches' ? workspace.matches.filter((match) => match.status === 'In progress').length : undefined} onClick={() => { setPage(item.id); setSelectedPlayerId(null); setSelectedTournamentId(null); setMobileNav(false); }} />)}
          {workspaceRole === 'organiser' && <><p className="nav-label nav-label--spaced">MANAGE</p>{workspaceNav.map((item) => <NavButton key={item.id} item={item} active={page === item.id} onClick={() => { setPage(item.id); setMobileNav(false); }} />)}</>}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-note"><span className="storage-dot" /><span><b>Local preview</b><small>Saved in this browser</small></span></div>
          
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button ref={mobileMenuRef} className="mobile-menu icon-button" onClick={() => setMobileNav(true)} aria-label="Open navigation" aria-expanded={mobileNav} aria-controls="rallydesk-sidebar"><Menu size={20} /></button>
          <div className="breadcrumb"><span>{workspace.clubName || 'Rallydesk'}</span><span className="breadcrumb-slash">/</span><b>{pageTitles[page]}</b></div>
          <div className="topbar-right">
            <span className="preview-pill"><span /> Local preview</span>
            <button className="topbar-icon icon-button" aria-label="Notifications" onClick={() => setToast('You’re all caught up')}><Bell size={18} /><i /></button>
          </div>
        </header>

        <main className="page-wrap">
          <div className="page-toolbar">
            <div className="mobile-page-title"><span className="eyebrow">{workspaceRole === 'referee' ? 'REFEREE DESK' : workspace.clubName || 'YOUR CLUB'} · {new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase()}</span><h1>{workspaceRole === 'referee' && page === 'matches' ? 'Referee desk' : pageTitles[page]}</h1></div>
            {workspaceRole === 'organiser' && <div className="quick-actions-wrap">
              <button className="button button-primary" onClick={openMatchSetup}><Plus size={17} strokeWidth={2.5} /> New match</button>
              <button className="button button-icon" onClick={() => setShowQuickActions((value) => !value)} aria-label="More create actions"><span>···</span></button>
              {showQuickActions && <div className="quick-actions-menu"><button onClick={() => { openTournamentSetup(); setShowQuickActions(false); }}><Trophy size={16} /> New tournament</button><button onClick={() => { setCreateDialog('player'); setShowQuickActions(false); }}><Users size={16} /> Add player</button></div>}
            </div>}
          </div>

          {page === 'overview' && <Overview workspace={workspace} players={playerById} onOpenMatch={setActiveMatchId} onPage={setPage} onNewMatch={openMatchSetup} onNewTournament={openTournamentSetup} onNewPlayer={() => setCreateDialog('player')} />}
          {page === 'matches' && <MatchCenter workspace={workspace} players={playerById} referees={workspace.referees ?? []} refereeDesk={workspaceRole === 'referee'} query={query} onQuery={setQuery} onOpenMatch={setActiveMatchId} onCreate={openMatchSetup} onSaveMatch={saveScoredMatch} onDeleteMatch={deleteMatch} />}
          {page === 'players' && <PlayersView workspace={workspace} query={query} onQuery={setQuery} selectedId={selectedPlayerId} onSelect={setSelectedPlayerId} onAdd={() => setCreateDialog('player')} onMatch={(id) => { setSelectedPlayerId(null); setCreateDialog('match'); if (id) setToast('Choose this player in the match setup.'); }} onUpdatePlayer={(id, changes) => update((current) => ({ ...current, players: current.players.map((player) => player.id === id ? { ...player, ...changes } : player) }))} />}
          {page === 'referees' && <RefereesView workspace={workspace} onChange={replaceWorkspace} toast={setToast} />}
          {page === 'tournaments' && <TournamentsView workspace={workspace} players={playerById} selectedId={selectedTournamentId} onSelect={setSelectedTournamentId} onCreate={openTournamentSetup} onOpenMatch={setActiveMatchId} onChange={(next) => replaceWorkspace(next)} onSaveMatch={saveScoredMatch} onDeleteMatch={deleteMatch} toast={setToast} />}
          {page === 'statistics' && <StatisticsView workspace={workspace} />}
          {page === 'exports' && <ExportsView workspace={workspace} onToast={setToast} />}
          {page === 'settings' && <SettingsView workspace={workspace} clubName={workspace.clubName ?? ''} onSaveClubName={(name) => { update((current) => ({ ...current, clubName: name })); setToast(name ? `${name} saved` : 'Club name cleared'); }} onImportWorkspace={replaceWorkspace} onReset={reset} />}
          {page === 'about' && <AboutView />}{page === 'guide' && <ClubGuide navigate={setPage} />}
        </main>
        <footer className="app-footer"><span>Rallydesk v3</span><span>© Aryan Arora 2026</span></footer>
      </div>

      {createDialog === 'player' && <PlayerDialog onClose={() => setCreateDialog(null)} onCreate={createNewPlayer} />}
      {createDialog === 'match' && <MatchDialog players={activePlayers} tournaments={workspace.tournaments} onClose={() => setCreateDialog(null)} onCreate={createNewMatch} />}
      {createDialog === 'tournament' && <TournamentDialog players={activePlayers} onClose={() => setCreateDialog(null)} onCreate={createNewTournament} />}
      {toast && <div className="toast" role="status"><span className="toast-dot" />{toast}</div>}
    </div>
  );
}

function NavButton({ item, active, count, onClick }: { item: NavItem; active: boolean; count?: number; onClick: () => void }) {
  const Icon = item.icon;
  return <button className={`nav-item ${active ? 'nav-item--active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}><Icon size={17} strokeWidth={active ? 2.25 : 1.8} /><span>{item.label}</span>{Boolean(count) && <span className="nav-count">{count}</span>}</button>;
}

function PlayerDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, hand: Player['hand'], grip: Player['grip'], style: Player['style']) => void }) {
  const [name, setName] = useState('');
  const [hand, setHand] = useState<Player['hand']>(null);
  const [grip, setGrip] = useState<Player['grip']>(null);
  const [style, setStyle] = useState<Player['style']>(null);
  return <Dialog title="Add a player" eyebrow="PLAYER PROFILE" onClose={onClose}><form className="form-stack" noValidate onSubmit={(event) => { event.preventDefault(); if (name.trim()) onCreate(name, hand, grip, style); }}>
    <label className="field"><span>Player name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter player name" required maxLength={60} /></label>
    <div className="form-row"><label className="field"><span>Playing hand</span><select value={hand ?? ''} onChange={(event) => setHand(event.target.value ? event.target.value as Player['hand'] : null)}><option value="">Not specified</option><option>Right</option><option>Left</option></select></label><label className="field"><span>Grip</span><select value={grip ?? ''} onChange={(event) => setGrip(event.target.value ? event.target.value as Player['grip'] : null)}><option value="">Not specified</option><option>Shakehand</option><option>Penhold</option></select></label></div>
    <label className="field"><span>Playing style</span><select value={style ?? ''} onChange={(event) => setStyle(event.target.value || null)}><option value="">Not specified</option>{['Attacker', 'Defender', 'All-rounder', 'Counter-attacker', 'Chopper'].map((value) => <option key={value}>{value}</option>)}</select></label>
    <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!name.trim()}>Add player <ArrowRight size={15} /></button></div>
  </form></Dialog>;
}

function MatchDialog({ players, tournaments, onClose, onCreate }: { players: Player[]; tournaments: Tournament[]; onClose: () => void; onCreate: (input: Pick<Match, 'playerOneId' | 'playerTwoId' | 'format' | 'pointsPerGame' | 'gamesToWin' | 'tournamentId' | 'table'>) => void }) {
  const [one, setOne] = useState(''); const [two, setTwo] = useState(''); const [format, setFormat] = useState('Best of 5'); const [points, setPoints] = useState<11 | 21>(11); const [tournamentId, setTournamentId] = useState(''); const [table, setTable] = useState('Table 01');
  const tableOptions = Array.from({ length: tournaments.find((item) => item.id === tournamentId)?.tableCount ?? 4 }, (_, index) => `Table ${String(index + 1).padStart(2, '0')}`);
  const gamesToWin = format === 'One game' ? 1 : format === 'Best of 3' ? 2 : format === 'Best of 5' ? 3 : 4;
  return <Dialog title="Set up a match" eyebrow="MATCH SETUP" onClose={onClose}><form className="form-stack" noValidate onSubmit={(event) => { event.preventDefault(); if (one && two && one !== two) onCreate({ playerOneId: one, playerTwoId: two, format, pointsPerGame: points, gamesToWin, tournamentId: tournamentId || undefined, table }); }}>
    <div className="match-pick-row"><label className="field"><span>Player one</span><select value={one} onChange={(event) => setOne(event.target.value)} required><option value="">Choose player</option>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><span className="versus">VS</span><label className="field"><span>Player two</span><select value={two} onChange={(event) => setTwo(event.target.value)} required><option value="">Choose player</option>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label></div>
    <div className="form-row"><label className="field"><span>Match format</span><select value={format} onChange={(event) => setFormat(event.target.value)}>{['One game', 'Best of 3', 'Best of 5', 'Best of 7'].map((value) => <option key={value}>{value}</option>)}</select></label><label className="field"><span>Points per game</span><select value={points} onChange={(event) => setPoints(Number(event.target.value) as 11 | 21)}><option value={11}>11 points · deuce</option><option value={21}>21 points · deuce</option></select></label></div>
    <div className="form-row"><label className="field"><span>Tournament <small>Optional</small></span><select value={tournamentId} onChange={(event) => { setTournamentId(event.target.value); setTable('Table 01'); }}><option value="">Friendly match</option>{tournaments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Table</span><select value={table} onChange={(event) => setTable(event.target.value)}>{tableOptions.map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <p className="form-note"><Activity size={15} /> Match settings: win by 2 at deuce. Toss and first server are confirmed on the scoring screen.</p>
    <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!one || !two || one === two}>Create match <ArrowRight size={15} /></button></div>
  </form></Dialog>;
}

function TournamentDialog({ players, onClose, onCreate }: { players: Player[]; onClose: () => void; onCreate: (input: Pick<Tournament, 'name' | 'format' | 'date' | 'venue' | 'entrantIds'> & { categories: TournamentCategory[]; tableCount: number }) => void }) {
  const newCategory = (name = 'Open singles', drawFormat: Tournament['format'] = 'Knockout'): TournamentCategory => ({ id: crypto.randomUUID(), name, kind: 'Singles', format: drawFormat, entries: [], groupStage: drawFormat === 'Group stage' ? { groupCount: 2, advancePerGroup: 1, advanceToKnockout: true } : undefined });
  const [name, setName] = useState(''); const [format, setFormat] = useState<Tournament['format']>('Knockout'); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [venue, setVenue] = useState(''); const [tableCount, setTableCount] = useState('4'); const [categories, setCategories] = useState<TournamentCategory[]>([newCategory()]);
  const [manualEntrants, setManualEntrants] = useState<Record<string, { name: string; seed: string; sourceSlot?: number; confidence?: number }[]>>({});
  const [groupImports, setGroupImports] = useState<Record<string, { fileName: string; groups: { id: string; name: string; entryIds: string[] }[] }>>({});
  const invalidTables = !/^\d+$/.test(tableCount) || Number(tableCount) < 1 || Number(tableCount) > 100;
  const entrantIds = [...new Set(categories.flatMap((category) => category.entries.flatMap((entry) => entry.playerIds)))];
  const invalidCategories = categories.some((category) => {
    const seeds = category.entries.map((entry) => entry.seed).filter((seed): seed is number => seed !== undefined);
    const invalidSeeds = seeds.some((seed) => !Number.isInteger(seed) || seed < 1 || seed > category.entries.length) || new Set(seeds).size !== seeds.length;
    const manualRows = manualEntrants[category.id];
    const manualNames = (manualRows ?? []).map((row) => row.name.trim().toLocaleLowerCase()).filter(Boolean);
    const invalidManualNames = manualRows !== undefined && (manualRows.length !== category.entries.length || manualRows.some((row) => !row.name.trim()) || new Set(manualNames).size !== manualNames.length);
    const invalidImportedSlots = Boolean(manualRows?.some((row) => row.sourceSlot) && !category.bracketSlots);
    const team = category.kind === 'Team' && category.entries.some((entry) => entry.playerIds.length < teamMinimum(category.teamSystem ?? 'new_swaythling') || entry.playerIds.length > teamLimit(category.teamSystem ?? 'new_swaythling'));
    const groupStage = category.groupStage;
    const imported = groupImports[category.id];
    const importInvalid = Boolean(imported && (imported.groups.some((group) => group.entryIds.length < 2) || new Set(imported.groups.flatMap((group) => group.entryIds)).size !== category.entries.length || imported.groups.flatMap((group) => group.entryIds).some((id) => !category.entries.some((entry) => entry.id === id))));
    const invalidGroups = category.format === 'Group stage' && (!groupStage || category.kind !== 'Singles' || !Number.isInteger(groupStage.groupCount) || groupStage.groupCount < 2 || groupStage.groupCount > Math.floor(category.entries.length / 2) || !Number.isInteger(groupStage.advancePerGroup) || groupStage.advancePerGroup < 1 || groupStage.advancePerGroup > Math.ceil(category.entries.length / groupStage.groupCount) || (imported && (imported.groups.length !== groupStage.groupCount || importInvalid)));
    return !category.name.trim() || category.entries.length < 2 || invalidSeeds || invalidManualNames || invalidImportedSlots || (category.kind === 'Doubles' && category.entries.some((entry) => entry.playerIds.length !== 2)) || team || invalidGroups;
  });
  const updateCategory = (index: number, next: TournamentCategory) => setCategories((items) => items.map((item, itemIndex) => itemIndex === index ? next : item));
  return <Dialog title="Create a tournament" eyebrow="TOURNAMENT SETUP" onClose={onClose} size="wide"><form className="form-stack" noValidate onSubmit={(event) => { event.preventDefault(); if (name.trim() && date && !invalidCategories && !invalidTables) onCreate({ name: name.trim(), format: categories[0]?.format ?? format, date: new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), venue, tableCount: Number(tableCount), categories: categories.map(c => c.groupStage ? { ...c, groupStage: { ...c.groupStage, groups: groupImports[c.id]?.groups } } : c), entrantIds }); }}>
    <div className="form-row"><label className="field"><span>Tournament name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Winter Club Open" required maxLength={80} /></label><label className="field"><span>Default draw format</span><select value={format} onChange={(event) => { const next = event.target.value as Tournament['format']; setFormat(next); setCategories((current) => current.map((category) => ({ ...category, format: next === 'Group stage' && category.kind !== 'Singles' ? 'Knockout' : next, groupStage: next === 'Group stage' && category.kind === 'Singles' ? category.groupStage ?? { groupCount: 2, advancePerGroup: 1, advanceToKnockout: true } : undefined }))); }}><option>Group stage</option><option>Knockout</option></select></label></div>
    <div className="form-row"><label className="field"><span>Start date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label className="field"><span>Venue</span><input value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Add a venue (optional)" maxLength={90} /></label></div>
    <label className="field"><span>Tables at venue</span><input type="number" min="1" max="100" step="1" value={tableCount} onChange={(event) => setTableCount(event.target.value)} required /><small>Opening fixtures are assigned across these tables.</small></label>
    <div className="category-editors">{categories.map((category, index) => <CategoryRegistration key={category.id} category={{ ...category, groupStage: category.groupStage ? { ...category.groupStage, groups: groupImports[category.id]?.groups } : undefined }} players={players} defaultFormat={format} manualEntrants={manualEntrants[category.id]} onManualEntrantsChange={(rows) => setManualEntrants((current) => { const next = { ...current }; if (rows === undefined) delete next[category.id]; else next[category.id] = rows; return next; })} groupImport={groupImports[category.id]} onImportGroups={(value) => setGroupImports((current) => { const next = { ...current }; if (value) next[category.id] = value; else delete next[category.id]; return next; })} onChange={(next) => updateCategory(index, next)} onRemove={() => { setCategories((items) => items.filter((_, itemIndex) => itemIndex !== index)); setManualEntrants((current) => { const next = { ...current }; delete next[category.id]; return next; }); setGroupImports((current) => { const next = { ...current }; delete next[category.id]; return next; }); }} canRemove={categories.length > 1} />)}</div>
    <button type="button" className="button button-outline" onClick={() => setCategories((items) => [...items, newCategory(`Category ${items.length + 1}`, format)])}><Plus size={15} /> Add category</button>
    {invalidCategories && <p className="field-error" role="alert">Each category needs a name and at least two valid entrants. Doubles need registered pairs; team lineups must meet their format’s minimum.</p>}
    <p className="form-note"><ClipboardList size={15} /> Each category has its own entrants, draw format and seed list. Unseeded entrants are shuffled within that category.</p>
    <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!name.trim() || !date || invalidCategories || invalidTables}>Create tournament <ArrowRight size={15} /></button></div>
  </form></Dialog>;
}

function teamMinimum(system: TeamSystem) { return system === 'corbillon' ? 2 : 3; }
function teamLimit(system: TeamSystem) { return system === 'corbillon' ? 4 : system === 'new_swaythling' || system === 'best_of_9' ? 3 : 5; }

function CategoryRegistration({ category, players, defaultFormat, manualEntrants, onManualEntrantsChange, groupImport, onImportGroups, onChange, onRemove, canRemove }: { category: TournamentCategory; players: Player[]; defaultFormat: Tournament['format']; manualEntrants?: { name: string; seed: string; sourceSlot?: number; confidence?: number }[]; onManualEntrantsChange: (rows: { name: string; seed: string; sourceSlot?: number; confidence?: number }[] | undefined) => void; groupImport?: { fileName: string; groups: { id: string; name: string; entryIds: string[] }[] }; onImportGroups: (value: { fileName: string; groups: { id: string; name: string; entryIds: string[] }[] } | undefined) => void; onChange: (category: TournamentCategory) => void; onRemove: () => void; canRemove: boolean }) {
  const [cvBusy, setCvBusy] = useState(false); const [cvError, setCvError] = useState(''); const cvFileRef = useRef<HTMLInputElement>(null);
  const [cvInfoOpen, setCvInfoOpen] = useState(false);
  const [cvByeSlots, setCvByeSlots] = useState<number[]>([]);
  const [pairOne, setPairOne] = useState(''); const [pairTwo, setPairTwo] = useState(''); const [teamName, setTeamName] = useState(''); const [lineup, setLineup] = useState<string[]>(['', '', '', '', '']);
  const set = (changes: Partial<TournamentCategory>) => onChange({ ...category, ...changes });
  const toggleSingles = (playerId: string) => {
    const entries = category.entries.some((entry) => entry.playerIds[0] === playerId) ? category.entries.filter((entry) => entry.playerIds[0] !== playerId) : [...category.entries, { id: playerId, name: '', playerIds: [playerId] }];
    set({ entries });
  };
  const addPair = () => {
    if (!pairOne || !pairTwo || pairOne === pairTwo) return;
    const memberIds = [pairOne, pairTwo];
    if (category.entries.some((entry) => entry.playerIds.some((id) => memberIds.includes(id)))) return;
    set({ entries: [...category.entries, { id: crypto.randomUUID(), name: memberIds.map((id) => players.find((player) => player.id === id)?.name).join(' & '), playerIds: memberIds }] });
    setPairOne(''); setPairTwo('');
  };
  const system = category.teamSystem ?? 'new_swaythling';
  const slots = teamLimit(system);
  const addTeam = () => {
    const playerIds = lineup.slice(0, slots).filter(Boolean);
    if (!teamName.trim() || new Set(playerIds).size !== playerIds.length || playerIds.length < teamMinimum(system) || playerIds.some((id) => category.entries.some((entry) => entry.playerIds.includes(id)))) return;
    set({ entries: [...category.entries, { id: crypto.randomUUID(), name: teamName.trim(), playerIds, doublesPlayerIds: playerIds.slice(0, 2) }] });
    setTeamName(''); setLineup(['', '', '', '', '']);
  };
  const setTeamPlayer = (index: number, playerId: string) => setLineup((current) => { const next = [...current]; next[index] = playerId; return next; });
  const resolveManualEntrants = (rows: { name: string; seed: string }[]) => {
    const used = new Set<string>();
    return rows.flatMap((row) => {
      const matches = players.filter((player) => player.name.trim().toLocaleLowerCase() === row.name.trim().toLocaleLowerCase());
      if (matches.length !== 1 || used.has(matches[0]?.id)) return [];
      used.add(matches[0].id);
      return [{ id: matches[0].id, name: '', playerIds: [matches[0].id], ...(row.seed.trim() ? { seed: Number(row.seed) } : {}) }];
    });
  };
  const updateManualEntrants = (rows: { name: string; seed: string; sourceSlot?: number; confidence?: number }[], byeSlots = cvByeSlots) => {
    onManualEntrantsChange(rows);
    const entries = resolveManualEntrants(rows);
    const slotCount = Math.max(0, ...rows.map((row) => row.sourceSlot ?? 0), ...byeSlots);
    const imported = slotCount > 0 && (slotCount & (slotCount - 1)) === 0 && rows.every((row) => row.sourceSlot) && entries.length === rows.length;
    const bracketSlots = imported ? Array<string | null>(slotCount).fill(null) : undefined;
    if (bracketSlots) rows.forEach((row) => { const player = players.find((item) => item.name.trim().toLocaleLowerCase() === row.name.trim().toLocaleLowerCase()); if (player) bracketSlots[row.sourceSlot! - 1] = player.id; });
    const complete = bracketSlots && new Set(rows.map((row) => row.sourceSlot)).size === rows.length && byeSlots.every((slot) => slot >= 1 && slot <= slotCount && bracketSlots[slot - 1] === null) && bracketSlots.every((id, index) => id !== null || byeSlots.includes(index + 1));
    set({ entries, ...(slotCount ? { format: 'Knockout' as const } : {}), bracketSlots: complete ? bracketSlots : undefined, byeEntryIds: complete ? byeSlots.flatMap((slot) => bracketSlots![((slot - 1) ^ 1)] ? [bracketSlots![((slot - 1) ^ 1)]!] : []) : undefined });
  };
  const importImageDraft = async (file?: File) => {
    if (!file) return;
    setCvBusy(true); setCvError('');
    try {
      const body = new FormData(); body.append('file', file);
      const response = await fetch('/api/draw/recognize', { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? 'Could not read this draw.');
      const structure = result.structureDraft as { entries: { name: string; slot: number; confidence: number | null }[]; byeSlotNumbers: number[]; bracketSlots: (string | null)[]; review: { missingSlots: number[]; duplicateSlots: number[] } };
      if (!structure || structure.review.duplicateSlots.length) throw new Error('Some bracket slots were duplicated. Try a clearer scan or enter the draw manually.');
      const recognized = new Map(structure.entries.map((entry) => [entry.slot, entry]));
      const rows = structure.bracketSlots.flatMap((_, index) => {
        const slot = index + 1;
        if (structure.byeSlotNumbers.includes(slot)) return [];
        const entry = recognized.get(slot);
        return [{ name: entry?.name ?? '', seed: '', sourceSlot: slot, confidence: entry?.confidence ?? undefined }];
      });
      if (!rows.length) throw new Error('No entrant names were recognized. You can enter them manually below.');
      setCvByeSlots(structure.byeSlotNumbers);
      updateManualEntrants(rows, structure.byeSlotNumbers);
      setCvError(`Beta draft: ${structure.entries.length} names in ${structure.bracketSlots.length} slots. BYEs: ${structure.byeSlotNumbers.join(', ') || 'none'}.${structure.review.missingSlots.length ? ` Fill the missing slots: ${structure.review.missingSlots.join(', ')}.` : ''} Review every name and BYE before creating the draw.`);
    } catch (error) {
      setCvError(error instanceof Error ? error.message : 'CV import is unavailable. Start the local CV service and try again.');
    } finally { setCvBusy(false); if (cvFileRef.current) cvFileRef.current.value = ''; }
  };
  const startManualEntry = () => {
    setCvByeSlots([]);
    onManualEntrantsChange(category.entries.map((entry) => ({ name: players.find((player) => player.id === entry.playerIds[0])?.name ?? '', seed: entry.seed?.toString() ?? '' })));
  };
  const manualEntryError = (name: string, index: number) => {
    const normalized = name.trim().toLocaleLowerCase();
    if (!normalized) return 'Enter a player name.';
    const matches = players.filter((player) => player.name.trim().toLocaleLowerCase() === normalized);
    if (matches.length === 0) return 'Choose a name that matches a registered player.';
    if (matches.length > 1) return 'This name matches multiple players. Use roster selection to distinguish them.';
    if (manualEntrants?.slice(0, index).some((row) => row.name.trim().toLocaleLowerCase() === normalized)) return 'This player is already on the list.';
    return '';
  };
  return <section className="category-editor"><div className="category-editor-head"><div><span className="eyebrow">EVENT CATEGORY</span><h3>{category.name || 'Untitled category'}</h3></div>{canRemove && <button className="icon-button" type="button" aria-label={`Remove ${category.name}`} onClick={onRemove}><X size={16} /></button>}</div>
    <div className="form-row"><label className="field"><span>Category name</span><input value={category.name} onChange={(event) => set({ name: event.target.value })} placeholder="e.g. U17 Girls Doubles" /></label><label className="field"><span>Entry type</span><select value={category.kind} onChange={(event) => { onManualEntrantsChange(undefined); set({ kind: event.target.value as CategoryKind, entries: [], format: event.target.value === 'Singles' ? defaultFormat : 'Knockout', groupStage: event.target.value === 'Singles' && defaultFormat === 'Group stage' ? { groupCount: 2, advancePerGroup: 1, advanceToKnockout: true } : undefined, teamSystem: event.target.value === 'Team' ? 'new_swaythling' : undefined }); }}><option>Singles</option><option>Doubles</option><option>Team</option></select></label><label className="field"><span>Draw format</span><select value={category.format} onChange={(event) => { const next = event.target.value as Tournament['format']; set({ format: next, groupStage: next === 'Group stage' ? category.groupStage ?? { groupCount: 2, advancePerGroup: 1, advanceToKnockout: true } : undefined }); }}>{category.kind === 'Singles' && <option>Group stage</option>}<option>Knockout</option></select></label></div>
    {category.kind === 'Singles' && category.format === 'Group stage' && <div className="group-stage-setup"><p className="form-note">Players compete round robin within seeded groups.</p>{category.groupStage && <label className="entrant-entry-mode"><input type="checkbox" checked={category.groupStage.advanceToKnockout !== false} onChange={(event) => set({ groupStage: { ...category.groupStage!, advanceToKnockout: event.target.checked } })} /><span>Advance qualifiers to knockout after the groups</span></label>}{category.groupStage && <div className="form-row"><label className="field"><span>Group distribution</span><select value={category.groupStage.distribution ?? 'snake'} onChange={(event) => set({ groupStage: { ...category.groupStage!, distribution: event.target.value as 'snake' | 'bands' | 'random', groups: undefined } })}><option value="snake">Snake seeding</option><option value="bands">Shuffle within seeding bands</option><option value="random">Fully random</option></select></label><label className="field"><span>Draw seed (optional)</span><input value={category.groupStage.drawSeed ?? ''} onChange={(event) => set({ groupStage: { ...category.groupStage!, drawSeed: event.target.value, groups: undefined } })} /></label><label className="field"><span>Number of groups</span><input type="number" min="2" max={Math.min(26, Math.floor(category.entries.length / 2))} value={category.groupStage.groupCount} onChange={(event) => set({ groupStage: { ...category.groupStage!, groupCount: Number(event.target.value), groups: undefined } })} /></label><label className="field"><span>Advance from each group</span><input type="number" min="1" max={Math.ceil(category.entries.length / category.groupStage.groupCount)} value={category.groupStage.advancePerGroup} onChange={(event) => set({ groupStage: { ...category.groupStage!, advancePerGroup: Number(event.target.value) } })} /></label></div>}{category.groupStage && <div className="group-import-tools"><label className="button button-outline">Import group allocation<input className="sr-only" type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; void file.text().then((source) => { try { const raw = file.name.toLowerCase().endsWith('.json') ? JSON.parse(source) : parseGroupAllocationCsv(source); const rows = Array.isArray(raw) ? raw : raw.groups; if (!Array.isArray(rows)) throw new Error('Use rows with group, player, and optional seed fields.'); const groups = new Map<string, { id: string; name: string; entryIds: string[] }>(); for (const [index, item] of rows.entries()) { if (!item || typeof item !== 'object') throw new Error(`Row ${index + 1} is invalid.`); const row = Object.fromEntries(Object.entries(item as Record<string, unknown>).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ''), String(value ?? '').trim()])); const groupName = row.group || row.groupname || ''; const playerName = row.player || row.playername || row.entrant || row.entrantname || row.playerid || ''; if (!groupName || !playerName) throw new Error(`Row ${index + 1} needs a group and player.`); const entry = category.entries.find((candidate) => candidate.id === playerName || (candidate.name || candidate.playerIds.map((id) => players.find((player) => player.id === id)?.name ?? '').join(' & ')).trim().toLocaleLowerCase() === playerName.toLocaleLowerCase()); if (!entry) throw new Error(`Could not match “${playerName}” to an entrant in ${category.name}.`); if ([...groups.values()].some((group) => group.entryIds.includes(entry.id))) throw new Error(`${playerName} is assigned more than once.`); const group = groups.get(groupName) ?? { id: crypto.randomUUID(), name: groupName, entryIds: [] }; group.entryIds.push(entry.id); groups.set(groupName, group); } const imported = [...groups.values()]; if (imported.length !== category.groupStage!.groupCount) throw new Error(`Expected ${category.groupStage!.groupCount} groups; found ${imported.length}.`); if (imported.some((group) => group.entryIds.length < 2) || imported.reduce((sum, group) => sum + group.entryIds.length, 0) !== category.entries.length) throw new Error('Every entrant must appear exactly once, and each group must have at least two entrants.'); onImportGroups({ fileName: file.name, groups: imported }); } catch (error) { window.alert(error instanceof Error ? error.message : 'Could not import group allocation.'); } }); }} /></label>{groupImport && <small>{groupImport.fileName} · {groupImport.groups.length} groups reviewed; allocation will replace the random draw.</small>}<button type="button" className="button button-quiet" onClick={() => onImportGroups(undefined)}>Use random seeded allocation</button></div>}</div>}
    {category.kind === 'Singles' && <><div className="entrant-entry-mode" role="group" aria-label="Choose how to add singles entrants"><button type="button" className={`button ${manualEntrants === undefined ? 'button-primary' : 'button-outline'}`} aria-pressed={manualEntrants === undefined} onClick={() => onManualEntrantsChange(undefined)}>Choose from player list</button><button type="button" className={`button ${manualEntrants !== undefined ? 'button-primary' : 'button-outline'}`} aria-pressed={manualEntrants !== undefined} onClick={startManualEntry}>Enter names</button></div>{manualEntrants === undefined ? <div className="entrant-list">{players.map((player) => <label className={`entrant-option ${category.entries.some((entry) => entry.playerIds[0] === player.id) ? 'entrant-option--selected' : ''}`} key={player.id}><input type="checkbox" checked={category.entries.some((entry) => entry.playerIds[0] === player.id)} onChange={() => toggleSingles(player.id)} /><span className="avatar avatar--tiny">{player.initials}</span><span>{player.name}</span><span className="entrant-rating">{player.rating}</span></label>)}</div> : <div className="manual-entrant-list"><p className="manual-entrant-help">Enter each registered player’s name. Suggestions come from your player list; names must match a profile to appear in the draw.</p>{category.format === 'Knockout' && <div className="cv-beta-tools"><button type="button" className="button ai-import-button" onClick={() => cvFileRef.current?.click()} disabled={cvBusy}><Image size={14} /> {cvBusy ? 'Reading bracket…' : 'Import bracket'} <span className="beta-tag">AI (BETA)</span></button><button type="button" className="cv-info-button" aria-label="About AI bracket import" aria-expanded={cvInfoOpen} onClick={() => setCvInfoOpen((open) => !open)}><Info size={15} /></button><input ref={cvFileRef} className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/tiff" onChange={(event) => { void importImageDraft(event.target.files?.[0]); }} /></div>}{category.format === 'Knockout' && cvInfoOpen && <p className="cv-beta-note" role="note">AI bracket import is in beta. It may misread names, slots, BYEs, or match order. Check the full draw before creating the tournament. Later-round connector lines are not interpreted.</p>}{cvError && <p className={cvError.startsWith('Beta draft:') ? 'cv-beta-note' : 'field-error'} role="status">{cvError}</p>}<datalist id={`player-suggestions-${category.id}`}>{players.map((player) => <option key={player.id} value={player.name} />)}</datalist>{manualEntrants.map((row, index) => <div className="manual-entrant-row" key={`${category.id}-${index}`}><label className="field"><span>Entrant {index + 1}{row.sourceSlot && <small className="bye-tag">Slot {row.sourceSlot}</small>}</span><input list={`player-suggestions-${category.id}`} value={row.name} autoComplete="off" placeholder="Start typing a player name" aria-invalid={Boolean(manualEntryError(row.name, index))} aria-describedby={`manual-entry-error-${category.id}-${index}`} onChange={(event) => updateManualEntrants(manualEntrants.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label><label className="field manual-seed-field"><span>{row.sourceSlot ? "Slot" : "Seed"} <small>{row.sourceSlot ? "from scan" : "optional"}</small></span><input className="seed-input" type="number" min="1" max={row.sourceSlot ? category.bracketSlots?.length ?? 64 : manualEntrants.length} step="1" placeholder="—" aria-label={`${row.sourceSlot ? "Slot" : "Seed"} for entrant ${index + 1}`} value={row.sourceSlot ?? row.seed} disabled={Boolean(row.sourceSlot)} onChange={(event) => updateManualEntrants(manualEntrants.map((item, itemIndex) => itemIndex === index ? { ...item, seed: event.target.value } : item))} /></label><button type="button" className="icon-button manual-remove-entry" aria-label={`Remove entrant ${index + 1}`} onClick={() => updateManualEntrants(manualEntrants.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button>{manualEntryError(row.name, index) && <small className="field-error manual-entry-error" id={`manual-entry-error-${category.id}-${index}`} role="status">{manualEntryError(row.name, index)}</small>}</div>)}<button type="button" className="button button-outline" onClick={() => updateManualEntrants([...manualEntrants, { name: '', seed: '' }])}><Plus size={15} /> Add another entrant</button></div>}</>}
    {category.kind === 'Doubles' && <><div className="form-row"><label className="field"><span>Player one</span><select value={pairOne} onChange={(event) => setPairOne(event.target.value)}><option value="">Select a player</option>{players.filter((player) => !category.entries.some((entry) => entry.playerIds.includes(player.id)) || player.id === pairOne).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><label className="field"><span>Player two</span><select value={pairTwo} onChange={(event) => setPairTwo(event.target.value)}><option value="">Select a partner</option>{players.filter((player) => player.id !== pairOne && (!category.entries.some((entry) => entry.playerIds.includes(player.id)) || player.id === pairTwo)).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><button type="button" className="button button-outline category-add-entry" onClick={addPair} disabled={!pairOne || !pairTwo || pairOne === pairTwo}><Plus size={15} /> Register pair</button></div><EntryList entries={category.entries} players={players} onRemove={(id) => set({ entries: category.entries.filter((entry) => entry.id !== id) })} /></>}
    {category.groupStage && category.format === 'Group stage' && <details className="group-workbench"><summary>Edit group tables</summary>
      <button type="button" className="button button-outline" disabled={category.groupStage.groupCount < 2 || category.groupStage.groupCount > Math.min(26, Math.floor(category.entries.length / 2))} onClick={() => onImportGroups({fileName: 'Organiser allocation', groups: assignSeededGroups(category.entries, category.groupStage!.groupCount, category.groupStage)})}>{groupImport ? 'Regenerate tables' : 'Prepare group tables'}</button>
      <div className="group-board">{groupImport?.groups.map(group => {
        const available = category.entries.filter(entry => !groupImport.groups.some(g => g.entryIds.includes(entry.id)));
        const name = (id: string) => category.entries.find(e => e.id === id)?.name || players.find(p => p.id === id)?.name || id;
        const change = (ids: string[]) => onImportGroups({...groupImport, groups: groupImport.groups.map(g => g.id === group.id ? {...g, entryIds: ids} : g)});
        return <section className="utility-card" key={group.id}><table className="data-table"><caption>{group.name}</caption><tbody>{group.entryIds.map(id => <tr key={id}><td>{name(id)}</td><td><button type="button" aria-label={'Remove ' + name(id) + ' from ' + group.name} onClick={() => change(group.entryIds.filter(i => i !== id))}>×</button></td></tr>)}</tbody></table><label>＋ Add player <select aria-label={'Add player to ' + group.name} value="" onChange={e => change([...group.entryIds, e.target.value])}><option value="">Choose unassigned player</option>{available.map(e => <option key={e.id} value={e.id}>{name(e.id)}</option>)}</select></label></section>;
      })}</div></details>}
    {category.kind === 'Team' && <><div className="form-row"><label className="field"><span>Team championship format</span><select value={system} onChange={(event) => set({ teamSystem: event.target.value as TeamSystem, entries: [] })}><option value="new_swaythling">New Swaythling · 5 singles</option><option value="corbillon">Corbillon · 4 singles and doubles</option><option value="olympic">Olympic · doubles first, best of 5</option><option value="best_of_7">Best of 7 · 6 singles and doubles</option><option value="best_of_9">Best of 9 · singles</option></select></label><label className="field"><span>Team name</span><input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="e.g. Indus A" /></label></div><p className="team-lineup-note">Lineup order becomes A/B/C and X/Y/Z after the referee’s lot. {system === 'corbillon' ? 'Enter 2–4 players.' : system === 'new_swaythling' || system === 'best_of_9' ? 'Enter exactly three players.' : 'Enter 3–5 players.'}</p><div className="form-row team-lineup-slots">{Array.from({ length: slots }, (_, index) => <label className="field" key={index}><span>Player {String.fromCharCode(65 + index)}</span><select value={lineup[index]} onChange={(event) => setTeamPlayer(index, event.target.value)}><option value="">{index < teamMinimum(system) ? 'Choose player' : 'Optional reserve'}</option>{players.filter((player) => (!lineup.includes(player.id) || lineup[index] === player.id) && !category.entries.some((entry) => entry.playerIds.includes(player.id))).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>)}</div><button type="button" className="button button-outline" onClick={addTeam} disabled={!teamName.trim() || new Set(lineup.filter(Boolean)).size !== lineup.filter(Boolean).length || lineup.filter(Boolean).length < teamMinimum(system) || lineup.filter(Boolean).some((id) => category.entries.some((entry) => entry.playerIds.includes(id)))}><Plus size={15} /> Register team</button><EntryList entries={category.entries} players={players} onRemove={(id) => set({ entries: category.entries.filter((entry) => entry.id !== id) })} /></>}
    {category.entries.length > 0 && manualEntrants === undefined && <div className="category-seeds"><span className="entrant-picker-head">Entrants & seeds <small>{category.entries.length} registered · seeds are unique in this category</small></span>{category.entries.map((entry) => <label className="seed-row" key={entry.id}><span>{entry.name || players.find((player) => player.id === entry.playerIds[0])?.name}</span><input aria-label={`Seed for ${entry.name || 'entrant'}`} className="seed-input" type="number" min="1" max={category.entries.length} placeholder="Seed" value={entry.seed ?? ''} onChange={(event) => set({ entries: category.entries.map((item) => item.id === entry.id ? { ...item, seed: event.target.value ? Number(event.target.value) : undefined } : item) })} /></label>)}</div>}
  </section>;
}

function EntryList({ entries, players, onRemove }: { entries: CategoryEntry[]; players: Player[]; onRemove: (id: string) => void }) {
  return <div className="registered-entries">{entries.map((entry) => <div className="registered-entry" key={entry.id}><span>{entry.name || entry.playerIds.map((id) => players.find((player) => player.id === id)?.name).filter(Boolean).join(' & ')}</span><small>{entry.playerIds.length} player{entry.playerIds.length === 1 ? '' : 's'}</small><button type="button" className="icon-button" onClick={() => onRemove(entry.id)} aria-label={`Remove ${entry.name || 'entry'}`}><X size={14} /></button></div>)}</div>;
}

function calculateCategoryStandings(category: TournamentCategory, matches: Match[]): Standing[] {
  const rows = new Map(category.entries.map((entry) => [entry.id, { playerId: entry.id, played: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0 } satisfies Standing]));
  const apply = (oneId: string, twoId: string, winnerId: string, oneGames: number, twoGames: number, games: { one: number; two: number }[]) => {
    const one = rows.get(oneId), two = rows.get(twoId); if (!one || !two) return;
    one.played += 1; two.played += 1;
    if (winnerId === oneId) { one.wins += 1; two.losses += 1; } else { two.wins += 1; one.losses += 1; }
    one.gamesWon += oneGames; one.gamesLost += twoGames; two.gamesWon += twoGames; two.gamesLost += oneGames;
    for (const game of games) { one.pointsFor += game.one; one.pointsAgainst += game.two; two.pointsFor += game.two; two.pointsAgainst += game.one; }
  };
  if (category.kind === 'Team') {
    const ties = new Map<string, Match[]>();
    matches.forEach((match) => { if (match.teamTieId) ties.set(match.teamTieId, [...(ties.get(match.teamTieId) ?? []), match]); });
    for (const tie of ties.values()) {
      const oneId = tie[0].teamOneId, twoId = tie[0].teamTwoId;
      if (!oneId || !twoId) continue;
      const oneWins = tie.filter((match) => match.status === 'Completed' && match.winnerId && match.winnerId === match.sideOneId).length;
      const twoWins = tie.filter((match) => match.status === 'Completed' && match.winnerId && match.winnerId === match.sideTwoId).length;
      const winnerId = tie.find((match) => match.status === 'Completed' && match.winnerId)?.teamOneId; // overwritten below when majority is reached
      const majority = Math.ceil((tie.length) / 2);
      const winningTeam = oneWins >= majority ? oneId : twoWins >= majority ? twoId : undefined;
      if (winningTeam) apply(oneId, twoId, winningTeam, oneWins, twoWins, tie.flatMap((match) => match.gameResults ?? []));
      void winnerId;
    }
  } else for (const match of matches) if (match.status === 'Completed' && match.winnerId) {
    const oneId = match.sideOneId ?? match.playerOneId, twoId = match.sideTwoId ?? match.playerTwoId;
    apply(oneId, twoId, match.winnerId, match.gamesWon[oneId] ?? 0, match.gamesWon[twoId] ?? 0, match.gameResults ?? []);
  }
  return [...rows.values()];
}

function parseGroupAllocationCsv(source: string): Record<string, string>[] {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const parseLine = (line: string) => { const cells: string[] = []; let cell = '', quoted = false; for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"' && quoted && line[index + 1] === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { cells.push(cell.trim()); cell = ''; } else cell += char; } cells.push(cell.trim()); return cells; };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(parseLine(line).map((value, index) => [headers[index] ?? `column_${index}`, value])));
}

function hasCompleteGroupRoundRobin(groups: TournamentGroup[], fixtures: Match[], categoryId: string): boolean {
  if (!groups.length) return false;
  let expectedFixtureCount = 0;
  for (const group of groups) {
    const expectedPairs = new Set<string>();
    for (let first = 0; first < group.entryIds.length; first += 1) {
      for (let second = first + 1; second < group.entryIds.length; second += 1) {
        expectedPairs.add([group.entryIds[first], group.entryIds[second]].sort().join('|'));
      }
    }
    const roundPrefix = `${group.name} ·`;
    const groupFixtures = fixtures.filter((match) => match.categoryId === categoryId && match.round?.startsWith(roundPrefix));
    const actualPairs = groupFixtures.map((match) => [match.sideOneId ?? match.playerOneId, match.sideTwoId ?? match.playerTwoId].sort().join('|'));
    expectedFixtureCount += expectedPairs.size;
    if (actualPairs.length !== expectedPairs.size || new Set(actualPairs).size !== expectedPairs.size || actualPairs.some((pair) => !expectedPairs.has(pair))) return false;
  }
  return fixtures.filter((match) => match.categoryId === categoryId).length === expectedFixtureCount;
}

function compareGroupStandings(a: Standing, b: Standing): number {
  return b.wins - a.wins || (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost) || b.gamesWon - a.gamesWon || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
}

function sameGroupStanding(a: Standing, b: Standing): boolean {
  return a.wins === b.wins && a.gamesWon - a.gamesLost === b.gamesWon - b.gamesLost && a.gamesWon === b.gamesWon && a.pointsFor - a.pointsAgainst === b.pointsFor - b.pointsAgainst;
}
