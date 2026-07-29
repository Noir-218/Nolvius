import React, { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { format, startOfWeek, addWeeks, subWeeks, getDaysInMonth } from 'date-fns';
import { useFacility } from '../contexts/FacilityContext';
import {
  ChevronLeft,
  ChevronRight,
  Zap,
  Download,
  AlertTriangle,
  CheckCircle,
  Calendar,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Save,
  Clock,
  FileSpreadsheet
} from 'lucide-react';

import { ExcelImporter } from '../components/scheduling/ExcelImporter';
import { StaffingConfigPanel } from '../components/scheduling/StaffingConfigPanel';
import { ScheduleGrid } from '../components/scheduling/ScheduleGrid';
import { scheduleWeek } from '../lib/scheduler';
import {
  saveWeeklySchedule,
  loadWeeklySchedule,
  listSavedWeeks,
  getMonthlySummary,
  getAccumulatedHoursForMonth
} from '../lib/scheduleDb';
import {
  StaffMember,
  StaffingConfig,
  WeeklySchedule,
  DayOfWeek,
  ShiftSlot,
  DEFAULT_STAFFING_CONFIG,
  DAYS_OF_WEEK,
  DAY_LABELS,
  SavedWeek,
  MonthlyStaffSummary
} from '../types/scheduling';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getWeekLabel(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return `${format(weekStart, 'dd/MM')} – ${format(end, 'dd/MM/yyyy')}`;
}

/**
 * Tính số giờ công chuẩn cho chức danh FT trở lên trong tháng:
 * (Số ngày trong tháng - số ngày Chủ Nhật) * 8 tiếng.
 */
function getStandardMonthlyHours(monthStr: string): number {
  if (!monthStr) return 0;
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  const totalDays = getDaysInMonth(date);
  
  let sundays = 0;
  for (let d = 1; d <= totalDays; d++) {
    const checkDate = new Date(year, month - 1, d);
    if (checkDate.getDay() === 0) { // 0 = Sunday
      sundays++;
    }
  }
  
  return (totalDays - sundays) * 8;
}

const Scheduling: React.FC = () => {
  const { facilityClient: supabase } = useFacility();
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [config, setConfig] = useState<StaffingConfig>({ ...DEFAULT_STAFFING_CONFIG });
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Left Panel Navigation
  const [leftPanelTab, setLeftPanelTab] = useState<'import' | 'config' | 'history'>('import');
  
  // Main Panel Navigation: 'week' (xem tuần hiện tại) hoặc 'month' (theo dõi tháng)
  const [mainTab, setMainTab] = useState<'week' | 'month'>('week');
  
  const [showViolations, setShowViolations] = useState(true);
  
  // DB States
  const [savedWeeks, setSavedWeeks] = useState<SavedWeek[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => format(new Date(), 'yyyy-MM'));
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlyStaffSummary[]>([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  // Load danh sách tuần đã lưu vào history tab
  const fetchSavedWeeks = useCallback(async () => {
    if (!supabase) return;
    try {
      const list = await listSavedWeeks(supabase);
      setSavedWeeks(list);
    } catch (err) {
      console.error('Không thể load danh sách lịch sử tuần', err);
    }
  }, [supabase]);

  useEffect(() => {
    fetchSavedWeeks();
  }, [fetchSavedWeeks]);

  // Load tổng hợp tháng khi tab tháng hoặc bộ lọc tháng thay đổi
  const fetchMonthlySummaryData = useCallback(async () => {
    if (mainTab !== 'month' || !supabase) return;
    setLoadingMonthly(true);
    try {
      const summaries = await getMonthlySummary(supabase, selectedMonth);
      setMonthlySummaries(summaries);
    } catch (err) {
      console.error('Không thể load tổng hợp tháng', err);
    } finally {
      setLoadingMonthly(false);
    }
  }, [mainTab, selectedMonth, supabase]);

  useEffect(() => {
    fetchMonthlySummaryData();
  }, [fetchMonthlySummaryData]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleImport = useCallback((staff: StaffMember[]) => {
    setStaffList(staff);
    setSchedule(null);
  }, []);

  const handleRunScheduler = useCallback(async () => {
    if (staffList.length === 0 || !supabase) return;
    setIsRunning(true);

    try {
      // Gọi database lấy số giờ tích luỹ tháng này (trừ tuần đang xếp) để đưa vào tham số đầu vào thuật toán
      const monthStr = format(weekStart, 'yyyy-MM');
      const excludeWeekStr = weekStart.toISOString().split('T')[0];
      const accumulations = await getAccumulatedHoursForMonth(supabase, monthStr, excludeWeekStr);
      
      // Chạy bất đồng bộ
      setTimeout(() => {
        const result = scheduleWeek(staffList, config, weekStart, accumulations);
        setSchedule(result);
        setIsRunning(false);
      }, 50);
    } catch (err) {
      console.error('Lỗi khi lấy dữ liệu công tích lũy tháng:', err);
      // Fallback chạy không có accumulations
      setTimeout(() => {
        const result = scheduleWeek(staffList, config, weekStart);
        setSchedule(result);
        setIsRunning(false);
      }, 50);
    }
  }, [staffList, config, weekStart, supabase]);

  const handleCellChange = useCallback((staffId: string, day: DayOfWeek, newStatus: ShiftSlot | 'OFF') => {
    if (!schedule) return;

    setSchedule(prev => {
      if (!prev) return prev;
      
      // 1. Cập nhật schedules của nhân sự
      const updatedSchedules = prev.schedules.map(s => {
        if (s.staff.id !== staffId) return s;
        const newDays = { ...s.days, [day]: { status: newStatus, source: 'MANUAL' as const } };
        
        let totalHours = 0;
        let totalOff = 0;
        for (const d of DAYS_OF_WEEK) {
          const cell = newDays[d];
          if (cell.status === 'OFF') {
            totalOff++;
          } else {
            const match = cell.status.match(/^(\d{1,2})-(\d{1,2})$/);
            if (match) {
              const start = parseInt(match[1], 10);
              const end = parseInt(match[2], 10);
              const hours = end < start ? (end + 24 - start) : (end - start);
              totalHours += hours;
            }
          }
        }
        return { ...s, days: newDays, totalHours, totalOff };
      });

      // 2. Tính lại dayStats cho ngày vừa chỉnh sửa
      const daySchedules = updatedSchedules.map(s => ({
        role: s.staff.role,
        shift: s.days[day].status
      }));

      // Đếm số người trực theo từng khung giờ
      const frameCounts: Record<string, number> = {};
      config.hourFrames.forEach(frame => {
        frameCounts[frame.id] = 0;
        daySchedules.forEach(({ shift }) => {
          if (shift === 'OFF') return;
          const match = shift.match(/^(\d{1,2})-(\d{1,2})$/);
          if (match) {
            const s = parseInt(match[1], 10);
            const e = parseInt(match[2], 10);
            const end = e < s ? e + 24 : e;
            if (s < frame.endHour && end > frame.startHour) {
              frameCounts[frame.id]++;
            }
          }
        });
      });

      // Kiểm tra xem có quản lý (SM/MB) trực ngày hôm đó hay không
      const hasManager = daySchedules.some(({ role, shift }) => 
        (role === 'SM' || role === 'MB') && shift !== 'OFF'
      );

      // Cập nhật dayStats
      const updatedDayStats = {
        ...prev.dayStats,
        [day]: {
          ...prev.dayStats[day],
          frameCounts,
          hasManager
        }
      };

      return {
        ...prev,
        schedules: updatedSchedules,
        dayStats: updatedDayStats
      };
    });
  }, [schedule, config.hourFrames]);

  const handleSaveToDb = async () => {
    if (!schedule || !supabase) return;
    setIsSaving(true);
    try {
      const label = getWeekLabel(weekStart);
      await saveWeeklySchedule(supabase, schedule, label);
      alert('Lưu lịch làm việc tuần thành công!');
      fetchSavedWeeks();
    } catch (err: any) {
      console.error(err);
      alert('Lỗi lưu lịch: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadWeek = async (weekId: string) => {
    if (!supabase) return;
    try {
      const loaded = await loadWeeklySchedule(supabase, weekId);
      setWeekStart(loaded.weekStart);
      setSchedule(loaded);
      // Gán danh sách staff từ lịch được load
      const members = loaded.schedules.map(s => s.staff);
      setStaffList(members);
      setMainTab('week');
      alert('Tải lịch làm việc tuần thành công!');
    } catch (err: any) {
      console.error(err);
      alert('Lỗi tải lịch: ' + err.message);
    }
  };

  const handleExportExcel = useCallback(() => {
    if (!schedule) return;

    const data = schedule.schedules.map(s => {
      const row: Record<string, string> = {
        'Họ tên': s.staff.name,
        'Chức vụ': s.staff.role,
      };
      for (const day of DAYS_OF_WEEK) {
        row[DAY_LABELS[day]] = s.days[day].status;
      }
      row['Tổng giờ'] = `${s.totalHours}h`;
      row['Số ngày OFF'] = String(s.totalOff);
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = Object.keys(data[0] || {}).map(() => ({ wch: 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lịch làm việc');
    XLSX.writeFile(wb, `lich-lam-viec-${format(weekStart, 'dd-MM-yyyy')}.xlsx`);
  }, [schedule, weekStart]);

  // ── Render ───────────────────────────────────────────────────────────────────
  const violations = schedule?.violations ?? [];
  const hasViolations = violations.length > 0;
  const standardHours = getStandardMonthlyHours(selectedMonth);

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Xếp Lịch Làm Việc</h1>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5">
            Auto-Scheduling System (5 Priorities)
          </p>
        </div>

        {/* Tab chuyển đổi giữa Xem Tuần và Báo Cáo Tháng */}
        <div className="flex bg-soft-gray p-1 rounded-xl">
          <button
            onClick={() => setMainTab('week')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mainTab === 'week' ? 'bg-warm-white text-forest-dark shadow-sm' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Lịch làm việc tuần
          </button>
          <button
            onClick={() => setMainTab('month')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mainTab === 'month' ? 'bg-warm-white text-forest-dark shadow-sm' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Báo cáo tháng
          </button>
        </div>

        {/* Week navigator */}
        {mainTab === 'week' && (
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2 shadow-sm">
            <button
              onClick={() => { setWeekStart(subWeeks(weekStart, 1)); setSchedule(null); }}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft size={16} className="text-gray-500" />
            </button>
            <div className="flex items-center gap-2 px-2">
              <Calendar size={14} className="text-teal-600" />
              <span className="text-sm font-black text-gray-800 whitespace-nowrap">
                {getWeekLabel(weekStart)}
              </span>
            </div>
            <button
              onClick={() => { setWeekStart(addWeeks(weekStart, 1)); setSchedule(null); }}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight size={16} className="text-gray-500" />
            </button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left Panel (chỉ hiển thị khi đang ở tab tuần) */}
        {mainTab === 'week' && (
          <aside className="w-72 shrink-0 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            {/* Tab switcher */}
            <div className="flex border-b border-gray-100">
              {[
                { key: 'import', label: 'Import Excel', icon: '📂' },
                { key: 'config', label: 'Định biên', icon: '⚙️' },
                { key: 'history', label: 'Lịch sử', icon: '⏳' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setLeftPanelTab(tab.key as 'import' | 'config' | 'history')}
                  className={`flex-1 flex items-center justify-center gap-1 py-3 text-xs font-bold transition-colors border-b-2 ${
                    leftPanelTab === tab.key
                      ? 'text-forest-dark border-forest bg-forest/5'
                      : 'text-text-muted border-transparent hover:text-text-main'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              {leftPanelTab === 'import' && (
                <ExcelImporter onImport={handleImport} validShifts={config.validShifts} />
              )}
              {leftPanelTab === 'config' && (
                <StaffingConfigPanel config={config} onChange={setConfig} />
              )}
              {leftPanelTab === 'history' && (
                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Lịch đã lưu</p>
                  {savedWeeks.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Chưa có lịch được lưu.</p>
                  ) : (
                    savedWeeks.map(w => (
                      <button
                        key={w.id}
                        onClick={() => handleLoadWeek(w.id)}
                        className="w-full text-left p-2.5 rounded-xl border border-gray-100 hover:bg-teal-50 hover:border-teal-200 transition-all flex flex-col gap-1"
                      >
                        <span className="text-xs font-bold text-gray-800">{w.week_label}</span>
                        <span className="text-[9px] text-gray-400">{format(new Date(w.created_at), 'dd/MM/yyyy HH:mm')}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Run button */}
            <div className="p-4 border-t border-gray-100 space-y-2">
              <button
                onClick={handleRunScheduler}
                disabled={staffList.length === 0 || isRunning}
                className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all bg-forest hover:bg-forest-dark text-warm-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunning ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    Đang xếp lịch...
                  </>
                ) : (
                  <>
                    <Zap size={15} />
                    Chạy Thuật Toán
                  </>
                )}
              </button>
            </div>
          </aside>
        )}

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {mainTab === 'week' ? (
            <>
              {/* Violations banner */}
              {schedule && (
                <div className={`rounded-2xl border px-4 py-3 ${
                  hasViolations
                    ? 'bg-red-50 border-red-200'
                    : 'bg-emerald-50 border-emerald-200'
                }`}>
                  <button
                    onClick={() => setShowViolations(!showViolations)}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      {hasViolations ? (
                        <AlertTriangle size={15} className="text-red-500 shrink-0" />
                      ) : (
                        <CheckCircle size={15} className="text-emerald-500 shrink-0" />
                      )}
                      <span className={`text-sm font-bold ${hasViolations ? 'text-red-700' : 'text-emerald-700'}`}>
                        {hasViolations
                          ? `${violations.length} vi phạm ràng buộc — click để xem`
                          : 'Lịch hợp lệ! Tất cả ràng buộc được tuân thủ.'}
                      </span>
                    </div>
                    {hasViolations && (
                      showViolations ? <ChevronUp size={14} className="text-red-400" /> : <ChevronDown size={14} className="text-red-400" />
                    )}
                  </button>

                  {hasViolations && showViolations && (
                    <ul className="mt-2 space-y-1 pl-5">
                      {violations.map((v, i) => (
                        <li key={i} className="text-xs text-red-600 font-medium list-disc">{v}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Grid or empty state */}
              <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                {!schedule ? (
                  <div className="h-full flex flex-col items-center justify-center gap-6 p-8 bg-warm-white">
                    <div className="w-16 h-16 rounded-2xl bg-sage-soft flex items-center justify-center shadow-sm">
                      <Calendar size={28} className="text-forest" />
                    </div>
                    <div className="text-center max-w-sm">
                      <h3 className="text-lg font-semibold text-text-main mb-2">Bắt đầu xếp lịch</h3>
                      <p className="text-sm text-text-muted mb-6 leading-relaxed">
                        {staffList.length === 0
                          ? 'Vui lòng import danh sách nguyện vọng ca của nhân viên từ file Excel để hệ thống tính toán.'
                          : `Hệ thống đã ghi nhận ${staffList.length} nhân viên hợp lệ. Nhấn nút bên dưới để tiến hành xếp lịch tự động.`}
                      </p>
                      {staffList.length > 0 && (
                         <button
                           onClick={handleRunScheduler}
                           disabled={isRunning}
                           className="px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all bg-forest hover:bg-forest-dark text-warm-white mx-auto shadow-sm"
                         >
                           {isRunning ? <RefreshCw size={15} className="animate-spin" /> : <Zap size={15} />}
                           {isRunning ? 'Đang xếp lịch...' : 'Chạy Thuật Toán'}
                         </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="overflow-auto h-full">
                    <ScheduleGrid schedule={schedule} onCellChange={handleCellChange} validShifts={config.validShifts} />
                  </div>
                )}
              </div>

              {/* Export & Save bar */}
              {schedule && (
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="font-bold text-gray-700">{schedule.schedules.length} nhân viên</span>
                    <span>•</span>
                    <span>
                      Tổng giờ công:{' '}
                      <span className="font-bold text-teal-600">
                        {schedule.schedules.reduce((acc, s) => acc + s.totalHours, 0)}h
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRunScheduler}
                      className="px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw size={12} />
                      Xếp lại
                    </button>
                    <button
                      onClick={handleSaveToDb}
                      disabled={isSaving}
                      className="px-4 py-2 text-xs font-semibold bg-forest text-warm-white hover:bg-forest-dark rounded-xl shadow-sm flex items-center gap-1.5 transition-all"
                    >
                      <Save size={13} />
                      {isSaving ? 'Đang lưu...' : 'Lưu lịch tuần'}
                    </button>
                    <button
                      onClick={handleExportExcel}
                      className="px-4 py-2 bg-warm-white hover:bg-sage-soft text-forest text-xs font-semibold border border-forest rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Download size={13} />
                      Xuất Excel
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Month Report View */
            <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 overflow-hidden flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2">
                  <Clock className="text-teal-600" size={20} />
                  <div>
                    <h2 className="text-lg font-black text-gray-800">Theo dõi công tích lũy theo tháng</h2>
                    <p className="text-xs text-gray-400">Giờ công chuẩn nhóm FT trở lên = (Ngày trong tháng - số ngày Chủ Nhật) x 8 tiếng</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-xs text-gray-400 font-bold block uppercase">Giờ công chuẩn tháng này:</span>
                    <span className="text-sm font-black text-teal-600">{standardHours} giờ</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-gray-500">Chọn tháng:</label>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={e => setSelectedMonth(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-50 outline-none focus:border-teal-500"
                    />
                  </div>
                </div>
              </div>

              {loadingMonthly ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400 text-sm">
                  <RefreshCw className="animate-spin" size={24} />
                  Đang tổng hợp dữ liệu...
                </div>
              ) : monthlySummaries.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                  <FileSpreadsheet size={40} className="text-gray-300" />
                  <p className="text-sm font-bold text-gray-500">Không có dữ liệu trong tháng {selectedMonth}</p>
                  <p className="text-xs text-gray-400 max-w-xs">Hãy lưu lịch của các tuần có ngày công thuộc tháng này.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr style={{ background: '#F7F7F2' }}>
                        <th className="py-3 px-4 border-b" style={{ fontSize: '11px', fontWeight: 600, color: '#626B64', textTransform: 'none' }}>Nhân viên</th>
                        <th className="py-3 px-4 border-b" style={{ fontSize: '11px', fontWeight: 600, color: '#626B64', textTransform: 'none' }}>Chức vụ</th>
                        <th className="py-3 px-4 border-b text-center" style={{ fontSize: '11px', fontWeight: 600, color: '#626B64', textTransform: 'none' }}>Số tuần công</th>
                        <th className="py-3 px-4 border-b text-center" style={{ fontSize: '11px', fontWeight: 600, color: '#626B64', textTransform: 'none' }}>Tổng ngày làm</th>
                        <th className="py-3 px-4 border-b text-center" style={{ fontSize: '11px', fontWeight: 600, color: '#626B64', textTransform: 'none' }}>Giờ công chuẩn</th>
                        <th className="py-3 px-4 border-b text-center" style={{ fontSize: '11px', fontWeight: 600, color: '#626B64', textTransform: 'none' }}>Giờ làm thực tế</th>
                        <th className="py-3 px-4 border-b text-right" style={{ fontSize: '11px', fontWeight: 600, color: '#626B64', textTransform: 'none' }}>Chênh lệch thừa/thiếu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlySummaries.map(s => {
                        const isFullTimeGroup = s.staff_role === 'FT' || s.staff_role === 'MB' || s.staff_role === 'SM';
                        const stdHrs = isFullTimeGroup ? standardHours : 0;
                        const diff = s.total_hours - stdHrs;
                        const diffText = diff > 0 ? `+${diff}h` : `${diff}h`;
                        
                        return (
                          <tr key={s.staff_id} className="border-b border-gray-100 hover:bg-[#F4F7F0]">
                            <td className="py-3.5 px-4 text-xs font-semibold" style={{ color: '#303A34' }}>{s.staff_name}</td>
                            <td className="py-3.5 px-4 text-xs font-semibold">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                s.staff_role === 'SM' || s.staff_role === 'MB' ? 'bg-[#E8E0F0] text-[#5C3D8F]' :
                                s.staff_role === 'FT' ? 'bg-[#D6EAF0] text-[#1E5F74]' : 'bg-[#F5EAD4] text-[#7A5A1A]'
                              }`}>
                                {s.staff_role}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-xs text-center font-mono" style={{ color: '#5F6962' }}>{s.weeks_count}</td>
                            <td className="py-3.5 px-4 text-xs text-center font-mono" style={{ color: '#5F6962' }}>{s.total_days_worked}</td>
                            <td className="py-3.5 px-4 text-xs text-center font-mono" style={{ color: '#5F6962' }}>
                              {isFullTimeGroup ? `${stdHrs}h` : '-'}
                            </td>
                            <td className="py-3.5 px-4 text-xs text-center font-bold font-mono" style={{ color: '#303A34' }}>{s.total_hours}h</td>
                            <td className={`py-3.5 px-4 text-xs text-right font-bold font-mono`} style={{
                              color: !isFullTimeGroup ? '#A5AAA5' : diff >= 0 ? '#2D6A47' : '#A0463A'
                            }}>
                              {isFullTimeGroup ? diffText : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Scheduling;
