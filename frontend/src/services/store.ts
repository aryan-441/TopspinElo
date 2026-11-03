import { initialWorkspace } from '../data/seed';
import type { CategoryEntry, GroupStageConfig, Match, Player, TeamSystem, Tournament, TournamentCategory, Workspace } from '../types';
import { teamMatchSequence } from './tableTennisRules';

const STORAGE_KEY = 'rallydesk-workspace-v2';

export function loadWorkspace(): Workspace {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(initialWorkspace);
    const parsed = JSON.parse(saved) as Workspace;
    if (!parsed.players || !parsed.matches || !parsed.tournaments) return structuredClone(initialWorkspace);
    return normalizeWorkspace(parsed);
  } catch {
    return structuredClone(initialWorkspace);
  }
}

export function normalizeWorkspace(parsed: Workspace): Workspace {
    const tournaments = parsed.tournaments.map((raw) => {
      const tournament = raw as Tournament & { categories: (TournamentCategory | string)[] };
      const categories = tournament.categories?.length ? tournament.categories.map((item, index) => typeof item === 'string' ? ({ id: `legacy-${index}`, name: item, kind: 'Singles' as const, format: tournament.format, entries: (tournament.entrantIds ?? []).map((playerId) => ({ id: playerId, name: '', playerIds: [playerId] })) }) : item) : [{ id: 'default-singles', name: 'Open singles', kind: 'Singles' as const, format: tournament.format, entries: (tournament.entrantIds ?? []).map((playerId) => ({ id: playerId, name: '', playerIds: [playerId] })) }];
      return { ...tournament, categories, tableCount: tournament.tableCount ?? 1 };
    });
    const matches = parsed.matches.map((match) => {
      const tournament = tournaments.find((item) => item.id === match.tournamentId);
      const category = tournament?.categories.find((item) => item.id === match.categoryId || item.name === match.category) ?? (tournament?.categories.length === 1 ? tournament.categories[0] : undefined);
      return { ...match, categoryId: match.categoryId ?? category?.id, sideOneId: match.sideOneId ?? match.playerOneId, sideTwoId: match.sideTwoId ?? match.playerTwoId, sideOnePlayerIds: match.sideOnePlayerIds ?? [match.playerOneId], sideTwoPlayerIds: match.sideTwoPlayerIds ?? [match.playerTwoId] };
    });
    return { ...parsed, matches, referees: parsed.referees ?? [], tournaments, activityLog: Array.isArray(parsed.activityLog) ? parsed.activityLog : [] };
}

