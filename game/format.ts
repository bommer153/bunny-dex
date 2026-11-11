// Formatting helpers with no Node imports, so browser components can use them too.

/** "1h 30m", "45s", "2d 3h". */
export function formatDuration(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, !d && !h && sec && `${sec}s`].filter(Boolean).join(" ") || "0s";
}
