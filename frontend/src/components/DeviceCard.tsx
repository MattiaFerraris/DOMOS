import type { SmartDevice, LightUpdates, DeviceTimer } from "../types/types";
import { isLightDevice, getBrand } from "../types/types";
import LightControls from "./LightControls";
import PlugTimer from "./PlugTimer";

interface DeviceCardProps {
  device: SmartDevice;
  timer?: DeviceTimer;
  now: number;
  onTogglePlug: (deviceId: string, currentIsOn: boolean) => void;
  onApplyLight: (device: SmartDevice, updates: LightUpdates) => void;
  onBrightnessDrag: (deviceId: string, brightness: number) => void;
  onScheduleTimer: (
    deviceId: string,
    minutes: number,
    targetState: boolean,
  ) => void;
  onCancelTimer: (deviceId: string) => void;
  onOpenDetail: (deviceId: string) => void;
}

// Icona presa smart
function PlugIcon({ className }: { className?: string }) {
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
      <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v5" />
    </svg>
  );
}

// Icona luce LED
function BulbIcon({ className }: { className?: string }) {
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
      <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" />
    </svg>
  );
}

export default function DeviceCard({
  device,
  timer,
  now,
  onTogglePlug,
  onApplyLight,
  onBrightnessDrag,
  onScheduleTimer,
  onCancelTimer,
  onOpenDetail,
}: DeviceCardProps) {
  const isPoweredOn = device.isOn;
  const isLight = isLightDevice(device);
  const brand = getBrand(device);

  const handleToggle = () =>
    isLight
      ? onApplyLight(device, { state: !isPoweredOn })
      : onTogglePlug(device.deviceId, isPoweredOn);

  return (
    <div
      onClick={() => onOpenDetail(device.deviceId)}
      title="Apri dettaglio dispositivo"
      className="group flex cursor-pointer flex-col rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
    >
      {/* Intestazione */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
              isPoweredOn
                ? isLight
                  ? "bg-amber-100 text-amber-600"
                  : "bg-blue-100 text-blue-600"
                : "bg-neutral-100 text-neutral-400"
            }`}
          >
            {isLight ? (
              <BulbIcon className="h-6 w-6" />
            ) : (
              <PlugIcon className="h-6 w-6" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-neutral-800 group-hover:text-indigo-600">
              {device.alias}
            </h2>
            <span className="text-xs font-medium text-neutral-400">
              {device.deviceModel}
            </span>
          </div>
        </div>

        <span className="shrink-0 text-xs font-black tracking-widest text-neutral-300">
          {brand}
        </span>
      </div>

      {/* Stato */}
      <div className="mb-6 flex items-center gap-2">
        <span
          className={`rounded border px-2 py-1 text-xs font-bold uppercase tracking-wide ${
            isLight
              ? "border-amber-100 bg-amber-50 text-amber-600"
              : "border-blue-100 bg-blue-50 text-blue-600"
          }`}
        >
          {isLight ? "Luce LED" : "Presa Smart"}
        </span>
        <span className="text-sm text-neutral-500">
          •{" "}
          <span
            className={`font-semibold ${isPoweredOn ? "text-green-600" : "text-neutral-800"}`}
          >
            {isPoweredOn ? "Accesa" : "Spenta"}
          </span>
        </span>
      </div>

      {/* Controlli — i click qui non aprono il dettaglio */}
      <div className="mt-auto" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleToggle}
          className={`w-full cursor-pointer rounded-xl py-2.5 font-semibold shadow-sm transition-colors ${
            isPoweredOn
              ? "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {isPoweredOn
            ? isLight
              ? "Spegni Luce"
              : "Spegni Presa"
            : isLight
              ? "Accendi Luce"
              : "Accendi Presa"}
        </button>

        {isLight ? (
          <LightControls
            device={device}
            onBrightnessDrag={onBrightnessDrag}
            onBrightnessCommit={(brightness) =>
              onApplyLight(device, { brightness })
            }
            onColorSelect={(color) => onApplyLight(device, { color })}
          />
        ) : (
          <PlugTimer
            device={device}
            timer={timer}
            now={now}
            onSchedule={(minutes, targetState) =>
              onScheduleTimer(device.deviceId, minutes, targetState)
            }
            onCancel={() => onCancelTimer(device.deviceId)}
          />
        )}
      </div>
    </div>
  );
}
