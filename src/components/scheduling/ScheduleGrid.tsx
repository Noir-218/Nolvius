import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  WeeklySchedule,
  DayOfWeek,
  ShiftSlot,
  DAYS_OF_WEEK,
  DAY_LABELS,
  StaffRole,
} from '../../types/scheduling';
import type { ScheduleCell as ScheduleCellType } from '../../types/scheduling';

interface ScheduleGridProps {
  schedule: WeeklySchedule;
  onCellChange: (staffId: string, day: DayOfWeek, newStatus: ShiftSlot | 'OFF') => void;
  validShifts: string[];
}

// ── Visual config per shift ─────────────────────────────────────────────────
function getShiftStyle(shift: string): { bg: string; text: string; border: string; label: string } {
  if (shift === 'OFF') return { bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-100', label: 'OFF' };
  if (shift === 'FLEXIBLE') return { bg: 'bg-purple-50', text: 'text-purple-400', border: 'border-purple-100', label: 'Linh hoạt' };
  
  const match = shift.match(/^(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const s = parseInt(match[1], 10);
    if (s < 10) return { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', label: `☀️ ${shift}` };
    if (s < 14) return { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200', label: `🌤 ${shift}` };
    if (s < 17) return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: `🌙 ${shift}` };
    return { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', label: `🌃 ${shift}` };
  }
  return { bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-100', label: shift };
}

const SOURCE_DOT: Record<'WISH' | 'AUTO' | 'MANUAL', { color: string; title: string }> = {
  WISH:   { color: 'bg-emerald-400', title: 'Đúng nguyện vọng' },
  AUTO:   { color: 'bg-amber-400',   title: 'Thuật toán tự xếp' },
  MANUAL: { color: 'bg-rose-400',    title: 'Chỉnh tay' },
};

const ROLE_BADGE: Record<StaffRole, { bg: string; text: string }> = {
  SM: { bg: 'bg-purple-100', text: 'text-purple-700' },
  MB: { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
  FT: { bg: 'bg-blue-100', text: 'text-blue-700' },
  CL: { bg: 'bg-amber-100', text: 'text-amber-700' },
  HV: { bg: 'bg-rose-100', text: 'text-rose-700' },
};

// ── Cell Component ──────────────────────────────────────────────────────────
interface CellProps {
  cell: ScheduleCellType;
  staffId: string;
  day: DayOfWeek;
  onCellChange: (staffId: string, day: DayOfWeek, newStatus: ShiftSlot | 'OFF') => void;
  validShifts: string[];
}

const ScheduleCell: React.FC<CellProps> = ({ cell, staffId, day, onCellChange, validShifts }) => {
  const [isOpen, setIsOpen] = useState(false);
  const style = getShiftStyle(cell.status);
  const dot = SOURCE_DOT[cell.source];

  const handleSelect = (val: ShiftSlot | 'OFF') => {
    onCellChange(staffId, day, val);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full min-w-[72px] px-1.5 py-1.5 rounded-lg border text-[11px] font-bold
          flex items-center justify-between gap-1 transition-all hover:shadow-sm
          ${style.bg} ${style.text} ${style.border}`}
      >
        <span className="truncate">{style.label}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${dot.color}`} title={dot.title} />
          <ChevronDown size={10} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden min-w-[120px]">
            {[...validShifts, 'OFF'].map(s => {
              const st = getShiftStyle(s);
              return (
                <button
                  key={s}
                  onClick={() => handleSelect(s)}
                  className={`w-full text-left px-3 py-2 text-xs font-bold transition-colors hover:bg-gray-50
                    ${cell.status === s ? `${st.bg} ${st.text}` : 'text-gray-700'}`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// ── Main Grid ───────────────────────────────────────────────────────────────
export const ScheduleGrid: React.FC<ScheduleGridProps> = ({ schedule, onCellChange, validShifts }) => {
  const { schedules, dayStats } = schedule;

  // Group: managers first, then FT, then parttime
  const grouped = [...schedules].sort((a, b) => {
    const order: Record<StaffRole, number> = { SM: 0, MB: 1, FT: 2, CL: 3, HV: 4 };
    return order[a.staff.role] - order[b.staff.role];
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            {/* Name column */}
            <th className="sticky left-0 z-10 bg-white px-3 py-3 text-left min-w-[180px]">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Nhân viên</span>
            </th>
            {/* Day columns */}
            {DAYS_OF_WEEK.map(day => {
              const stats = dayStats[day];
              const hasViolation = stats?.violations?.length > 0;
              return (
                <th key={day} className="px-1.5 py-2 min-w-[82px]">
                  <div className={`rounded-xl px-2 py-1.5 text-center ${hasViolation ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                    <p className={`text-xs font-black ${hasViolation ? 'text-red-600' : 'text-gray-700'}`}>
                      {DAY_LABELS[day]}
                    </p>
                    {!stats?.hasManager && (
                      <p className="text-[9px] text-red-500 font-bold">⚠ Thiếu QS</p>
                    )}
                  </div>
                </th>
              );
            })}
            {/* Stats columns */}
            <th className="px-2 py-3 min-w-[60px]">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Giờ</span>
            </th>
            <th className="px-2 py-3 min-w-[50px]">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">OFF</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {grouped.map((sched, rowIdx) => {
            const role = sched.staff.role;
            const badge = ROLE_BADGE[role];

            return (
              <tr
                key={sched.staff.id}
                className={`group ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-teal-50/20 transition-colors`}
              >
                {/* Name + role */}
                <td className={`sticky left-0 z-10 px-3 py-2 border-b border-gray-100
                  ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} group-hover:bg-teal-50/20`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-lg ${badge.bg} flex items-center justify-center text-[10px] font-black ${badge.text} shrink-0`}>
                      {role}
                    </div>
                    <span className="text-xs font-bold text-gray-800 truncate max-w-[130px]" title={sched.staff.name}>
                      {sched.staff.name}
                    </span>
                  </div>
                </td>

                {/* Day cells */}
                {DAYS_OF_WEEK.map(day => (
                  <td key={day} className="px-1.5 py-1.5 border-b border-gray-100">
                    <ScheduleCell
                      cell={sched.days[day]}
                      staffId={sched.staff.id}
                      day={day}
                      onCellChange={onCellChange}
                      validShifts={validShifts}
                    />
                  </td>
                ))}

                {/* Hours */}
                <td className="px-2 py-1.5 border-b border-gray-100 text-center">
                  <span className={`text-sm font-black ${sched.totalHours < 40 ? 'text-amber-500' : 'text-gray-700'}`}>
                    {sched.totalHours}h
                  </span>
                </td>

                {/* OFF count */}
                <td className="px-2 py-1.5 border-b border-gray-100 text-center">
                  <span className={`text-sm font-black ${sched.totalOff > 2 ? 'text-red-500' : 'text-gray-500'}`}>
                    {sched.totalOff}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>

        {/* Footer stats row */}
        <tfoot>
          <tr className="bg-gray-900 text-white">
            <td className="sticky left-0 z-10 bg-gray-900 px-3 py-3">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Tổng/khung</span>
            </td>
            {DAYS_OF_WEEK.map(day => {
              const stats = dayStats[day];
              return (
                <td key={day} className="px-1.5 py-2 text-center">
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="text-[9px] text-gray-400">☀</span>
                      <span className={`text-xs font-black ${!stats ? 'text-gray-400' : (stats.frameCounts['early'] ?? 0) > 5 ? 'text-red-400' : (stats.frameCounts['early'] ?? 0) < 4 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {(stats?.frameCounts['early'] ?? '-')}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="text-[9px] text-gray-400">☁</span>
                      <span className={`text-xs font-black ${!stats ? 'text-gray-400' : (stats.frameCounts['peakMorning'] ?? 0) > 6 ? 'text-red-400' : (stats.frameCounts['peakMorning'] ?? 0) < 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {(stats?.frameCounts['peakMorning'] ?? '-')}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="text-[9px] text-gray-400">🌙</span>
                      <span className={`text-xs font-black ${!stats ? 'text-gray-400' : (stats.frameCounts['peakEvening'] ?? 0) > 6 ? 'text-red-400' : (stats.frameCounts['peakEvening'] ?? 0) < 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {(stats?.frameCounts['peakEvening'] ?? '-')}
                      </span>
                    </div>
                  </div>
                </td>
              );
            })}
            <td colSpan={2} className="px-2 py-2">
              <div className="flex items-center gap-3 justify-center text-[10px]">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-gray-400">Nguyện vọng</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-gray-400">Tự động</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-rose-400" />
                  <span className="text-gray-400">Chỉnh tay</span>
                </div>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
