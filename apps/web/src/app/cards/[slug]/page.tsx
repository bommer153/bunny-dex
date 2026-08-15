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
  const src = card.imageUrl || `/cards/${card.slug}.png`;

  return (
    <article className="mx-auto grid max-w-3xl gap-6 md:grid-cols-[280px_1fr]">
      <div className="overflow-hidden rounded-2xl border border-meadow-700 bg-meadow-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={card.name} className="aspect-square w-full object-cover" />
      </div>
      <div className="space-y-3">
        <h1 className="font-display text-3xl text-meadow-400">{card.name}</h1>
        <p className="text-meadow-100/70">{card.description}</p>
        <p>
          {card.rarity} · {card.element} · set {card.setId}
        </p>
        <p>
          ATK {card.atk} · DEF {card.def} · HP {card.hp} · base {card.baseValue}
        </p>
      </div>
    </article>
  );
}
