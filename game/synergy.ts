// Team synergy math, kept free of Node imports so the web deck builder can preview it live in the browser.
import { ELEMENTS, type CardDef } from "./data/cards";
import { CONFIG, TRAITS } from "./config";

/** Team-wide bonuses: same element ×2 +5% / ×3 +12% (those cards), a full team from one set +8%, each light card blesses the other lanes +4%. */
export function teamBonus(team: ({ def: CardDef } | undefined)[]) {
  const mult = team.map(() => 1);
  const notes: string[] = [];
  for (const el of ELEMENTS) {
    const n = team.filter((f) => f?.def.element === el).length;
    const b = n >= 3 ? 0.12 : n === 2 ? 0.05 : 0;
    if (!b) continue;
    team.forEach((f, i) => { if (f?.def.element === el) mult[i] += b; });
    notes.push(`${TRAITS[el].name.split(" ")[0]}×${n} +${Math.round(b * 100)}%`);
  }
  const set = team[0]?.def.setId;
  if (team.length >= CONFIG.teamSize && team.every((f) => f && f.def.setId === set)) {
    mult.forEach((_, i) => (mult[i] += 0.08));
    notes.push(`📦 ${set} set +8%`);
  }
  team.forEach((f, j) => {
    if (f?.def.element !== "light") return;
    team.forEach((g, i) => { if (g && i !== j) mult[i] += 0.04; });
  });
  const lights = team.filter((f) => f?.def.element === "light").length;
  if (lights) notes.push(`✨×${lights} other lanes +${lights * 4}%`);
  return { mult, notes };
}
