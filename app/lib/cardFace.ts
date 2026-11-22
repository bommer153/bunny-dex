/** URL of the standard trading-card picture (app/api/card). Aspect 43:61; use `aspect-[43/61]` on its box. */
export const cardFace = (slug: string, variant = "normal") => `/api/card/${slug}${variant !== "normal" ? `?v=${variant}` : ""}`;
