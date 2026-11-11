// HUD navigation. Hunt and Work live on the profile page (#hunt, #work); everything else is its own route.
export type NavItem = { href: string; label: string; icon: string };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { label: "Play", items: [
    { href: "/profile#hunt", label: "Hunt", icon: "🌿" },
    { href: "/battle", label: "Battle", icon: "⚔️" },
    { href: "/profile#work", label: "Work", icon: "💼" },
    { href: "/burrow", label: "Burrow", icon: "🕳️" },
  ] },
  { label: "Cards", items: [
    { href: "/collection", label: "Collection", icon: "📚" },
    { href: "/cards", label: "Cards", icon: "🃏" },
    { href: "/combine", label: "Combine", icon: "🧪" },
  ] },
  { label: "Trade", items: [
    { href: "/market", label: "Market", icon: "🏪" },
    { href: "/auctions", label: "Auctions", icon: "🔨" },
    { href: "/trades", label: "Trades", icon: "🤝" },
  ] },
  { label: "Community & Help", items: [
    { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
    { href: "/guide", label: "Guide", icon: "📖" },
  ] },
];

/** The phone/tablet tab bar: the most-used sections; the rest are under "More". */
export const QUICK = ["/profile#hunt", "/battle", "/combine", "/collection"];

/** Is this nav item the current page? On /profile, #work selects Work, otherwise Hunt. */
export function isCurrent(href: string, pathname: string, hash: string) {
  const [path, anchor] = href.split("#");
  if (pathname === "/cards" || pathname.startsWith("/cards/")) return path === "/cards";
  if (path !== pathname) return false;
  if (!anchor) return true;
  return anchor === "work" ? hash === "#work" : hash !== "#work";
}
