export function formatDurationMs(valueMs: number | null): string {
  if (valueMs === null) return "--:--";
  const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatDurationSec(valueSec: number | null): string {
  if (valueSec === null) return "—";
  const minutes = Math.floor(valueSec / 60);
  const seconds = valueSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
