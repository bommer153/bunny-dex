type WikiCardArtProps = {
  slug: string;
  name: string;
  href?: string;
  caption?: string;
};

export function WikiCardArt({ slug, name, href, caption }: WikiCardArtProps) {
  const inner = (
    <>
      <div className="aspect-square bg-meadow-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/cards/${slug}.png`} alt={name} className="h-full w-full object-cover" />
      </div>
      <p className="px-2 py-2 text-center text-xs text-meadow-400">{caption ?? name}</p>
    </>
  );

  const className =
    "overflow-hidden rounded-2xl border border-meadow-700 bg-meadow-900/60 transition hover:border-meadow-400";

  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }

  return <div className={className}>{inner}</div>;
}

export function WikiCardStrip({
  slugs,
}: {
  slugs: Array<{ slug: string; name: string }>;
}) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {slugs.map((card) => (
        <WikiCardArt
          key={card.slug}
          slug={card.slug}
          name={card.name}
          href={`/cards/${card.slug}`}
        />
      ))}
    </section>
  );
}
