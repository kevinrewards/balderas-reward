import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
execFileSync('python',['-m','zipfile','-e','assets/wallet-emoji-v2.zip','.'],{cwd:fileURLToPath(new URL('..',import.meta.url))});
import {renderArt} from '../supabase/functions/loyalty-v2/art.mjs';
import {loadSymbols,symbolKeys} from '../supabase/functions/loyalty-v2/symbols.mjs';
const local=async url=>new Response(await readFile(new URL('../icons/wallet-emoji-v2/'+new URL(url).pathname.split('/').pop(),import.meta.url)));
test('Configured food and empty circle render real assets; holiday, custom and joined emoji work',async()=>{
 for(const icon of ['🍱','📷','🎄','🎃','❤️','🦄','👩🏽‍🍳','🍱🍣']){
  const values={icon,empty:'○',done:2,total:10};const sprites=await loadSymbols(values,local);
  assert.equal(sprites[icon].length,symbolKeys(icon).length);
  assert.notDeepEqual(renderArt({...values,sprites}),renderArt({icon:'★',empty:'○',done:2}));
  if(icon==='🍱')await writeFile('/workspace/scratch/6ea131dda486/wallet-food-v2.png',renderArt({...values,sprites}));
 }
});
test('Different pending symbol is preserved and unavailable graphics never silently become stars',async()=>{
 const values={icon:'🍱',empty:'📸',done:2,total:10};const sprites=await loadSymbols(values,local);
 assert(sprites['📸']);assert.notDeepEqual(renderArt({...values,sprites}),renderArt({...values,empty:'○',sprites}));
 await assert.rejects(loadSymbols({icon:'漢',done:1},async url=>{assert.match(url,/^https:\/\/balderas-reward.netlify.app\/icons\/wallet-emoji-v2\/[a-f0-9-]+\.bin$/);return new Response('',{status:404})}));
 assert.deepEqual(await loadSymbols({total:100,icon:'漢'},()=>{throw Error('should not fetch')}),{});
});

test('Business food and preset graphics work even when Netlify is unavailable',async()=>{
 const {loadSymbols:uncached}=await import('../supabase/functions/loyalty-v2/symbols.mjs?offline');
 for(const icon of ['🍱','📷','🎄','🎃','❤️','☕','🎁']){
  const values={icon,empty:'○',done:2,total:10};
  const sprites=await uncached(values,()=>{throw Error('Network unavailable')});
  assert(sprites[icon]);assert(renderArt({...values,sprites}).length>100);
 }
});
