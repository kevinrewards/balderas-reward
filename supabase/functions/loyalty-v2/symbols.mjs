// Twemoji assets are published with this site, never fetched from a user-provided URL.
import {inflateSync} from 'node:zlib';
import {artOptions} from './art.mjs';
const builtin=new Set(['★','☆','○','●','◯','〇','⚪','⚫']);
const cache=new Map();
export function symbolKeys(symbol){
 return [...new Intl.Segmenter('es',{granularity:'grapheme'}).segment(symbol)].map(({segment})=>{
   const value=segment.includes('\u200d')?segment:segment.replace(/\ufe0f/g,'');
   return [...value].map(c=>c.codePointAt(0).toString(16)).join('-');
 });
}
export async function loadSymbols(values={},fetchAsset=fetch){
 const options=artOptions(values),sprites={};
 if(options.total>20)return sprites;
 const symbols=[...(options.done>0?[options.icon]:[]),...(options.done<options.total?[options.empty]:[])];
 for(const symbol of new Set(symbols)){
   if(builtin.has(symbol))continue;
   sprites[symbol]=await Promise.all(symbolKeys(symbol).map(async key=>{
     if(cache.has(key))return cache.get(key);
     const url='https://balderas-reward.netlify.app/icons/wallet-emoji-v2/'+key+'.bin';
     const result=await fetchAsset(url,{signal:AbortSignal.timeout(8000),redirect:'error'});
     if(!result.ok)throw new Error('No se pudo cargar el símbolo de recompensas. Publica los recursos Wallet v2 en Netlify.');
     const packed=new Uint8Array(await result.arrayBuffer());
     if(packed.length>20000)throw new Error('Imagen de símbolo inválida.');
     const pixels=new Uint8Array(inflateSync(packed,{maxOutputLength:48*48*4}));
     if(pixels.length!==48*48*4)throw new Error('Imagen de símbolo inválida.');
     if(cache.size>=128)cache.delete(cache.keys().next().value);
     cache.set(key,pixels);return pixels;
   }));
 }
 return sprites;
}
