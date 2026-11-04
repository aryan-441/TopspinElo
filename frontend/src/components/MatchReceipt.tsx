import { useEffect, useRef, useState } from 'react';
import { Check, Trophy } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Workspace } from '../types';
import { resolveTeamTie } from '../services/store';

export function MatchReceipt({workspace}:{workspace:Workspace}) {
  const before=useRef(workspace);
  const [notice,setNotice]=useState<{id:string;label:string;name:string;destination:string;champion:boolean}|null>(null);
  useEffect(()=>{
    const last=before.current;
    before.current=workspace;
    const priorMatches = new Map(last.matches.map(match => [match.id, match]));
    const saved=workspace.matches.find(match => {
      const old = priorMatches.get(match.id);
      return old && match.status === 'Completed' && match.winnerId &&
        (old.status !== 'Completed' || old.winnerId !== match.winnerId || old.resultNote !== match.resultNote);
    });
    if(!saved) return;
    const category=workspace.tournaments.find(t=>t.id===saved.tournamentId)?.categories.find(c=>c.id===saved.categoryId);
    const rows=workspace.matches.filter(m=>m.categoryId===saved.categoryId && m.tournamentId===saved.tournamentId);
    const winner=saved.teamTieId ? resolveTeamTie(rows.filter(m=>m.teamTieId===saved.teamTieId),category?.teamSystem??'new_swaythling').winnerId : saved.winnerId;
    const next=rows.find(m=>!priorMatches.has(m.id) && (m.sideOneId===winner || m.sideTwoId===winner));
    const finalRound=Number(saved.round?.match(/Round\s+(\d+)/i)?.[1]);
    const champion=Boolean(winner && category?.format==='Knockout' && finalRound===Math.max(1,Math.ceil(Math.log2(category.entries.length))));
    const entry=category?.entries.find(e=>e.id===winner);
    const name=entry?.name || (entry?.playerIds??[]).map(id=>workspace.players.find(p=>p.id===id)?.name).filter(Boolean).join(' & ') || (winner===saved.sideOneId?saved.sideOneLabel:saved.sideTwoLabel) || workspace.players.find(p=>p.id===winner)?.name || '';
    setNotice({id:crypto.randomUUID(),label:champion?'Champion · '+category?.name:next?'Through to the next round':'Result saved',name,destination:next?.round??'',champion});
  },[workspace]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),4800);return ()=>clearTimeout(timer)},[notice]);
  return notice && createPortal(<aside key={notice.id} className="match-receipt" role="status">
    {notice.champion?<Trophy className="draw-trophy"/>:<Check/>}<div><small>{notice.label}</small><strong>{notice.name}</strong></div>
    {notice.destination && <><i className="advance-path"/><div className="advance-name"><small>{notice.destination}</small><b>{notice.name}</b></div></>}
  </aside>,document.body);
}
