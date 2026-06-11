import React, { useState, useEffect } from "react";

// Abbiamo rinominato l'interfaccia per renderla generica (Multivendor)
interface SmartDevice {
  deviceId: string;
  alias: string;
  isOn: boolean;
  deviceModel: string;
  deviceType?: string; // Arriva dal cloud
  brightness?: number;
  color?: string;
}

export default function App() {
  const [devices, setDevices] = useState<SmartDevice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchDevices = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("http://localhost:3000/api/tapo/list");
      const data = await res.json();

      if (data.status === "OK") {
        const initializedDevices = data.data.map((d: any) => ({
          ...d,
          // MAPPATURA CRUCIALE: Il backend manda 'device_on', React usa 'isOn'
          isOn: d.device_on || false,
          brightness: d.brightness || 100,
          color: d.color || "white",
        }));
        setDevices(initializedDevices);
      }
    } catch (err) {
      console.error("Errore fetch dispositivi:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const togglePlug = async (deviceId: string, currentIsOn: boolean) => {
    // Optimistic UI update
    setDevices((prev) =>
      prev.map((d) =>
        d.deviceId === deviceId ? { ...d, isOn: !currentIsOn } : d,
      ),
    );

    try {
      const response = await fetch("http://localhost:3000/api/tapo/power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, state: !currentIsOn }),
      });
      if (!response.ok) throw new Error("Network error");
    } catch {
      // Rollback in caso di errore
      setDevices((prev) =>
        prev.map((d) =>
          d.deviceId === deviceId ? { ...d, isOn: currentIsOn } : d,
        ),
      );
    }
  };

  const applyLightSettings = async (
    device: SmartDevice,
    updates: { state?: boolean; color?: string; brightness?: number },
  ) => {
    const newState = updates.state !== undefined ? updates.state : device.isOn;
    const newColor = updates.color || device.color || "white";
    const newBrightness = updates.brightness || device.brightness || 100;

    const isTurningOn =
      newState ||
      updates.color !== undefined ||
      updates.brightness !== undefined;

    setDevices((prev) =>
      prev.map((d) =>
        d.deviceId === device.deviceId
          ? {
              ...d,
              isOn: isTurningOn,
              color: newColor,
              brightness: newBrightness,
            }
          : d,
      ),
    );

    try {
      await fetch("http://localhost:3000/api/tapo/light", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: device.deviceId,
          state: isTurningOn,
          color: newColor,
          brightness: newBrightness,
        }),
      });
    } catch (error) {
      console.error("Errore aggiornamento luce:", error);
    }
  };

  const handleLocalBrightnessDrag = (deviceId: string, brightness: number) => {
    setDevices((prev) =>
      prev.map((d) => (d.deviceId === deviceId ? { ...d, brightness } : d)),
    );
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 md:p-10 font-sans text-neutral-800">
      <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-indigo-600 tracking-tight">
            DOMOS
          </h1>
          <p className="text-neutral-500 font-medium mt-1">
            Device Orchestration for Multivendor Open Systems
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm border border-green-200">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
            Backend Connesso
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {isLoading && devices.length === 0 && (
          <div className="col-span-full text-center py-10 text-neutral-500">
            Lettura stato dispositivi in corso...
          </div>
        )}

        {devices.map((device) => {
          const isPoweredOn = device.isOn;
          const isLight =
            device.deviceModel.toUpperCase().includes("L") ||
            device.deviceModel.toUpperCase().includes("BULB");

          // Logica per determinare la marca e creare un piccolo badge
          const isKasa =
            device.deviceType?.toUpperCase().startsWith("IOT.") ||
            device.deviceModel.toUpperCase().startsWith("HS");
          const brandName = isKasa ? "KASA" : "TAPO";

          return (
            <div
              key={device.deviceId}
              className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="flex justify-between items-start mb-4">
                <h2
                  className="text-xl font-bold text-neutral-800 line-clamp-1"
                  title={device.alias}
                >
                  {device.alias}
                </h2>

                {/* Badge Marca */}
                <span className="text-xs font-black text-neutral-300 tracking-widest ml-2">
                  {brandName}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-6">
                <span
                  className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wide border
                  ${
                    isLight
                      ? "text-amber-600 bg-amber-50 border-amber-100"
                      : "text-blue-600 bg-blue-50 border-blue-100"
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

              <div className="mt-auto">
                <button
                  onClick={() =>
                    isLight
                      ? applyLightSettings(device, { state: !isPoweredOn })
                      : togglePlug(device.deviceId, isPoweredOn)
                  }
                  className={`w-full py-2.5 rounded-xl font-semibold shadow-sm transition-colors cursor-pointer ${
                    isPoweredOn
                      ? "bg-neutral-100 hover:bg-neutral-200 text-neutral-800"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
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

                {isLight && (
                  <div className="mt-4 p-4 bg-neutral-50 rounded-xl border border-neutral-100">
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-neutral-500 uppercase">
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
                          handleLocalBrightnessDrag(
                            device.deviceId,
                            parseInt(e.target.value),
                          )
                        }
                        onMouseUp={(e) =>
                          applyLightSettings(device, {
                            brightness: parseInt(
                              (e.target as HTMLInputElement).value,
                            ),
                          })
                        }
                        onTouchEnd={(e) =>
                          applyLightSettings(device, {
                            brightness: parseInt(
                              (e.target as HTMLInputElement).value,
                            ),
                          })
                        }
                        className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          applyLightSettings(device, { color: "red" })
                        }
                        className="flex-1 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-bold transition-colors cursor-pointer"
                      >
                        Rosso
                      </button>
                      <button
                        onClick={() =>
                          applyLightSettings(device, { color: "blue" })
                        }
                        className="flex-1 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-bold transition-colors cursor-pointer"
                      >
                        Blu
                      </button>
                      <button
                        onClick={() =>
                          applyLightSettings(device, { color: "green" })
                        }
                        className="flex-1 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-sm font-bold transition-colors cursor-pointer"
                      >
                        Verde
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
