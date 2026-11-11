"use client";
// Battle: your team waits at the bottom. Fight → face-down opponents slide in while the server resolves the battle,
// then flip up and each lane replays the confirmed result: lunge, impact, power numbers, loser recoils. Skippable.
import { useEffect, useRef, useState } from "react";
import type { Rarity } from "@/game/data/cards";
import { RARITY_EMOJI } from "@/game/config";
import { battlePlay } from "../actions";
import { ease, type CardMesh, type Stage } from "../fx/stage";
import { useStage } from "../fx/useStage";
import StageFrame from "../hud/StageFrame";
import { useConfirmed, useLock } from "../fx/useConfirmed";
import { button, ghostButton, panel } from "../components";

export type TeamCard = { code: string; slug: string; name: string; rarity: Rarity; level: number; variant: string; atk: number; def: number; hp: number };
type Result = Extract<Awaited<ReturnType<typeof battlePlay>>, { ok: true }>["data"];
type Lane = Result["lanes"][number];
type Phase = "idle" | "pending" | "replay" | "done" | "error";

const LANE_X = (i: number) => (i - 1) * 2.1;
const A_Y = -1.75, B_Y = 1.75, CARD_W = 1.3;

function laneText(l: Lane, i: number, foe: string) {
  const side = (f: Lane["a"], p: number) => (f ? `${RARITY_EMOJI[f.rarity]} ${f.name} Lv${f.level} (${p})` : "empty");
  const verdict = l.winner === "a" ? "✅ won" : l.winner === "b" ? "❌ lost" : "🤝 draw";
  return `Lane ${i + 1}: ${side(l.a, l.pa)} vs ${foe}'s ${side(l.b, l.pb)}, ${verdict}`;
}