export function recordWorkspaceChanges(before: Workspace, after: Workspace): Workspace {
  const knownActivity = new Map([...(before.activityLog ?? []), ...(after.activityLog ?? [])].map((entry) => [entry.id, entry]));
  const activityLog = [...knownActivity.values()];
  const collections = [
    ['player', before.players, after.players], ['match', before.matches, after.matches],
    ['tournament', before.tournaments, after.tournaments], ['referee', before.referees ?? [], after.referees ?? []],
  ] as const;
  const now = new Date().toISOString();
  for (const [entity, oldRows, newRows] of collections) {
    const oldMap = new Map(oldRows.map((row) => [row.id, row]));
    const newMap = new Map(newRows.map((row) => [row.id, row]));
    for (const id of new Set([...oldMap.keys(), ...newMap.keys()])) {
      const oldRow = oldMap.get(id); const newRow = newMap.get(id);
      if (JSON.stringify(oldRow) === JSON.stringify(newRow)) continue;
      const action = !oldRow ? 'created' : !newRow ? 'deleted' : 'updated';
      let beforeSnapshot: unknown = oldRow; let afterSnapshot: unknown = newRow;
      let summary = `${entity[0].toUpperCase()}${entity.slice(1)} ${action}`;
      if (entity === 'match' && oldRow && newRow) {
        const matchBefore = oldRow as Match; const matchAfter = newRow as Match;
        const omitScoring = ({ events: _events, score: _score, gamesWon: _gamesWon, winnerId: _winnerId, gameResults: _gameResults, serverId: _serverId, status: _status, doublesOrder: _doublesOrder, ...rest }: Match) => rest;
        const eventsById = new Set(matchBefore.events.map((event) => event.id));
        const newEvents = matchAfter.events.filter((event) => !eventsById.has(event.id));
        if (JSON.stringify(omitScoring(matchBefore)) === JSON.stringify(omitScoring(matchAfter))) {
          beforeSnapshot = { status: matchBefore.status, score: matchBefore.score, gamesWon: matchBefore.gamesWon, winnerId: matchBefore.winnerId, gameResults: matchBefore.gameResults, serverId: matchBefore.serverId };
          afterSnapshot = { status: matchAfter.status, score: matchAfter.score, gamesWon: matchAfter.gamesWon, winnerId: matchAfter.winnerId, gameResults: matchAfter.gameResults, serverId: matchAfter.serverId, eventsAdded: newEvents, removedEventIds: matchBefore.events.filter((event) => !matchAfter.events.some((next) => next.id === event.id)).map((event) => event.id) };
        }
        summary = newEvents.length ? `Match scoring updated · ${newEvents.length} event(s) recorded` : 'Match setup or schedule updated';
      }
      activityLog.unshift({ id: crypto.randomUUID(), at: now, entity, entityId: id, action, summary, before: beforeSnapshot, after: afterSnapshot });
    }
  }
  if (before.clubName !== after.clubName) activityLog.unshift({ id: crypto.randomUUID(), at: now, entity: 'workspace', entityId: 'clubName', action: 'updated', summary: 'Workspace name changed', before: before.clubName, after: after.clubName });
  return { ...after, activityLog };
}

export function saveWorkspace(workspace: Workspace): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}

export function resetWorkspace() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* Save effect reports storage failures to the organiser. */ }
  return structuredClone(initialWorkspace);
}

export function createPlayer(name: string, hand: Player['hand'] = null, grip: Player['grip'] = null, style: Player['style'] = null): Player {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
  return { id: crypto.randomUUID(), name: name.trim(), initials, hand, grip, style, rating: 1000, wins: 0, losses: 0, pointsWon: 0, recent: [] };
}

export function createMatch(input: Pick<Match, 'playerOneId' | 'playerTwoId' | 'format' | 'pointsPerGame' | 'gamesToWin' | 'tournamentId' | 'table'>, players: Player[]): Match {
  const server = players.find((player) => player.id === input.playerOneId);
  if (!server) throw new Error('Choose two saved players before creating a match.');
  return { ...input, id: crypto.randomUUID(), status: 'Scheduled', startsAt: 'Now', gamesWon: { [input.playerOneId]: 0, [input.playerTwoId]: 0 }, score: { [input.playerOneId]: 0, [input.playerTwoId]: 0 }, serverId: server.id, tossWinnerId: server.id, events: [], tournamentName: undefined };
}

function seedRankOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) { const nextSize = order.length * 2 + 1; order = order.flatMap((seed) => [seed, nextSize - seed]); }
  return order;
}

function shuffle<T>(values: T[], random = Math.random): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [result[index], result[swap]] = [result[swap], result[index]]; }
  return result;
}

