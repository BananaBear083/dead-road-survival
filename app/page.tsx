import type { Metadata } from "next";
import { DeadRoadGame } from "./DeadRoadGame";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "死路求生 · 2D 僵尸射击",
  description: "守住公路，活过一波又一波尸潮。",
};

export default function Home() {
  return <DeadRoadGame />;
}
