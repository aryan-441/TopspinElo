import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'topspinelo-standalone-'));
try {
 const bundle=await build({stdin:{contents:`export * from './src/services/standaloneMatches'; export * from './src/services/resultEntry'; export * from './src/services/store'; export * from './src/services/matchAvailability'; export * from './src/services/refereeAvailability';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false});
 const path=join(dir,'test.cjs');await writeFile(path,bundle.outputFiles[0].contents);const api=createRequire(import.meta.url)(path);
 const players=Array.from({length:6},(_,i)=>api.createPlayer('Player '+i));const ids=players.map(p=>p.id);
 const setup={kind:'Singles',one:[ids[0]],two:[ids[1]],oneName:'A',twoName:'B',teamSystem:'new_swaythling',gamesToWin:3,pointsPerGame:11,goldenPoint:false,playedOn:'2026-11-10',table:'',includeReferees:false};
 const single=api.createStandaloneMatches(setup,players)[0];assert.equal(single.tournamentId,undefined);assert.equal(single.playedOn,'2026-11-10');
 assert.equal(api.enterResult(single,'match-score','3-1').winnerId,single.sideOneId);
 assert.equal(api.enterResult(single,'winner','',single.sideTwoId).winnerId,single.sideTwoId);
 assert.equal(api.enterResult(single,'game-scores','11-9 11-5 12-10').status,'Completed');
 assert.throws(()=>api.enterResult(single,'game-scores','11-10 11-5 11-4'));
 const golden={...single,goldenPoint:true};assert.equal(api.enterResult(golden,'game-scores','11-10 11-5 11-4').status,'Completed');assert.throws(()=>api.enterResult(golden,'game-scores','12-10 11-5 11-4'));
 for(const target of [11,21]) {assert.equal(api.validGameScore(target,target-1,target,true),true);assert.equal(api.validGameScore(target,target-1,target,false),false);assert.equal(api.validGameScore(target+1,target-1,target,false),true);assert.equal(api.validGameScore(target+2,target-2,target,false),false);}
 assert.throws(()=>api.createStandaloneMatches({...setup,two:[ids[0]]},players));assert.throws(()=>api.createStandaloneMatches({...setup,playedOn:'2026-02-30'},players));
 const pair=api.createStandaloneMatches({...setup,kind:'Doubles',one:ids.slice(0,2),two:ids.slice(2,4)},players)[0];assert.equal(pair.sideOnePlayerIds.length,2);assert.equal(pair.tournamentId,undefined);
 for(const system of ['new_swaythling','corbillon','olympic','best_of_7','best_of_9']) {
  const count=system==='corbillon'?2:3;const matches=api.createStandaloneMatches({...setup,kind:'Team',teamSystem:system,one:ids.slice(0,count),two:ids.slice(count,count*2)},players);assert.equal(matches.length,system==='best_of_7'?7:system==='best_of_9'?9:5);assert.ok(matches.every(m=>!m.tournamentId&&m.standaloneTeamSystem===system));
  assert.equal(api.matchAvailability(matches[1],{players,matches,tournaments:[],referees:[]}).ready,false);
  const needed=Math.ceil(matches.length/2);const decided=matches.map((m,i)=>i<needed?api.enterResult(m,'winner','',m.sideOneId):m);const result=api.resolveTeamTie(decided,system);assert.equal(result.winnerId,matches[0].teamOneId);assert.equal(result.matches.filter(m=>m.status==='Not played').length,matches.length-needed);
 }
 assert.equal(api.matchIncludesReferees({...single,includeReferees:true},{tournaments:[]}),true);assert.equal(api.matchIncludesReferees(single,{tournaments:[]}),false);
 console.log('Standalone match formats, team progression, dates, result entry, referee flag, deuce and golden point passed.');
} finally {await rm(dir,{recursive:true,force:true});}
