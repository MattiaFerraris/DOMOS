import { useState, useEffect, useCallback } from "react";
import type { NenkoPreset } from "../types/types";
import * as api from "../api/domosClient";

// Hook per la luce Nenko: carica i preset (dal file lato backend) e lo stato,
// ed espone l'invio di un preset con evidenziazione ottimistica.
export function useNenko() {
  const [presets, setPresets] = useState<NenkoPreset[]>([]);
  const [active, setActive] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      api.fetchNenkoPresets(),
      api.fetchNenkoState(),
    ]);
    setPresets(p);
    setActive(s.color);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const sendPreset = useCallback(async (name: string) => {
    const prev = active;
    setActive(name); // evidenzia subito il pulsante premuto
    setError(null);
    try {
      await api.sendNenkoPreset(name);
    } catch {
      setActive(prev); // rollback dell'evidenziazione
      setError(name);
    }
  }, [active]);

  return { presets, active, error, sendPreset, reload: load };
}