export default function BattleScene({ team, energy, cost }: { team: TeamCard[]; energy: number; cost: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stage, failed } = useStage(canvasRef, 9);
  const fight = useConfirmed(battlePlay);
  const lock = useLock();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");
  const mine = useRef<(CardMesh | null)[]>([]);
  const foes = useRef<(CardMesh | null)[]>([]);
  const teamKey = team.map((t) => t.code).join(",");

  const clearFoes = () => { foes.current.forEach((c) => c?.dispose()); foes.current = []; };
  const placeMine = (s: Stage, cards: (Pick<TeamCard, "slug" | "rarity" | "variant"> | null)[]) => {
    mine.current.forEach((c) => c?.dispose());
    mine.current = cards.map((t, i) => {
      if (!t) return null;
      const c = s.card(t.slug, t.rarity, t.variant, CARD_W);
      c.root.position.set(LANE_X(i), A_Y, 0);
      return c;
    });
  };

  // Your team slides up into place (again whenever the deck changes).
  useEffect(() => {
    if (!stage) return;
    placeMine(stage, team.slice(0, 3));
    mine.current.forEach((c, i) => {
      if (!c) return;
      c.root.position.y = A_Y - 4;
      void stage.wait(i * 120).then(() => stage.tween(500, (k) => { c.root.position.y = A_Y - 4 * (1 - k); }, ease.back));
    });
    stage.render();
    return () => { clearFoes(); mine.current.forEach((c) => c?.dispose()); mine.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when the deck itself changes
  }, [stage, teamKey]);

  async function start() {
    if (phase === "pending" || phase === "replay") return;
    setError("");
    setLog([]);
    setResult(null);
    setPhase("pending");
    let bob: (() => void) | null = null;
    if (stage) {
      stage.resume();
      clearFoes();
      placeMine(stage, team.slice(0, 3));
      // Neutral: three face-down cards slide in and hover while the server picks an opponent.
      foes.current = [0, 1, 2].map((i) => {
        const c = stage.card("meadow-hop", "common", "normal", CARD_W);
        c.root.rotation.y = Math.PI;
        c.root.position.set(LANE_X(i), B_Y + 4, 0);
        void stage.tween(450 + i * 100, (k) => { c.root.position.y = B_Y + 4 * (1 - k); }, ease.out);
        return c;
      });
      const release = stage.hold();
      let t = 0;
      const obs = stage.scene.onBeforeRenderObservable.add(() => {
        t += stage.engine.getDeltaTime() / 1000;
        foes.current.forEach((c, i) => c && t > 0.6 && (c.root.position.y = B_Y + Math.sin(t * 3 + i) * 0.08));
      });
      bob = () => { stage.scene.onBeforeRenderObservable.remove(obs); release(); };
    }
    const [r] = await Promise.all([fight(), new Promise((res) => setTimeout(res, stage?.reduced ? 0 : 800))]);
    bob?.();
    if (!r) return;
    if (!r.ok) {
      clearFoes();
      setError(r.error);
      setPhase("error");
      return;
    }
    setResult(r.data);
    setPhase("replay");
    await replay(r.data);
    setPhase((p) => (p === "replay" ? "done" : p));
  }

  async function replay(res: Result) {
    const s = stage;
    if (!s) { setLog(res.lanes.map((l, i) => laneText(l, i, res.opponent))); return; }
    // The confirmed lanes are the source of truth: rebuild both sides from them.
    placeMine(s, res.lanes.map((l) => l.a));
    clearFoes();
    foes.current = res.lanes.map((l, i) => {
      if (!l.b) return null;
      const c = s.card(l.b.slug, l.b.rarity, l.b.variant, CARD_W);
      c.root.position.set(LANE_X(i), B_Y, 0);
      c.root.rotation.y = Math.PI;
      return c;
    });
    await Promise.all(foes.current.map((c, i) => c && s.wait(i * 90).then(() => s.tween(420, (k) => { c.root.rotation.y = Math.PI * (1 - k); }, ease.inOut))));

    for (const [i, l] of res.lanes.entries()) {
      if (s.disposed || s.skipping) return; // Skip already drew the final board and full log
      const a = mine.current[i], b = foes.current[i];
      const x = LANE_X(i);
      // Lunge toward the middle.
      await s.tween(230, (k) => {
        if (a) a.root.position.y = A_Y + 1.15 * k;
        if (b) b.root.position.y = B_Y - 1.15 * k;
      }, ease.in);
      const impact = new s.B.Vector3(x, 0, -0.3);
      s.particles({ count: 70, rgb: l.winner === "b" ? [1, 0.4, 0.4] : l.winner === "a" ? [1, 0.85, 0.35] : [0.8, 0.8, 0.9], at: impact, radius: 0.15, power: [2, 4.5], size: [0.03, 0.14], life: [0.3, 0.7], gravity: -3 });
      void s.shake(220, 0.18);
      const diff = Math.abs(l.pa - l.pb);
      if (l.winner === "a") {
        void s.floatText(`${l.pa}`, new s.B.Vector3(x, A_Y + 1.5, -0.5), "#facc15");
        if (b) void s.floatText(`-${diff}`, new s.B.Vector3(x, B_Y + 0.3, -0.5), "#f87171");
      } else if (l.winner === "b") {
        void s.floatText(`${l.pb}`, new s.B.Vector3(x, B_Y - 1.5, -0.5), "#facc15");
        if (a) void s.floatText(`-${diff}`, new s.B.Vector3(x, A_Y - 0.3, -0.5), "#f87171");
      } else {
        void s.floatText("DRAW", new s.B.Vector3(x, 0.6, -0.5), "#d4d4d8");
      }
      // Winner returns to its spot, loser is knocked back and dims.
      await s.tween(380, (k) => {
        if (a) {
          const lost = l.winner !== "a";
          a.root.position.y = A_Y + 1.15 * (1 - k) - (lost ? 0.35 * k : 0);
          a.root.rotation.z = lost ? 0.25 * k : 0;
          if (lost) a.dim(1 - 0.6 * k);
        }
        if (b) {
          const lost = l.winner !== "b";
          b.root.position.y = B_Y - 1.15 * (1 - k) + (lost ? 0.35 * k : 0);
          b.root.rotation.z = lost ? -0.25 * k : 0;
          if (lost) b.dim(1 - 0.6 * k);
        }
      }, ease.out);
      if (s.skipping) return;
      setLog((prev) => [...prev, laneText(l, i, res.opponent)]);
      await s.wait(180);
    }
    if (res.winner === "a") mine.current.forEach((c) => c && s.particles({ count: 40, rgb: [1, 0.85, 0.35], at: c.root.position.clone(), radius: 0.4, power: [1, 2.5], size: [0.03, 0.1], gravity: 1 }));
  }

  function skip() {
    if (!result) return;
    stage?.skip();
    // Final board: everything resolved, losers dimmed, full log.
    result.lanes.forEach((l, i) => {
      const a = mine.current[i], b = foes.current[i];
      if (a) { a.root.position.y = A_Y - (l.winner !== "a" ? 0.35 : 0); a.root.rotation.z = l.winner !== "a" ? 0.25 : 0; a.dim(l.winner !== "a" ? 0.4 : 1); }
      if (b) { b.root.rotation.y = 0; b.root.position.y = B_Y + (l.winner !== "b" ? 0.35 : 0); b.root.rotation.z = l.winner !== "b" ? -0.25 : 0; b.dim(l.winner !== "b" ? 0.4 : 1); }
    });
    stage?.render();
    setLog(result.lanes.map((l, i) => laneText(l, i, result.opponent)));
    setPhase("done");
  }

  const banner = result && phase === "done"
    ? result.winner === "a" ? { t: `🏆 Victory vs ${result.opponent}!`, c: "text-goldfoil" }
      : result.winner === "b" ? { t: `✕ Defeat vs ${result.opponent}`, c: "text-red-300" } : { t: `= Draw with ${result.opponent}`, c: "text-plum-200" }
    : null;
  const enough = energy >= cost;

  // One framed column per lane: your card vs theirs with the existing combat stats; fills in as lanes resolve.
  const lanes = [0, 1, 2].map((i) => {
    const l = result?.lanes[i];
    const mineCard = l ? l.a : team[i] ? { ...team[i] } : null;
    const resolved = !!l && log.length > i;
    return { i, mineCard, foe: l && resolved ? l.b : null, l, resolved };
  });
  const side = (c: { name: string; level: number; atk: number; def: number; hp: number } | null, power?: number) =>
    c ? (
      <div className="min-w-0">
        <div className="truncate font-medium">{c.name} <span className="text-plum-400">Lv{c.level}</span></div>
        <div className="text-xs tabular-nums text-plum-300">⚔️{c.atk} 🛡️{c.def} ❤️{c.hp}{power !== undefined && <span className="text-gold-300"> · ⚡{power}</span>}</div>
      </div>
    ) : <div className="text-xs text-plum-500">{phase === "pending" || phase === "replay" ? "face-down…" : "?"}</div>;

  return (
    <section className={`${panel} p-4 flex flex-col gap-3`} aria-labelledby="battle-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="battle-title" className="flex items-center gap-2 font-semibold"><span className="gem" aria-hidden /> 🎲 Random battle</h2>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${enough ? "border-gold-500/50 text-gold-200" : "border-red-400/50 text-red-300"}`}>
          {enough ? `✓ Ready · ⚡${energy} · costs ${cost}` : `✕ Need ⚡${cost} (you have ${energy})`}
        </span>
      </div>
      <StageFrame glow={phase === "done" && result?.winner === "a"}>
      <div className="relative w-full aspect-[4/5] sm:aspect-[16/9] max-h-[560px] bg-[radial-gradient(ellipse_at_50%_50%,#2d1250,#130a20_75%)]">
        <div aria-hidden className="pointer-events-none absolute inset-x-6 top-1/2 h-px bg-gradient-to-r from-transparent via-gold-500/50 to-transparent" />
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full pointer-events-none" />
        <span aria-hidden className="absolute left-14 top-3 text-[10px] uppercase tracking-widest text-red-300/80 sm:left-20">{result && log.length ? result.opponent : "Opponent"}</span>
        <span aria-hidden className="absolute bottom-3 left-14 text-[10px] uppercase tracking-widest text-sky-300/80 sm:left-20">You</span>
        {failed && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-plum-500 p-4 text-center">3D preview unavailable. Results appear below.</div>
        )}
        {phase === "pending" && <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-plum-200 text-sm" role="status"><span className="rounded-full bg-plum-950/80 px-3 py-1"><span className="spinner" aria-hidden /> Finding an opponent…</span></p>}
        {banner && (
          <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-4">
            <div className={`anim-pop ${result?.winner === "a" ? "gold-frame" : ""}`}>
              <p className={`${result?.winner === "a" ? "gold-frame-inner" : "rounded-2xl bg-plum-950/85"} px-5 py-2 text-center text-2xl font-extrabold sm:text-4xl ${banner.c}`}>{banner.t}</p>
            </div>
          </div>
        )}
      </div>
      </StageFrame>

      <div className="grid gap-2 sm:grid-cols-3" aria-label="Lanes">
        {lanes.map(({ i, mineCard, foe, l, resolved }) => {
          const tone = !resolved ? "border-plum-800" : l?.winner === "a" ? "border-gold-500/70 bg-gold-500/5" : l?.winner === "b" ? "border-red-500/50" : "border-plum-600";
          return (
            <div key={i} className={`rounded-xl border p-2.5 text-sm transition-colors ${tone}`}>
              <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider text-plum-400">
                <span className="flex items-center gap-1"><span className="gem" aria-hidden /> Lane {i + 1}</span>
                {resolved && <span className={l?.winner === "a" ? "text-gold-300" : l?.winner === "b" ? "text-red-300" : "text-plum-300"}>{l?.winner === "a" ? "✓ WIN" : l?.winner === "b" ? "✕ LOSS" : "= DRAW"}</span>}
              </div>
              {side(foe, resolved ? l?.pb : undefined)}
              <div className="my-1 text-center text-[10px] text-plum-500">vs</div>
              {side(mineCard, resolved ? l?.pa : undefined)}
            </div>
          );
        })}
      </div>
      <ol className="flex flex-col gap-1 text-xs text-plum-400" aria-live="polite">
        {log.map((l, i) => <li key={i} className="anim-lane">{l}</li>)}
      </ol>
      {phase === "error" && <p role="alert" className="text-red-300 text-sm anim-shake">✕ {error}</p>}
      {result && phase === "done" && (
        <p className="text-sm text-plum-200">
          {result.coins > 0 ? <strong className="text-gold-300">+{result.coins} 🪙</strong> : "No coins (draw)"} · your deck cards gained XP{result.leveledUp && ` · 🎉 level ${result.level}!`}
        </p>
      )}
      <div className="flex gap-3">
        {phase === "replay" && <button onClick={skip} className={`${ghostButton} py-2`}>Skip replay ⏭</button>}
        {phase !== "pending" && phase !== "replay" && (
          <button onClick={() => lock(start)} disabled={!enough || team.length === 0} className={`${button} px-5 py-2 text-base`}>
            🎲 {!enough ? `Need ⚡${cost}` : phase === "idle" ? "Fight" : "Fight again"} · ⚡{cost}
          </button>
        )}
      </div>
    </section>
  );
}
