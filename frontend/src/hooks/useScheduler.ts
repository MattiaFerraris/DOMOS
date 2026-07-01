import { useState, useEffect, useCallback } from "react";
import type { OneShotTimer, RecurringSchedule } from "../types/types";
import * as api from "../api/domosClient";

type TimerMap = Record<string, OneShotTimer>;

/**
 * Gestisce timer one-shot e schedulazioni ricorrenti lato server.
 */
export function useScheduler() {
  const [timers, setTimers] = useState<TimerMap>({});
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const reloadTimers = useCallback(async () => {
    const list = await api.listTimers();
    const map: TimerMap = {};
    for (const t of list) map[t.deviceId] = t;
    setNow(Date.now());
    setTimers(map);
  }, []);

  const reloadSchedules = useCallback(async () => {
    setSchedules(await api.listSchedules());
  }, []);

  // Caricamento iniziale + polling timer ogni 10s (per sincronizzare lo scadere)
  useEffect(() => {
    // I reload sono asincroni (fetch dal backend): aggiornano lo stato dopo l'await
    /* eslint-disable react-hooks/set-state-in-effect */
    void reloadTimers();
    void reloadSchedules();
    /* eslint-enable react-hooks/set-state-in-effect */
    const poll = setInterval(() => void reloadTimers(), 10 * 1000);
    return () => clearInterval(poll);
  }, [reloadTimers, reloadSchedules]);

  // Tick countdown solo quando ci sono timer attivi
  useEffect(() => {
    if (Object.keys(timers).length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timers]);

  // ── Azioni timer ──────────────────────────────────────────────
  const scheduleTimer = useCallback(
    async (deviceId: string, minutes: number, targetState: boolean) => {
      await api.addTimer(deviceId, minutes, targetState);
      await reloadTimers();
    },
    [reloadTimers],
  );

  const cancelTimer = useCallback(
    async (deviceId: string) => {
      const timer = timers[deviceId];
      if (!timer) return;
      await api.cancelTimer(timer.id);
      await reloadTimers();
    },
    [timers, reloadTimers],
  );

  // ── Azioni schedulazioni ──────────────────────────────────────
  const addSchedule = useCallback(
    async (input: Omit<RecurringSchedule, "id">) => {
      await api.addSchedule(input);
      await reloadSchedules();
    },
    [reloadSchedules],
  );

  const updateSchedule = useCallback(
    async (id: string, patch: Partial<Omit<RecurringSchedule, "id">>) => {
      await api.updateSchedule(id, patch);
      await reloadSchedules();
    },
    [reloadSchedules],
  );

  const deleteSchedule = useCallback(
    async (id: string) => {
      await api.deleteSchedule(id);
      await reloadSchedules();
    },
    [reloadSchedules],
  );

  return {
    timers,
    schedules,
    now,
    scheduleTimer,
    cancelTimer,
    addSchedule,
    updateSchedule,
    deleteSchedule,
  };
}
