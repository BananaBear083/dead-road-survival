export type GamepadButtonLike = {
  pressed: boolean;
  value: number;
};

export type GamepadLike = {
  connected: boolean;
  index: number;
  mapping: string;
  axes: readonly number[];
  buttons: readonly GamepadButtonLike[];
};

export type CoOpGamepadButtons = {
  confirm: boolean;
  back: boolean;
  fire: boolean;
  kick: boolean;
  reload: boolean;
  switchWeapon: boolean;
  previousTab: boolean;
  menu: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export type CoOpGamepadInput = {
  connected: boolean;
  index: number | null;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  fireHeld: boolean;
  firePressed: boolean;
  kickPressed: boolean;
  reloadPressed: boolean;
  switchWeaponPressed: boolean;
  confirmPressed: boolean;
  backPressed: boolean;
  previousTabPressed: boolean;
  menuPressed: boolean;
  upPressed: boolean;
  downPressed: boolean;
  leftPressed: boolean;
  rightPressed: boolean;
  buttons: CoOpGamepadButtons;
};

export const EMPTY_COOP_GAMEPAD_BUTTONS: CoOpGamepadButtons = {
  confirm: false,
  back: false,
  fire: false,
  kick: false,
  reload: false,
  switchWeapon: false,
  previousTab: false,
  menu: false,
  up: false,
  down: false,
  left: false,
  right: false,
};

export function creditPlayerCoins(
  balances: readonly [number, number],
  player: 1 | 2,
  amount: number,
): [number, number] {
  return player === 1
    ? [Math.max(0, balances[0] + amount), balances[1]]
    : [balances[0], Math.max(0, balances[1] + amount)];
}

const GAMEPAD_DEADZONE = 0.2;

function stickAxis(value: number | undefined) {
  const axis = Number.isFinite(value) ? Math.max(-1, Math.min(1, value ?? 0)) : 0;
  const magnitude = Math.abs(axis);
  if (magnitude <= GAMEPAD_DEADZONE) return 0;
  return Math.sign(axis) * (magnitude - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE);
}

function buttonPressed(gamepad: GamepadLike, index: number) {
  const button = gamepad.buttons[index];
  return Boolean(button && (button.pressed || button.value >= 0.55));
}

export function survivalWaveTotal(day: number, coOp: boolean) {
  const normalizedDay = Math.max(1, Math.floor(day));
  const singlePlayerTotal = normalizedDay === 1 ? 6 : 5 + Math.ceil(normalizedDay * 2.2);
  return singlePlayerTotal * (coOp ? 2 : 1);
}

export function readCoOpGamepad(
  gamepads: readonly (GamepadLike | null)[],
  previous: CoOpGamepadButtons = EMPTY_COOP_GAMEPAD_BUTTONS,
): CoOpGamepadInput {
  const gamepad = gamepads.find((candidate) => candidate?.connected && candidate.mapping === "standard") ?? null;
  if (!gamepad) {
    return {
      connected: false,
      index: null,
      moveX: 0,
      moveY: 0,
      aimX: 0,
      aimY: 0,
      fireHeld: false,
      firePressed: false,
      kickPressed: false,
      reloadPressed: false,
      switchWeaponPressed: false,
      confirmPressed: false,
      backPressed: false,
      previousTabPressed: false,
      menuPressed: false,
      upPressed: false,
      downPressed: false,
      leftPressed: false,
      rightPressed: false,
      buttons: { ...EMPTY_COOP_GAMEPAD_BUTTONS },
    };
  }

  // Standard Gamepad mapping: A=0, B=1, X=2, Y=3, LB=4, RB=5,
  // RT=7, Menu=9, D-pad=12–15.
  const buttons: CoOpGamepadButtons = {
    confirm: buttonPressed(gamepad, 0),
    back: buttonPressed(gamepad, 1),
    fire: buttonPressed(gamepad, 7),
    kick: buttonPressed(gamepad, 5),
    reload: buttonPressed(gamepad, 2),
    switchWeapon: buttonPressed(gamepad, 3),
    previousTab: buttonPressed(gamepad, 4),
    menu: buttonPressed(gamepad, 9),
    up: buttonPressed(gamepad, 12),
    down: buttonPressed(gamepad, 13),
    left: buttonPressed(gamepad, 14),
    right: buttonPressed(gamepad, 15),
  };

  return {
    connected: true,
    index: gamepad.index,
    moveX: stickAxis(gamepad.axes[0]),
    moveY: stickAxis(gamepad.axes[1]),
    aimX: stickAxis(gamepad.axes[2]),
    aimY: stickAxis(gamepad.axes[3]),
    fireHeld: buttons.fire,
    firePressed: buttons.fire && !previous.fire,
    kickPressed: buttons.kick && !previous.kick,
    reloadPressed: buttons.reload && !previous.reload,
    switchWeaponPressed: buttons.switchWeapon && !previous.switchWeapon,
    confirmPressed: buttons.confirm && !previous.confirm,
    backPressed: buttons.back && !previous.back,
    previousTabPressed: buttons.previousTab && !previous.previousTab,
    menuPressed: buttons.menu && !previous.menu,
    upPressed: buttons.up && !previous.up,
    downPressed: buttons.down && !previous.down,
    leftPressed: buttons.left && !previous.left,
    rightPressed: buttons.right && !previous.right,
    buttons,
  };
}
