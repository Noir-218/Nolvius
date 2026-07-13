import React from 'react';
import { Settings2 } from 'lucide-react';
import { StaffingConfig, DEFAULT_STAFFING_CONFIG } from '../../types/scheduling';

interface StaffingConfigPanelProps {
  config: StaffingConfig;
  onChange: (config: StaffingConfig) => void;
}



export const StaffingConfigPanel: React.FC<StaffingConfigPanelProps> = ({ config, onChange }) => {
  const handleChange = (key: keyof StaffingConfig, value: number | string | string[]) => {
    const updated = { ...config, [key]: value };
    if (key.endsWith('Min') && (updated[key] as number) > (updated[key.replace('Min', 'Max') as keyof StaffingConfig] as number)) {
      (updated as any)[key.replace('Min', 'Max')] = updated[key];
    }
    if (key.endsWith('Max') && (updated[key] as number) < (updated[key.replace('Max', 'Min') as keyof StaffingConfig] as number)) {
      (updated as any)[key.replace('Max', 'Min')] = updated[key];
    }
    onChange(updated);
  };

  const handleReset = () => onChange({ ...DEFAULT_STAFFING_CONFIG });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 size={14} className="text-gray-500" />
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Định biên nhân sự</span>
        </div>
        <button
          onClick={handleReset}
          className="text-[10px] text-teal-600 hover:underline font-bold"
        >
          Đặt lại
        </button>
      </div>

      <div className="space-y-2">
        {config.hourFrames.map((frame) => (
          <div
            key={frame.id}
            className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2"
          >
            <div>
              <p className="text-xs font-bold text-gray-600">{frame.label}</p>
              <p className="text-[10px] text-gray-400 font-mono">{frame.timeRange}</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 font-bold block mb-1">Tối thiểu</label>
                <div className="flex items-center">
                  <button
                    onClick={() => {
                      const newVal = Math.max(0, frame.minStaff - 1);
                      const updatedFrames = config.hourFrames.map(f => f.id === frame.id ? { ...f, minStaff: newVal } : f);
                      onChange({ ...config, hourFrames: updatedFrames });
                    }}
                    className="w-6 h-6 bg-white border border-gray-200 rounded-l-lg text-gray-600 hover:bg-gray-50 flex items-center justify-center text-sm font-bold transition-colors"
                  >−</button>
                  <input
                    type="number"
                    value={frame.minStaff}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0;
                      const updatedFrames = config.hourFrames.map(f => f.id === frame.id ? { ...f, minStaff: val } : f);
                      onChange({ ...config, hourFrames: updatedFrames });
                    }}
                    className="w-10 h-6 border-t border-b border-gray-200 text-center text-sm font-bold text-gray-800 bg-white outline-none"
                    min={0} max={20}
                  />
                  <button
                    onClick={() => {
                      const newVal = frame.minStaff + 1;
                      const updatedFrames = config.hourFrames.map(f => f.id === frame.id ? { ...f, minStaff: newVal } : f);
                      onChange({ ...config, hourFrames: updatedFrames });
                    }}
                    className="w-6 h-6 bg-white border border-gray-200 rounded-r-lg text-gray-600 hover:bg-gray-50 flex items-center justify-center text-sm font-bold transition-colors"
                  >+</button>
                </div>
              </div>

              <div className="text-gray-300 font-bold text-sm mt-4">–</div>

              <div className="flex-1">
                <label className="text-[10px] text-gray-500 font-bold block mb-1">Tối đa</label>
                <div className="flex items-center">
                  <button
                    onClick={() => {
                      const newVal = Math.max(0, frame.maxStaff - 1);
                      const updatedFrames = config.hourFrames.map(f => f.id === frame.id ? { ...f, maxStaff: newVal } : f);
                      onChange({ ...config, hourFrames: updatedFrames });
                    }}
                    className="w-6 h-6 bg-white border border-gray-200 rounded-l-lg text-gray-600 hover:bg-gray-50 flex items-center justify-center text-sm font-bold transition-colors"
                  >−</button>
                  <input
                    type="number"
                    value={frame.maxStaff}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0;
                      const updatedFrames = config.hourFrames.map(f => f.id === frame.id ? { ...f, maxStaff: val } : f);
                      onChange({ ...config, hourFrames: updatedFrames });
                    }}
                    className="w-10 h-6 border-t border-b border-gray-200 text-center text-sm font-bold text-gray-800 bg-white outline-none"
                    min={0} max={20}
                  />
                  <button
                    onClick={() => {
                      const newVal = frame.maxStaff + 1;
                      const updatedFrames = config.hourFrames.map(f => f.id === frame.id ? { ...f, maxStaff: newVal } : f);
                      onChange({ ...config, hourFrames: updatedFrames });
                    }}
                    className="w-6 h-6 bg-white border border-gray-200 rounded-r-lg text-gray-600 hover:bg-gray-50 flex items-center justify-center text-sm font-bold transition-colors"
                  >+</button>
                </div>
              </div>

              <div className="mt-4 text-lg font-black text-gray-600">
                {frame.minStaff}–{frame.maxStaff}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-50 rounded-xl p-2.5 text-[10px] text-gray-500 leading-relaxed mb-3">
        <span className="font-bold text-gray-600">Lưu ý:</span> Thuật toán sẽ ưu tiên cắt giảm CL/HV khi số người
        vượt quá <span className="font-bold">tối đa</span>, và cảnh báo khi dưới <span className="font-bold">tối thiểu</span>.
      </div>

      <hr className="border-gray-100" />

      {/* OFF Limits */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-700">Luật Cắt Ca (OFF)</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white border border-gray-200 p-2.5 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-purple-700">SM, MB, FT</p>
              <p className="text-[9px] text-gray-400">Tối đa số buổi OFF/tuần</p>
            </div>
            <input
              type="number"
              value={config.maxOffFulltime}
              onChange={e => handleChange('maxOffFulltime', parseInt(e.target.value) || 0)}
              className="w-10 h-7 border border-gray-200 rounded-lg text-center text-xs font-bold text-gray-800 bg-gray-50 outline-none"
              min={1} max={7}
            />
          </div>
          <div className="bg-white border border-gray-200 p-2.5 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-amber-700">Part-time</p>
              <p className="text-[9px] text-gray-400">Tối đa số buổi OFF/tuần</p>
            </div>
            <input
              type="number"
              value={config.maxOffParttime}
              onChange={e => handleChange('maxOffParttime', parseInt(e.target.value) || 0)}
              className="w-10 h-7 border border-gray-200 rounded-lg text-center text-xs font-bold text-gray-800 bg-gray-50 outline-none"
              min={1} max={7}
            />
          </div>
        </div>
      </div>

      <hr className="border-gray-100" />

      {/* Dynamic Shifts */}
      <div className="space-y-2 pb-2">
        <p className="text-xs font-bold text-gray-700">Ca làm việc hợp lệ</p>
        <div className="flex flex-wrap gap-1.5">
          {config.validShifts.map(shift => (
            <span key={shift} className="bg-teal-50 border border-teal-200 text-teal-700 text-[10px] font-mono px-2 py-1 rounded-lg flex items-center gap-1">
              {shift}
              <button
                onClick={() => onChange({ ...config, validShifts: config.validShifts.filter(s => s !== shift) })}
                className="text-teal-400 hover:text-teal-600 font-bold"
              >×</button>
            </span>
          ))}
        </div>
        <form onSubmit={e => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem('newShift') as HTMLInputElement;
          const val = input.value.trim();
          if (/^\d{2}-\d{2}$/.test(val) && !config.validShifts.includes(val)) {
            onChange({ ...config, validShifts: [...config.validShifts, val].sort() });
            input.value = '';
          }
        }} className="flex gap-2 pt-1">
          <input
            name="newShift"
            placeholder="VD: 06-15"
            pattern="\d{2}-\d{2}"
            title="Định dạng XX-YY"
            className="flex-1 bg-white border border-gray-200 text-xs font-mono px-3 py-1.5 rounded-xl outline-none focus:border-teal-400"
          />
          <button type="submit" className="bg-teal-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-teal-700">
            Thêm ca
          </button>
        </form>
      </div>
    </div>
  );
};
