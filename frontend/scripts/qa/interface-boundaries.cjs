const {chromium}=require(process.env.TOPSPINELO_PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TOPSPINELO_BROWSER_EXECUTABLE,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto('http://127.0.0.1:5173/?demo',{waitUntil:'networkidle'});
  assert.equal(await page.locator('.topbar-icon i').count(),0,'No unread dot without notifications');
  await page.evaluate(()=>{const w=JSON.parse(localStorage.getItem('rallydesk-demo-v1'));w.referees=[];localStorage.setItem('rallydesk-demo-v1',JSON.stringify(w));});
  await page.reload();
  await page.locator('.role-switch button').filter({hasText:'Referee'}).click();
  await page.getByRole('heading',{name:'Your assigned matches',exact:true}).waitFor();
  assert.equal(await page.locator('.matches-table tbody tr').count(),0,'No referee identity must not expose all matches');
  assert.equal(await page.getByRole('button',{name:/^(New match|Create a match)$/}).count(),0);
  await page.locator('.role-switch button').filter({hasText:'Organiser'}).click();
  await page.getByRole('button',{name:'Statistics',exact:true}).click();
  const single=await page.getByRole('heading',{name:'Where are points won?',exact:true}).boundingBox();
  const doubles=await page.getByRole('heading',{name:'Doubles, together',exact:true}).boundingBox();
  assert.ok(single.y<doubles.y,'Singles must precede doubles');
  await page.getByRole('button',{name:'Tournaments',exact:true}).click();
  await page.getByRole('button',{name:/Harbour Club Cup/}).click();
  assert.equal(await page.getByRole('button',{name:'Knockout PDF import · locked',exact:true}).isEnabled(),false);
  await page.getByRole('tab',{name:'Draw & matches',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:/Scan group PDF/}).count(),0);
  assert.equal(await page.locator('input[type=file][accept*="application/pdf"]').count(),0,'Groups must have no AI upload');
  console.log(JSON.stringify({refereeEmptyRosterIsolated:true,refereeCannotCreate:true,singlesBeforeDoubles:true,noFalseNotificationDot:true,groupAiRemoved:true,qualificationLocked:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
