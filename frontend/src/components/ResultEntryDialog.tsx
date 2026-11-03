import { useState } from 'react';
import type { Match, Workspace } from '../types';
import { enterResult } from '../services/resultEntry';
import { Dialog } from './Dialog';

export function ResultEntryDialog({match,workspace,onClose,onSave}: {match:Match;workspace:Workspace;onClose:()=>void;onSave:(match:Match)=>void}) {
  const [detail,setDetail] = useState<'winner'|'match-score'|'game-scores'>('winner');
  const [input,setInput] = useState('');
  const [winner,setWinner] = useState('');
  const [reason,setReason] = useState('');
  const [error,setError] = useState('');
  const one=match.sideOneId??match.playerOneId, two=match.sideTwoId??match.playerTwoId;
  const labels=[match.sideOneLabel??workspace.players.find(p=>p.id===match.playerOneId)?.name??'Side one',match.sideTwoLabel??workspace.players.find(p=>p.id===match.playerTwoId)?.name??'Side two'];
  const replacing=match.events.length>0 || match.status==='Completed';
  return <Dialog title="Record a result" eyebrow="NO REFEREE REQUIRED" onClose={onClose}>
    <p>{labels[0]} vs {labels[1]} · {match.format}</p>
    <label className="field"><span>How much detail?</span><select aria-label="Result detail" value={detail} onChange={e=>{setDetail(e.target.value as typeof detail);setError('')}}><option value="winner">Just the winner</option><option value="match-score">Overall game score</option><option value="game-scores">Individual game scores</option></select></label>
    {detail==='winner'?<label className="field"><span>Winner</span><select aria-label="Winner" value={winner} onChange={e=>setWinner(e.target.value)}><option value="">Choose winner</option><option value={one}>{labels[0]}</option><option value={two}>{labels[1]}</option></select></label>:<label className="field"><span>{detail==='match-score'?'Games won · first side – second side':'Game scores · first side – second side'}</span><input value={input} onChange={e=>setInput(e.target.value)} placeholder={detail==='match-score'?match.gamesToWin+'-0':'11-3 11-7 11-5'}/></label>}
    <p>Wins and Elo update with any result. Game statistics need an overall score. Point totals need individual game scores. Service and pressure statistics need point-by-point scoring.</p>
    {replacing&&<label className="field"><span>Reason for replacing the current result or point history</span><textarea value={reason} onChange={e=>setReason(e.target.value)}/><small>The previous record remains in the change journal.</small></label>}
    {error&&<p role="alert" className="inline-message">{error}</p>}
    <div className="dialog-actions"><button className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={replacing&&!reason.trim()} onClick={()=>{try{onSave({...enterResult(match,detail,input,winner),resultNote:reason.trim()||undefined})}catch(e){setError(e instanceof Error?e.message:'Could not save result')}}}>Save result</button></div>
  </Dialog>;
}
