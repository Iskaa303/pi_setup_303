import type { KeyId } from "@earendil-works/pi-tui";

export const NOTIFY_CHORD: KeyId = "alt+shift+n";

/** Event channel broadcast on every toggle, so other extensions (e.g.
 *  pi-zen-frame) can mirror the enabled state. */
export const NOTIFY_TOGGLE_EVENT = "pi-notify:toggle-changed";

export const APP_NAME = "pi-notify";
export const MAX_NOTIFICATION_LABEL_LENGTH = 16;
export const NOTIFICATION_ICON = "dialog-information";

/** Sound players tried in order; the first that exits 0 wins; */
export const SOUND_PLAYERS: ReadonlyArray<{ cmd: string; args: string[] }> = [
  { cmd: "canberra-gtk-play", args: ["--id=complete"] },
  {
    cmd: "paplay",
    args: ["/usr/share/sounds/freedesktop/stereo/complete.oga"],
  },
  { cmd: "aplay", args: ["-q", "/usr/share/sounds/alsa/Front_Center.wav"] },
];

export function displayChord(chord: KeyId): string {
  return chord.replace(
    /(^|\+)([a-z])/g,
    (_m, sep: string, c: string) => `${sep}${c.toUpperCase()}`,
  );
}
