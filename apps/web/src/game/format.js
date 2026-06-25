/* Formátování velkých čísel a času. */
const UNITS = [
  'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd',
  'Td', 'Qd', 'Qt', 'Sd', 'St', 'Od', 'Nd', 'Vg',
];

export function fmt(n) {
  if (!isFinite(n)) return '∞';
  n = Math.floor(n);
  if (n < 1000) return '' + n;
  let i = -1;
  let x = n;
  while (x >= 1000 && i < UNITS.length - 1) { x /= 1000; i++; }
  if (x >= 1000) return n.toExponential(2).replace('e+', 'e');
  return x.toFixed(x < 10 ? 2 : x < 100 ? 1 : 0) + UNITS[i];
}

export function fmtDuration(s) {
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${sec} s`;
  return `${sec} s`;
}