export function assignSeededGroups(entries: CategoryEntry[], groupCount: number, options: Pick<GroupStageConfig, 'distribution' | 'drawSeed'> = {}) {
  if (!Number.isInteger(groupCount) || groupCount < 2 || groupCount > Math.floor(entries.length / 2)) throw new Error('Choose at least two groups, with at least two entrants per group.');
  if (groupCount > 26) throw new Error('Choose no more than 26 groups.');
  const groups = Array.from({ length: groupCount }, (_, index) => ({ id: crypto.randomUUID(), name: `Group ${String.fromCharCode(65 + index)}`, entryIds: [] as string[] }));
  const seeded = entries.filter((entry) => Number.isInteger(entry.seed)).sort((a, b) => a.seed! - b.seed!);
  let state = 2166136261;
  for (const char of options.drawSeed ?? '') {
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  }
  const random = options.drawSeed ? () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  } : Math.random;
  const unseeded = entries.filter((entry) => !Number.isInteger(entry.seed));
  const order = options.distribution === 'random'
    ? shuffle(entries, random)
    : [...seeded, ...shuffle(unseeded, random)];
  for (let start = 0; start < order.length; start += groupCount) {
    const band = order.slice(start, start + groupCount);
    const placements = options.distribution === 'bands' ? shuffle(band, random) : band;
    const reverse = (start / groupCount) % 2 === 1;
    placements.forEach((entry, i) => groups[reverse ? groupCount - 1 - i : i].entryIds.push(entry.id));
  }
  return groups;
}

export function createTournament(input: Pick<Tournament, 'name' | 'format' | 'date' | 'venue' | 'entrantIds'> & { seeds?: Record<string, number>; categories?: TournamentCategory[]; tableCount?: number }): Tournament {
  const entrantCount = input.entrantIds.length;
  const rounds = input.format === 'Knockout' ? Math.ceil(Math.log2(Math.max(2, entrantCount))) : Math.max(1, entrantCount % 2 ? entrantCount : entrantCount - 1);
  const bracketSize = 2 ** Math.ceil(Math.log2(Math.max(2, entrantCount)));
  const seededIds = Object.entries(input.seeds ?? {}).sort((a, b) => a[1] - b[1]).map(([id]) => id);
  const unseededIds = input.entrantIds.filter((id) => !seededIds.includes(id));
  const orderedEntrants = [...seededIds, ...unseededIds];
  const byePlayerIds = input.format === 'Knockout' ? orderedEntrants.slice(0, bracketSize - entrantCount) : [];
  const bracketSeedMap = new Map<number, string>();
  seededIds.forEach((id) => bracketSeedMap.set(input.seeds![id], id));
  const remaining = orderedEntrants.filter((id) => !seededIds.includes(id));
  for (let rank = 1; rank <= bracketSize; rank += 1) if (!bracketSeedMap.has(rank) && remaining.length) bracketSeedMap.set(rank, remaining.shift()!);
  const bracketSlots = input.format === 'Knockout' ? seedRankOrder(bracketSize).map((rank) => bracketSeedMap.get(rank) ?? null) : undefined;
  const categoryInput: TournamentCategory[] = input.categories?.length ? input.categories : [{ id: crypto.randomUUID(), name: 'Open singles', kind: 'Singles', format: input.format, entries: orderedEntrants.map((id) => ({ id, name: '', playerIds: [id] })) }];
  const categories = categoryInput.map((category) => {
    const entryCount = category.entries.length;
    const groupStage = category.groupStage ? { ...category.groupStage, groups: category.groupStage.groups?.length ? category.groupStage.groups : assignSeededGroups(category.entries, category.groupStage.groupCount, category.groupStage), advanced: false } : undefined;
    const size = 2 ** Math.ceil(Math.log2(Math.max(2, entryCount)));
      const seeded = category.entries.filter((entry) => entry.seed).sort((a, b) => a.seed! - b.seed!);
    const unseeded = shuffle(category.entries.filter((entry) => !entry.seed));
    const sorted = [...seeded, ...unseeded];
    const slotByRank = new Map<number, string>();
    seeded.forEach((entry) => slotByRank.set(entry.seed!, entry.id));
    const available = sorted.filter((entry) => !entry.seed);
    for (let rank = 1; rank <= entryCount; rank += 1) if (!slotByRank.has(rank) && available.length) slotByRank.set(rank, available.shift()!.id);
    const importedSlots = category.bracketSlots?.length === size && category.bracketSlots.filter(Boolean).length === entryCount && category.bracketSlots.every((id) => !id || category.entries.some((entry) => entry.id === id)) ? category.bracketSlots : undefined;
    const slots = category.format === 'Knockout' ? importedSlots ?? seedRankOrder(size).map((rank) => slotByRank.get(rank) ?? null) : undefined;
    const byeEntryIds = category.format === 'Knockout' ? importedSlots ? importedSlots.flatMap((id, index) => id || importedSlots[index ^ 1] === null ? [] : [importedSlots[index ^ 1]!]) : sorted.slice(0, size - entryCount).map((entry) => entry.id) : [];
    return { ...category, entries: sorted, format: category.format ?? input.format, bracketSlots: slots, byeEntryIds, groupStage, standings: sorted.map((entry) => ({ playerId: entry.id, played: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0 })), tieBreaks: groupStage ? ['Match wins', 'Game difference', 'Games won', 'Point difference'] : ['Match wins', 'Game difference', 'Games won'] };
  });
  return { ...input, entrantIds: orderedEntrants, seeds: input.seeds ?? {}, bracketSlots, tableCount: input.tableCount ?? 1, categories, id: crypto.randomUUID(), status: 'Upcoming', byePlayerIds, matchIds: [], rounds, completed: 0, progressPaused: false, tieBreaks: input.format !== 'Knockout' ? (categoryInput.some((category) => category.groupStage) ? ['Match wins', 'Game difference', 'Games won', 'Point difference'] : ['Match wins', 'Game difference', 'Games won']) : [], standings: orderedEntrants.map((playerId) => ({ playerId, played: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0 })), audit: [] };
}



