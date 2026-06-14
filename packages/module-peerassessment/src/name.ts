/**
 * Split a name into { firstName, lastName }. Prefers "Last, First" (Canvas sortable_name);
 * falls back to "First ... Last" for plain display names. Returns blanks for empty input.
 */
export function splitName(raw: string): { firstName: string; lastName: string } {
  const s = (raw ?? '').trim();
  if (!s) return { firstName: '', lastName: '' };
  if (s.includes(',')) {
    const [last, first] = s.split(',', 2);
    return { firstName: first.trim(), lastName: last.trim() };
  }
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}
