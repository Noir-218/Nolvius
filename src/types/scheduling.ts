// ─── Enums & Literal Types ───────────────────────────────────────────────────

/** Chức vụ nhân viên */
export type StaffRole = 'SM' | 'MB' | 'FT' | 'CL' | 'HV';

/** Nhóm vai trò để thuật toán phân loại */
export type RoleGroup = 'MANAGER' | 'FULLTIME' | 'PARTTIME';

/** Các khung ca chuẩn — nhận dạng chuỗi Sáng-Tối như 07-15 */
export type ShiftSlot = string;

/** Trạng thái ô lịch trong nguyện vọng */
export type WishStatus = ShiftSlot | 'OFF' | 'FLEXIBLE';

/** Trạng thái ô lịch sau khi xếp */
export type ScheduledStatus = ShiftSlot | 'OFF';

/** Các ngày trong tuần */
export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export const DAYS_OF_WEEK: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LABELS: Record<DayOfWeek, string> = {
  Mon: 'Thứ 2',
  Tue: 'Thứ 3',
  Wed: 'Thứ 4',
  Thu: 'Thứ 5',
  Fri: 'Thứ 6',
  Sat: 'Thứ 7',
  Sun: 'CN',
};

// ─── Staff ───────────────────────────────────────────────────────────────────

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  /** Nguyện vọng theo từng ngày trong tuần */
  wishes: Record<DayOfWeek, WishStatus>;
}

export interface HourFrame {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
  minStaff: number;
  maxStaff: number;
  /** Human-readable time range, e.g. "07-15" */
  timeRange: string;
}

export interface WishViolation {
  staffId: string;
  staffName: string;
  day: DayOfWeek;
  originalWish: string;
  assignedShift: string;
  reason: string;
}

// ─── Staffing Config ─────────────────────────────────────────────────────────

/** Cấu hình định biên nhân sự theo khung giờ */
export interface StaffingConfig {
  mgrOffPerWeek: number;
  /** Số ngày nghỉ tối thiểu cho FT (ví dụ 1) */
  ftOffPerWeek: number;
  /** Giới hạn số buổi cắt OFF cho Quản lý / Full-time */
  maxOffFulltime: number;
  /** Giới hạn số buổi cắt OFF cho Part-time */
  maxOffParttime: number;
  /** Danh sách các ca hợp lệ tự định nghĩa */
  validShifts: string[];
  /** Danh sách khung giờ hoạt động định biên */
  hourFrames: HourFrame[];
}

export const DEFAULT_STAFFING_CONFIG: StaffingConfig = {
  mgrOffPerWeek: 1,
  ftOffPerWeek: 1,
  maxOffFulltime: 1,
  maxOffParttime: 3,
  validShifts: ['07-15', '15-23', '10-18', '07-12', '12-18', '18-23'],
  hourFrames: [
    { id: 'early', label: 'Buổi sáng sớm', startHour: 7, endHour: 10, minStaff: 4, maxStaff: 5, timeRange: '07-10' },
    { id: 'peakMorning', label: 'Cao điểm sáng', startHour: 10, endHour: 15, minStaff: 5, maxStaff: 6, timeRange: '10-15' },
    { id: 'peakEvening', label: 'Cao điểm chiều-tối', startHour: 15, endHour: 23, minStaff: 5, maxStaff: 6, timeRange: '15-23' },
  ],
};

// ─── Schedule Result ─────────────────────────────────────────────────────────

/** Một ô trong lịch xếp */
export interface ScheduleCell {
  status: ScheduledStatus;
  /** AUTO = thuật toán tự xếp, WISH = đúng nguyện vọng, MANUAL = quản lý chỉnh tay */
  source: 'WISH' | 'AUTO' | 'MANUAL';
}

/** Lịch làm việc của một nhân viên trong tuần */
export interface StaffSchedule {
  staff: StaffMember;
  days: Record<DayOfWeek, ScheduleCell>;
  /** Tổng số buổi OFF trong tuần */
  totalOff: number;
  /** Tổng giờ công trong tuần */
  totalHours: number;
}

/** Kết quả xếp lịch cho một ngày */
export interface DayStats {
  day: DayOfWeek;
  /** Số người làm trong từng khung giờ (map từ frameId -> count) */
  frameCounts: Record<string, number>;
  /** Có quản lý không */
  hasManager: boolean;
  /** Vi phạm ràng buộc */
  violations: string[];
}

/** Kết quả xếp lịch cả tuần */
export interface WeeklySchedule {
  weekStart: Date;
  schedules: StaffSchedule[];
  dayStats: Record<DayOfWeek, DayStats>;
  isValid: boolean;
  violations: string[];
  wishViolations: WishViolation[];
}

// ─── Database Types ───────────────────────────────────────────────────────────

export interface StaffMonthlyAccumulation {
  staffId: string;
  accumulatedHours: number;
}

/** Metadata một tuần lịch đã lưu */
export interface SavedWeek {
  id: string;
  week_start: string;
  week_label: string;
  is_valid: boolean;
  violations: string[];
  wish_violations: WishViolation[];
  created_at: string;
}

/** Tổng hợp giờ công theo tháng cho từng nhân viên */
export interface MonthlyStaffSummary {
  staff_id: string;
  staff_name: string;
  staff_role: string;
  month: string; // "2025-07"
  total_hours: number;
  total_days_worked: number;
  total_days_off: number;
  weeks_count: number;
}

// ─── Excel Import ─────────────────────────────────────────────────────────────

/** Hàng dữ liệu thô từ Excel */
export interface RawExcelRow {
  name: string;
  role: string;
  mon: string;
  tue: string;
  wed: string;
  thu: string;
  fri: string;
  sat: string;
  sun: string;
}
