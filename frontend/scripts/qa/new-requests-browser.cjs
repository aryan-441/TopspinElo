const {chromium}=require(process.env.RALLYDESK_PLAYWRIGHT_PATH || 'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.RALLYDESK_BROWSER_EXECUTABLE,headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/palettes.html');
 await page.getByRole('button',{name:'Choose Sapphire & Jade',exact:true}).click();
 if(!(await page.locator('#selection').textContent()).includes('Sapphire'))throw Error('Palette selection failed');
 await page.getByRole('button',{name:'Record result →',exact:true}).first().click();
 await page.getByText('✓ Result saved · your record is up to date',{exact:true}).waitFor();
 await page.screenshot({path:'.test-tmp/palettes-desktop.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Palette mobile overflow');
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('http://127.0.0.1:5173/?demo');
 await page.getByRole('button',{name:'Matches',exact:true}).click();
 await page.getByRole('button',{name:'Enter result',exact:true}).last().click();
 console.log(await page.getByRole('dialog').innerText()); await page.getByRole('dialog').locator('select').nth(1).selectOption({index:1});
 await page.getByRole('button',{name:'Save result',exact:true}).click();
 await page.getByText('Winner recorded',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Tournaments',exact:true}).click();
 await page.getByRole('button',{name:'Create tournament',exact:false}).first().click().catch(async()=>{await page.getByRole('button',{name:'New tournament',exact:false}).first().click()});
 await page.getByText('INCLUDE REFEREES',{exact:true}).waitFor();
 const box=page.getByRole('checkbox',{name:/INCLUDE REFEREES/});
 if(await box.isChecked())throw Error('Referees should default to optional');
 await box.check();
 console.log(JSON.stringify({errors,resultEntry:'passed',refereeOption:'passed',paletteSelection:'passed',mobileOverflow:false}));
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

