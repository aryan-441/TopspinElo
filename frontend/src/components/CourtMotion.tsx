import { useLayoutEffect, useRef, useState } from 'react';
import type { HTMLAttributes } from 'react';

export function RollingNumber({value}: {value:number}) {
  const previous = useRef(value);
  const digits = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const node = digits.current;
    if (!node) return;
    const distance = value > from ? '80%' : '-80%';
    const effect = node.animate([{transform:'translateY('+distance+')',opacity:.25},{transform:'translateY(0)',opacity:1}], {duration:240,easing:'ease-out'});
    return () => effect.cancel();
  },[value]);
  return <span className="roll-window"><span ref={digits}>{value}</span></span>;
}

export function SlidingTabs({children,...props}:HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [line,setLine] = useState({left:0,width:0});
  useLayoutEffect(()=>{
    const host=ref.current;
    const selected=host?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!host || !selected) return;
    function measure() {
      const next={left:selected!.offsetLeft,width:selected!.offsetWidth};
      setLine(old=>old.left===next.left && old.width===next.width?old:next);
    }
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(host);
    for (const tab of host.querySelectorAll('button')) observer.observe(tab);
    return ()=>observer.disconnect();
  },[children]);
  return <div {...props} ref={ref}>{children}<i aria-hidden="true" className="sliding-line" style={{width:line.width,transform:'translateX('+line.left+'px)'}}/></div>;
}

export function animateSwap(first:number, second:number, names:string[]) {
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const controls=[first,second].map(slot=>document.querySelector<HTMLSelectElement>('[aria-label="Player in slot '+(slot+1)+'"]'));
  if (!controls[0] || !controls[1]) return;
  const boxes=controls.map(el=>el!.getBoundingClientRect());
  controls.forEach((_,i)=>{
    const box=boxes[i], to=boxes[1-i];
    const ghost=document.createElement('span');
    ghost.className='swap-flight';
    ghost.setAttribute('aria-hidden','true');
    ghost.textContent=names[i];
    Object.assign(ghost.style,{top:box.top+'px',left:box.left+'px',width:box.width+'px'});
    document.body.append(ghost);
    const flight=ghost.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY('+(to.top-box.top)+'px)',opacity:.4}],{duration:380,easing:'cubic-bezier(.2,.75,.3,1)'});
    flight.finished.then(()=>ghost.remove(),()=>ghost.remove());
  });
}
