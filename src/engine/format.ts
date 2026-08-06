// Helpers de formatação pt-BR.

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const WEEKDAYS = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado",
];

function toDate(iso: string): Date {
  return new Date(iso);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "19:05" */
export function timeHM(iso: string): string {
  const d = toDate(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "14 de março" */
export function dayLabel(iso: string): string {
  const d = toDate(iso);
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/** "sexta-feira, 14 de março" */
export function dayLabelFull(iso: string): string {
  const d = toDate(iso);
  return `${WEEKDAYS[d.getDay()]}, ${dayLabel(iso)}`;
}

/** "14/03/2025 19:05" — formato de protocolo para fichas e laudos. */
export function dateTimeLabel(iso: string): string {
  const d = toDate(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${timeHM(iso)}`;
}

/** "14/03/2025" — apenas a data. */
export function dateLabel(iso: string): string {
  const d = toDate(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "hoje" / "ontem" em relação ao agora real, senão "14 de março". */
export function relativeDay(iso: string, now: Date): string {
  const d = toDate(iso);
  if (sameDay(d, now)) return "hoje";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) return "ontem";
  return dayLabel(iso);
}

/** "mm:ss" (ou "h:mm:ss" acima de 1h) */
export function duration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(sec)}`;
  return `${pad2(m)}:${pad2(sec)}`;
}
