import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const tempDir = await mkdtemp(join(tmpdir(), 'rallydesk-rules-'));
try {
  const bundle = await build({ entryPoints: ['src/services/store.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
  const bundlePath = join(tempDir, 'store.cjs');
  await writeFile(bundlePath, bundle.outputFiles[0].contents);
  const store = createRequire(import.meta.url)(bundlePath);
  const rules = await build({ entryPoints: ['src/services/tableTennisRules.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
  const rulesPath = join(tempDir, 'rules.cjs');
  await writeFile(rulesPath, rules.outputFiles[0].contents);
  const tableRules = createRequire(import.meta.url)(rulesPath);
  const players = Array.from({ length: 13 }, (_, index) => ({ id: `p${index}`, name: `Player ${index}`, initials: `P${index}`, hand: 'Right', grip: 'Shakehand', style: 'All-round', rating: 1000, wins: 0, losses: 0, pointsWon: 0, recent: [] }));
  const workspaceBefore = { clubName: 'Test club', players: [players[0]], matches: [], tournaments: [], referees: [], activityLog: [] };
  const workspaceEdited = store.recordWorkspaceChanges(workspaceBefore, { ...workspaceBefore, players: [{ ...players[0], name: 'Updated name' }] });
  assert.equal(workspaceEdited.activityLog[0].action, 'updated', 'profile edits enter the activity journal');
  assert.equal(workspaceEdited.activityLog[0].before.name, 'Player 0', 'journal retains the previous profile');
  assert.equal(workspaceEdited.activityLog[0].after.name, 'Updated name', 'journal retains the updated profile');
  const workspaceDeleted = store.recordWorkspaceChanges(workspaceEdited, { ...workspaceEdited, players: [] });
  assert.equal(workspaceDeleted.activityLog[0].action, 'deleted', 'removed records enter the activity journal');
  assert.equal(workspaceDeleted.activityLog[0].before.id, 'p0', 'journal retains deleted record details');
  const systems = [
    ['new_swaythling', [[[0],[0]],[[1],[1]],[[2],[2]],[[0],[1]],[[1],[0]]]],
    ['corbillon', [[[0],[0]],[[1],[1]],[[0,1],[0,1]],[[0],[1]],[[1],[0]]]],
    ['olympic', [[[1,2],[1,2]],[[0],[0]],[[2],[2]],[[0],[1]],[[1],[0]]]],
    ['best_of_7', [[[0],[0]],[[1],[1]],[[2],[2]],[[0,1],[0,1]],[[0],[1]],[[2],[0]],[[1],[2]]]],
    ['best_of_9', [[[0],[0]],[[1],[1]],[[2],[2]],[[1],[0]],[[0],[2]],[[2],[1]],[[1],[2]],[[2],[0]],[[0],[1]]]],
  ];
  for (const [teamSystem, expected] of systems) {
    const categories = [{ id: 'teams', name: 'Team event', kind: 'Team', teamSystem, format: 'Round robin', entries: [{ id: 'alpha', name: 'Alpha', playerIds: ['p0','p1','p2','p3','p4'], doublesPlayerIds: ['p0','p1'] }, { id: 'beta', name: 'Beta', playerIds: ['p5','p6','p7','p8','p9'], doublesPlayerIds: ['p5','p6'] }] }];
    const tournament = store.createTournament({ name: 'ITTF sequence check', format: 'Round robin', date: '1 Nov 2026', venue: 'Test hall', entrantIds: categories[0].entries.flatMap((entry) => entry.playerIds), tableCount: 3, categories });
    const fixtures = store.generateTournamentFixtures(tournament, players);
    assert.equal(fixtures.length, expected.length, `${teamSystem} individual fixture count`);
    fixtures.forEach((match, index) => {
      const indexes = (teamName, ids) => ids.map((id) => Number(id.slice(1)) - (teamName === 'Alpha' ? 0 : 5));
      assert.deepEqual(indexes(match.sideOneTeamName, match.sideOnePlayerIds), expected[index][0], `${teamSystem} A/B/C lineup order at match ${index + 1}`);
      assert.deepEqual(indexes(match.sideTwoTeamName, match.sideTwoPlayerIds), expected[index][1], `${teamSystem} X/Y/Z lineup order at match ${index + 1}`);
      if (expected[index][0].length === 2) assert.equal(match.sideOnePlayerIds.length, 2, `${teamSystem} doubles side has two players`);
    });
    const scored = fixtures.map((match, index) => index < Math.ceil(expected.length / 2) ? { ...match, status: 'Completed', winnerId: match.sideOneId } : match);
    const decision = store.resolveTeamTie(scored, teamSystem);
    assert.equal(decision.winnerId, decision.matches[0].teamOneId, `${teamSystem} stops at a majority`);
    assert.ok(decision.matches.slice(Math.ceil(expected.length / 2)).every((match) => match.status === 'Not played'), `${teamSystem} marks surplus matches not played`);
  }

  const doublesOrder = ['server-A', 'receiver-X', 'partner-A', 'partner-X'];
  assert.equal(tableRules.doublesServerAfterPoint(doublesOrder, 'server-A', 0, 0, 11), 'server-A', 'doubles serve remains with the player for point one');
  assert.equal(tableRules.doublesServerAfterPoint(doublesOrder, 'server-A', 1, 0, 11), 'receiver-X', 'doubles server rotates after two points');
  assert.equal(tableRules.doublesServerAfterPoint(doublesOrder, 'receiver-X', 10, 10, 11), 'partner-A', 'doubles server rotates after each deuce point');
  const nextGame = tableRules.nextDoublesGameOrder(doublesOrder);
  assert.deepEqual(nextGame, ['receiver-X', 'server-A', 'partner-X', 'partner-A'], 'previous receiving pair serves first next game');
  assert.deepEqual(tableRules.chooseDoublesFirstServer(nextGame, 'partner-X'), ['partner-X', 'partner-A', 'receiver-X', 'server-A'], 'chosen first server receives from the player who served to them last game');

  const seededEntries = Array.from({ length: 5 }, (_, index) => ({ id: `e${index + 1}`, name: `Entrant ${index + 1}`, playerIds: [`p${index}`], seed: index + 1 }));
  const knockout = store.createTournament({ name: 'Seeded draw', format: 'Knockout', date: '1 Nov 2026', venue: 'Test hall', entrantIds: seededEntries.map((entry) => entry.playerIds[0]), tableCount: 2, categories: [{ id: 'singles', name: 'Singles', kind: 'Singles', format: 'Knockout', entries: seededEntries }] });
  const firstRound = store.generateTournamentFixtures(knockout, players);
  assert.equal(firstRound.length, 1, 'five entrants with three seeded byes produce one opening match');
  assert.deepEqual(new Set(knockout.categories[0].byeEntryIds), new Set(['e1', 'e2', 'e3']), 'highest seeds receive the opening-round byes');
  assert.equal(firstRound[0].categoryId, 'singles', 'fixtures retain their category identity');
  assert.ok(firstRound[0].table, 'fixtures receive a configured venue table');

  console.log('Tournament rules checks passed: five ITTF team orders, tie majorities, doubles service rotation, seeded byes, category/table assignment, and before/after activity journal.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
