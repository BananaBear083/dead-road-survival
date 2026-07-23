import assert from "node:assert/strict";
import test from "node:test";

import {
  creditPlayerCoins,
  EMPTY_COOP_GAMEPAD_BUTTONS,
  readCoOpGamepad,
  survivalWaveTotal,
} from "../app/coOp.ts";

function standardGamepad({
  axes = [0, 0, 0, 0],
  pressed = [],
  index = 0,
} = {}) {
  return {
    connected: true,
    index,
    mapping: "standard",
    axes,
    buttons: Array.from({ length: 16 }, (_, buttonIndex) => ({
      pressed: pressed.includes(buttonIndex),
      value: pressed.includes(buttonIndex) ? 1 : 0,
    })),
  };
}

test("双人生存模式每天的僵尸数恰好是单人模式两倍", () => {
  for (const day of [1, 2, 5, 12, 30]) {
    assert.equal(survivalWaveTotal(day, true), survivalWaveTotal(day, false) * 2);
  }
  assert.equal(survivalWaveTotal(1, false), 6);
  assert.equal(survivalWaveTotal(1, true), 12);
});

test("两名玩家的金币独立增加和扣除", () => {
  assert.deepEqual(creditPlayerCoins([100, 40], 2, 15), [100, 55]);
  assert.deepEqual(creditPlayerCoins([100, 55], 1, -30), [70, 55]);
  assert.deepEqual(creditPlayerCoins([10, 55], 1, -50), [0, 55]);
});

test("手柄摇杆死区会过滤漂移并保留有效方向", () => {
  const drift = readCoOpGamepad([standardGamepad({ axes: [0.12, -0.08, 0.19, 0] })]);
  assert.deepEqual([drift.moveX, drift.moveY, drift.aimX, drift.aimY], [0, 0, 0, 0]);

  const input = readCoOpGamepad([standardGamepad({ axes: [0.6, -0.6, 0.8, -0.8] })]);
  assert.ok(input.moveX > 0.45);
  assert.ok(input.moveY < -0.45);
  assert.ok(input.aimX > 0.7);
  assert.ok(input.aimY < -0.7);
});

test("战斗与菜单的全部手柄动作只在按钮按下边沿触发", () => {
  const first = readCoOpGamepad(
    [standardGamepad({ pressed: [0, 1, 2, 3, 4, 5, 7, 9, 12, 13, 14, 15] })],
    EMPTY_COOP_GAMEPAD_BUTTONS,
  );
  assert.equal(first.fireHeld, true);
  assert.equal(first.firePressed, true);
  assert.equal(first.confirmPressed, true);
  assert.equal(first.backPressed, true);
  assert.equal(first.reloadPressed, true);
  assert.equal(first.switchWeaponPressed, true);
  assert.equal(first.kickPressed, true);
  assert.equal(first.previousTabPressed, true);
  assert.equal(first.menuPressed, true);
  assert.deepEqual(
    [first.upPressed, first.downPressed, first.leftPressed, first.rightPressed],
    [true, true, true, true],
  );

  const held = readCoOpGamepad(
    [standardGamepad({ pressed: [0, 1, 2, 3, 4, 5, 7, 9, 12, 13, 14, 15] })],
    first.buttons,
  );
  assert.equal(held.fireHeld, true);
  assert.equal(held.firePressed, false);
  assert.equal(held.confirmPressed, false);
  assert.equal(held.backPressed, false);
  assert.equal(held.reloadPressed, false);
  assert.equal(held.switchWeaponPressed, false);
  assert.equal(held.kickPressed, false);
  assert.equal(held.previousTabPressed, false);
  assert.equal(held.menuPressed, false);
  assert.deepEqual(
    [held.upPressed, held.downPressed, held.leftPressed, held.rightPressed],
    [false, false, false, false],
  );
});

test("未连接标准手柄时返回安全的空输入", () => {
  const input = readCoOpGamepad([
    { ...standardGamepad(), mapping: "", connected: true },
    null,
  ]);
  assert.equal(input.connected, false);
  assert.equal(input.index, null);
  assert.equal(input.fireHeld, false);
});
