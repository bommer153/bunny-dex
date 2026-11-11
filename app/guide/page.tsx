import { CONFIG } from "@/game/config";
import { GUIDE } from "@/game/guide";
import { Page } from "../components";
import GuideStepper from "./GuideStepper";

export const metadata = { title: "Command guide · BunnyDex" };

const P = CONFIG.prefix;

export default function GuidePage() {
  return (
    <Page title="📖 Command guide">
      <p className="text-plum-400 max-w-3xl">
        Type commands in any Discord channel the bot can see, starting with <code className="text-gold-200">{P}</code>.
        <code className="text-gold-200"> {"<like this>"}</code> is required, <code className="text-gold-200">[like this]</code> is optional.
        Try <code className="text-gold-200">{P} help</code> in Discord for this guide there too.
      </p>
      <GuideStepper sections={GUIDE} prefix={P} />
    </Page>
  );
}
