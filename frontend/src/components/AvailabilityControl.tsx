import { useState } from 'react';
import type { Referee, Workspace } from '../types';
import { refereeAvailability } from '../services/refereeAvailability';

export function AvailabilityControl({ referee, workspace, onChange }: {
  referee: Referee; workspace: Workspace; onChange: (workspace: Workspace) => void;
}) {
  const [reason, setReason] = useState('');
  function change(away: boolean) {
    onChange({ ...workspace, referees: workspace.referees.map(item => item.id === referee.id
      ? { ...item, unavailableReason: away ? reason.trim() || 'Marked busy' : undefined } : item) });
    setReason('');
  }
  return <div className="availability-control">
    <strong role="status">{refereeAvailability(referee, workspace)}</strong>
    {referee.unavailableReason
      ? <button className="button button-outline" onClick={() => change(false)}>I am back</button>
      : <><input aria-label={'Busy reason for ' + referee.name} placeholder="e.g. Taking a break" value={reason} onChange={e => setReason(e.target.value)} />
        <button className="button button-outline" onClick={() => change(true)}>Mark myself busy</button></>}
  </div>;
}
