import type { SmartDevice } from "../types/types";

interface LightControlsProps {
  device: SmartDevice;
  onBrightnessDrag: (deviceId: string, brightness: number) => void;
  onBrightnessCommit: (brightness: number) => void;
  onColorSelect: (color: string) => void;
}

// Palette colori disponibili per le luci LED
const COLORS: { name: string; value: string; swatch: string }[] = [
  {
    name: "Bianco",
    value: "white",
    swatch: "bg-neutral-100 border-neutral-300",
  },
  { name: "Rosso", value: "red", swatch: "bg-red-500" },
  { name: "Blu", value: "blue", swatch: "bg-blue-500" },
  { name: "Verde", value: "green", swatch: "bg-green-500" },
];

export default function LightControls({
  device,
  onBrightnessDrag,
  onBrightnessCommit,
  onColorSelect,
}: LightControlsProps) {
  const commit = (e: React.SyntheticEvent<HTMLInputElement>) =>
    onBrightnessCommit(parseInt((e.target as HTMLInputElement).value));

  return (
    <div className="mt-4 rounded-xl border border-neutral-100 bg-neutral-50 p-4">
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-neutral-500">
            Luminosità
          </span>
          <span className="text-xs font-bold text-neutral-700">
            {device.brightness}%
          </span>
        </div>
        <input
          type="range"
          min="1"
          max="100"
          value={device.brightness}
          onChange={(e) =>
            onBrightnessDrag(device.deviceId, parseInt(e.target.value))
          }
          onMouseUp={commit}
          onTouchEnd={commit}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-neutral-200 accent-amber-500"
        />
      </div>

      <div>
        <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-neutral-500">
          Colore
        </span>
        <div className="flex gap-2">
          {COLORS.map((c) => {
            const active = (device.color || "white") === c.value;
            return (
              <button
                key={c.value}
                onClick={() => onColorSelect(c.value)}
                title={c.name}
                className={`h-9 flex-1 rounded-lg border-2 transition-all cursor-pointer ${c.swatch} ${
                  active
                    ? "border-neutral-800 ring-2 ring-neutral-300"
                    : "border-transparent hover:scale-105"
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
