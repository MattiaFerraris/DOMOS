import { useState, useEffect } from "react";
import type { DeviceInfo, DeviceSource } from "../types/types";
import * as api from "../api/domosClient";

/**
 * Carica le info di sistema/rete (WiFi, uptime, firmware...) di un dispositivo
 * quando il modal è aperto. Valgono per tutti i Tapo/Kasa, plug e luci.
 * I device Zigbee (Philips Hue) non espongono telemetria: vengono saltati.
 *
 * Il consumo energetico è gestito separatamente da useEnergy (solo plug).
 */
export function useDeviceInfo(deviceId: string | null, source?: DeviceSource) {
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!deviceId || source === "zigbee") {
      // Modal chiuso o device senza telemetria: azzera i dati precedenti
      setInfo(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    void api.fetchDeviceInfo(deviceId).then((i) => {
      if (cancelled) return;
      setInfo(i);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [deviceId, source]);

  return { info, loading };
}
