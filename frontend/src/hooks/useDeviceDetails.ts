import { useState, useEffect } from "react";
import type { DeviceEnergy, DeviceInfo } from "../types/types";
import * as api from "../api/domosClient";

/**
 * Carica energia e info di un dispositivo quando il modal è aperto.
 * L'energia viene ri-letta periodicamente (consumo in tempo reale).
 */
export function useDeviceDetails(deviceId: string | null) {
  const [energy, setEnergy] = useState<DeviceEnergy | null>(null);
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!deviceId) {
      // Modal chiuso: azzera i dati del dispositivo precedente
      setEnergy(null);
      setInfo(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Prima lettura: energia + info
    void (async () => {
      const [e, i] = await Promise.all([
        api.fetchEnergy(deviceId),
        api.fetchDeviceInfo(deviceId),
      ]);
      if (cancelled) return;
      setEnergy(e);
      setInfo(i);
      setLoading(false);
    })();

    // Refresh periodico della sola energia (consumo live)
    const poll = setInterval(() => {
      void api.fetchEnergy(deviceId).then((e) => {
        if (!cancelled) setEnergy(e);
      });
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [deviceId]);

  return { energy, info, loading };
}
