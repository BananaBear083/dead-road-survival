import type { Metadata } from "next";

import { DeadRoadGame } from "../DeadRoadGame";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "死路求生 · 2D 僵尸射击",
  description: "守住公路，活过一波又一波尸潮。",
  openGraph: {
    title: "死路求生",
    description: "守住公路，活过今天。",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "死路求生游戏封面" }],
  },
};

export default function DeadRoadPage() {
  return <DeadRoadGame />;
}
