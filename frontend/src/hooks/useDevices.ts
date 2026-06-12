import { useState, useEffect, useCallback } from "react";
import type { SmartDevice, LightUpdates } from "../types/types";
import * as api from "../api/domosClient";

// Hook centrale: gestisce stato dispositivi, caricamento e azioni con
// aggiornamento ottimistico della UI.
export function useDevices() {
  const [devices, setDevices] = useState<SmartDevice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadDevices = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.fetchDevices();
      setDevices(data);
    } catch (err) {
      console.error("Errore fetch dispositivi:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Caricamento iniziale dei dispositivi all'avvio (fetch-on-mount)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDevices();
  }, [loadDevices]);

  // Imposta lo stato assoluto di una presa con rollback in caso di errore
  const setPlugPower = useCallback(
    async (deviceId: string, state: boolean) => {
      setDevices((prev) =>
        prev.map((d) => (d.deviceId === deviceId ? { ...d, isOn: state } : d)),
      );

      try {
        await api.setPower(deviceId, state);
      } catch {
        // Rollback allo stato precedente
        setDevices((prev) =>
          prev.map((d) =>
            d.deviceId === deviceId ? { ...d, isOn: !state } : d,
          ),
        );
      }
    },
    [],
  );

  // Toggle presa smart (comodità sopra setPlugPower)
  const togglePlug = useCallback(
    (deviceId: string, currentIsOn: boolean) =>
      setPlugPower(deviceId, !currentIsOn),
    [setPlugPower],
  );

  // Applica impostazioni luce (stato/colore/luminosità)
  const applyLightSettings = useCallback(
    async (device: SmartDevice, updates: LightUpdates) => {
      const newColor = updates.color || device.color || "white";
      const newBrightness = updates.brightness || device.brightness || 100;

      const isTurningOn =
        (updates.state !== undefined ? updates.state : device.isOn) ||
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
        await api.setLight(
          device.deviceId,
          isTurningOn,
          newColor,
          newBrightness,
        );
      } catch (error) {
        console.error("Errore aggiornamento luce:", error);
      }
    },
    [],
  );

  // Aggiornamento locale durante il trascinamento dello slider (no chiamata API)
  const handleLocalBrightnessDrag = useCallback(
    (deviceId: string, brightness: number) => {
      setDevices((prev) =>
        prev.map((d) => (d.deviceId === deviceId ? { ...d, brightness } : d)),
      );
    },
    [],
  );

  // Anteprima locale del colore durante il trascinamento (no chiamata API)
  const handleLocalColorDrag = useCallback(
    (deviceId: string, color: string) => {
      setDevices((prev) =>
        prev.map((d) => (d.deviceId === deviceId ? { ...d, color } : d)),
      );
    },
    [],
  );

  return {
    devices,
    isLoading,
    reload: loadDevices,
    setPlugPower,
    togglePlug,
    applyLightSettings,
    handleLocalBrightnessDrag,
    handleLocalColorDrag,
  };
}
