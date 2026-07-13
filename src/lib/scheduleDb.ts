import { SupabaseClient } from '@supabase/supabase-js';
import { WeeklySchedule, SavedWeek, MonthlyStaffSummary, StaffMember, DayOfWeek, ScheduleCell, StaffMonthlyAccumulation } from '../types/scheduling';

/**
 * Lưu lịch làm việc của một tuần vào database cơ sở
 */
export async function saveWeeklySchedule(
  supabase: SupabaseClient,
  schedule: WeeklySchedule,
  weekLabel: string
): Promise<string> {
  // 1. Tạo bản ghi week
  const { data: weekData, error: weekError } = await supabase
    .from('schedule_weeks' as any)
    .insert([
      {
        week_start: schedule.weekStart.toISOString().split('T')[0],
        week_label: weekLabel,
        is_valid: schedule.isValid,
        violations: schedule.violations,
        wish_violations: schedule.wishViolations,
      },
    ])
    .select()
    .single();

  if (weekError || !weekData) {
    throw new Error(weekError?.message || 'Không thể tạo bản ghi lịch tuần');
  }

  const weekId = (weekData as any).id;

  // 2. Chuyển đổi dữ liệu và insert các dòng schedule_entries
  const entries = schedule.schedules.map(s => ({
    week_id: weekId,
    staff_id: s.staff.id,
    staff_name: s.staff.name,
    staff_role: s.staff.role,
    mon: s.days.Mon.status,
    tue: s.days.Tue.status,
    wed: s.days.Wed.status,
    thu: s.days.Thu.status,
    fri: s.days.Fri.status,
    sat: s.days.Sat.status,
    sun: s.days.Sun.status,
    mon_source: s.days.Mon.source,
    tue_source: s.days.Tue.source,
    wed_source: s.days.Wed.source,
    thu_source: s.days.Thu.source,
    fri_source: s.days.Fri.source,
    sat_source: s.days.Sat.source,
    sun_source: s.days.Sun.source,
    total_hours: s.totalHours,
    total_off: s.totalOff,
  }));

  const { error: entriesError } = await supabase
    .from('schedule_entries' as any)
    .insert(entries);

  if (entriesError) {
    // Rollback tuần
    await supabase.from('schedule_weeks' as any).delete().eq('id', weekId);
    throw new Error(entriesError.message);
  }

  return weekId;
}

/**
 * Load lịch tuần đã lưu theo id từ database cơ sở
 */
export async function loadWeeklySchedule(supabase: SupabaseClient, weekId: string): Promise<WeeklySchedule> {
  const { data: weekData, error: weekError } = await supabase
    .from('schedule_weeks' as any)
    .select('*')
    .eq('id', weekId)
    .single();

  if (weekError || !weekData) {
    throw new Error(weekError?.message || 'Không tìm thấy lịch tuần');
  }

  const week = weekData as any;

  const { data: entriesData, error: entriesError } = await supabase
    .from('schedule_entries' as any)
    .select('*')
    .eq('week_id', weekId);

  if (entriesError || !entriesData) {
    throw new Error(entriesError?.message || 'Không tìm thấy chi tiết ca làm');
  }

  const entries = entriesData as any[];

  // Khôi phục lại WeeklySchedule structure
  const schedules = entries.map((entry: any) => {
    const staff: StaffMember = {
      id: entry.staff_id,
      name: entry.staff_name,
      role: entry.staff_role,
      wishes: {
        Mon: 'FLEXIBLE', Tue: 'FLEXIBLE', Wed: 'FLEXIBLE', Thu: 'FLEXIBLE', Fri: 'FLEXIBLE', Sat: 'FLEXIBLE', Sun: 'FLEXIBLE'
      }
    };

    const days: Record<DayOfWeek, ScheduleCell> = {
      Mon: { status: entry.mon, source: entry.mon_source },
      Tue: { status: entry.tue, source: entry.tue_source },
      Wed: { status: entry.wed, source: entry.wed_source },
      Thu: { status: entry.thu, source: entry.thu_source },
      Fri: { status: entry.fri, source: entry.fri_source },
      Sat: { status: entry.sat, source: entry.sat_source },
      Sun: { status: entry.sun, source: entry.sun_source },
    };

    return {
      staff,
      days,
      totalHours: entry.total_hours,
      totalOff: entry.total_off,
    };
  });

  // Tạo mock dayStats trống vì dữ liệu frameCounts sẽ tự tính ở view UI hoặc lưu động
  const dayStats: any = {};
  const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  DAYS.forEach(d => {
    dayStats[d] = {
      day: d,
      frameCounts: {},
      hasManager: true,
      violations: [],
    };
  });

  return {
    weekStart: new Date(week.week_start),
    schedules,
    dayStats,
    isValid: week.is_valid,
    violations: week.violations || [],
    wishViolations: week.wish_violations || [],
  };
}

/**
 * Lấy danh sách tất cả các tuần đã xếp lịch của cơ sở
 */
export async function listSavedWeeks(supabase: SupabaseClient): Promise<SavedWeek[]> {
  const { data, error } = await supabase
    .from('schedule_weeks' as any)
    .select('*')
    .order('week_start', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as any[]).map((item: any) => ({
    id: item.id,
    week_start: item.week_start,
    week_label: item.week_label,
    is_valid: item.is_valid,
    violations: item.violations,
    wish_violations: item.wish_violations,
    created_at: item.created_at,
  }));
}

/**
 * Lấy báo cáo tổng hợp theo tháng của cơ sở
 */
export async function getMonthlySummary(supabase: SupabaseClient, month: string): Promise<MonthlyStaffSummary[]> {
  const { data, error } = await supabase
    .from('schedule_month_summary' as any)
    .select('*')
    .eq('month', month);

  if (error) throw new Error(error.message);
  return data as any[];
}

/**
 * Lấy tổng số giờ công đã tích lũy của từng nhân viên trong tháng của cơ sở
 */
export async function getAccumulatedHoursForMonth(
  supabase: SupabaseClient,
  month: string,
  excludeWeekStartStr?: string
): Promise<StaffMonthlyAccumulation[]> {
  // Lấy danh sách tuần thuộc tháng ngoại trừ tuần đang xếp
  let query = supabase
    .from('schedule_weeks' as any)
    .select('id')
    .like('week_start', `${month}%`);
    
  if (excludeWeekStartStr) {
    query = query.neq('week_start', excludeWeekStartStr);
  }
  
  const { data: weeks, error: weeksError } = await query;
  if (weeksError || !weeks || weeks.length === 0) {
    return [];
  }
  
  const weekIds = weeks.map((w: any) => w.id);
  
  // Query các entries liên quan
  const { data: entries, error: entriesError } = await supabase
    .from('schedule_entries' as any)
    .select('staff_id, total_hours')
    .in('week_id', weekIds);
    
  if (entriesError || !entries) {
    return [];
  }
  
  // Tính tổng
  const totals: Record<string, number> = {};
  entries.forEach((e: any) => {
    totals[e.staff_id] = (totals[e.staff_id] || 0) + (e.total_hours || 0);
  });
  
  return Object.keys(totals).map(id => ({
    staffId: id,
    accumulatedHours: totals[id],
  }));
}
