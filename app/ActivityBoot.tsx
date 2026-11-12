"use client";
// Runs only when Discord opens the site as an Activity (it adds ?frame_id=…&instance_id=… to the URL).
// Handshake with the Discord client, log in silently with the player's Discord account, then show the game.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const inDiscord = () => typeof window !== "undefined" && new URLSearchParams(location.search).has("frame_id");

export default function ActivityBoot({ clientId, signedIn }: { clientId: string; signedIn: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!inDiscord()) return;
    // Marks the page as embedded for CSS (e.g. no sign-in/out buttons; Discord already knows who you are).
    document.documentElement.dataset.activity = "1";
    let cancelled = false;
    (async () => {
      setState("loading");
      try {
        const { DiscordSDK } = await import("@discord/embedded-app-sdk");
        const sdk = new DiscordSDK(clientId);
        await sdk.ready();
        if (!signedIn) {
          const { code } = await sdk.commands.authorize({ client_id: clientId, response_type: "code", state: "", prompt: "none", scope: ["identify"] });
          const res = await fetch("/api/activity/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
          const body = (await res.json()) as { access_token?: string; error?: string };
          if (!res.ok || !body.access_token) throw new Error(body.error ?? "Login failed.");
          await sdk.commands.authenticate({ access_token: body.access_token });
        }
        if (cancelled) return;
        setState("idle");
        router.refresh(); // re-render server components with the new session cookie
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, signedIn, router]);

  if (state === "idle") return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-plum-950/95 p-6 text-center">
      <div className="flex max-w-xs flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny local asset on a loading screen */}
        <img src="/brand/mascot.png" alt="" width={96} height={96} className="fx-bob size-24 rounded-full ring-4 ring-gold-500/70" />
        {state === "loading" ? (
          <p className="font-semibold">Opening BunnyDex…</p>
        ) : (
          <>
            <p className="font-semibold text-red-300">Couldn&apos;t sign you in</p>
            <p className="text-sm text-plum-300">{error}</p>
            <button className="rounded-md bg-gold-500 px-4 py-2 font-semibold text-plum-950" onClick={() => location.reload()}>Try again</button>
          </>
        )}
      </div>
    </div>
  );
}
