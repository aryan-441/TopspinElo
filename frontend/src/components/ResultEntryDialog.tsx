import { matchIncludesReferees } from '../services/refereeAvailability';
import { useState } from 'react';
import type { Match, Workspace } from '../types';
import { enterResult } from '../services/resultEntry';
import { Dialog } from './Dialog';

export function ResultEntryDialog({match,workspace,onClose,onSave}: {match:Match;workspace:Workspace;onClose:()=>void;onSave:(match:Match)=>void}) {
  const [detail,setDetail] = useState<'winner'|'match-score'|'game-scores'>('winner');
  const [input,setInput] = useState('');
  const [winner,setWinner] = useState('');
  const [reason,setReason] = useState('');
  const [fallback,setFallback] = useState(false);
  const [fallbackReason,setFallbackReason] = useState('');
  const needsReferee = matchIncludesReferees(match,workspace);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const one=match.sideOneId??match.playerOneId, two=match.sideTwoId??match.playerTwoId;
  const labels=[match.sideOneLabel??workspace.players.find(p=>p.id===match.playerOneId)?.name??'Side one',match.sideTwoLabel??workspace.players.find(p=>p.id===match.playerTwoId)?.name??'Side two'];
  const replacing=match.events.length>0 || match.status==='Completed';
  return <Dialog title="Record a result" eyebrow="ORGANISER RESULT ENTRY" onClose={onClose}>
    {needsReferee && <section className="settings-panel"><p>Assign this match from the Referees page. If officials are unavailable, record why you are entering the result yourself.</p><label className="feedback-switch"><input type="checkbox" checked={fallback} onChange={e=>setFallback(e.target.checked)}/> Referees unavailable?</label>{fallback && <label className="field expand-field"><span>Reason · saved in the activity journal</span><textarea value={fallbackReason} onChange={e=>setFallbackReason(e.target.value)}/></label>}</section>}
    <p>{labels[0]} vs {labels[1]} · {match.format}</p>
    <label className="field"><span>How much detail?</span><select aria-label="Result detail" value={detail} onChange={e=>{setDetail(e.target.value as typeof detail);setError('')}}><option value="winner">Just the winner</option><option value="match-score">Overall game score</option><option value="game-scores">Individual game scores</option></select></label>
    {detail==='winner'?<label className="field"><span>Winner</span><select aria-label="Winner" value={winner} onChange={e=>setWinner(e.target.value)}><option value="">Choose winner</option><option value={one}>{labels[0]}</option><option value={two}>{labels[1]}</option></select></label>:<label className="field"><span>{detail==='match-score'?'Games won · first side – second side':'Game scores · first side – second side'}</span><input value={input} onChange={e=>setInput(e.target.value)} placeholder={detail==='match-score'?match.gamesToWin+'-0':'11-3 11-7 11-5'}/></label>}
    <p>{match.goldenPoint ? `Golden point: first to ${match.pointsPerGame}, including ${match.pointsPerGame}-${match.pointsPerGame-1}.` : 'Deuce: win by two.'}</p><p>Match records update with any result. Eligible singles contribute to Elo. Game statistics need an overall score. Point totals need individual game scores. Service and pressure statistics need point-by-point scoring.</p>
    {replacing&&<label className="field"><span>Reason for replacing the current result or point history</span><textarea value={reason} onChange={e=>setReason(e.target.value)}/><small>The previous record remains in the change journal.</small></label>}
    {error&&<p role="alert" className="inline-message">{error}</p>}
    <div className="dialog-actions"><button className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving || (replacing&&!reason.trim()) || (needsReferee && (!fallback || !fallbackReason.trim()))} onClick={()=>{try{const result={...enterResult(match,detail,input,winner),organiserScoringReason:needsReferee?fallbackReason.trim():undefined,resultNote:[reason.trim(),needsReferee?"Organiser scoring · referees unavailable: "+fallbackReason.trim():"Organiser result entry"].filter(Boolean).join(" · ")};setSaving(true);requestAnimationFrame(()=>requestAnimationFrame(()=>onSave(result)))}catch(e){setError(e instanceof Error?e.message:'Could not save result')}}}>{saving?"Saving result…":"Save result"}</button></div>
  </Dialog>;
}
