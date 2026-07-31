import { useState, useEffect } from "react";
import type { DeviceEnergy } from "../types/types";
import * as api from "../api/domosClient";

/**
 * Legge il consumo energetico di un dispositivo mentre il modal è aperto,
 * con refresh periodico (consumo in tempo reale).
 */
export function useEnergy(deviceId: string | null, enabled: boolean) {
  const [energy, setEnergy] = useState<DeviceEnergy | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!deviceId || !enabled) {
      // Modal chiuso
      setEnergy(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Prima lettura
    void api.fetchEnergy(deviceId).then((e) => {
      if (cancelled) return;
      setEnergy(e);
      setLoading(false);
    });

    // Refresh periodico (consumo live)
    const poll = setInterval(() => {
      void api.fetchEnergy(deviceId).then((e) => {
        if (!cancelled) setEnergy(e);
      });
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [deviceId, enabled]);

  return { energy, loading };
}
