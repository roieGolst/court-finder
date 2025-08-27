export function fmtDate(d) {
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

export function timesBetween(start, end, step) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const S = sh*60+sm, E = eh*60+em, out = [];
  for (let t=S; t<=E; t+=step) out.push(`${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`);
  return out;
}