function makeFixture(tournament: Tournament, category: TournamentCategory, one: CategoryEntry, two: CategoryEntry, roundNumber: number, players: Player[], bracketOrder?: number, tie?: { id: string; order: number; teamOneId: string; teamTwoId: string; teamOneName: string; teamTwoName: string; teamOneRosterIds?: string[]; teamTwoRosterIds?: string[]; doublesPending?: boolean }): Match {
  const sideOneId = tie ? `${tie.id}:one:${tie.order}` : one.id;
  const sideTwoId = tie ? `${tie.id}:two:${tie.order}` : two.id;
  const label = (entry: CategoryEntry) => entry.name || entry.playerIds.map((id) => players.find((player) => player.id === id)?.name ?? 'Unknown').join(' & ');
  return { id: crypto.randomUUID(), playerOneId: one.playerIds[0], playerTwoId: two.playerIds[0], sideOneId, sideTwoId, sideOneLabel: label(one), sideTwoLabel: label(two), sideOneTeamName: tie?.teamOneName, sideTwoTeamName: tie?.teamTwoName, sideOnePlayerIds: one.playerIds, sideTwoPlayerIds: two.playerIds, sideOneTeamRosterIds: tie?.teamOneRosterIds, sideTwoTeamRosterIds: tie?.teamTwoRosterIds, teamOneId: tie?.teamOneId, teamTwoId: tie?.teamTwoId, teamTieId: tie?.id, teamTieOrder: tie?.order, doublesNominationPending: tie?.doublesPending, status: 'Scheduled', tournamentId: tournament.id, tournamentName: tournament.name, category: category.name, categoryId: category.id, round: category.kind === 'Team' ? `Round ${roundNumber} · Tie ${bracketOrder! + 1}` : `Round ${roundNumber}`, startsAt: 'TBD', format: 'Best of 5', pointsPerGame: 11, gamesToWin: 3, gamesWon: { [sideOneId]: 0, [sideTwoId]: 0 }, score: { [sideOneId]: 0, [sideTwoId]: 0 }, serverId: one.playerIds[0], tossWinnerId: sideOneId, events: [], bracketOrder };
}

function orderEntries(category: TournamentCategory, entries: CategoryEntry[]) {
  if (category.format !== 'Knockout') return entries;
  if (category.bracketSlots?.length) {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    return category.bracketSlots.map((id) => id ? byId.get(id) ?? null : null);
  }
  return entries;
}

