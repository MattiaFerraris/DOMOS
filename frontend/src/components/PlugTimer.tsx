import type { SmartDevice, OneShotTimer } from "../types/types";

interface PlugTimerProps {
  device: SmartDevice;
  timer?: OneShotTimer;
  now: number; // timestamp corrente (aggiornato ogni secondo dal parent)
  onSchedule: (minutes: number, targetState: boolean) => void;
  onCancel: () => void;
}

// Durate rapide proposte (in minuti)
const PRESETS = [5, 15, 30, 60];

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatPreset(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`;
}

export default function PlugTimer({
  device,
  timer,
  now,
  onSchedule,
  onCancel,
}: PlugTimerProps) {
  // Timer attivo: countdown + annulla
  if (timer) {
    const remaining = timer.fireAt - now;
    const action = timer.targetState ? "Si accende tra" : "Si spegne tra";
    return (
      <div className="mt-4 flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50 p-3">
        <div className="flex items-center gap-2 text-indigo-700">
          <ClockIcon className="h-4 w-4" />
          <span className="text-xs font-semibold">{action}</span>
          <span className="font-mono text-sm font-bold tabular-nums">
            {formatRemaining(remaining)}
          </span>
        </div>
        <button
          onClick={onCancel}
          className="cursor-pointer rounded-lg px-2 py-1 text-xs font-bold text-indigo-500 transition-colors hover:bg-indigo-100 hover:text-indigo-700"
        >
          Annulla
        </button>
      </div>
    );
  }

  // Nessun timer: propone spegnimento o accensione rapidi in base allo stato
  const targetState = !device.isOn;
  const label = targetState ? "Accendi tra" : "Spegni tra";

  return (
    <div className="mt-4 rounded-xl border border-neutral-100 bg-neutral-50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-neutral-500">
        <ClockIcon className="h-3.5 w-3.5" />
        <span className="text-xs font-bold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="flex gap-2">
        {PRESETS.map((minutes) => (
          <button
            key={minutes}
            onClick={() => onSchedule(minutes, targetState)}
            className="flex-1 cursor-pointer rounded-lg border border-neutral-200 bg-white py-1.5 text-sm font-bold text-neutral-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
          >
            {formatPreset(minutes)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
