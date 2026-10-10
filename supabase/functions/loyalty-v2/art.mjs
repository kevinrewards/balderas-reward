// Deterministic PNG artwork. No customer names, tokens, fonts or external fetches.
import {deflateSync} from 'node:zlib';
export function artOptions(values={}) {
  const number=(v,f,max)=>Number.isFinite(Number(v))?Math.max(0,Math.min(max,Math.floor(Number(v)))):f;
  const color=(v,f)=>/^#[a-f0-9]{6}$/i.test(v||'')?v.toLowerCase():f;
  const total=Math.max(1,number(values.total,10,100000));
  return {total,done:number(values.done,0,total),bg:color(values.bg,'#111112'),accent:color(values.accent,'#e1b85d'),icon:['star','camera','heart','coffee','gift'].includes(values.icon)?values.icon:'star'};
}
export function iconFor(symbol='') {
  if(/[📷📸]/u.test(symbol))return 'camera';
  if(/[❤♥💛💙💚💜]/u.test(symbol))return 'heart';
  if(/[☕]/u.test(symbol))return 'coffee';
  if(/[🎁]/u.test(symbol))return 'gift';
  return 'star';
}
export function renderArt(values={}) {
  const o=artOptions(values),w=1032,h=812;
  const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
  const bg=rgb(o.bg),accent=rgb(o.accent);
  // Maintain visible stamps even if the owner chooses equal foreground/background.
  const light=c=>c.reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  if(Math.abs(light(bg)-light(accent))<65)accent.splice(0,3,...(light(bg)>128?[25,25,25]:[245,245,245]));
  const muted=bg.map((v,i)=>Math.round(v*.68+accent[i]*.32));
  const pixels=new Uint8Array(w*h*3);
  for(let i=0;i<pixels.length;i+=3)pixels.set(bg,i);
  function rect(x,y,ww,hh,c){for(let yy=Math.max(0,Math.floor(y));yy<Math.min(h,y+hh);yy++)for(let xx=Math.max(0,Math.floor(x));xx<Math.min(w,x+ww);xx++)pixels.set(c,(yy*w+xx)*3);}
  function circle(x,y,r,c){for(let yy=Math.max(0,Math.floor(y-r));yy<Math.min(h,y+r);yy++){const span=Math.sqrt(Math.max(0,r*r-(yy-y)**2));rect(x-span,yy,span*2,1,c);}}
  function polygon(points,c){const low=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1])))),high=Math.min(h,Math.ceil(Math.max(...points.map(p=>p[1]))));for(let y=low;y<high;y++){const hits=[];for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y))hits.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}hits.sort((a,b)=>a-b);for(let i=0;i<hits.length;i+=2)rect(hits[i],y,hits[i+1]-hits[i],1,c);}}
  function stamp(x,y,r,done){
    const c=done?accent:muted;
    circle(x,y,r,c);circle(x,y,r-5,bg);
    const s=r*.55;
    if(o.icon==='camera'){rect(x-s,y-s*.6,s*2,s*1.3,c);rect(x-s*.55,y-s*.9,s*.8,s*.4,c);circle(x,y+s*.05,s*.45,bg);circle(x,y+s*.05,s*.3,c);}
    else if(o.icon==='heart'){circle(x-s*.37,y-s*.26,s*.52,c);circle(x+s*.37,y-s*.26,s*.52,c);polygon([[x-s*.85,y-s*.05],[x+s*.85,y-s*.05],[x,y+s]],c);}
    else if(o.icon==='coffee'){circle(x+s*.65,y-s*.1,s*.48,c);circle(x+s*.65,y-s*.1,s*.28,bg);rect(x-s,y-s*.6,s*1.5,s*1.2,c);rect(x-s*1.1,y+s*.8,s*2.2,5,c);}
    else if(o.icon==='gift'){rect(x-s,y-s*.45,s*2,s*1.45,c);rect(x-4,y-s*.45,8,s*1.45,bg);rect(x-s,y-s*.12,s*2,5,bg);circle(x-s*.25,y-s*.7,s*.28,c);circle(x+s*.25,y-s*.7,s*.28,c);}
    else {const points=Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,rr=i%2?s*.46:s;return[x+Math.cos(a)*rr,y+Math.sin(a)*rr];});polygon(points,c);}
  }
  if(o.total<=20){
    const cols=Math.min(o.total,5),rows=Math.ceil(o.total/cols),gapX=176,gapY=Math.min(225,600/rows),r=Math.min(64,gapY*.35);
    for(let i=0;i<o.total;i++){const row=Math.floor(i/cols),rowCount=Math.min(cols,o.total-row*cols);stamp(w/2+(i%cols-(rowCount-1)/2)*gapX,h/2+(row-(rows-1)/2)*gapY,r,i<o.done);}
  }else{
    // Large goals are shown as a bar; never imply that one stamp means one visit.
    rect(100,360,832,92,muted);rect(106,366,820,80,bg);rect(106,366,820*o.done/o.total,80,accent);
  }
  const scan=new Uint8Array((w*3+1)*h);for(let y=0;y<h;y++)scan.set(pixels.subarray(y*w*3,(y+1)*w*3),y*(w*3+1)+1);
  function chunk(type,data){const label=new TextEncoder().encode(type),out=new Uint8Array(data.length+12),dv=new DataView(out.buffer);dv.setUint32(0,data.length);out.set(label,4);out.set(data,8);let crc=0xffffffff;for(const byte of out.subarray(4,-4)){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}dv.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;}
  const header=new Uint8Array(13),dv=new DataView(header.buffer);dv.setUint32(0,w);dv.setUint32(4,h);header[8]=8;header[9]=2;
  const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',new Uint8Array())];
  const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;
}
