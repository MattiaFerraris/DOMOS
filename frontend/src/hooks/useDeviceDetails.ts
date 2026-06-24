import { useState, useEffect } from "react";
import type { DeviceEnergy, DeviceInfo, DeviceSource } from "../types/types";
import * as api from "../api/domosClient";

/**
 * Carica energia e info di un dispositivo quando il modal è aperto.
 * L'energia viene ri-letta periodicamente (consumo in tempo reale).
 * I device Zigbee (Philips Hue) non espongono questi dati: vengono saltati.
 */
export function useDeviceDetails(
  deviceId: string | null,
  source?: DeviceSource,
) {
  const [energy, setEnergy] = useState<DeviceEnergy | null>(null);
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!deviceId || source === "zigbee") {
      // Modal chiuso o device senza telemetria: azzera i dati precedenti
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
  }, [deviceId, source]);

  return { energy, info, loading };
}
