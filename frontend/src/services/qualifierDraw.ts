import type { CategoryEntry, TournamentGroup } from '../types';
export function qualifierDraw(qualifiers: {entry: CategoryEntry; place: number}[], groups: TournamentGroup[], perGroup: number) {
  const ordered = [...qualifiers];
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  const bracketSize = 2 ** Math.ceil(Math.log2(ordered.length));
  const slots: (string | null)[] = [];
  const winners = ordered.filter(q => q.place === 1);
  if (perGroup === 2 && winners.length * 2 === ordered.length) {
    const offset = 1 + Math.floor(Math.random() * (winners.length - 1));
    winners.forEach((winner, i) => {
      const otherWinner = winners[(i + offset) % winners.length];
      const group = groups.find(g => g.entryIds.includes(otherWinner.entry.id))!;
      const runner = ordered.find(q => q.place === 2 && group.entryIds.includes(q.entry.id))!;
      slots.push(winner.entry.id, runner.entry.id);
    });
  } else slots.push(...ordered.map(q => q.entry.id));
  const bracketSlots: (string | null)[] = [];
  const splitPairs = (bracketSize - slots.length) / 2;
  if (slots.length % 2) bracketSlots.push(slots.shift()!, null);
  for (let i = 0; i < slots.length; i += 2) {
    if (i / 2 < Math.floor(splitPairs)) bracketSlots.push(slots[i], null, slots[i+1], null);
    else bracketSlots.push(slots[i], slots[i+1]);
  }
  return { ordered, bracketSlots };
}
