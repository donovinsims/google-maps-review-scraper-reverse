import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { parseRunOptions } from '../src/core/config.js';
import { launchBatchCollector } from '../src/collector/batch.js';
import { scrapePlaceReviews } from '../src/collector/place-reviews.js';
import { SELECTORS } from '../src/collector/selectors.js';
import { redact } from '../src/core/redact.js';
const program=new Command();
program.argument('<url>').option('--profile <name>','local profile').option('--no-profile','anonymous capture').option('--language <code>','language','en').option('--limit <n>','maximum reviews','30').option('--sort <mode>','sort mode','newest').action(async(url,opts)=>{
  const config=parseRunOptions({...opts,headless:false,delayMs:[0,0]});
  const captured=[];
  await launchBatchCollector([{url,idx:0}],config,async result=>{console.log(`Capture ended: ${result.termination.reason}`);return {status:'done'};},async()=>{},{scrapePlaceReviews:async(page,input,progress)=>{
    const result=await scrapePlaceReviews(page,input,progress);
    const fixture=await page.evaluate(({selectors})=>{
      const cards=[...document.querySelectorAll(selectors.card)].map(card=>{
        const clone=card.cloneNode(true);
        for(const node of clone.querySelectorAll('[data-reviewer-name],.d4r55'))node.textContent='[REDACTED AUTHOR]';
        for(const node of clone.querySelectorAll('button[data-href*="contrib/"],a[href*="contrib/"]')){
          if(!node.querySelector('.d4r55,[data-reviewer-name]'))node.textContent='[REDACTED AUTHOR]';
          if(node.hasAttribute('data-href'))node.setAttribute('data-href','https://www.google.com/maps/contrib/REDACTED');
          if(node.hasAttribute('href'))node.setAttribute('href','https://www.google.com/maps/contrib/REDACTED');
          if(node.hasAttribute('aria-label'))node.setAttribute('aria-label','[REDACTED AUTHOR]');
        }
        for(const node of clone.querySelectorAll('img')){node.removeAttribute('src');node.removeAttribute('srcset');node.setAttribute('alt','');}
        for(const node of clone.querySelectorAll('script,input,textarea'))node.remove();
        return clone.outerHTML;
      });
      const snippets=[...document.querySelectorAll(selectors.reviewsTab+','+selectors.sortButton+',[role="menuitemradio"]')].map(n=>n.outerHTML);
      return {cards,snippets};
    },{selectors:SELECTORS});
    if(!fixture.cards.length)throw new Error(`No cards captured (${result.termination.reason}); no fixture written`);
    const dir=path.resolve('tests/fixtures/live'),stamp=new Date().toISOString().replace(/[:.]/g,'-');await fs.mkdir(dir,{recursive:true});
    const filename=path.join(dir,`reviews-${config.language}-${stamp}.html`);await fs.writeFile(filename,redact([...fixture.snippets,...fixture.cards].join('\n')));
    await fs.writeFile(filename+'.json',JSON.stringify({capturedAt:new Date().toISOString(),sourceUrl:result.place.url,language:config.language,termination:result.termination,cardCount:fixture.cards.length},null,2));captured.push(filename);return result;
  }});
  for(const filename of captured)console.log(`Saved scrubbed live fixture: ${filename}`);
});
program.parseAsync().catch(error=>{console.error(redact(error.message));process.exitCode=1;});
