const {chromium}=require(process.env.TOPSPINELO_PLAYWRIGHT_PATH || 'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TOPSPINELO_BROWSER_EXECUTABLE,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?demo');
  await page.evaluate(()=>{
   const w=JSON.parse(localStorage.getItem('rallydesk-demo-v1'));
   const first=w.matches[0];
   while(w.players.length<16){const n=w.players.length;w.players.push({...w.players[n%8],id:'extra-'+n,name:'Player '+(n+1),initials:'P'+(n+1),wins:0,losses:0,recent:[]})}
   const make=(round,index,status)=>{const one=w.players[index*2],two=w.players[index*2+1];return {...first,id:`round-${round}-${index}`,playerOneId:one.id,playerTwoId:two.id,sideOneId:one.id,sideTwoId:two.id,sideOneLabel:one.name,sideTwoLabel:two.name,sideOnePlayerIds:[one.id],sideTwoPlayerIds:[two.id],status,round:`Round ${round}`,categoryId:'demo-singles',category:'Open singles',winnerId:status==='Completed'?one.id:undefined,gamesWon:{[one.id]:status==='Completed'?3:0,[two.id]:0},score:{[one.id]:0,[two.id]:0},events:[],gameResults:[],serverId:one.id,tossWinnerId:one.id,startsAt:'TBD'};};
   const r1=Array.from({length:8},(_,i)=>make(1,i,'Completed'));
   const r2=Array.from({length:8},(_,i)=>make(2,i,'Scheduled'));
   const final=make(3,0,'Scheduled');final.id='future-final';final.sideOneLabel='TBD';final.sideTwoLabel='TBD';
   w.matches=[...r1,...r2,final];const t=w.tournaments[0];t.matchIds=w.matches.map(m=>m.id);t.completed=8;t.status='Running';t.format='Knockout';t.entrantIds=w.players.map(p=>p.id);t.categories=[{id:'demo-singles',name:'Open singles',kind:'Singles',format:'Knockout',entries:w.players.map(p=>({id:p.id,name:p.name,playerIds:[p.id]}))}];localStorage.setItem('rallydesk-demo-v1',JSON.stringify(w));
  });
  await page.reload();
  await page.getByRole('button',{name:'Tournaments',exact:true}).click();
  await page.getByRole('button',{name:/Harbour Club Cup/}).click();
  await page.getByRole('heading',{name:'Ready to play'}).waitFor();
  const ready=page.locator('.tournament-match-list .tournament-match-row');
  if(await ready.count()!==8)throw Error('Expected eight ready matches');
  await ready.last().click();
  if(!(await page.locator('body').innerText()).includes('Player 15'))throw Error('Eighth match did not open');
  await page.getByRole('button',{name:'Match desk'}).click();
  await page.getByRole('button',{name:'Choose a match'}).click();
  const waiting=page.getByRole('button',{name:/Waiting: TBD versus TBD/});
  if(!(await waiting.isDisabled()))throw Error('Future final should be disabled');
  if(errors.length)throw Error(errors.join(' | '));
  console.log(JSON.stringify({readyMatches:8,eighthSelectable:true,futureFinalDisabled:true,errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