function teamTieFixtures(tournament: Tournament, category: TournamentCategory, oneTeam: CategoryEntry, twoTeam: CategoryEntry, roundNumber: number, tieNumber: number, players: Player[]): Match[] {
  const spec = teamMatchSequence(category.teamSystem ?? 'new_swaythling');
  const tieId = crypto.randomUUID();
  const oneIsABC = Math.random() < 0.5; // Team letters are assigned by lot for each tie.
  const teamOne = oneIsABC ? oneTeam : twoTeam, teamTwo = oneIsABC ? twoTeam : oneTeam;
  const label = (team: CategoryEntry, indexes: number[]) => ({ id: `${team.id}:${tieId}:${indexes.join('-')}`, name: indexes.map((index) => team.playerIds[index]).filter(Boolean).map((id) => id).join(' & '), playerIds: indexes.map((index) => team.playerIds[index]).filter((id): id is string => Boolean(id)) });
  return spec.sides.map(([aIndexes, xIndexes], order) => {
    const nominated = spec.doublesAt === order && ['corbillon', 'best_of_7'].includes(category.teamSystem ?? '');
    const left = label(teamOne, nominated && teamOne.doublesPlayerIds?.length === 2 ? teamOne.doublesPlayerIds.map((id) => teamOne.playerIds.indexOf(id)) : aIndexes);
    const right = label(teamTwo, nominated && teamTwo.doublesPlayerIds?.length === 2 ? teamTwo.doublesPlayerIds.map((id) => teamTwo.playerIds.indexOf(id)) : xIndexes);
    return makeFixture(tournament, category, left, right, roundNumber, players, tieNumber, { id: tieId, order, teamOneId: teamOne.id, teamTwoId: teamTwo.id, teamOneName: teamOne.name, teamTwoName: teamTwo.name, teamOneRosterIds: teamOne.playerIds, teamTwoRosterIds: teamTwo.playerIds, doublesPending: nominated });
  });
}

function pairRoundRobin(entries: CategoryEntry[]) {
  const rotation: (CategoryEntry | null)[] = [...entries]; if (rotation.length % 2) rotation.push(null);
  const rounds: [CategoryEntry, CategoryEntry][][] = [];
  for (let round = 0; round < rotation.length - 1; round += 1) {
    const pairs: [CategoryEntry, CategoryEntry][] = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      let one = rotation[index], two = rotation[rotation.length - 1 - index];
      if (round % 2 && index === 0) [one, two] = [two, one];
      if (one && two) pairs.push([one, two]);
    }
    rounds.push(pairs); const fixed = rotation[0], moved = rotation.pop(); if (moved !== undefined) rotation.splice(1, 0, moved); rotation[0] = fixed;
  }
  return rounds;
}

export function generateTournamentFixtures(tournament: Tournament, players: Player[]): Match[] {
  const fixtures: Match[] = [];
  for (const category of tournament.categories) {
    const entries = category.entries.filter((entry) => entry.playerIds.length > 0);
    if (category.kind === 'Team') {
      const rounds = category.format !== 'Knockout' ? pairRoundRobin(entries) : [pairKnockoutRound(category, entries)];
      rounds[0]?.forEach(([one, two], tieIndex) => fixtures.push(...teamTieFixtures(tournament, category, one, two, 1, tieIndex, players)));
      continue;
    }
    if (category.format !== 'Knockout') {
      if (category.groupStage?.groups?.length) {
        const byId = new Map(entries.map((entry) => [entry.id, entry]));
        for (const group of category.groupStage.groups) {
          const groupEntries = group.entryIds.map((id) => byId.get(id)).filter((entry): entry is CategoryEntry => Boolean(entry));
          pairRoundRobin(groupEntries).forEach((pairs, round) => pairs.forEach(([one, two]) => fixtures.push({ ...makeFixture(tournament, category, one, two, round + 1, players), round: `${group.name} · Round ${round + 1}` })));
        }
      } else {
        pairRoundRobin(entries).forEach((pairs, round) => pairs.forEach(([one, two]) => fixtures.push(makeFixture(tournament, category, one, two, round + 1, players))));
      }
    } else {
      const slots = orderEntries(category, entries);
      for (let index = 0; index + 1 < slots.length; index += 2) {
        const one = slots[index], two = slots[index + 1];
        if (one && two) fixtures.push(makeFixture(tournament, category, one, two, 1, players, Math.floor(index / 2)));
      }
    }
  }
  const roundCounts = new Map<string, number>();
  return fixtures.map((match) => {
    const count = roundCounts.get(match.round ?? '') ?? 0; roundCounts.set(match.round ?? '', count + 1);
    return { ...match, table: `Table ${String(count % Math.max(1, tournament.tableCount) + 1).padStart(2, '0')}` };
  });
}

