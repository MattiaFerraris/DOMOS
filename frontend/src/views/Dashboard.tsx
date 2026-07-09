import { useState } from "react";
import { useDevices } from "../hooks/useDevices";
import { useScheduler } from "../hooks/useScheduler";
import { useDeviceInfo } from "../hooks/useDeviceInfo";
import { useEnergy } from "../hooks/useEnergy";
import { useNenko } from "../hooks/useNenko";
import { isLightDevice } from "../types/types";
import Header from "../components/Header";
import DeviceCard from "../components/DeviceCard";
import NenkoCard from "../components/NenkoCard";
import DeviceDetailModal from "../components/DeviceDetailModal";

export default function Dashboard() {
  const {
    devices,
    isLoading,
    reload,
    togglePlug,
    applyLightSettings,
    handleLocalBrightnessDrag,
    handleLocalColorDrag,
  } = useDevices();

  // Timer e schedulazioni sono pianificati ed eseguiti dal backend
  const {
    timers,
    schedules,
    now,
    scheduleTimer,
    cancelTimer,
    addSchedule,
    updateSchedule,
    deleteSchedule,
  } = useScheduler();

  // Luce Nenko (preset colore/effetto via dongle nRF52840)
  const nenko = useNenko();

  // Dispositivo selezionato per il modal di dettaglio
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedDevice = devices.find((d) => d.deviceId === selectedId) ?? null;

  // Info di sistema/rete del dispositivo aperto (saltate per i device Zigbee)
  const { info } = useDeviceInfo(selectedId, selectedDevice?.source);

  // Consumo energetico: ha senso solo per le prese smart, non per le luci/strisce LED
  const isPlug = selectedDevice ? !isLightDevice(selectedDevice) : false;
  const { energy, loading: detailsLoading } = useEnergy(selectedId, isPlug);

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans text-neutral-800 md:p-10">
      <div className="mx-auto max-w-7xl">
        <Header deviceCount={devices.length} onRefresh={reload} />

        {isLoading && devices.length === 0 ? (
          <div className="py-20 text-center text-neutral-500">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-indigo-500"></span>
            <p className="mt-4 font-medium">Lettura stato dispositivi in corso...</p>
          </div>
        ) : devices.length === 0 && nenko.presets.length === 0 ? (
          <div className="py-20 text-center text-neutral-500">
            <p className="font-medium">Nessun dispositivo trovato.</p>
          </div>
        ) : (
          <main className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {devices.map((device) => (
              <DeviceCard
                key={device.deviceId}
                device={device}
                timer={timers[device.deviceId]}
                now={now}
                onTogglePlug={togglePlug}
                onApplyLight={applyLightSettings}
                onBrightnessDrag={handleLocalBrightnessDrag}
                onScheduleTimer={scheduleTimer}
                onCancelTimer={cancelTimer}
                onOpenDetail={setSelectedId}
              />
            ))}
            <NenkoCard
              presets={nenko.presets}
              active={nenko.active}
              error={nenko.error}
              onSend={nenko.sendPreset}
            />
          </main>
        )}
      </div>

      {selectedDevice && (
        <DeviceDetailModal
          device={selectedDevice}
          timer={timers[selectedDevice.deviceId]}
          now={now}
          energy={energy}
          info={info}
          detailsLoading={detailsLoading}
          schedules={schedules}
          onClose={() => setSelectedId(null)}
          onTogglePlug={togglePlug}
          onApplyLight={applyLightSettings}
          onBrightnessDrag={handleLocalBrightnessDrag}
          onColorDrag={handleLocalColorDrag}
          onScheduleTimer={scheduleTimer}
          onCancelTimer={cancelTimer}
          onAddSchedule={addSchedule}
          onUpdateSchedule={updateSchedule}
          onDeleteSchedule={deleteSchedule}
        />
      )}
    </div>
  );
}
