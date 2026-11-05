const {chromium}=require(process.env.RALLYDESK_PLAYWRIGHT_PATH || 'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.RALLYDESK_BROWSER_EXECUTABLE,headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?demo');
  await page.evaluate(()=>{const w=JSON.parse(localStorage.getItem('rallydesk-demo-v1'));w.matches=[];const t=w.tournaments[0];t.matchIds=[];t.completed=0;t.status='Upcoming';t.format='Knockout';t.categories[0].format='Knockout';delete t.categories[0].groupStage;localStorage.setItem('rallydesk-demo-v1',JSON.stringify(w))});
  await page.reload();
  const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')).players.length);
  const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')).players[0].name);
  await page.getByRole('button',{name:'Tournaments',exact:true}).click();
  await page.getByRole('button',{name:/Harbour Club Cup/}).click();
  await page.getByRole('tab',{name:'Draw & matches'}).click();
  const csv=`player_one,player_two,category,round\n${first},New Challenger,Open singles,Round 1\n`;
  await page.locator('input[type=file][accept*="text/csv"]').last().setInputFiles({name:'new-player.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.getByText('1 name is not in this tournament').waitFor();
  await page.getByRole('button',{name:'Cancel import'}).click();
  const afterCancel=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')));
  if(afterCancel.players.length!==original||afterCancel.matches.length)throw Error('Cancel changed workspace');
  await page.locator('input[type=file][accept*="text/csv"]').last().setInputFiles({name:'new-player.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.getByRole('button',{name:'Add player to this import'}).click();
  const staged=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')));
  if(staged.players.length!==original)throw Error('Staging changed workspace');
  await page.getByRole('button',{name:'Import 1 fixtures'}).click();
  await page.getByText('1 draw match imported').waitFor();
  const done=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')));
  const newcomer=done.players.find(p=>p.name==='New Challenger');
  if(!newcomer||newcomer.hand!==null||newcomer.grip!==null||newcomer.style!==null)throw Error('Incomplete defaults');
  if(done.players.length!==original+1||!done.tournaments[0].entrantIds.includes(newcomer.id)||done.matches.length!==1)throw Error('Import incomplete');
  if(errors.length)throw Error(errors.join(' | '));
  console.log(JSON.stringify({csvFlow:'passed',cancelUnchanged:true,stagingUnchanged:true,newPlayerDefaults:'null',fixtures:done.matches.length,errors}));
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
