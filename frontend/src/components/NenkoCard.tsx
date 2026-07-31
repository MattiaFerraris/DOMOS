import type { NenkoPreset } from "../types/types";

interface NenkoCardProps {
  presets: NenkoPreset[];
  active?: string; // nome del preset attivo
  error?: string | null;
  onSend: (name: string) => void;
}

// Icona luce sensoriale
function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  );
}

// Sfondo dei pulsanti "effetto"
const EFFECT_BG: Record<string, string> = {
  arcobaleno:
    "bg-gradient-to-br from-red-500 via-yellow-400 to-blue-600 text-white",
  bolle: "bg-gradient-to-br from-cyan-400 to-blue-600 text-white",
};
const EFFECT_FALLBACK =
  "bg-gradient-to-br from-indigo-500 to-purple-600 text-white";

// Testo scuro o chiaro in base alla luminosità del colore di sfondo.
function textColorFor(hex?: string): string {
  if (!hex) return "#ffffff";
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum < 140 ? "#ffffff" : "#111111";
}

export default function NenkoCard({
  presets,
  active,
  error,
  onSend,
}: NenkoCardProps) {
  if (presets.length === 0) return null;

  return (
    <div className="group flex flex-col rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
      {/* Intestazione */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fuchsia-100 text-fuchsia-600">
            <SparklesIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-neutral-800">
              Nenko
            </h2>
            <span className="text-xs font-medium text-neutral-400">
              Light Source
            </span>
          </div>
        </div>
        <span className="shrink-0 text-xs font-black tracking-widest text-neutral-300">
          NENKO
        </span>
      </div>

      {/* Stato */}
      <div className="mb-6 flex items-center gap-2">
        <span className="rounded border border-fuchsia-100 bg-fuchsia-50 px-2 py-1 text-xs font-bold uppercase tracking-wide text-fuchsia-600">
          Luce sensoriale
        </span>
        {error ? (
          <span className="text-sm font-semibold text-red-600">
            Invio fallito (dongle non connesso?)
          </span>
        ) : (
          <span className="text-sm text-neutral-500">
            {active ? (
              <>
                •{" "}
                <span className="font-semibold text-neutral-800">
                  {presets.find((p) => p.name === active)?.label ?? active}
                </span>
              </>
            ) : (
              "Scegli un colore"
            )}
          </span>
        )}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-3">
        {presets.map((p) => {
          const isColor = p.tipo === "colore" && !!p.rgb;
          const effectClass = isColor
            ? ""
            : (EFFECT_BG[p.name] ?? EFFECT_FALLBACK);
          const isActive = active === p.name;
          return (
            <button
              key={p.name}
              onClick={() => onSend(p.name)}
              title={p.label}
              style={
                isColor
                  ? { backgroundColor: p.rgb, color: textColorFor(p.rgb) }
                  : undefined
              }
              className={`flex min-h-[72px] cursor-pointer items-center justify-center rounded-xl px-3 py-5 text-base font-bold shadow-sm transition-all hover:scale-[1.03] ${effectClass} ${
                isActive ? "ring-4 ring-indigo-400 ring-offset-2" : "ring-0"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
