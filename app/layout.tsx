import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { auth } from "@/auth";
import { login, logout } from "./actions";
import { getUid } from "./lib/session";
import TiltEffect from "./fx/TiltEffect";
import { DesktopNav, MobileNav } from "./hud/NavBar";
import PlayerStatus from "./hud/PlayerStatus";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BunnyDex",
  description: "Collect, trade, auction and battle bunny cards on Discord.",
  icons: "/brand/mascot.png",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [session, uid] = await Promise.all([auth(), getUid()]);
  // eslint-disable-next-line react-hooks/purity -- Server Component: one clock read per request for the daily timer.
  const now = Date.now();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans pb-20 lg:pb-0">
        <TiltEffect />
        <header className="sticky top-0 z-30 border-b border-gold-500/25 bg-plum-950/85 backdrop-blur-md shadow-[0_8px_30px_-12px_rgb(124_58_237/0.5)]">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
            <Link href="/" aria-label="BunnyDex home" className="flex shrink-0 items-center gap-1.5">
              <Image src="/brand/mascot.png" alt="" width={40} height={40} priority className="size-9 rounded-full ring-2 ring-gold-500/80 sm:size-10" />
              <Image src="/brand/wordmark.webp" alt="BunnyDex" width={480} height={117} priority className="hidden h-9 w-auto sm:block" />
            </Link>
            {uid && <PlayerStatus uid={uid} now={now} />}
            <div className="ml-auto flex shrink-0 items-center gap-2 text-sm">
              {session ? (
                <>
                  <Link href="/profile" className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 hover:bg-plum-800" title="Your profile">
                    {session.user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Discord CDN avatar; tiny, not worth an image-optimizer remote rule
                      <img src={session.user.image} alt="" className="size-8 rounded-full ring-2 ring-gem/70" />
                    ) : <span className="grid size-8 place-items-center rounded-full bg-plum-800" aria-hidden>🐰</span>}
                    <span className="hidden max-w-32 truncate text-plum-200 md:inline">{session.user.name}</span>
                  </Link>
                  <form action={logout}><button className="text-plum-500 hover:text-plum-100" title="Sign out">Sign out</button></form>
                </>
              ) : (
                <form action={login}><button className="rounded-md bg-indigo-500 px-3 py-1 font-medium hover:bg-indigo-400">Sign in with Discord</button></form>
              )}
            </div>
          </div>
          <DesktopNav />
        </header>
        {children}
        <MobileNav />
      </body>
    </html>
  );
}
