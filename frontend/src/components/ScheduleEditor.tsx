import { useState } from "react";
import type { RecurringSchedule } from "../types/types";

interface ScheduleEditorProps {
  deviceId: string;
  schedules: RecurringSchedule[];
  onAdd: (input: Omit<RecurringSchedule, "id">) => void;
  onUpdate: (id: string, patch: Partial<Omit<RecurringSchedule, "id">>) => void;
  onDelete: (id: string) => void;
}

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

function daysSummary(days: number[]): string {
  if (days.length === 7) return "Ogni giorno";
  const sorted = [...days].sort((a, b) => a - b);
  // Lun-Ven
  if (sorted.join() === "1,2,3,4,5") return "Feriali";
  if (sorted.join() === "0,6") return "Weekend";
  return sorted.map((d) => DAY_LABELS[d]).join(" ");
}

export default function ScheduleEditor({
  deviceId,
  schedules,
  onAdd,
  onUpdate,
  onDelete,
}: ScheduleEditorProps) {
  const mySchedules = schedules.filter((s) => s.deviceId === deviceId);

  const [time, setTime] = useState("08:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [targetState, setTargetState] = useState(true);

  const toggleDay = (d: number) =>
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );

  const handleAdd = () => {
    if (days.length === 0) return;
    onAdd({ deviceId, targetState, time, days: [...days].sort(), enabled: true });
  };

  return (
    <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4">
      <div className="mb-3 flex items-center gap-1.5 text-neutral-500">
        <CalendarIcon className="h-3.5 w-3.5" />
        <span className="text-xs font-bold uppercase tracking-wide">
          Schedulazioni ricorrenti
        </span>
      </div>

      {/* Elenco esistenti */}
      {mySchedules.length > 0 && (
        <div className="mb-4 space-y-2">
          {mySchedules.map((s) => (
            <div
              key={s.id}
              className={`flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 ${
                s.enabled ? "border-neutral-200" : "border-neutral-100 opacity-60"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-neutral-800">
                    {s.time}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                      s.targetState
                        ? "bg-blue-50 text-blue-600"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {s.targetState ? "Accendi" : "Spegni"}
                  </span>
                </div>
                <span className="text-xs text-neutral-500">
                  {daysSummary(s.days)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => onUpdate(s.id, { enabled: !s.enabled })}
                  title={s.enabled ? "Disattiva" : "Attiva"}
                  className={`rounded-lg px-2 py-1 text-xs font-bold transition-colors cursor-pointer ${
                    s.enabled
                      ? "text-green-600 hover:bg-green-50"
                      : "text-neutral-400 hover:bg-neutral-100"
                  }`}
                >
                  {s.enabled ? "ON" : "OFF"}
                </button>
                <button
                  onClick={() => onDelete(s.id)}
                  title="Elimina"
                  className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="h-4 w-4"
                  >
                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form nuova schedulazione */}
      <div className="space-y-3 rounded-lg border border-dashed border-neutral-200 p-3">
        <div className="flex items-center gap-3">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 font-mono text-sm font-semibold text-neutral-800"
          />
          <div className="flex flex-1 overflow-hidden rounded-lg border border-neutral-200">
            <button
              onClick={() => setTargetState(true)}
              className={`flex-1 py-1.5 text-sm font-bold transition-colors cursor-pointer ${
                targetState
                  ? "bg-blue-600 text-white"
                  : "bg-white text-neutral-500 hover:bg-neutral-50"
              }`}
            >
              Accendi
            </button>
            <button
              onClick={() => setTargetState(false)}
              className={`flex-1 py-1.5 text-sm font-bold transition-colors cursor-pointer ${
                !targetState
                  ? "bg-neutral-700 text-white"
                  : "bg-white text-neutral-500 hover:bg-neutral-50"
              }`}
            >
              Spegni
            </button>
          </div>
        </div>

        <div className="flex justify-between gap-1">
          {DAY_LABELS.map((label, d) => (
            <button
              key={d}
              onClick={() => toggleDay(d)}
              className={`h-8 w-8 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                days.includes(d)
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {label[0]}
            </button>
          ))}
        </div>

        <button
          onClick={handleAdd}
          disabled={days.length === 0}
          className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          Aggiungi schedulazione
        </button>
      </div>
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
