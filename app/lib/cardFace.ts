// Bump when the card picture's look changes (bot/grid.ts), so browsers drop their cached copies (cached for a day).
const REV = 3;

/** URL of the standard trading-card picture (app/api/card). Aspect 43:61; use `aspect-[43/61]` on its box. */
export const cardFace = (slug: string, variant = "normal") => `/api/card/${slug}?r=${REV}${variant !== "normal" ? `&v=${variant}` : ""}`;
