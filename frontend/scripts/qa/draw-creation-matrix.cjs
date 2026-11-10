const {chromium}=require(process.env.TOPSPINELO_PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.TOPSPINELO_BROWSER_EXECUTABLE,headless:true});
  const results=[];
  const modes=[{name:'random knockout'},{name:'seeded knockout',seeded:true},{name:'typed names',manual:true},
    {name:'snake uneven groups',distribution:'snake',groups:3},
    {name:'seed bands',distribution:'bands',groups:2},
    {name:'random groups only',distribution:'random',groups:2,groupsOnly:true},
    {name:'doubles pairs',kind:'Doubles'},
    ...['new_swaythling','corbillon','olympic','best_of_7','best_of_9'].map(system=>({name:`team ${system}`,kind:'Team',system}))];
  try{
    for(const mode of modes){
      const context=await browser.newContext({viewport:{width:1440,height:1000}});
      const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto('http://127.0.0.1:5173/?demo',{waitUntil:'networkidle'});
        const base=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')));
        await page.getByRole('button',{name:'Tournaments',exact:true}).click();
        await page.getByRole('button',{name:'Create tournament',exact:true}).click();
        const dialog=page.getByRole('dialog');
        await dialog.getByLabel('Tournament name',{exact:true}).fill(`Audit ${mode.name}`);
        if(mode.groups){
          await dialog.getByRole('combobox',{name:'Default draw format',exact:true}).selectOption('Group stage');
        }
        if(mode.kind) await dialog.getByRole('combobox',{name:'Entry type',exact:true}).selectOption(mode.kind);
        if(mode.kind==='Doubles'){
          for(let i=0;i<8;i+=2){
            await dialog.getByRole('combobox',{name:'Player one',exact:true}).selectOption(base.players[i].id);
            await dialog.getByRole('combobox',{name:'Player two',exact:true}).selectOption(base.players[i+1].id);
            await dialog.getByRole('button',{name:'Register pair',exact:true}).click();
          }
        }else if(mode.kind==='Team'){
          await dialog.getByRole('combobox',{name:'Team championship format',exact:true}).selectOption(mode.system);
          for(let team=0;team<2;team++){
            await dialog.getByLabel('Team name',{exact:true}).fill(`Team ${team+1}`);
            for(let i=0;i<3;i++) await dialog.getByRole('combobox',{name:`Player ${String.fromCharCode(65+i)}`,exact:true}).selectOption(base.players[team*3+i].id);
            await dialog.getByRole('button',{name:'Register team',exact:true}).click();
          }
        }else{
          for(const box of await dialog.locator('.entrant-option input').all()) await box.check();
          if(mode.manual){
            await dialog.getByRole('button',{name:'Enter names',exact:true}).click();
            assert.equal(await dialog.locator('.manual-entrant-row').count(),8);
          }
          if(mode.seeded || mode.distribution){
            const seedInputs=dialog.locator('.category-seeds input');
            for(let i=0;i<8;i++) await seedInputs.nth(i).fill(String(i+1));
          }
          if(mode.groups){
            await dialog.getByLabel('Number of groups',{exact:true}).fill(String(mode.groups));
            await dialog.getByRole('combobox',{name:'Group distribution',exact:true}).selectOption(mode.distribution);
            await dialog.getByLabel('Draw seed (optional)',{exact:true}).fill('audit-reproducible');
            if(mode.groupsOnly) await dialog.getByLabel('Advance qualifiers to knockout after the groups',{exact:true}).uncheck();
            await dialog.locator('summary').filter({hasText:'Edit group tables'}).click();
            await dialog.getByRole('button',{name:'Prepare group tables',exact:true}).click();
          }
        }
        const create=dialog.getByRole('button',{name:'Create tournament',exact:true});
        assert.ok(await create.isEnabled(),`Cannot create ${mode.name}`);
        await create.click(); await page.getByRole('heading',{name:`Audit ${mode.name}`,exact:true}).waitFor();
        const w=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')));
        const t=w.tournaments.find(t=>t.name===`Audit ${mode.name}`),c=t.categories[0];
        const fixtures=w.matches.filter(m=>m.tournamentId===t.id);
        assert.ok(fixtures.length>0);assert.equal(c.entries.length,mode.kind==='Team'?2:mode.kind==='Doubles'?4:8);
        if(mode.groups){
          assert.equal(c.groupStage.groups.length,mode.groups);
          const assigned=c.groupStage.groups.flatMap(g=>g.entryIds);
          assert.equal(assigned.length,8);assert.equal(new Set(assigned).size,8);
          assert.ok(c.groupStage.groups.every(g=>g.entryIds.length>=2));
          const expected=c.groupStage.groups.reduce((n,g)=>n+g.entryIds.length*(g.entryIds.length-1)/2,0);
          assert.equal(fixtures.length,expected);
          if(mode.groupsOnly) assert.equal(c.groupStage.advanceToKnockout,false);
          else await page.getByRole('button',{name:'Knockout PDF import · locked',exact:true}).waitFor();
        }else if(!mode.kind){assert.equal(fixtures.length,4);}
        assert.deepEqual(errors,[]);
        results.push({name:mode.name,passed:true,entrants:c.entries.length,fixtures:fixtures.length});
        console.log('PASS',mode.name,fixtures.length,'fixtures');
      }catch(e){results.push({name:mode.name,passed:false,error:e.stack}); console.error('FAIL',mode.name,e.message);}
      finally{await context.close();}
    }
  }finally{await browser.close();fs.writeFileSync('.test-tmp/draw-creation-matrix.json',JSON.stringify({at:new Date().toISOString(),results},null,2));}
  if(results.some(r=>!r.passed))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
