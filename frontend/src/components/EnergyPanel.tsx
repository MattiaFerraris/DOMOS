import type { DeviceEnergy } from "../types/types";

interface EnergyPanelProps {
  energy: DeviceEnergy | null;
  loading: boolean;
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex-1 rounded-lg bg-white p-3 text-center">
      <div className="text-xl font-extrabold text-neutral-800">
        {value}
        <span className="ml-0.5 text-sm font-semibold text-neutral-400">
          {unit}
        </span>
      </div>
      <div className="mt-0.5 text-xs font-medium text-neutral-500">{label}</div>
    </div>
  );
}

export default function EnergyPanel({ energy, loading }: EnergyPanelProps) {
  if (loading && !energy) {
    return (
      <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-center text-sm text-neutral-400">
        Lettura consumo in corso...
      </div>
    );
  }

  if (!energy || !energy.supported) {
    return (
      <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-center text-sm text-neutral-400">
        Misurazione energetica non supportata da questo dispositivo
      </div>
    );
  }

  const fmt = (n?: number, d = 1) => (n != null ? n.toFixed(d) : "—");

  return (
    <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4">
      <div className="mb-3 flex items-center gap-1.5 text-neutral-500">
        <BoltIcon className="h-3.5 w-3.5" />
        <span className="text-xs font-bold uppercase tracking-wide">
          Consumo energetico
        </span>
      </div>
      <div className="flex gap-2">
        <Stat label="Potenza" value={fmt(energy.powerW, 1)} unit="W" />
        {energy.todayKwh != null && (
          <Stat label="Oggi" value={fmt(energy.todayKwh, 2)} unit="kWh" />
        )}
        {energy.monthKwh != null && (
          <Stat label="Mese" value={fmt(energy.monthKwh, 2)} unit="kWh" />
        )}
        {energy.voltage != null && (
          <Stat label="Tensione" value={fmt(energy.voltage, 0)} unit="V" />
        )}
      </div>
    </div>
  );
}

function BoltIcon({ className }: { className?: string }) {
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
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
    </svg>
  );
}
