import React, { useState, useEffect } from "react";

export default function App() {
  interface TapoDevice {
    deviceId: string;
    alias: string;
    isOn: boolean;
    deviceModel: string;
  }

  // 1. Aggiungiamo lo stato per salvare le prese Tapo trovate
  const [tapoDevices, setTapoDevices] = useState<TapoDevice[]>([]);

  // 2. Carichiamo la lista delle prese all'avvio della pagina
  useEffect(() => {
    fetch("http://localhost:3000/api/tapo/list")
      .then((res) => res.json())
      .then(async (data) => {
        if (data.status !== "OK") return;

        // Per ogni device, leggi lo stato reale localmente
        const devicesWithRealStatus = await Promise.all(
          data.data.map(async (device: TapoDevice) => {
            try {
              const res = await fetch(
                `http://localhost:3000/api/tapo/status/${device.deviceId}`,
              );
              const s = await res.json();
              return { ...device, status: s.isOn ? 1 : 0 };
            } catch {
              return device; // fallback allo stato cloud
            }
          }),
        );
        setTapoDevices(devicesWithRealStatus);
      });
  }, []);

  // 3. Modifichiamo la funzione per usare il deviceId dinamico
  const toggleTapo = async (deviceId: string, currentIsOn: boolean) => {
    setTapoDevices((prev) =>
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

      if (!response.ok) {
        // Rollback
        setTapoDevices((prev) =>
          prev.map((d) =>
            d.deviceId === deviceId ? { ...d, isOn: currentIsOn } : d,
          ),
        );
      }
    } catch {
      setTapoDevices((prev) =>
        prev.map((d) =>
          d.deviceId === deviceId ? { ...d, isOn: currentIsOn } : d,
        ),
      );
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 md:p-10 font-sans text-neutral-800">
      {/* Header (Invariato) */}
      <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-indigo-600 tracking-tight">
            DOMOS
          </h1>
          <p className="text-neutral-500 font-medium mt-1">
            Device Orchestration for Multivendor Open Systems
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
            Backend Connesso
          </div>
        </div>
      </header>

      {/* Main Grid dei Dispositivi */}
      <main className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* --- INIZIO SEZIONE TAPO DINAMICA --- */}
        {/* Genera automaticamente una card con il tuo design per ogni presa trovata */}
        {tapoDevices.map((device) => {
          const isPoweredOn = device.isOn;

          return (
            <div
              key={device.deviceId}
              className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-xl font-bold text-neutral-800">
                  {device.alias} {/* Es. "Tapo P105" o "Luce Salotto" */}
                </h2>
                <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide border border-blue-100">
                  Presa Smart
                </span>
              </div>
              <p className="text-sm text-neutral-500 mb-6">
                Stato:{" "}
                <span
                  className={`font-semibold ${isPoweredOn ? "text-green-600" : "text-neutral-800"}`}
                >
                  {isPoweredOn ? "Accesa" : "Spenta"}
                </span>
              </p>
              <button
                onClick={() => toggleTapo(device.deviceId, isPoweredOn)}
                className={`w-full py-2.5 rounded-xl font-semibold shadow-sm transition-colors cursor-pointer ${
                  isPoweredOn
                    ? "bg-neutral-100 hover:bg-neutral-200 text-neutral-800"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {isPoweredOn ? "Spegni Presa" : "Accendi Presa"}
              </button>
            </div>
          );
        })}
        {/* --- FINE SEZIONE TAPO DINAMICA --- */}
      </main>

      {/* Sezione Scenari Multivendor (Invariata) */}
      <section className="mt-12 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-neutral-200">
        <h3 className="text-2xl font-bold text-neutral-800 mb-2">
          Automazioni e Scenari
        </h3>
        <p className="text-neutral-500 mb-6">
          Orchestra dispositivi di produttori diversi con un singolo comando.
        </p>

        <div className="flex flex-wrap gap-4">
          <button className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md font-bold transition-all hover:-translate-y-0.5 cursor-pointer flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                clipRule="evenodd"
              />
            </svg>
            Avvia "Stanza Sensoriale"
          </button>

          <button className="px-6 py-3.5 bg-neutral-800 hover:bg-black text-white rounded-xl shadow-md font-bold transition-all hover:-translate-y-0.5 cursor-pointer">
            Spegnimento Globale
          </button>
        </div>
      </section>
    </div>
  );
}
