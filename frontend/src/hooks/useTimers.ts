import { useState, useEffect, useRef, useCallback } from "react";
import type { DeviceTimer } from "../types/types";

const STORAGE_KEY = "domos.timers";

type TimerMap = Record<string, DeviceTimer>;

function loadFromStorage(): TimerMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as TimerMap;
  } catch {
    return {};
  }
}

function saveToStorage(timers: TimerMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
  } catch {
    /* storage non disponibile: ignora */
  }
}

/**
 * Gestisce timer di accensione/spegnimento pianificati lato client.
 * `onFire` viene chiamato quando un timer scade con lo stato desiderato.
 * I timer sono persistiti in localStorage per sopravvivere ai refresh.
 */
export function useTimers(onFire: (deviceId: string, targetState: boolean) => void) {
  const [timers, setTimers] = useState<TimerMap>(() => loadFromStorage());
  // Tick aggiornato ogni secondo: usato dai componenti per il countdown
  const [now, setNow] = useState(() => Date.now());

  // Riferimento sempre aggiornato a onFire per evitare di ripianificare i timeout
  const onFireRef = useRef(onFire);
  useEffect(() => {
    onFireRef.current = onFire;
  });

  const handles = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const cancelTimer = useCallback((deviceId: string) => {
    const handle = handles.current[deviceId];
    if (handle) {
      clearTimeout(handle);
      delete handles.current[deviceId];
    }
    setTimers((prev) => {
      if (!prev[deviceId]) return prev;
      const next = { ...prev };
      delete next[deviceId];
      saveToStorage(next);
      return next;
    });
  }, []);

  const fire = useCallback(
    (deviceId: string, targetState: boolean) => {
      onFireRef.current(deviceId, targetState);
      cancelTimer(deviceId);
    },
    [cancelTimer],
  );

  // (Ri)pianifica il setTimeout reale per un timer
  const arm = useCallback(
    (timer: DeviceTimer) => {
      const delay = Math.max(0, timer.fireAt - Date.now());
      if (handles.current[timer.deviceId]) {
        clearTimeout(handles.current[timer.deviceId]);
      }
      handles.current[timer.deviceId] = setTimeout(
        () => fire(timer.deviceId, timer.targetState),
        delay,
      );
    },
    [fire],
  );

  const scheduleTimer = useCallback(
    (deviceId: string, minutes: number, targetState: boolean) => {
      const timer: DeviceTimer = {
        deviceId,
        targetState,
        fireAt: Date.now() + minutes * 60 * 1000,
      };
      setTimers((prev) => {
        const next = { ...prev, [deviceId]: timer };
        saveToStorage(next);
        return next;
      });
      arm(timer);
    },
    [arm],
  );

  // Al mount: riarma i timer ripristinati da localStorage (scaduti compresi)
  useEffect(() => {
    const restored = loadFromStorage();
    Object.values(restored).forEach((timer) => arm(timer));
    const current = handles.current;
    return () => {
      Object.values(current).forEach((h) => clearTimeout(h));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick di 1s solo quando ci sono timer attivi, per il countdown
  useEffect(() => {
    if (Object.keys(timers).length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timers]);

  return { timers, now, scheduleTimer, cancelTimer };
}
