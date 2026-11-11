// If Discord refuses an upload (no Attach Files permission, file too large), resend the same reply without media.
// Clips and card art are decoration: the embed text always carries the full result.
import type { Reply } from "./commands";

export const MEDIA_ERRORS = new Set([50013, 40005]); // Missing Permissions, Request entity too large

export function withoutMedia(r: Reply): Reply {
  const embeds = r.embeds?.map((e) => {
    const data = { ...("toJSON" in e ? e.toJSON() : e) };
    if (data.image?.url.startsWith("attachment://")) delete data.image;
    if (data.thumbnail?.url.startsWith("attachment://")) delete data.thumbnail;
    return data;
  });
  return { ...r, embeds, files: [] };
}

export async function tryMedia<T>(r: Reply, send: (r: Reply) => Promise<T>) {
  try {
    return await send(r);
  } catch (e) {
    if (r.files?.length && MEDIA_ERRORS.has((e as { code?: number }).code ?? 0)) return send(withoutMedia(r));
    throw e;
  }
}
