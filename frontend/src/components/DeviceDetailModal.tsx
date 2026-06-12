import { useEffect } from "react";
import type { SmartDevice, LightUpdates, DeviceTimer } from "../types/types";
import { isLightDevice, getBrand } from "../types/types";
import LightControls from "./LightControls";
import ColorSlider from "./ColorSlider";
import PlugTimer from "./PlugTimer";

interface DeviceDetailModalProps {
  device: SmartDevice;
  timer?: DeviceTimer;
  now: number;
  onClose: () => void;
  onTogglePlug: (deviceId: string, currentIsOn: boolean) => void;
  onApplyLight: (device: SmartDevice, updates: LightUpdates) => void;
  onBrightnessDrag: (deviceId: string, brightness: number) => void;
  onColorDrag: (deviceId: string, color: string) => void;
  onScheduleTimer: (
    deviceId: string,
    minutes: number,
    targetState: boolean,
  ) => void;
  onCancelTimer: (deviceId: string) => void;
}

// Riga di una proprietà nella scheda informazioni
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm font-medium text-neutral-500">{label}</span>
      <span className="truncate text-sm font-semibold text-neutral-800" title={value}>
        {value}
      </span>
    </div>
  );
}

export default function DeviceDetailModal({
  device,
  timer,
  now,
  onClose,
  onTogglePlug,
  onApplyLight,
  onBrightnessDrag,
  onColorDrag,
  onScheduleTimer,
  onCancelTimer,
}: DeviceDetailModalProps) {
  const isLight = isLightDevice(device);
  const isPoweredOn = device.isOn;
  const brand = getBrand(device);

  // Chiusura con tasto Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleToggle = () =>
    isLight
      ? onApplyLight(device, { state: !isPoweredOn })
      : onTogglePlug(device.deviceId, isPoweredOn);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header modal */}
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 p-6">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-extrabold text-neutral-900">
              {device.alias}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`rounded border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
                  isLight
                    ? "border-amber-100 bg-amber-50 text-amber-600"
                    : "border-blue-100 bg-blue-50 text-blue-600"
                }`}
              >
                {isLight ? "Luce LED" : "Presa Smart"}
              </span>
              <span
                className={`text-sm font-semibold ${isPoweredOn ? "text-green-600" : "text-neutral-500"}`}
              >
                {isPoweredOn ? "Accesa" : "Spenta"}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Chiudi"
            className="shrink-0 cursor-pointer rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="h-5 w-5"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Corpo */}
        <div className="space-y-6 p-6">
          {/* Comando principale */}
          <button
            onClick={handleToggle}
            className={`w-full cursor-pointer rounded-xl py-3 font-semibold shadow-sm transition-colors ${
              isPoweredOn
                ? "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {isPoweredOn ? "Spegni" : "Accendi"}
          </button>

          {/* Controlli specifici */}
          {isLight ? (
            <>
              <LightControls
                device={device}
                onBrightnessDrag={onBrightnessDrag}
                onBrightnessCommit={(brightness) =>
                  onApplyLight(device, { brightness })
                }
                onColorSelect={(color) => onApplyLight(device, { color })}
              />
              <ColorSlider
                device={device}
                onColorDrag={onColorDrag}
                onColorCommit={(color) => onApplyLight(device, { color })}
              />
            </>
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

          {/* Informazioni dispositivo */}
          <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-4">
            <InfoRow label="Marca" value={brand} />
            <div className="border-t border-neutral-100" />
            <InfoRow label="Modello" value={device.deviceModel} />
            <div className="border-t border-neutral-100" />
            <InfoRow label="Tipo" value={device.deviceType ?? "—"} />
            <div className="border-t border-neutral-100" />
            <InfoRow label="ID dispositivo" value={device.deviceId} />
          </div>

          {/* Spazio per funzionalità future */}
          <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-400">
            Altre funzionalità in arrivo
          </div>
        </div>
      </div>
    </div>
  );
}
