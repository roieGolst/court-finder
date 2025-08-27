export function parseAvailability(text) {
  if (text.includes("לא נמצאו מגרשים פנויים")) return { count: 0, numbers: [] };
  let count = 0;
  const m = text.match(/נמצאו\s+(\d+)\s+מגרש(?:ים)?\s+פנוי(?:ים)?/);
  if (m) count = parseInt(m[1], 10);
  else if (/נמצא\s+מגרש\s+פנוי/.test(text)) count = 1;
  const numbers = Array.from(text.matchAll(/מגרש:\s*(\d+)/g)).map(x => Number(x[1]));
  if (!count && numbers.length) count = numbers.length;
  return { count, numbers };
}