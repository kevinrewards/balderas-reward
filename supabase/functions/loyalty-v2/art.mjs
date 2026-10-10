// Deterministic PNG artwork. No customer names, tokens, fonts or external fetches.
import {deflateSync} from 'node:zlib';
export function artOptions(values={}) {
  const number=(v,f,max)=>Number.isFinite(Number(v))?Math.max(0,Math.min(max,Math.floor(Number(v)))):f;
  const color=(v,f)=>/^#[a-f0-9]{6}$/i.test(v||'')?v.toLowerCase():f;
  const total=Math.max(1,number(values.total,10,100000));
  return {total,done:number(values.done,0,total),bg:color(values.bg,'#111112'),accent:color(values.accent,'#e1b85d'),icon:iconFor(values.icon),empty:iconFor(values.empty||'☆')};
}
export function iconFor(symbol='') {
  const aliases={star:'★',camera:'📷',heart:'❤️',coffee:'☕',gift:'🎁'};
  return aliases[symbol]||String(symbol||'★').trim().slice(0,16)||'★';
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
    const symbol=done?o.icon:o.empty,c=done?accent:muted;
    const parts=values.sprites?.[symbol];
    if(parts){
      const size=Math.min(r*2, r*2.5/parts.length),left=x-size*parts.length/2;
      for(let n=0;n<parts.length;n++){
        const sprite=parts[n];
        for(let yy=0;yy<size;yy++)for(let xx=0;xx<size;xx++){
          const sx=Math.max(0,Math.min(47,(xx+.5)*48/size-.5)),sy=Math.max(0,Math.min(47,(yy+.5)*48/size-.5));
          const x0=Math.floor(sx),y0=Math.floor(sy),dx=sx-x0,dy=sy-y0;
          const sample=ch=>sprite[(y0*48+x0)*4+ch]*(1-dx)*(1-dy)+sprite[(y0*48+Math.min(47,x0+1))*4+ch]*dx*(1-dy)+sprite[(Math.min(47,y0+1)*48+x0)*4+ch]*(1-dx)*dy+sprite[(Math.min(47,y0+1)*48+Math.min(47,x0+1))*4+ch]*dx*dy;
          const px=Math.floor(left+n*size+xx),py=Math.floor(y-size/2+yy);
          if(px<0||py<0||px>=w||py>=h)continue;
          const dest=(py*w+px)*3,alpha=sample(3)/255;
          for(let ch=0;ch<3;ch++)pixels[dest+ch]=Math.round(sample(ch)*alpha+pixels[dest+ch]*(1-alpha));
        }
      }
    }else if(['○','●','◯','〇','⚪','⚫'].includes(symbol)){
      circle(x,y,r*.78,c);if(!['●','⚫'].includes(symbol))circle(x,y,r*.78-4,bg);
    }else if(['★','☆'].includes(symbol)){
      const star=(radius,color)=>polygon(Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,rr=i%2?radius*.46:radius;return[x+Math.cos(a)*rr,y+Math.sin(a)*rr];}),color);
      star(r,c);if(symbol==='☆')star(r-8,bg);
    }else throw new Error('Falta la imagen del símbolo de recompensas.');

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
