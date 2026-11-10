const {chromium}=require(process.env.TOPSPINELO_PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TOPSPINELO_BROWSER_EXECUTABLE,headless:true});const results=[];
 try{
  for(const group of [false,true])for(const format of ['csv','json']){
   const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:5173/?demo',{waitUntil:'networkidle'});
   const base=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')));
   await page.getByRole('button',{name:'Tournaments',exact:true}).click();await page.getByRole('button',{name:'Create tournament',exact:true}).click();
   const name=`Audit ${group?'groups':'fixtures'} ${format}`,dialog=page.getByRole('dialog');
   await dialog.getByLabel('Tournament name',{exact:true}).fill(name);
   if(group)await dialog.getByRole('combobox',{name:'Default draw format',exact:true}).selectOption('Group stage');
   for(const box of await dialog.locator('.entrant-option input').all())await box.check();
   await dialog.getByRole('button',{name:'Create tournament',exact:true}).click();
   await page.getByRole('heading',{name,exact:true}).waitFor();await page.getByRole('tab',{name:'Draw & matches',exact:true}).click();
   const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')));
   const t=before.tournaments.find(t=>t.name===name);
   const rows=group?base.players.map((p,i)=>({group:i<4?'Group A':'Group B',player:p.name,seed:i+1})):[{player_one:base.players[0].name,player_two:base.players[7].name,category:'Open singles',round:'Imported fixture round',table:'99',start_time:'15:30'}];
   const body=format==='json'?JSON.stringify(group?{groups:rows}:{matches:rows}):Object.keys(rows[0]).join(',')+'\n'+rows.map(row=>Object.values(row).join(',')).join('\n');
   const input=page.locator('input[type=file][accept*="text/csv"]');
   await (group?input.first():input.last()).setInputFiles({name:`filled-example.${format}`,mimeType:format==='csv'?'text/csv':'application/json',buffer:Buffer.from(body)});
   await page.getByRole('button',{name:group?'Apply group allocation':'Import 1 fixtures',exact:true}).click();
   const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')));
   const updated=after.tournaments.find(x=>x.id===t.id),matches=after.matches.filter(m=>m.tournamentId===t.id);
   if(group){
    assert.equal(matches.length,12);
    const groups=updated.categories[0].groupStage.groups;
    assert.equal(groups.length,2);
    const names=new Map(updated.categories[0].entries.map(e=>[e.id,after.players.find(p=>e.playerIds.includes(p.id)).name]));
    for(const row of rows)assert.ok(groups.find(g=>g.name===row.group).entryIds.some(id=>names.get(id)===row.player));
   }else{
    assert.equal(matches.length,5);assert.equal(matches.filter(m=>m.round==='Imported fixture round').length,1);
   }
   assert.deepEqual(errors,[]);results.push({group,format,fixtures:matches.length,passed:true});console.log('PASS',group?'group allocation':'match list',format);
   await context.close();
  }
  fs.writeFileSync('.test-tmp/structured-imports.json',JSON.stringify({at:new Date().toISOString(),results},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
