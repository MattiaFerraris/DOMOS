import { useState } from "react";
import { useDevices } from "../hooks/useDevices";
import { useScheduler } from "../hooks/useScheduler";
import { useDeviceDetails } from "../hooks/useDeviceDetails";
import Header from "../components/Header";
import DeviceCard from "../components/DeviceCard";
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

  // Dispositivo selezionato per il modal di dettaglio
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedDevice = devices.find((d) => d.deviceId === selectedId) ?? null;

  // Energia + info del dispositivo aperto nel modal
  const { energy, info, loading: detailsLoading } = useDeviceDetails(selectedId);

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans text-neutral-800 md:p-10">
      <div className="mx-auto max-w-7xl">
        <Header deviceCount={devices.length} onRefresh={reload} />

        {isLoading && devices.length === 0 ? (
          <div className="py-20 text-center text-neutral-500">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-indigo-500"></span>
            <p className="mt-4 font-medium">Lettura stato dispositivi in corso...</p>
          </div>
        ) : devices.length === 0 ? (
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
