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
  const profile = store.createPlayer('New entrant');
  assert.deepEqual([profile.hand, profile.grip, profile.style], [null, null, null]);
  const entrants = Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), seed: i + 1 }));
  const placements = (options) => store.assignSeededGroups(entrants, 3, options).map(group => group.entryIds);
  assert.deepEqual(placements({ distribution: 'snake' }), [['1','6','7'], ['2','5','8'], ['3','4','9','10']]);
  for (const distribution of ['bands', 'random']) {
    const options = { distribution, drawSeed: 'club-finals' };
    assert.deepEqual(placements(options), placements(options));
    assert.equal(new Set(placements(options).flat()).size, entrants.length);
  }
  const drawBundle = await build({entryPoints:['src/services/qualifierDraw.ts'],bundle:true,platform:'node',format:'cjs',write:false});
  const drawPath = join(tempDir,'qualifiers.cjs');
  await writeFile(drawPath,drawBundle.outputFiles[0].contents);
  const {qualifierDraw} = createRequire(import.meta.url)(drawPath);
  for(const groupCount of [2,3,4,5,7,8,10]) for(const perGroup of [1,2,3]) {
    const groups=Array.from({length:groupCount},(_,i)=>({id:String(i),name:String(i),entryIds:Array.from({length:perGroup},(_,j)=>i+'-'+j)}));
    const qualifiers=groups.flatMap(g=>g.entryIds.map((id,i)=>({entry:{id},place:i+1})));
    const {bracketSlots}=qualifierDraw(qualifiers,groups,perGroup);
    assert.equal(bracketSlots.length,2**Math.ceil(Math.log2(qualifiers.length)));
    assert.deepEqual(bracketSlots.filter(Boolean).sort(),qualifiers.map(q=>q.entry.id).sort());
    for(let i=0;i<bracketSlots.length;i+=2){
      const [a,b]=bracketSlots.slice(i,i+2);
      assert.ok(a || b);
      if(perGroup===2 && a && b){
        assert.notEqual(a.split('-')[0],b.split('-')[0]);
        assert.notEqual(a.split('-')[1],b.split('-')[1]);
      }
    }
  }
  const analysisBundle = await build({
    entryPoints:['src/views/PlayerAnalysis.tsx'],bundle:true,platform:'node',format:'cjs',
    jsx:'automatic',write:false,plugins:[{name:'test-render',setup(builder){
      builder.onResolve({filter:/^react(?:\/jsx-runtime)?$/},args=>({path:createRequire(import.meta.url).resolve(args.path),external:true}));
    }}]
  });
  const analysisPath=join(tempDir,'analysis.cjs');
  await writeFile(analysisPath,analysisBundle.outputFiles[0].contents);
  const require=createRequire(import.meta.url);
  const {PlayerAnalysis}=require(analysisPath);
  const render=(matches)=>require('react-dom/server').renderToStaticMarkup(require('react').createElement(PlayerAnalysis,{workspace:{
    players:[{...profile,id:'a'},{...profile,id:'b',name:'Opponent'}],tournaments:[],matches
  }}));
  const scored={playerOneId:'a',playerTwoId:'b',winnerId:'a',status:'Completed',id:'m',format:'Best of 1',gamesToWin:1,pointsPerGame:11,gamesWon:{a:1,b:0},
    gameResults:[{one:12,two:10,winnerId:'a'}],events:[{id:'p',kind:'Point',game:1,score:'11–10',serverId:'a',winnerId:'a'}]};
  const scoredPage=render([scored]);
  assert.match(scoredPage,/Serving<\/small><strong>100%/);
  assert.match(scoredPage,/Deuce games won<\/small><strong>100%/);
  assert.match(scoredPage,/Deuce points won<\/small><strong>100%/);
  assert.match(render([{...scored,events:[]}]),/Serving<\/small><strong>-/);
  const metricsBundle=await build({entryPoints:['src/services/playerMetrics.ts','src/services/tournamentRecovery.ts','src/data/demo.ts'],bundle:true,platform:'node',format:'cjs',write:false,outdir:'out'});
  const loaded={};
  for(const file of metricsBundle.outputFiles){
    const name=file.path.split(/[\\/]/).pop();
    const path=join(tempDir,name);
    await writeFile(path,file.contents);
    loaded[name]=require(path);
  }
  const demo=loaded['demo.js'].demoWorkspace();
  const metrics=loaded['playerMetrics.js'];
  const firstMatch=demo.matches.find(m=>m.status==='Completed');
  const selected=firstMatch.playerOneId;
  const result=metrics.calculatePlayerMetrics([firstMatch],selected);
  assert.equal(result.rates['Recorded points won'].total,firstMatch.events.length);
  const game=firstMatch.gameResults[0];
  const gameEvents=firstMatch.events.filter(e=>e.game===1);
  assert.equal(metrics.completeGameEvents(gameEvents,game.one,game.two,firstMatch),true);
  assert.equal(metrics.completeGameEvents(gameEvents.slice(1),game.one,game.two,firstMatch),false);
  assert.equal(metrics.calculatePlayerMetrics([{...firstMatch,events:[]}],selected).rates.Serving,undefined);
  const withKnockout=structuredClone(demo);
  withKnockout.tournaments[0].categories[0].groupStage.advanced=true;
  withKnockout.tournaments[0].categories.push({id:'ko',name:'Open singles · Knockout',format:'Knockout',kind:'Singles',entries:[]});
  withKnockout.matches.push({...firstMatch,id:'ko-match',categoryId:'ko'});
  const rewound=loaded['tournamentRecovery.js'].rewindQualification(withKnockout,'demo-cup','demo-singles','Correct group placement');
  assert.equal(rewound.matches.length,demo.matches.length);
  assert.equal(rewound.tournaments[0].progressPaused,true);
  assert.equal(rewound.tournaments[0].categories[0].groupStage.advanced,false);
  assert.equal(withKnockout.matches.length,demo.matches.length+1);
  assert.throws(()=>loaded['tournamentRecovery.js'].rewindQualification(withKnockout,'demo-cup','demo-singles',''));
  const journal=store.recordWorkspaceChanges(withKnockout,rewound);
  assert.ok(journal.activityLog.some(e=>e.entityId==='ko-match'&&e.before.id==='ko-match'));
  const restored=store.normalizeWorkspace(JSON.parse(JSON.stringify(demo)));
  assert.deepEqual(restored.matches.map(m=>m.events),demo.matches.map(m=>m.events));
  assert.deepEqual(restored.players,demo.players);
  const entryBundle=await build({entryPoints:['src/services/resultEntry.ts'],bundle:true,platform:'node',format:'cjs',write:false});
  const entryPath=join(tempDir,'entry.cjs');
  await writeFile(entryPath,entryBundle.outputFiles[0].contents);
  const {enterResult,replayRatings}=require(entryPath);
  const manual={...firstMatch,gamesToWin:3};
  const winnerOnly=enterResult(manual,'winner','',manual.playerOneId);
  assert.deepEqual(winnerOnly.gameResults,[]);
  assert.equal(Object.values(winnerOnly.gamesWon).reduce((a,b)=>a+b,0),0);
  const overall=enterResult(manual,'match-score','3-0');
  assert.equal(overall.gamesWon[manual.playerOneId],3);
  assert.equal(overall.gameResults.length,0);
  const detailed=enterResult(manual,'game-scores','11-3 11-7 11-5');
  assert.equal(detailed.gameResults.length,3);
  assert.equal(detailed.events.length,0);
  assert.throws(()=>enterResult(manual,'game-scores','11-10 11-2 11-3'));
  assert.throws(()=>enterResult(manual,'match-score','2-0'));
  const base={...demo,matches:[winnerOnly]};
  const once=replayRatings(base);
  const twice=replayRatings(once);
  assert.deepEqual(once.players.map(p=>p.rating),twice.players.map(p=>p.rating));
  assert.ok(once.players.find(p=>p.id===manual.playerOneId).rating>base.players.find(p=>p.id===manual.playerOneId).rating);
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

  const availabilityBundle = await build({ entryPoints: ['src/services/matchAvailability.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
  const availabilityPath = join(tempDir, 'match-availability.cjs');
  await writeFile(availabilityPath, availabilityBundle.outputFiles[0].contents);
  const { matchAvailability } = createRequire(import.meta.url)(availabilityPath);
  const roundPlayers = Array.from({ length: 16 }, (_, index) => ({ id: `round-p${index}` }));
  const fixture = (id, round, index, status = 'Scheduled') => ({ id, tournamentId: 'round-event', categoryId: 'round-singles', round: `Round ${round}`, status, playerOneId: `round-p${index * 2}`, playerTwoId: `round-p${index * 2 + 1}` });
  const roundOne = Array.from({ length: 8 }, (_, index) => fixture(`r1-${index}`, 1, index, 'Completed'));
  const roundTwo = Array.from({ length: 8 }, (_, index) => fixture(`r2-${index}`, 2, index));
  const final = fixture('final', 3, 0);
  const roundWorkspace = { players: roundPlayers, matches: [...roundOne, ...roundTwo, final], tournaments: [{ id: 'round-event', categories: [{ id: 'round-singles', format: 'Knockout' }] }] };
  assert.ok(roundTwo.every((match) => matchAvailability(match, roundWorkspace).ready), 'every ready match in the same round can be chosen');
  assert.equal(matchAvailability(final, roundWorkspace).ready, false, 'a later round waits for the previous round');
  assert.equal(matchAvailability(roundTwo[7], { ...roundWorkspace, matches: [{ ...roundOne[0], status: 'Scheduled' }, ...roundOne.slice(1), ...roundTwo, final] }).ready, false, 'the current round waits until earlier results are known');

  console.log('Tournament rules checks passed: team orders, seeded draws, match availability, and activity journal.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
