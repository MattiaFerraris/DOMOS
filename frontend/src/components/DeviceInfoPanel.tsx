import type { DeviceInfo } from "../types/types";

interface DeviceInfoPanelProps {
  info: DeviceInfo | null;
}

// Formatta una durata in secondi in "Xg Yh Zm"
function formatUptime(sec?: number): string {
  if (sec == null) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}g ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Livello segnale 0-4: usa signal_level (Tapo) o lo deriva dall'rssi in dBm
function signalBars(info: DeviceInfo): number {
  if (info.signal != null) return Math.max(0, Math.min(4, info.signal));
  const rssi = info.rssi;
  if (rssi == null) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  return 1;
}

function WifiBars({ level }: { level: number }) {
  return (
    <span className="flex items-end gap-0.5">
      {[1, 2, 3, 4].map((b) => (
        <span
          key={b}
          className={`w-1 rounded-sm ${b <= level ? "bg-green-500" : "bg-neutral-200"}`}
          style={{ height: `${b * 3 + 2}px` }}
        />
      ))}
    </span>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm font-medium text-neutral-500">{label}</span>
      <span className="flex items-center gap-2 truncate text-sm font-semibold text-neutral-800">
        {children}
      </span>
    </div>
  );
}

export default function DeviceInfoPanel({ info }: DeviceInfoPanelProps) {
  if (!info) {
    return (
      <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-center text-sm text-neutral-400">
        Lettura informazioni in corso...
      </div>
    );
  }

  const bars = signalBars(info);

  return (
    <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-4">
      <Row label="Segnale WiFi">
        <WifiBars level={bars} />
        {info.rssi != null && (
          <span className="text-xs font-medium text-neutral-400">
            {info.rssi} dBm
          </span>
        )}
      </Row>
      {info.ssid && (
        <>
          <div className="border-t border-neutral-100" />
          <Row label="Rete">{info.ssid}</Row>
        </>
      )}
      <div className="border-t border-neutral-100" />
      <Row label="Acceso da">{formatUptime(info.onTimeSec)}</Row>
      <div className="border-t border-neutral-100" />
      <Row label="Temperatura">
        {info.overheated ? (
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
            Surriscaldato
          </span>
        ) : (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-bold text-green-600">
            Normale
          </span>
        )}
      </Row>
      <div className="border-t border-neutral-100" />
      <Row label="Firmware">{info.firmware ?? "—"}</Row>
    </div>
  );
}