export function resolveTeamTie(matches: Match[], teamSystem: TeamSystem): { winnerId?: string; matches: Match[] } {
  const ordered = [...matches].sort((a, b) => (a.teamTieOrder ?? 0) - (b.teamTieOrder ?? 0));
  const needed = Math.ceil(teamMatchSequence(teamSystem).sides.length / 2);
  const wins = new Map<string, number>();
  for (const match of ordered) if (match.status === 'Completed' && match.winnerId) {
    const winningTeam = match.winnerId === match.sideOneId ? match.teamOneId : match.teamTwoId;
    if (winningTeam) wins.set(winningTeam, (wins.get(winningTeam) ?? 0) + 1);
  }
  const winnerId = [...wins].find(([, count]) => count >= needed)?.[0];
  if (!winnerId) return { matches: ordered };
  return { winnerId, matches: ordered.map((match) => match.status === 'Scheduled' ? { ...match, status: 'Not played' } : match) };
}

export function generateCategoryRoundFixtures(tournament: Tournament, category: TournamentCategory, entrantIds: string[], roundNumber: number, players: Player[]): Match[] {
  const byId = new Map(category.entries.map((entry) => [entry.id, entry]));
  const entrants = entrantIds.map((id) => byId.get(id)).filter((entry): entry is CategoryEntry => Boolean(entry));
  if (category.kind === 'Team') {
    const round = pairKnockoutRound({ ...category, bracketSlots: undefined, byeEntryIds: [] }, entrants);
    return round.flatMap(([one, two], tieIndex) => teamTieFixtures(tournament, category, one, two, roundNumber, tieIndex, players));
  }
  const fixtures: Match[] = [];
  for (let index = 0; index + 1 < entrants.length; index += 2) fixtures.push(makeFixture(tournament, category, entrants[index], entrants[index + 1], roundNumber, players, Math.floor(index / 2)));
  return fixtures;
}

function pairKnockoutRound(category: TournamentCategory, entries: CategoryEntry[]): [CategoryEntry, CategoryEntry][] {
  const slots = orderEntries(category, entries), pairs: [CategoryEntry, CategoryEntry][] = [];
  for (let index = 0; index + 1 < slots.length; index += 2) { const one = slots[index], two = slots[index + 1]; if (one && two) pairs.push([one, two]); }
  return pairs;
}


export function generateKnockoutRoundFixtures(tournament: Tournament, entrantIds: string[], roundNumber: number): Match[] {
  const matches: Match[] = [];
  for (let index = 0; index + 1 < entrantIds.length; index += 2) {
    const one = entrantIds[index]; const two = entrantIds[index + 1];
    matches.push({ id: crypto.randomUUID(), playerOneId: one, playerTwoId: two, status: 'Scheduled', tournamentId: tournament.id, tournamentName: tournament.name, round: `Round ${roundNumber}`, startsAt: 'TBD', format: 'Best of 5', pointsPerGame: 11, gamesToWin: 3, gamesWon: { [one]: 0, [two]: 0 }, score: { [one]: 0, [two]: 0 }, serverId: one, tossWinnerId: one, events: [], bracketOrder: matches.length });
  }
  return matches;
}
