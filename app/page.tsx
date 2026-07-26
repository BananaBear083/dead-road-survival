import type { Metadata } from "next";
import { CS2ManagerGame } from "./CS2ManagerGame";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "CS2 战队老板 · 职业经理生涯",
  description: "创建俱乐部、招募真实职业选手，带队从 Challenger 一路打进 Major 决赛。",
};

export default function Home() {
  return <CS2ManagerGame />;
}
