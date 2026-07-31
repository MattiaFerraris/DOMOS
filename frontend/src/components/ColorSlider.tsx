import type { SmartDevice } from "../types/types";

interface ColorSliderProps {
  device: SmartDevice;
  onColorDrag: (deviceId: string, color: string) => void;
  onColorCommit: (color: string) => void;
}

// Tonalità approssimative dei colori preset
const PRESET_HUES: Record<string, number> = {
  red: 0,
  yellow: 60,
  green: 120,
  blue: 240,
  white: 0,
};

// Converte una tonalità (0-360) in esadecimale a saturazione/luminosità piene
function hueToHex(h: number): string {
  const c = 1; // chroma (s=1, l=0.5)
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Ricava la tonalità da un colore esadecimale, altrimenti null
function hexToHue(hex: string): number | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  const deg = Math.round(h * 60);
  return deg < 0 ? deg + 360 : deg;
}

// Gradiente arcobaleno per la traccia dello slider
const RAINBOW =
  "linear-gradient(to right, " +
  "#ff0000 0%, #ffff00 17%, #00ff00 33%, " +
  "#00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)";

export default function ColorSlider({
  device,
  onColorDrag,
  onColorCommit,
}: ColorSliderProps) {
  const color = device.color || "white";
  // Tonalità corrente: da hex se possibile, altrimenti dal preset
  const hue = hexToHue(color) ?? PRESET_HUES[color] ?? 0;
  const previewHex = hexToHue(color) !== null ? color : hueToHex(hue);

  const commit = (e: React.SyntheticEvent<HTMLInputElement>) =>
    onColorCommit(hueToHex(parseInt((e.target as HTMLInputElement).value)));

  return (
    <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-neutral-500">
          Tonalità colore
        </span>
        <span
          className="h-5 w-5 rounded-full border border-neutral-300 shadow-inner"
          style={{ backgroundColor: previewHex }}
          title={previewHex}
        />
      </div>
      <input
        type="range"
        min="0"
        max="360"
        value={hue}
        onChange={(e) =>
          onColorDrag(device.deviceId, hueToHex(parseInt(e.target.value)))
        }
        onMouseUp={commit}
        onTouchEnd={commit}
        className="h-3 w-full cursor-pointer appearance-none rounded-lg"
        style={{ backgroundImage: RAINBOW }}
      />
    </div>
  );
}
