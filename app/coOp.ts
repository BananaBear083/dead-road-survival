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
  fire: boolean;
  kick: boolean;
  reload: boolean;
  switchWeapon: boolean;
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
  buttons: CoOpGamepadButtons;
};

export const EMPTY_COOP_GAMEPAD_BUTTONS: CoOpGamepadButtons = {
  fire: false,
  kick: false,
  reload: false,
  switchWeapon: false,
};

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
      buttons: { ...EMPTY_COOP_GAMEPAD_BUTTONS },
    };
  }

  // Standard Gamepad mapping: RT=7, RB=5, X=2, Y=3.
  const buttons: CoOpGamepadButtons = {
    fire: buttonPressed(gamepad, 7),
    kick: buttonPressed(gamepad, 5),
    reload: buttonPressed(gamepad, 2),
    switchWeapon: buttonPressed(gamepad, 3),
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
    buttons,
  };
}
