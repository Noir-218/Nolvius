import {
  StaffMember,
  StaffingConfig,
  WeeklySchedule,
  StaffSchedule,
  ScheduleCell,
  DayStats,
  DayOfWeek,
  ShiftSlot,
  WishStatus,
  ScheduledStatus,
  DAYS_OF_WEEK,
  RawExcelRow,
  StaffRole,
  HourFrame,
  WishViolation,
  StaffMonthlyAccumulation,
} from '../types/scheduling';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Trả về nhóm vai trò */
function getRoleGroup(role: StaffRole): 'MANAGER' | 'FULLTIME' | 'PARTTIME' {
  if (role === 'SM' || role === 'MB') return 'MANAGER';
  if (role === 'FT') return 'FULLTIME';
  return 'PARTTIME';
}

/** Số ngày làm tối thiểu theo vai trò */
function getRoleTargetDays(role: StaffRole): number {
  return getRoleGroup(role) === 'PARTTIME' ? 4 : 6;
}

/** Lấy start và end từ chuỗi ca (vd: "07-15") */
function parseShiftTime(shift: ShiftSlot): [number, number] | null {
  if (shift === 'OFF' || shift === 'FLEXIBLE' || shift === 'AUTO') return null;
  const match = shift.match(/^(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return [parseInt(match[1], 10), parseInt(match[2], 10)];
  }
  return null;
}

/** Tính số giờ của một ca */
export function shiftHours(shift: ShiftSlot): number {
  const times = parseShiftTime(shift);
  if (times) {
    const hours = times[1] - times[0];
    return hours > 0 ? hours : hours + 24;
  }
  return 0;
}

/** Kiểm tra ca có hoạt động trong khung giờ không */
export function shiftCoversFrame(shift: ShiftSlot, frameStart: number, frameEnd: number): boolean {
  const times = parseShiftTime(shift);
  if (times) {
    const [s, e] = times;
    const end = e < s ? e + 24 : e;
    return s < frameEnd && end > frameStart;
  }
  return false;
}

/** Hạ ca: tự động cắt bớt 3 tiếng cuối ca nếu ca dài >= 8 tiếng */
export function downgradeShift(shift: ShiftSlot, validShifts: string[]): ShiftSlot {
  const times = parseShiftTime(shift);
  if (times) {
    const [s, e] = times;
    const hours = e < s ? e + 24 - s : e - s;
    if (hours >= 8) {
      const earlyCut = `${String(s).padStart(2, '0')}-${String(e - 3).padStart(2, '0')}`;
      const lateCut = `${String(s + 3).padStart(2, '0')}-${String(e).padStart(2, '0')}`;
      if (s <= 7 && validShifts.includes(earlyCut)) return earlyCut;
      if (e >= 23 && validShifts.includes(lateCut)) return lateCut;
      if (validShifts.includes(earlyCut)) return earlyCut;
      if (validShifts.includes(lateCut)) return lateCut;
      const fallback = validShifts.find(v => v.startsWith(String(s).padStart(2, '0')) && shiftHours(v) >= 5 && shiftHours(v) <= 6);
      if (fallback) return fallback;
    }
  }
  return shift;
}

/**
 * Chuẩn hoá chuỗi ca từ người dùng nhập.
 * Ví dụ: "7-15" → "07-15", "715" → "07-15", "7h-15h" → "07-15"
 */
export function normalizeShift(raw: string, validShifts?: string[]): WishStatus | null {
  if (!raw) return null;
  const clean = raw.toString().trim().toLowerCase()
    .replace(/h/g, '')
    .replace(/\s+/g, '');

  if (clean === 'off' || clean === 'nghi' || clean === 'nghỉ' || clean === 'x') return 'OFF';
  if (clean === 'lh' || clean === 'linhhoat' || clean === 'linhhoạt' || clean === 'free') return 'FLEXIBLE';

  const dashMatch = clean.match(/^(\d{1,2})-(\d{1,2})$/);
  const noSepMatch = clean.match(/^(\d{1,2})(\d{2})$/);

  let start: number | null = null;
  let end: number | null = null;

  if (dashMatch) {
    start = parseInt(dashMatch[1]);
    end = parseInt(dashMatch[2]);
  } else if (noSepMatch) {
    start = parseInt(noSepMatch[1]);
    end = parseInt(noSepMatch[2]);
  }

  if (start !== null && end !== null) {
    const padded = `${String(start).padStart(2, '0')}-${String(end).padStart(2, '0')}` as ShiftSlot;
    if (validShifts && validShifts.length > 0) {
      if (validShifts.includes(padded)) return padded;
      return `RANGE:${padded}` as ShiftSlot;
    } else {
      return padded;
    }
  }

  return null;
}

/**
 * Parse danh sách nhân viên từ dữ liệu Excel thô
 */
export function parseStaffFromExcel(rows: RawExcelRow[], validShifts: string[]): StaffMember[] {
  return rows
    .filter(row => row.name?.trim())
    .map((row, i) => {
      const normalizeWish = (raw: string): WishStatus => {
        const normalized = normalizeShift(raw, validShifts);
        return normalized || 'FLEXIBLE';
      };
      return {
        id: `staff-${i}-${row.name.trim().replace(/\s+/g, '-')}`,
        name: row.name.trim(),
        role: (row.role?.toUpperCase() as StaffRole) || 'FT',
        wishes: {
          Mon: normalizeWish(row.mon || ''),
          Tue: normalizeWish(row.tue || ''),
          Wed: normalizeWish(row.wed || ''),
          Thu: normalizeWish(row.thu || ''),
          Fri: normalizeWish(row.fri || ''),
          Sat: normalizeWish(row.sat || ''),
          Sun: normalizeWish(row.sun || ''),
        },
      };
    });
}

// ─── Frame counting ───────────────────────────────────────────────────────────

function countByFrame(daySchedules: Array<{ shift: ScheduledStatus }>, hourFrames: HourFrame[]) {
  const counts: Record<string, number> = {};
  for (const frame of hourFrames) {
    counts[frame.id] = 0;
  }
  for (const { shift } of daySchedules) {
    if (shift === 'OFF') continue;
    for (const frame of hourFrames) {
      if (shiftCoversFrame(shift, frame.startHour, frame.endHour)) {
        counts[frame.id]++;
      }
    }
  }
  return counts;
}

// ─── Main Scheduler ───────────────────────────────────────────────────────────

export function scheduleWeek(
  staffList: StaffMember[],
  config: StaffingConfig,
  weekStart: Date,
  accumulations?: StaffMonthlyAccumulation[]
): WeeklySchedule {

  // Trộn ngẫu nhiên danh sách staffList đầu vào để mỗi lần nhấn "Xếp lại" (re-schedule) sẽ trả về kết quả khác nhau
  const shuffledStaff = [...staffList].sort(() => Math.random() - 0.5);

  // ── Trạng thái nội bộ: 'PENDING' = chưa xếp (FLEXIBLE/RANGE), 'LOCKED' = OFF đăng ký cứng
  type CellState = ScheduleCell & { _pending?: boolean };

  const schedules: Array<StaffSchedule & { _cells: Record<DayOfWeek, CellState> }> =
    shuffledStaff.map(staff => ({
      staff,
      days: {} as Record<DayOfWeek, ScheduleCell>,
      _cells: {} as Record<DayOfWeek, CellState>,
      totalOff: 0,
      totalHours: 0,
    }));

  const wishViolations: WishViolation[] = [];

  // Trích xuất số giờ đã tích lũy của từng nhân viên từ tháng
  const getAccumulatedHours = (staffId: string) => {
    if (!accumulations) return 0;
    const found = accumulations.find(a => a.staffId === staffId);
    return found ? found.accumulatedHours : 0;
  };

  // Helpers
  const isManager = (s: typeof schedules[0]) => getRoleGroup(s.staff.role) === 'MANAGER';
  const isFulltime = (s: typeof schedules[0]) => getRoleGroup(s.staff.role) === 'FULLTIME';
  const isParttime = (s: typeof schedules[0]) => getRoleGroup(s.staff.role) === 'PARTTIME';

  const workedDays = (s: typeof schedules[0]) =>
    DAYS_OF_WEEK.filter(d => s._cells[d] && s._cells[d].status !== 'OFF').length;

  const isPending = (s: typeof schedules[0], day: DayOfWeek) =>
    s._cells[day]?._pending === true;

  const getWishOffCount = (staff: StaffMember) =>
    DAYS_OF_WEEK.filter(d => staff.wishes[d] === 'OFF').length;

  // Lấy danh sách ca hợp lệ theo nguyện vọng và chức vụ
  const getAllowedShifts = (staff: StaffMember, day: DayOfWeek, allowAll = false): string[] => {
    const wish = staff.wishes[day];
    let allowed = [...config.validShifts];

    if (wish.startsWith('RANGE:')) {
      const times = parseShiftTime(wish.replace('RANGE:', ''));
      if (times) {
        const [rs, re] = times;
        const rangeEnd = re < rs ? re + 24 : re;
        allowed = allowed.filter(v => {
          const t = parseShiftTime(v);
          if (!t) return false;
          const vs = t[0];
          const ve = t[1] < t[0] ? t[1] + 24 : t[1];
          return vs >= rs && ve <= rangeEnd;
        });
      }
    }

    if (allowed.length === 0 && !allowAll) return [];

    const group = getRoleGroup(staff.role);
    if (group === 'MANAGER' || group === 'FULLTIME') {
      const long = allowed.filter(v => shiftHours(v) >= 8);
      return long.length > 0 ? long : (allowAll ? allowed : []);
    } else {
      const short = allowed.filter(v => shiftHours(v) >= 5 && shiftHours(v) <= 6);
      if (short.length > 0) return short;
      return allowAll ? allowed : [];
    }
  };

  // ─── PHA 1: GÁN NGUYỆN VỌNG CỨNG ────────────────────────────────────────────
  // OFF đăng ký → khóa cứng (WISH), không thuật toán nào ghi đè
  // Ca cụ thể → gán WISH
  // FLEXIBLE/RANGE → đánh dấu PENDING để xếp sau
  for (const day of DAYS_OF_WEEK) {
    for (const sched of schedules) {
      const wish = sched.staff.wishes[day];
      if (wish === 'OFF') {
        sched._cells[day] = { status: 'OFF', source: 'WISH' };
      } else if (wish === 'FLEXIBLE' || wish.startsWith('RANGE:')) {
        sched._cells[day] = { status: 'OFF', source: 'AUTO', _pending: true };
      } else {
        // Ca cụ thể đã đăng ký
        sched._cells[day] = { status: wish as ShiftSlot, source: 'WISH' };
      }
    }
  }

  // ─── PHA 2: PHÂN BỔ SM/MB ────────────────────────────────────────────────────
  // Mục tiêu: mỗi ngày có ít nhất 1 SM/MB buổi sáng VÀ 1 buổi tối
  // Nếu 2+ SM/MB đều PENDING cùng ngày → tách sáng/tối
  // Ưu tiên nguyện vọng; bù ngày thiếu sau
  for (const day of DAYS_OF_WEEK) {
    const pendingMgrs = schedules.filter(s => isManager(s) && isPending(s, day));
    const assignedMgrs = schedules.filter(s =>
      isManager(s) && !isPending(s, day) && s._cells[day]?.status !== 'OFF'
    );

    const hasMorningMgr = assignedMgrs.some(s =>
      shiftCoversFrame(s._cells[day].status as ShiftSlot, 7, 15)
    );
    const hasEveningMgr = assignedMgrs.some(s =>
      shiftCoversFrame(s._cells[day].status as ShiftSlot, 15, 23)
    );

    if (pendingMgrs.length >= 2) {
      // Tách: người ít ngày làm hơn nhận ca cần coverage hơn
      pendingMgrs.sort((a, b) => workedDays(a) - workedDays(b));

      // Xác định ca nào cần trước
      const firstShift = (!hasMorningMgr) ? '07-15' : '15-23';
      const secondShift = firstShift === '07-15' ? '15-23' : '07-15';

      // Kiểm tra ca có trong validShifts không, fallback sang 10-18
      const resolveShift = (target: string) =>
        config.validShifts.includes(target)
          ? target
          : config.validShifts.find(v => shiftHours(v) >= 8) || '07-15';

      pendingMgrs[0]._cells[day] = { status: resolveShift(firstShift), source: 'AUTO' };
      pendingMgrs[1]._cells[day] = { status: resolveShift(secondShift), source: 'AUTO' };

      // Còn thêm SM/MB PENDING → gán ca phù hợp nhất
      for (let i = 2; i < pendingMgrs.length; i++) {
        const allowed = getAllowedShifts(pendingMgrs[i].staff, day);
        if (allowed.length > 0) {
          pendingMgrs[i]._cells[day] = { status: allowed[0], source: 'AUTO' };
        }
        // Nếu không có ca phù hợp → giữ OFF (sẽ xử lý ở bù ngày)
      }
    } else if (pendingMgrs.length === 1) {
      const mgr = pendingMgrs[0];
      // Chọn ca mà buổi đó đang thiếu quản lý
      let targetShift = '07-15';
      if (hasMorningMgr && !hasEveningMgr) {
        targetShift = '15-23';
      } else if (!hasMorningMgr) {
        targetShift = '07-15';
      }
      const resolveShift = (target: string) =>
        config.validShifts.includes(target)
          ? target
          : config.validShifts.find(v => shiftHours(v) >= 8) || '07-15';
      mgr._cells[day] = { status: resolveShift(targetShift), source: 'AUTO' };
    }
  }

  // Bù ngày thiếu cho SM/MB (đảm bảo >= 6 ngày)
  const managers = schedules.filter(isManager).sort((a, b) => getAccumulatedHours(a.staff.id) - getAccumulatedHours(b.staff.id));
  for (const sched of managers) {
    const targetDays = getRoleTargetDays(sched.staff.role);
    const pendingDays = DAYS_OF_WEEK.filter(d => isPending(sched, d));
    pendingDays.sort((a, b) => {
      // Ưu tiên ngày mà buổi đó còn thiếu quản lý
      const needsA = !schedules.some(s2 =>
        isManager(s2) && s2._cells[a]?.status !== 'OFF' && !isPending(s2, a)
      );
      const needsB = !schedules.some(s2 =>
        isManager(s2) && s2._cells[b]?.status !== 'OFF' && !isPending(s2, b)
      );
      return (needsB ? 1 : 0) - (needsA ? 1 : 0);
    });

    for (const day of pendingDays) {
      if (workedDays(sched) >= targetDays) break;
      if (isPending(sched, day)) {
        const allowed = getAllowedShifts(sched.staff, day);
        const shift = allowed[0] || (config.validShifts.find(v => shiftHours(v) >= 8) || '07-15');
        sched._cells[day] = { status: shift, source: 'AUTO' };
      }
    }

    // Đánh dấu PENDING còn lại thành OFF
    for (const day of DAYS_OF_WEEK) {
      if (isPending(sched, day)) {
        sched._cells[day] = { status: 'OFF', source: 'AUTO' };
      }
    }
  }

  // ─── PHA 3: PHÂN BỔ FT ───────────────────────────────────────────────────────
  const fulltimers = schedules.filter(isFulltime).sort((a, b) => getAccumulatedHours(a.staff.id) - getAccumulatedHours(b.staff.id));
  for (const sched of fulltimers) {
    const targetDays = getRoleTargetDays(sched.staff.role);
    const pendingDays = DAYS_OF_WEEK.filter(d => isPending(sched, d));

    for (const day of pendingDays) {
      if (workedDays(sched) >= targetDays) break;
      const allowed = getAllowedShifts(sched.staff, day);
      const shift = allowed[0] || (config.validShifts.find(v => shiftHours(v) >= 8) || '07-15');
      sched._cells[day] = { status: shift, source: 'AUTO' };
    }

    // Bù thêm nếu chưa đủ ngày (dùng ngày PENDING còn lại)
    if (workedDays(sched) < targetDays) {
      for (const day of DAYS_OF_WEEK) {
        if (workedDays(sched) >= targetDays) break;
        if (isPending(sched, day)) {
          const shift = config.validShifts.find(v => shiftHours(v) >= 8) || '07-15';
          sched._cells[day] = { status: shift, source: 'AUTO' };
        }
      }
    }

    // Đánh dấu PENDING còn lại → OFF
    for (const day of DAYS_OF_WEEK) {
      if (isPending(sched, day)) {
        sched._cells[day] = { status: 'OFF', source: 'AUTO' };
      }
    }
  }

  // ─── PHA 4: PHÂN BỔ CL/HV ────────────────────────────────────────────────────
  for (const sched of schedules.filter(isParttime)) {
    const targetDays = getRoleTargetDays(sched.staff.role);
    const pendingDays = DAYS_OF_WEEK.filter(d => isPending(sched, d));

    for (const day of pendingDays) {
      if (workedDays(sched) >= Math.min(targetDays + 1, 7)) break; // Tối đa 5 ngày
      const allowed = getAllowedShifts(sched.staff, day);
      if (allowed.length > 0) {
        sched._cells[day] = { status: allowed[0], source: 'AUTO' };
      }
    }

    // Đánh dấu PENDING còn lại → OFF
    for (const day of DAYS_OF_WEEK) {
      if (isPending(sched, day)) {
        sched._cells[day] = { status: 'OFF', source: 'AUTO' };
      }
    }
  }

  // ─── PHA 5: BÙ KHUNG GIỜ THIẾU (RÀNG BUỘC CỨNG) ─────────────────────────────
  // Chỉ dùng người đang OFF/AUTO (không khóa WISH), không ghi đè OFF/WISH
  for (const day of DAYS_OF_WEEK) {
    for (const frame of config.hourFrames) {
      let attempts = 0;

      while (attempts < 20) {
        attempts++;
        const currentCounts = countByFrame(
          schedules.map(s => ({ shift: s._cells[day].status })),
          config.hourFrames
        );
        if (currentCounts[frame.id] >= frame.minStaff) break;

        // Tìm ứng viên: đang OFF/AUTO (không phải WISH), có thể cover khung giờ này
        const candidates = schedules
          .map((s, idx) => ({ s, idx }))
          .filter(({ s }) => {
            const cell = s._cells[day];
            if (cell.status !== 'OFF' || cell.source === 'WISH') return false; // Không chạm OFF/WISH
            const allowed = getAllowedShifts(s.staff, day, true);
            return allowed.some(v => shiftCoversFrame(v, frame.startHour, frame.endHour));
          })
          .sort((a, b) => {
            // Ưu tiên người thiếu ngày nhất
            const daysA = DAYS_OF_WEEK.filter(d => a.s._cells[d]?.status !== 'OFF').length;
            const daysB = DAYS_OF_WEEK.filter(d => b.s._cells[d]?.status !== 'OFF').length;
            const targetA = getRoleTargetDays(a.s.staff.role);
            const targetB = getRoleTargetDays(b.s.staff.role);
            const underA = daysA < targetA;
            const underB = daysB < targetB;
            if (underA && !underB) return -1;
            if (!underA && underB) return 1;
            return daysA - daysB;
          });

        if (candidates.length === 0) {
          // Không còn ai có thể bù → ghi vi phạm, giữ nguyên
          const currentCount = countByFrame(
            schedules.map(s => ({ shift: s._cells[day].status })),
            config.hourFrames
          )[frame.id];
          wishViolations.push({
            staffId: 'SYSTEM',
            staffName: 'Hệ thống',
            day,
            originalWish: '',
            assignedShift: '',
            reason: `Khung giờ ${frame.label} (${day}) thiếu nhân sự: ${currentCount}/${frame.minStaff} — không còn ai để bù`,
          });
          break;
        }

        const { idx, s } = candidates[0];
        const allowed = getAllowedShifts(s.staff, day, true);
        const matchShift = allowed.find(v => shiftCoversFrame(v, frame.startHour, frame.endHour)) || allowed[0];

        // Ghi vi phạm nguyện vọng nếu nguyện vọng là OFF (WISH)
        const wasWishOff = s.staff.wishes[day] === 'OFF';
        if (wasWishOff) {
          // OFF/WISH không được ghi đè — bỏ qua ứng viên này, thử người tiếp theo
          // (đã lọc ở filter trên — không bao giờ chạy đến đây)
          break;
        }

        schedules[idx]._cells[day] = { status: matchShift, source: 'AUTO' };

        // Ghi vi phạm nếu người này đang có nguyện vọng không phù hợp
        const wish = s.staff.wishes[day];
        if (wish !== 'FLEXIBLE' && !wish.startsWith('RANGE:')) {
          wishViolations.push({
            staffId: s.staff.id,
            staffName: s.staff.name,
            day,
            originalWish: wish,
            assignedShift: matchShift,
            reason: `Thiếu nhân sự khung ${frame.label} (${frame.startHour}h–${frame.endHour}h)`,
          });
        }
      }
    }
  }

  // ─── PHA 5B: ĐẢM BẢO CÓ QUẢN LÝ MỖI BUỔI ───────────────────────────────────
  for (const day of DAYS_OF_WEEK) {
    const hasMorning = schedules.some(s =>
      isManager(s) &&
      s._cells[day]?.status !== 'OFF' &&
      shiftCoversFrame(s._cells[day].status as ShiftSlot, 7, 15)
    );
    const hasEvening = schedules.some(s =>
      isManager(s) &&
      s._cells[day]?.status !== 'OFF' &&
      shiftCoversFrame(s._cells[day].status as ShiftSlot, 15, 23)
    );

    const forceManager = (morning: boolean) => {
      const targetShift = morning ? '07-15' : '15-23';
      const resolvedShift = config.validShifts.includes(targetShift)
        ? targetShift
        : config.validShifts.find(v => shiftHours(v) >= 8) || '07-15';

      // Tìm quản lý đang OFF/AUTO (không phải WISH)
      const candidates = schedules
        .filter(s =>
          isManager(s) &&
          s._cells[day]?.status === 'OFF' &&
          s._cells[day]?.source !== 'WISH'
        )
        .sort((a, b) =>
          DAYS_OF_WEEK.filter(d => a._cells[d]?.status !== 'OFF').length -
          DAYS_OF_WEEK.filter(d => b._cells[d]?.status !== 'OFF').length
        );

      if (candidates.length > 0) {
        const mgr = candidates[0];
        const wish = mgr.staff.wishes[day];
        mgr._cells[day] = { status: resolvedShift, source: 'AUTO' };
        if (wish !== 'FLEXIBLE' && !wish.startsWith('RANGE:')) {
          wishViolations.push({
            staffId: mgr.staff.id,
            staffName: mgr.staff.name,
            day,
            originalWish: wish,
            assignedShift: resolvedShift,
            reason: `Bắt buộc có Quản lý ca ${morning ? 'Sáng' : 'Tối'}`,
          });
        }
      }
    };

    if (!hasMorning) forceManager(true);
    if (!hasEvening) forceManager(false);
  }

  // ─── PHA 6: CẮT THỪA + CÂN BẰNG GIỜ ────────────────────────────────────────
  for (const day of DAYS_OF_WEEK) {
    for (const frame of config.hourFrames) {
      let attempts = 0;

      while (attempts < 10) {
        attempts++;
        const counts = countByFrame(
          schedules.map(s => ({ shift: s._cells[day].status })),
          config.hourFrames
        );
        if (counts[frame.id] <= frame.maxStaff) break;

        // Ứng viên bị cắt: ưu tiên PARTTIME, rồi theo ngày dư nhất
        const activeStaff = schedules
          .map((s, idx) => ({ s, idx }))
          .filter(({ s }) => {
            if (s._cells[day].status === 'OFF') return false;
            if (s._cells[day].source === 'WISH') return false; // Bảo vệ nguyện vọng cứng
            return shiftCoversFrame(s._cells[day].status as ShiftSlot, frame.startHour, frame.endHour);
          })
          .sort((a, b) => {
            const ga = getRoleGroup(a.s.staff.role);
            const gb = getRoleGroup(b.s.staff.role);
            const score = { MANAGER: 3, FULLTIME: 2, PARTTIME: 1 };
            if (ga !== gb) return score[ga] - score[gb];
            const offA = getWishOffCount(a.s.staff);
            const offB = getWishOffCount(b.s.staff);
            return offB - offA;
          });

        if (activeStaff.length === 0) break;

        let cutDone = false;
        for (const { idx, s } of activeStaff) {
          const currentShift = s._cells[day].status as ShiftSlot;
          const group = getRoleGroup(s.staff.role);

          // Hạ ca dài → ngắn (chỉ PARTTIME)
          if (group === 'PARTTIME' && shiftHours(currentShift) >= 8) {
            const downgraded = downgradeShift(currentShift, config.validShifts);
            if (downgraded !== currentShift) {
              schedules[idx]._cells[day] = { status: downgraded, source: 'AUTO' };
              cutDone = true;
              break;
            }
          }

          // Chuyển OFF — chỉ nếu người này không vượt giới hạn OFF
          const currentOff = DAYS_OF_WEEK.filter(d => schedules[idx]._cells[d]?.status === 'OFF').length;
          const maxAllowed = group === 'PARTTIME' ? config.maxOffParttime : config.maxOffFulltime;
          const wishOff = getWishOffCount(s.staff);
          const limit = Math.max(maxAllowed, wishOff);

          if (currentOff < limit) {
            schedules[idx]._cells[day] = { status: 'OFF', source: 'AUTO' };
            cutDone = true;
            break;
          }
        }

        if (!cutDone) break;
      }
    }
  }

  // Cân bằng giờ công trong nhóm
  const balanceGroup = (group: 'MANAGER' | 'FULLTIME' | 'PARTTIME') => {
    const getHours = (sIdx: number) =>
      DAYS_OF_WEEK.reduce((total, d) => {
        const status = schedules[sIdx]._cells[d].status;
        return total + (status === 'OFF' ? 0 : shiftHours(status as ShiftSlot));
      }, 0);

    const indices = schedules
      .map((s, idx) => ({ s, idx }))
      .filter(({ s }) => getRoleGroup(s.staff.role) === group)
      .map(({ idx }) => idx);

    let changed = true;
    let iter = 0;
    while (changed && iter < 20) {
      iter++;
      changed = false;
      indices.sort((a, b) => getHours(a) - getHours(b));
      const poorIdx = indices[0];
      const richIdx = indices[indices.length - 1];
      if (poorIdx === undefined || richIdx === undefined || poorIdx === richIdx) break;

      if (getHours(richIdx) - getHours(poorIdx) > 8) {
        for (const day of DAYS_OF_WEEK) {
          const richCell = schedules[richIdx]._cells[day];
          const poorCell = schedules[poorIdx]._cells[day];
          if (
            richCell.status !== 'OFF' && richCell.source === 'AUTO' &&
            poorCell.status === 'OFF' && poorCell.source === 'AUTO'
          ) {
            const richShift = richCell.status as ShiftSlot;
            const poorAllowed = getAllowedShifts(schedules[poorIdx].staff, day);
            if (poorAllowed.includes(richShift)) {
              schedules[poorIdx]._cells[day] = { status: richShift, source: 'AUTO' };
              schedules[richIdx]._cells[day] = { status: 'OFF', source: 'AUTO' };
              changed = true;
              break;
            }
          }
        }
      }
    }
  };

  balanceGroup('MANAGER');
  balanceGroup('FULLTIME');
  balanceGroup('PARTTIME');

  // ─── PHA 7: TỔNG HỢP KẾT QUẢ ────────────────────────────────────────────────
  for (const sched of schedules) {
    // Sync _cells → days (public interface)
    sched.days = {} as Record<DayOfWeek, ScheduleCell>;
    let totalHours = 0;
    let totalOff = 0;
    for (const day of DAYS_OF_WEEK) {
      const cell = sched._cells[day];
      sched.days[day] = { status: cell.status, source: cell.source };
      if (cell.status === 'OFF') {
        totalOff++;
      } else {
        totalHours += shiftHours(cell.status as ShiftSlot);
      }
    }
    sched.totalHours = totalHours;
    sched.totalOff = totalOff;
  }

  // Tạo dayStats + violations
  const dayStats: Record<DayOfWeek, DayStats> = {} as Record<DayOfWeek, DayStats>;
  const globalViolations: string[] = [];

  for (const day of DAYS_OF_WEEK) {
    const finalCounts = countByFrame(
      schedules.map(s => ({ shift: s.days[day].status })),
      config.hourFrames
    );
    const hasManager = schedules.some(s =>
      isManager(s) && s.days[day].status !== 'OFF'
    );
    const dayViolations: string[] = [];

    if (!hasManager) {
      dayViolations.push(`${day}: Không có Quản lý trực ca!`);
    }

    config.hourFrames.forEach(frame => {
      const count = finalCounts[frame.id] || 0;
      if (count < frame.minStaff) {
        dayViolations.push(`${day}: Thiếu nhân sự khung ${frame.label} (${count}/${frame.minStaff})`);
      }
      if (count > frame.maxStaff) {
        dayViolations.push(`${day}: Thừa nhân sự khung ${frame.label} (${count}/${frame.maxStaff})`);
      }
    });

    globalViolations.push(...dayViolations);
    dayStats[day] = { day, frameCounts: finalCounts, hasManager, violations: dayViolations };
  }

  // Cảnh báo ngày công thiếu
  schedules.forEach(sched => {
    const worked = DAYS_OF_WEEK.filter(d => sched.days[d].status !== 'OFF').length;
    const target = getRoleTargetDays(sched.staff.role);
    if (worked < target) {
      globalViolations.push(
        `Cảnh báo: ${sched.staff.name} (${sched.staff.role}) chưa đủ ngày công: ${worked}/${target} ngày`
      );
    }
  });

  return {
    weekStart,
    schedules: schedules.map(s => ({
      staff: s.staff,
      days: s.days,
      totalOff: s.totalOff,
      totalHours: s.totalHours,
    })),
    dayStats,
    isValid: globalViolations.length === 0,
    violations: globalViolations,
    wishViolations,
  };
}

// ─── Excel Export ─────────────────────────────────────────────────────────────

export function buildExcelData(schedule: WeeklySchedule): Array<Record<string, string>> {
  const dayLabels: Record<string, string> = {
    Mon: 'Thứ 2', Tue: 'Thứ 3', Wed: 'Thứ 4',
    Thu: 'Thứ 5', Fri: 'Thứ 6', Sat: 'Thứ 7', Sun: 'CN',
  };

  return schedule.schedules.map(sched => {
    const row: Record<string, string> = {
      'Họ tên': sched.staff.name,
      'Chức vụ': sched.staff.role,
    };
    for (const day of DAYS_OF_WEEK) {
      row[dayLabels[day]] = sched.days[day].status;
    }
    row['Số giờ'] = String(sched.totalHours);
    row['Số ngày OFF'] = String(sched.totalOff);
    return row;
  });
}
