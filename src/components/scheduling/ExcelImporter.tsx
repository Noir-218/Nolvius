import React, { useCallback, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { parseStaffFromExcel } from '../../lib/scheduler';
import { StaffMember } from '../../types/scheduling';

interface ExcelImporterProps {
  onImport: (staff: StaffMember[]) => void;
  validShifts: string[];
}

const TEMPLATE_HEADERS = ['Họ tên', 'Chức vụ', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];

export const ExcelImporter: React.FC<ExcelImporterProps> = ({ onImport, validShifts }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<StaffMember[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [step, setStep] = useState<'idle' | 'preview' | 'done'>('idle');

  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        // Đọc dưới dạng mảng 2D (array of arrays) để xử lý file có header phức tạp
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        
        // Tìm dòng chứa các ngày trong tuần (THỨ 2, T2, v.v.)
        let headerRowIdx = -1;
        let colMap = { name: 0, role: 1, mon: -1, tue: -1, wed: -1, thu: -1, fri: -1, sat: -1, sun: -1 };

        for (let i = 0; i < Math.min(20, rawData.length); i++) {
          const row = rawData[i] || [];
          // Sử dụng Array.from để lấp đầy các ô trống (holes) bằng undefined, sau đó ép thành chuỗi rỗng
          const rowStr = Array.from(row).map(cell => String(cell || '').toLowerCase());
          
          const monIdx = rowStr.findIndex(c => c.includes('thứ 2') || c === 't2' || c === 'mon');
          if (monIdx !== -1) {
            headerRowIdx = i;
            // Map các cột
            colMap.mon = monIdx;
            colMap.tue = rowStr.findIndex(c => c.includes('thứ 3') || c === 't3' || c === 'tue');
            colMap.wed = rowStr.findIndex(c => c.includes('thứ 4') || c === 't4' || c === 'wed');
            colMap.thu = rowStr.findIndex(c => c.includes('thứ 5') || c === 't5' || c === 'thu');
            colMap.fri = rowStr.findIndex(c => c.includes('thứ 6') || c === 't6' || c === 'fri');
            colMap.sat = rowStr.findIndex(c => c.includes('thứ 7') || c === 't7' || c === 'sat');
            colMap.sun = rowStr.findIndex(c => c.includes('chủ nhật') || c.includes('chu nhat') || c === 'cn' || c === 'sun');
            
            // Cột Role thường có chữ "chức vụ" hoặc nằm kế bên cột tên
            const roleIdx = rowStr.findIndex(c => c.includes('chức vụ') || c.includes('role') || c.includes('cv'));
            if (roleIdx !== -1) colMap.role = roleIdx;
            
            // Cột Tên thường là cột đầu tiên (index 0)
            break;
          }
        }

        if (headerRowIdx === -1) {
          throw new Error('Không tìm thấy dòng tiêu đề chứa các ngày (THỨ 2, THỨ 3...). Vui lòng kiểm tra lại file Excel.');
        }

        const rows: any[] = [];
        // Quét các dòng bên dưới header
        for (let i = headerRowIdx + 1; i < rawData.length; i++) {
          const row = rawData[i] || [];
          const name = String(row[colMap.name] || '').trim();
          
          // Bỏ qua dòng trống hoặc các dòng rác (ví dụ dòng ghi chú ngày tháng có name="OFF")
          if (!name || name.toLowerCase() === 'off' || name.toLowerCase().includes('tổng')) continue;
          
          rows.push({
            name: name,
            role: String(row[colMap.role] || '').trim(),
            mon: String(row[colMap.mon] || ''),
            tue: String(row[colMap.tue] || ''),
            wed: String(row[colMap.wed] || ''),
            thu: String(row[colMap.thu] || ''),
            fri: String(row[colMap.fri] || ''),
            sat: String(row[colMap.sat] || ''),
            sun: String(row[colMap.sun] || '')
          });
        }

        const staff = parseStaffFromExcel(rows, validShifts);
        setPreview(staff);
        setErrors([]);
        setStep('preview');
      } catch (err) {
        console.error('Lỗi khi parse file Excel:', err);
        setErrors([`Lỗi đọc file: ${(err as Error).message}`]);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset file input value so selecting the same file again triggers onChange
    e.target.value = '';
  }, [processFile]);

  const handleConfirm = () => {
    onImport(preview);
    setStep('done');
  };

  const handleReset = () => {
    setStep('idle');
    setPreview([]);
    setErrors([]);
    setFileName('');
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_HEADERS,
      ['Nguyễn Văn A', 'SM', '07-15', '', '07-15', '07-15', '', '07-15', 'OFF'],
      ['Trần Thị B', 'FT', '15-23', '15-23', '', '15-23', '15-23', '', 'OFF'],
      ['Lê Văn C', 'CL', '07-12', '07-12', 'OFF', '07-12', '', '07-12', ''],
    ]);
    ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nguyện Vọng');
    XLSX.writeFile(wb, 'mau-nguyen-vong-ca.xlsx');
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
          <CheckCircle size={28} className="text-emerald-500" />
        </div>
        <p className="font-bold text-gray-800">Đã tải {preview.length} nhân viên</p>
        <p className="text-xs text-gray-400">{fileName}</p>
        <button onClick={handleReset} className="text-xs text-teal-600 hover:underline mt-1">
          Tải file khác
        </button>
      </div>
    );
  }

  if (step === 'preview') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-teal-600" />
            <span className="text-sm font-bold text-gray-700">{fileName}</span>
          </div>
          <button onClick={handleReset} className="p-1 hover:bg-gray-100 rounded-lg">
            <X size={14} className="text-gray-400" />
          </button>
        </div>

        {errors.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-amber-700 text-xs font-bold">
              <AlertTriangle size={13} /> {errors.length} cảnh báo
            </div>
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-amber-600 pl-4">{e}</p>
            ))}
          </div>
        )}

        <div className="bg-gray-50 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
          {preview.map(s => (
            <div key={s.id} className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">{s.name}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                s.role === 'SM' || s.role === 'MB' ? 'bg-purple-100 text-purple-700' :
                s.role === 'FT' ? 'bg-blue-100 text-blue-700' :
                'bg-amber-100 text-amber-700'
              }`}>{s.role}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition-colors"
        >
          Xác nhận ({preview.length} nhân viên)
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-red-700 text-xs font-bold">
            <AlertTriangle size={13} /> Lỗi nhập dữ liệu
          </div>
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-600 pl-4">{e}</p>
          ))}
        </div>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
          isDragging
            ? 'border-teal-400 bg-teal-50'
            : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50/30'
        }`}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="flex flex-col items-center gap-2 pointer-events-none">
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
            <Upload size={20} className="text-teal-500" />
          </div>
          <p className="text-sm font-bold text-gray-700">Kéo thả file Excel</p>
          <p className="text-xs text-gray-400">hoặc click để chọn file (.xlsx, .xls)</p>
        </div>
      </div>

      <button
        onClick={downloadTemplate}
        className="w-full py-2 text-xs text-teal-600 hover:bg-teal-50 border border-teal-200 rounded-xl transition-colors font-bold flex items-center justify-center gap-1.5"
      >
        <FileSpreadsheet size={13} />
        Tải mẫu Excel
      </button>

      <div className="bg-blue-50 rounded-xl p-3">
        <p className="text-[10px] font-bold text-blue-700 mb-1">Định dạng ca hợp lệ:</p>
        <div className="flex flex-wrap gap-1">
          {[...validShifts, 'OFF'].map(s => (
            <span key={s} className="bg-white border border-blue-200 text-blue-600 text-[10px] font-mono px-1.5 py-0.5 rounded">
              {s}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-blue-500 mt-1.5">Để trống = OFF (nhân sự) hoặc Linh hoạt (Quản lý)</p>
      </div>
    </div>
  );
};
