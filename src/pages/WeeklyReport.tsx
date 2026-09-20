import { useState, useEffect, useCallback } from 'react';
import * as xlsx from 'xlsx';
import { UploadCloud, FileSpreadsheet, CheckCircle2, Save, ArrowUpRight, ArrowDownRight, Activity, History, Trash2, ChevronDown, ChevronUp, CalendarDays } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useFacility } from '../contexts/FacilityContext';

interface SourceRevenue {
  name: string;
  invoices: number;
  revenue: number;
}

interface DailyRevenue {
  date: string;
  revenue: number;
}

interface GroupRevenue {
  group: string;
  keyword: string;
  revenue: number;
}

interface ReportDate {
  startDate: string;
  endDate: string;
}

interface PreviousReport {
  source_data: SourceRevenue[];
  total_invoices: number;
  total_revenue: number;
}

interface SavedReport {
  id: string;
  start_date: string;
  end_date: string;
  source_data: SourceRevenue[];
  total_invoices: number;
  total_revenue: number;
  created_at: string;
}

export default function WeeklyReport() {
  const { currentFacility } = useFacility();
  const [b03File, setB03File] = useState<File | null>(null);
  const [b04File, setB04File] = useState<File | null>(null);
  
  const [sourceData, setSourceData] = useState<SourceRevenue[]>([]);
  const [dailyData, setDailyData] = useState<DailyRevenue[]>([]);
  const [groupData, setGroupData] = useState<GroupRevenue[]>([]);
  
  const [reportDate, setReportDate] = useState<ReportDate | null>(null);
  const [previousReport, setPreviousReport] = useState<PreviousReport | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // History state
  const [activeTab, setActiveTab] = useState<'report' | 'history'>('report');
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!currentFacility?.id) return;
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('weekly_reports')
        .select('*')
        .eq('facility_id', currentFacility.id)
        .order('end_date', { ascending: false });
      if (error) throw error;
      setSavedReports((data || []) as unknown as SavedReport[]);
    } catch (err: any) {
      toast.error('Không thể tải lịch sử báo cáo');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [currentFacility?.id]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa báo cáo tuần này không?')) return;
    setDeletingId(reportId);
    try {
      const { error } = await supabase
        .from('weekly_reports')
        .delete()
        .eq('id', reportId);
      if (error) throw error;
      setSavedReports(prev => prev.filter(r => r.id !== reportId));
      toast.success('Đã xóa báo cáo tuần!');
    } catch (err: any) {
      toast.error('Không thể xóa: ' + (err.message || 'Lỗi hệ thống'));
    } finally {
      setDeletingId(null);
    }
  };

  // Parse dates and fetch previous report when file is parsed
  const fetchPreviousReport = async (startDate: string) => {
    if (!currentFacility?.id) return;
    try {
      const { data, error } = await supabase
        .from('weekly_reports')
        .select('*')
        .eq('facility_id', currentFacility.id)
        .lt('end_date', startDate)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching previous report:', error);
        return;
      }

      if (data) {
        setPreviousReport({
          source_data: data.source_data as unknown as SourceRevenue[],
          total_invoices: data.total_invoices,
          total_revenue: data.total_revenue
        });
      } else {
        setPreviousReport(null);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const processB03 = async (file: File) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = xlsx.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const sheetData = xlsx.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

          // Extract dates
          const titleRow = sheetData[0] ? String(sheetData[0][0] || '') : '';
          const dateMatch = titleRow.match(/từ\s+(\d{2}\/\d{2}\/\d{4}).*đến\s+(\d{2}\/\d{2}\/\d{4})/);
          let parsedDateRange: ReportDate | null = null;
          if (dateMatch) {
            const formatDbDate = (str: string) => {
              const [d, m, y] = str.split('/');
              return `${y}-${m}-${d}`;
            };
            parsedDateRange = {
              startDate: formatDbDate(dateMatch[1]),
              endDate: formatDbDate(dateMatch[2])
            };
          }

          const row1 = sheetData[1] || [];
          const sources: { name: string, colIndex: number }[] = [];
          for (let i = 1; i < row1.length; i++) {
            if (row1[i] && row1[i] !== 'Tổng') {
              sources.push({ name: String(row1[i]), colIndex: i });
            }
          }

          const results: Record<string, { invoices: number, revenue: number }> = {};
          sources.forEach(s => results[s.name] = { invoices: 0, revenue: 0 });
          const daily: DailyRevenue[] = [];

          for (let r = 3; r < sheetData.length; r++) {
            const row = sheetData[r];
            if (!row || row.length === 0 || !row[0]) continue;
            if (row[0] === 'Tổng') continue;

            const date = String(row[0]);
            
            sources.forEach(s => {
              const invoicesCol = s.colIndex;
              const hoaHongCol = s.colIndex + 2;
              const netCol = s.colIndex + 5;
              
              const invoices = parseFloat(row[invoicesCol]) || 0;
              const hoaHong = parseFloat(row[hoaHongCol]) || 0;
              const net = parseFloat(row[netCol]) || 0;
              
              results[s.name].invoices += invoices;
              results[s.name].revenue += (hoaHong + net);
            });

            const tongIndex = row1.indexOf('Tổng');
            if (tongIndex !== -1) {
              const hoaHong = parseFloat(row[tongIndex + 2]) || 0;
              const net = parseFloat(row[tongIndex + 5]) || 0;
              daily.push({ date, revenue: hoaHong + net });
            }
          }

          const formattedSources = sources.map(s => ({
            name: s.name,
            invoices: results[s.name].invoices,
            revenue: results[s.name].revenue / 1.08
          }));

          resolve({ sources: formattedSources, daily, parsedDateRange });
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const processB04 = async (file: File) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = xlsx.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const sheetData = xlsx.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

          const keywords = [
            { group: 'Trân Châu', keyword: 'Trân châu' },
            { group: 'Thạch', keyword: 'Thạch' },
            { group: 'Bánh', keyword: 'HN' },
            { group: 'Hoa quả sấy', keyword: 'Hoa Quả Sấy' },
            { group: 'MCD', keyword: 'Merchandise' }
          ];

          const results: Record<string, number> = {};
          keywords.forEach(k => results[k.group] = 0);

          for (let r = 3; r < sheetData.length; r++) {
            const row = sheetData[r];
            if (!row || row.length === 0 || !row[1]) continue;
            
            const tenMon = row[1] ? String(row[1]).normalize('NFC').toLowerCase() : "";
            const nhomMon = row[3] ? String(row[3]).normalize('NFC').toLowerCase() : "";
            
            const hoaHong = parseFloat(row[6]) || 0;
            const net = parseFloat(row[10]) || 0;
            const rowRevenue = (hoaHong + net);
            
            keywords.forEach(k => {
              const kw = k.keyword.toLowerCase();
              if (tenMon.includes(kw) || nhomMon.includes(kw)) {
                results[k.group] += rowRevenue;
              }
            });
          }

          const formattedGroups = keywords.map(k => ({
            group: k.group,
            keyword: k.keyword,
            revenue: results[k.group] / 1.08
          }));

          resolve(formattedGroups);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const handleProcessFiles = async () => {
    if (!b03File || !b04File) {
      toast.error('Vui lòng tải lên cả 2 file B03 và B04');
      return;
    }

    setIsProcessing(true);
    setIsSaved(false);
    try {
      const [b03Result, b04Result] = await Promise.all([
        processB03(b03File),
        processB04(b04File)
      ]);

      const { sources, daily, parsedDateRange } = b03Result as { sources: SourceRevenue[], daily: DailyRevenue[], parsedDateRange: ReportDate | null };
      const groups = b04Result as GroupRevenue[];

      // Merge PHELA_AHAMOVE into Ahamove as requested
      const sourceMap = new Map<string, SourceRevenue>();
      
      sources.forEach(s => {
        let name = s.name;
        if (name.toUpperCase() === 'PHELA_AHAMOVE' || name.toUpperCase() === 'AHAMOVE') {
          name = 'Ahamove';
        }

        if (sourceMap.has(name)) {
          const existing = sourceMap.get(name)!;
          existing.invoices += s.invoices;
          existing.revenue += s.revenue;
        } else {
          sourceMap.set(name, { name, invoices: s.invoices, revenue: s.revenue });
        }
      });

      const finalSources = Array.from(sourceMap.values());

      setSourceData(finalSources);
      setDailyData(daily);
      setGroupData(groups);
      setReportDate(parsedDateRange);
      
      if (parsedDateRange) {
        await fetchPreviousReport(parsedDateRange.startDate);
      } else {
        toast.error("Không trích xuất được ngày báo cáo từ file B03. Tính năng so sánh sẽ không khả dụng.");
      }
      
      toast.success('Xử lý dữ liệu thành công!');
    } catch (error) {
      console.error(error);
      toast.error('Có lỗi xảy ra khi đọc file Excel. Vui lòng kiểm tra lại định dạng file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const totalInvoices = sourceData.reduce((sum, item) => sum + item.invoices, 0);
  const totalRevenue = sourceData.reduce((sum, item) => sum + item.revenue, 0);

  const handleSaveReport = async () => {
    if (!currentFacility?.id || !reportDate || sourceData.length === 0) {
      toast.error('Dữ liệu không đầy đủ để lưu!');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.from('weekly_reports').upsert({
        facility_id: currentFacility.id,
        start_date: reportDate.startDate,
        end_date: reportDate.endDate,
        source_data: sourceData as any,
        total_invoices: totalInvoices,
        total_revenue: totalRevenue
      }, { onConflict: 'facility_id,start_date,end_date' });

      if (error) throw error;
      
      setIsSaved(true);
      toast.success('Lưu báo cáo tuần thành công!');
    } catch (error: any) {
      console.error('Error saving report:', error);
      toast.error('Không thể lưu báo cáo: ' + (error.message || 'Lỗi hệ thống'));
    } finally {
      setIsSaving(false);
    }
  };

  const formatMoney = (amount: number) => {
    return Math.round(amount).toLocaleString('vi-VN');
  };

  const calculateChange = (current: number, previous: number | undefined) => {
    if (!previous || previous === 0) return null;
    const diff = current - previous;
    const percent = (diff / previous) * 100;
    return {
      value: percent,
      isIncrease: percent > 0,
      isDecrease: percent < 0,
      formatted: `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`
    };
  };

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-forest-dark">Báo Cáo Tuần</h1>
          <p className="text-forest/70 text-sm mt-1">Upload file B03 và B04 để tự động tính toán doanh thu</p>
          {activeTab === 'report' && reportDate && (
            <div className="mt-2 text-xs font-semibold text-ochre bg-ochre/10 px-3 py-1 rounded-full inline-block">
              Chu kỳ: {formatDate(reportDate.startDate)} đến {formatDate(reportDate.endDate)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'report' && sourceData.length > 0 && (
            <button
              onClick={handleSaveReport}
              disabled={isSaving || isSaved}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-soft ${
                isSaved
                  ? 'bg-sage text-white border-0 cursor-not-allowed'
                  : 'bg-warm-white border border-forest text-forest hover:bg-forest hover:text-white'
              }`}
            >
              {isSaving ? <Activity className="animate-spin" size={16} /> : <Save size={16} />}
              {isSaved ? 'Đã lưu báo cáo' : 'Lưu dữ liệu tuần này'}
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-sage/10 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('report')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'report'
              ? 'bg-white text-forest-dark shadow-sm'
              : 'text-forest/60 hover:text-forest'
          }`}
        >
          <FileSpreadsheet size={16} />
          Nhập Báo Cáo
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'history'
              ? 'bg-white text-forest-dark shadow-sm'
              : 'text-forest/60 hover:text-forest'
          }`}
        >
          <History size={16} />
          Lịch Sử Báo Cáo
        </button>
      </div>

      {/* ── REPORT TAB ── */}
      {activeTab === 'report' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-sm border border-sage/20 p-6">
              <h3 className="text-sm font-semibold text-forest-dark mb-4 flex items-center gap-2">
                <FileSpreadsheet className="text-sage" size={18} />
                File Báo Cáo B03
              </h3>
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setB03File(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-colors ${b03File ? 'border-sage/50 bg-sage/5' : 'border-sage/30 hover:border-sage bg-warm-white'}`}>
                  {b03File ? (
                    <>
                      <CheckCircle2 className="text-sage mb-2" size={32} />
                      <p className="text-sm font-medium text-forest-dark text-center break-words w-full">{b03File.name}</p>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="text-sage/60 mb-2" size={32} />
                      <p className="text-sm text-forest/70">Click hoặc kéo thả file B03 vào đây</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-sage/20 p-6">
              <h3 className="text-sm font-semibold text-forest-dark mb-4 flex items-center gap-2">
                <FileSpreadsheet className="text-sage" size={18} />
                File Báo Cáo B04
              </h3>
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setB04File(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-colors ${b04File ? 'border-sage/50 bg-sage/5' : 'border-sage/30 hover:border-sage bg-warm-white'}`}>
                  {b04File ? (
                    <>
                      <CheckCircle2 className="text-sage mb-2" size={32} />
                      <p className="text-sm font-medium text-forest-dark text-center break-words w-full">{b04File.name}</p>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="text-sage/60 mb-2" size={32} />
                      <p className="text-sm text-forest/70">Click hoặc kéo thả file B04 vào đây</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleProcessFiles}
              disabled={!b03File || !b04File || isProcessing}
              className="bg-forest text-white px-8 py-3 rounded-xl font-medium shadow-soft hover:bg-forest-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isProcessing ? <Activity className="animate-spin" size={18} /> : null}
              {isProcessing ? 'Đang xử lý...' : 'Bắt đầu tính toán'}
            </button>
          </div>

          {sourceData.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mt-8 animate-fade-in">
              {/* B03 Source Table */}
              <div className="bg-white rounded-2xl shadow-sm border border-sage/20 overflow-hidden xl:col-span-2">
                <div className="p-4 border-b border-sage/20 bg-forest/5 flex justify-between items-center">
                  <h3 className="font-semibold text-forest-dark">Doanh thu theo nguồn (B03)</h3>
                  {previousReport && (
                    <span className="text-xs bg-sage/20 text-forest-dark px-3 py-1 rounded-full font-medium">
                      Có dữ liệu so sánh tuần trước
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-orange-200/50 text-orange-900 border-b border-orange-200">
                        <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Nguồn Đơn</th>
                        <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs text-right">Hóa Đơn<br/><span className="text-[10px] font-normal text-orange-800/70">Tuần Này</span></th>
                        {previousReport && <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs text-right bg-orange-100/50 border-l border-orange-200/50">+/- Hóa Đơn</th>}
                        <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs text-right border-l border-orange-200/50">Doanh Thu<br/><span className="text-[10px] font-normal text-orange-800/70">Tuần Này</span></th>
                        {previousReport && <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs text-right bg-orange-100/50 border-l border-orange-200/50">+/- Doanh Thu</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sage/10">
                      {sourceData.map((item, index) => {
                        let prevItem = previousReport?.source_data.find(s => s.name === item.name);
                        const invoiceChange = calculateChange(item.invoices, prevItem?.invoices);
                        const revenueChange = calculateChange(item.revenue, prevItem?.revenue);
                        return (
                          <tr key={index} className="hover:bg-sage/5 transition-colors">
                            <td className="px-4 py-3 font-medium text-forest-dark">{item.name}</td>
                            <td className="px-4 py-3 text-right">{item.invoices.toLocaleString()}</td>
                            {previousReport && (
                              <td className="px-4 py-3 text-right bg-orange-50/30 border-l border-sage/10">
                                {invoiceChange ? (
                                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${invoiceChange.isIncrease ? 'text-green-700 bg-green-100' : invoiceChange.isDecrease ? 'text-rose bg-rose/10' : 'text-gray-500 bg-gray-100'}`}>
                                    {invoiceChange.isIncrease ? <ArrowUpRight size={12}/> : (invoiceChange.isDecrease ? <ArrowDownRight size={12}/> : null)}
                                    {invoiceChange.formatted}
                                  </span>
                                ) : '-'}
                              </td>
                            )}
                            <td className="px-4 py-3 text-right font-medium text-forest-dark border-l border-sage/10">{formatMoney(item.revenue)}</td>
                            {previousReport && (
                              <td className="px-4 py-3 text-right bg-orange-50/30 border-l border-sage/10">
                                {revenueChange ? (
                                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${revenueChange.isIncrease ? 'text-green-700 bg-green-100' : revenueChange.isDecrease ? 'text-rose bg-rose/10' : 'text-gray-500 bg-gray-100'}`}>
                                    {revenueChange.isIncrease ? <ArrowUpRight size={12}/> : (revenueChange.isDecrease ? <ArrowDownRight size={12}/> : null)}
                                    {revenueChange.formatted}
                                  </span>
                                ) : '-'}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-orange-300 text-orange-950 font-bold border-t border-orange-300">
                      <tr>
                        <td className="px-4 py-3">TỔNG TUẦN</td>
                        <td className="px-4 py-3 text-right">{totalInvoices.toLocaleString()}</td>
                        {previousReport && (() => {
                          const invChg = calculateChange(totalInvoices, previousReport.total_invoices);
                          return (
                            <td className="px-4 py-3 text-right border-l border-orange-300">
                              {invChg ? <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full shadow-sm ${invChg.isIncrease ? 'text-white bg-green-600' : invChg.isDecrease ? 'text-white bg-rose' : 'text-gray-700 bg-gray-200'}`}>{invChg.formatted}</span> : '-'}
                            </td>
                          );
                        })()}
                        <td className="px-4 py-3 text-right border-l border-orange-300/50">{formatMoney(totalRevenue)}</td>
                        {previousReport && (() => {
                          const revChg = calculateChange(totalRevenue, previousReport.total_revenue);
                          return (
                            <td className="px-4 py-3 text-right border-l border-orange-300">
                              {revChg ? <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full shadow-sm ${revChg.isIncrease ? 'text-white bg-green-600' : revChg.isDecrease ? 'text-white bg-rose' : 'text-gray-700 bg-gray-200'}`}>{revChg.formatted}</span> : '-'}
                            </td>
                          );
                        })()}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="space-y-8 xl:col-span-1">
                <div className="bg-white rounded-2xl shadow-sm border border-sage/20 overflow-hidden h-full">
                  <div className="p-4 border-b border-sage/20 bg-forest/5">
                    <h3 className="font-semibold text-forest-dark">Doanh thu theo nhóm món (B04)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-orange-200/50 text-orange-900 border-b border-orange-200">
                          <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Nhóm Món</th>
                          <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">KEY word</th>
                          <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs text-right">Doanh Thu<br/><span className="text-[10px] font-normal">(NET + HOA HỒNG)/1,08</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sage/10">
                        {groupData.map((item, index) => (
                          <tr key={index} className="hover:bg-sage/5 transition-colors">
                            <td className="px-4 py-3 font-medium text-forest-dark">{item.group}</td>
                            <td className="px-4 py-3 text-forest/70">{item.keyword}</td>
                            <td className="px-4 py-3 text-right font-medium text-forest-dark bg-green-50/50">{formatMoney(item.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="space-y-8 xl:col-span-1">
                <div className="bg-white rounded-2xl shadow-sm border border-sage/20 overflow-hidden h-full">
                  <div className="p-4 border-b border-sage/20 bg-forest/5">
                    <h3 className="font-semibold text-forest-dark">Doanh thu theo ngày (B03)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-center">
                      <thead>
                        <tr className="bg-orange-300/80 text-orange-950 border-b border-orange-300">
                          <th colSpan={dailyData.length} className="px-4 py-2 font-semibold uppercase tracking-wider text-xs border-b border-orange-300">
                            NET + HOA HỒNG (KHÔNG CHIA 1,8)
                          </th>
                        </tr>
                        <tr className="bg-orange-200/50 text-orange-900 border-b border-orange-200">
                          {dailyData.map((item, index) => (
                            <th key={index} className="px-2 py-2 font-semibold tracking-wider text-xs whitespace-nowrap border-r border-orange-200/50 last:border-r-0">
                              {item.date}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {dailyData.map((item, index) => (
                            <td key={index} className="px-2 py-3 font-medium text-forest-dark whitespace-nowrap border-r border-sage/10 last:border-r-0 bg-white">
                              {formatMoney(item.revenue)}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-forest/70">
              {isLoadingHistory ? 'Đang tải...' : `${savedReports.length} báo cáo đã lưu`}
            </p>
            <button
              onClick={fetchHistory}
              disabled={isLoadingHistory}
              className="text-xs flex items-center gap-1.5 text-forest/60 hover:text-forest transition-colors font-medium"
            >
              <Activity size={13} className={isLoadingHistory ? 'animate-spin' : ''} />
              Làm mới
            </button>
          </div>

          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-20">
              <Activity className="animate-spin text-sage" size={32} />
            </div>
          ) : savedReports.length === 0 ? (
            <div className="bg-white rounded-2xl border border-sage/20 shadow-sm flex flex-col items-center justify-center py-16 gap-3">
              <CalendarDays size={48} className="text-sage/40" />
              <p className="text-forest/50 text-sm font-medium">Chưa có báo cáo nào được lưu</p>
              <p className="text-forest/40 text-xs">Hãy nhập và lưu báo cáo tuần đầu tiên của bạn</p>
              <button
                onClick={() => setActiveTab('report')}
                className="mt-2 px-4 py-2 bg-forest text-white rounded-xl text-sm font-medium hover:bg-forest-dark transition-colors"
              >
                Nhập báo cáo ngay
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {savedReports.map((report) => {
                const isExpanded = expandedReport === report.id;
                const totalRev = report.source_data.reduce((s, r) => s + r.revenue, 0);
                return (
                  <div key={report.id} className="bg-white rounded-2xl shadow-sm border border-sage/20 overflow-hidden transition-all">
                    {/* Card Header */}
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div className="w-10 h-10 rounded-xl bg-ochre/10 flex items-center justify-center shrink-0">
                        <CalendarDays size={20} className="text-ochre" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-forest-dark text-sm">
                          {formatDate(report.start_date)} — {formatDate(report.end_date)}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-forest/60">{report.total_invoices.toLocaleString()} hóa đơn</span>
                          <span className="text-xs text-forest/30">•</span>
                          <span className="text-xs font-semibold text-forest-dark">{formatMoney(totalRev)} đ</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleDeleteReport(report.id)}
                          disabled={deletingId === report.id}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-rose/60 hover:text-rose hover:bg-rose/10 transition-colors"
                          title="Xóa báo cáo này"
                        >
                          {deletingId === report.id
                            ? <Activity size={15} className="animate-spin" />
                            : <Trash2 size={15} />}
                        </button>
                        <button
                          onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-forest/50 hover:text-forest hover:bg-sage/10 transition-colors"
                          title={isExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Detail */}
                    {isExpanded && (
                      <div className="border-t border-sage/10 px-5 py-4 bg-warm-white/50 animate-fade-in">
                        <p className="text-xs font-semibold text-forest/50 uppercase tracking-wider mb-3">Doanh thu theo nguồn đơn</p>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-orange-100/60 text-orange-900 rounded-lg">
                              <th className="text-left px-3 py-2 text-xs font-semibold rounded-l-lg">Nguồn Đơn</th>
                              <th className="text-right px-3 py-2 text-xs font-semibold">Hóa Đơn</th>
                              <th className="text-right px-3 py-2 text-xs font-semibold rounded-r-lg">Doanh Thu</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-sage/10">
                            {report.source_data.map((src, i) => (
                              <tr key={i} className="hover:bg-sage/5">
                                <td className="px-3 py-2 text-forest-dark font-medium">{src.name}</td>
                                <td className="px-3 py-2 text-right text-forest/70">{src.invoices.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right font-semibold text-forest-dark">{formatMoney(src.revenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-orange-200/50 font-bold text-orange-950">
                              <td className="px-3 py-2 rounded-bl-lg">TỔNG</td>
                              <td className="px-3 py-2 text-right">{report.total_invoices.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right rounded-br-lg">{formatMoney(totalRev)}</td>
                            </tr>
                          </tfoot>
                        </table>
                        <p className="text-[10px] text-forest/30 mt-3 text-right">
                          Lưu lúc: {new Date(report.created_at).toLocaleString('vi-VN')}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

