# Hunt build-up video prompts (backup)

The hunt animation is coded today (bot: `huntClip` in `bot/fx.ts`; web: `HuntScene.tsx`). These prompts are a backup
for AI-generated build-up clips, e.g. to replace the purple mist on the web while it searches.

**Rule:** a video can't know which card was pulled, so it only builds up. The code always does the reveal (real card,
variant, rarity). Each clip ends on a bright flash in its rarity colour so the card can cut in.

## Specs for every clip

- 2–3 seconds, square 1:1, 1080×1080 (it's scaled down), 24–30 fps, no audio needed.
- No text, no logos, no bunny or card visible (the reveal shows the bunny).
- Locked-off camera or a slow push-in; nothing important at the edges.
- Last 0.3 s: a full-frame bright flash in the rarity colour (fades to white at the centre).
- **Best results:** attach `public/activity/bunnydex_background.png` and `public/brand/card-back.webp` as style references.
  Start the chat with: *"Match the art style and colour palette of the attached images exactly."*
- Save as `public/hunt/<tier>.mp4` (`common`, `rare`, `legendary`, `mythic`).
- For Discord, each must become a GIF of about 400 px and under 2 MB (needs ffmpeg).

Shared style (already in every prompt below): *glossy painterly fantasy collectible-card-game style, deep plum and
purple night meadow, soft gold accents, magical glowing particles, cinematic lighting, rich saturated colours.*

---

### 1. common.mp4 (common and uncommon)

Short square 1:1 video, 2.5 seconds, glossy painterly fantasy collectible-card-game style, deep plum and purple night
meadow, soft gold accents, magical glowing particles, cinematic lighting, rich saturated colours. A quiet moonlit
meadow of tall grass seen from ground level; a gentle breeze makes the grass sway and rustle in the centre of the
frame, and a few soft green fireflies drift up out of it. A faint green glimmer grows between the grass blades. The
camera pushes in slowly. In the last 0.3 seconds a soft green and white flash fills the frame from the centre.
No text, no logos, no animals, no characters, no cards.

### 2. rare.mp4 (rare and epic)

Short square 1:1 video, 2.5 seconds, glossy painterly fantasy collectible-card-game style, deep plum and purple night
meadow, soft gold accents, magical glowing particles, cinematic lighting, rich saturated colours. Tall grass in a
misty night meadow parts in the centre as a column of blue light rises from the ground, shifting to violet as it grows
brighter; blue and purple sparks spiral upward around it and the mist swirls outward. The camera pushes in slowly.
In the last 0.3 seconds a bright blue-violet and white flash fills the frame from the centre.
No text, no logos, no animals, no characters, no cards.

### 3. legendary.mp4 (legendary)

Short square 1:1 video, 3 seconds, glossy painterly fantasy collectible-card-game style, deep plum and purple night
meadow, soft gold accents, magical glowing particles, cinematic lighting, rich saturated colours. A massive pillar of
golden light bursts up from the centre of a misty night meadow into the sky, the ground trembles, golden rings of
light pulse outward along the grass and thousands of golden sparks and petals rise through the beam. The camera
shakes slightly as the light intensifies. In the last 0.3 seconds a blinding gold and white flash fills the frame.
No text, no logos, no animals, no characters, no cards.

### 4. mythic.mp4 (mythic and secret)

Short square 1:1 video, 3 seconds, glossy painterly fantasy collectible-card-game style, deep plum and purple night
meadow, soft gold accents, magical glowing particles, cinematic lighting, rich saturated colours. The night sky above
a misty meadow cracks open into a swirling portal of crimson light with shimmering rainbow edges; lightning arcs
around it, the grass flattens in a ring, and glowing red and rainbow shards spiral down into the centre. The camera
shakes as the portal widens. In the last 0.3 seconds a brilliant crimson, rainbow and white flash fills the frame.
No text, no logos, no animals, no characters, no cards.
