import { ensureDb } from "@/lib/db";
import { CardCatalogService } from "@bunnydex/game";

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await ensureDb();
  const { slug } = await params;
  const card = await CardCatalogService.getBySlugOrId(slug);

  return (
    <article className="max-w-xl space-y-3 rounded-2xl border border-meadow-700 bg-meadow-900 p-6">
      <h1 className="font-display text-3xl text-meadow-400">{card.name}</h1>
      <p className="text-meadow-100/70">{card.description}</p>
      <p>
        {card.rarity} · {card.element} · set {card.setId}
      </p>
      <p>
        ATK {card.atk} · DEF {card.def} · HP {card.hp} · base {card.baseValue}
      </p>
    </article>
  );
}
