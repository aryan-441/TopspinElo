import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const dir = await mkdtemp(join(tmpdir(), 'rallydesk-doubles-'));
try {
  const bundle = await build({ entryPoints: ['src/services/doublesMetrics.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
  const path = join(dir, 'metrics.cjs');
  await writeFile(path, bundle.outputFiles[0].contents);
  const { doublesPartnerships } = createRequire(import.meta.url)(path);
  const players = ['A','B','C','D','E'].map(id => ({ id, name: id }));
  const base = { status: 'Completed', winnerId: 'pair1', playerOneId: 'A', playerTwoId: 'C', sideOneId: 'pair1', sideTwoId: 'pair2', sideOnePlayerIds: ['A','B'], sideTwoPlayerIds: ['C','D'], gamesWon: {pair1: 2,pair2: 1}, gameResults: [{one:11,two:7},{one:9,two:11},{one:11,two:6}] };
  const matches = [{...base,id:'m1'}, {...base,id:'m2',winnerId:'pair2',sideOnePlayerIds:['C','D'],sideTwoPlayerIds:['A','B'],sideOneId:'pair2',sideTwoId:'pair1',gamesWon:{pair1:0,pair2:2},gameResults:[]}, {...base,id:'m3',status:'Scheduled'}, {...base,id:'m4',sideOnePlayerIds:['A','E'],winnerId:'pair1'}];
  const rows = doublesPartnerships({players,matches},'A');
  assert.equal(rows.length,2);
  assert.deepEqual([rows[0].partnerId,rows[0].wins,rows[0].losses,rows[0].gamesWon,rows[0].gamesLost,rows[0].scoredGames,rows[0].pointsWon,rows[0].pointsLost],['B',1,1,2,3,3,31,24]);
  assert.deepEqual([rows[1].partnerId,rows[1].wins,rows[1].losses],['E',1,0]);
  assert.equal(rows[0].opponents.get('C|D').wins,1);
  assert.equal(rows[0].opponents.get('C|D').losses,1);
  assert.deepEqual(doublesPartnerships({players,matches:[]},'A'),[]);
  console.log('Doubles partnership metrics passed');
} finally { await rm(dir,{recursive:true,force:true}); }
