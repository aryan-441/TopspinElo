const {chromium,webkit}=require(process.env.RALLYDESK_PLAYWRIGHT_PATH || 'playwright');
(async()=>{const browser=await (process.env.QA_WEBKIT?webkit:chromium).launch({...(process.env.QA_WEBKIT?{}:{executablePath:process.env.RALLYDESK_BROWSER_EXECUTABLE}),headless:true});try{
const page=await browser.newPage({viewport:{width:820,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173/?demo');
await page.evaluate(()=>{const w=JSON.parse(localStorage.getItem('rallydesk-demo-v1'));w.matches=[];const t=w.tournaments[0];t.matchIds=[];t.completed=0;t.status='Upcoming';t.format='Knockout';t.categories[0].format='Knockout';delete t.categories[0].groupStage;localStorage.setItem('rallydesk-demo-v1',JSON.stringify(w))});
const names=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')).players.map(p=>p.name));
const ids=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')).players.map(p=>p.id));
await page.route('**/api/draw/recognize',async route=>{await new Promise(r=>setTimeout(r,900));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({structureDraft:{bracketSlots:names,byeSlotNumbers:[],review:{missingSlots:[],duplicateSlots:[]}}})})});
await page.reload();await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('button',{name:'Tournaments',exact:true}).click();await page.getByRole('button',{name:/Harbour Club Cup/}).click();await page.getByRole('tab',{name:'Draw & matches'}).click();
await page.locator('input[type=file][accept*="application/pdf"]').last().setInputFiles({name:'bracket.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n')});
await page.getByRole('heading',{name:'Reading draw'}).waitFor();
await page.getByText('Reading names and bracket positions').waitFor();
await page.getByRole('heading',{name:'Review knockout draw'}).waitFor();await page.screenshot({path:'.test-tmp/bracket-review-new-top.png'});
const slot8=page.getByRole('combobox',{name:'Player in slot 8'}),slot3=page.getByRole('combobox',{name:'Player in slot 3'});
await slot8.selectOption(ids[2]);
if(await slot3.inputValue()!==ids[7]||await slot8.inputValue()!==ids[2])throw Error('Occupied slots did not swap');
await page.getByText(/Swapped .* between slots 8 and 3/).waitFor();
const bounds=await page.locator('.bracket-review .import-review-table-wrap').boundingBox();const dialog=await page.getByRole('dialog').boundingBox();if(bounds.x+ bounds.width>dialog.x+dialog.width-10)throw Error('Table is clipped in review dialog');
console.log('LAYOUT',await page.evaluate(()=>{const d=document.querySelector('.dialog--review'),h=d.querySelector('.dialog-head'),s=document.querySelector('.dialog-scrim');return {dialogTop:d.getBoundingClientRect().top,dialogScroll:d.scrollTop,headerTop:h.getBoundingClientRect().top,scrimScroll:s.scrollTop}}));await page.screenshot({path:'.test-tmp/bracket-review-820.png',animations:'disabled'});
await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
await page.screenshot({path:'.test-tmp/bracket-review-mobile.png',animations:'disabled'});
await page.getByRole('button',{name:'Apply reviewed knockout bracket'}).click();
const w=await page.evaluate(()=>JSON.parse(localStorage.getItem('rallydesk-demo-v1')));const slots=w.tournaments[0].categories[0].bracketSlots;if(slots[7]!==ids[2]||slots[2]!==ids[7])throw Error('Saved bracket lost swap');
if(errors.length)throw Error(errors.join(' | '));console.log(JSON.stringify({loadingVisible:true,occupiedSlotsSwapped:true,reviewTableFits:true,mobileOverflow:false,saved:true,errors}));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});

