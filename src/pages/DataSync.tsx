import React, { useState, useEffect } from 'react';
import { Facility } from '../contexts/FacilityContext';
import { supabase } from '../lib/supabase';
import { SYNC_TABLES, syncDataBetweenFacilities, SyncProgress } from '../lib/syncService';
import { Database, RefreshCw, CheckCircle, XCircle, AlertCircle, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

const DataSync: React.FC = () => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loadingFacilities, setLoadingFacilities] = useState(true);
  
  const [sourceId, setSourceId] = useState<string>('');
  const [destId, setDestId] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [progressLog, setProgressLog] = useState<SyncProgress[]>([]);
  
  // Trạng thái lưu trữ các bảng được chọn (mặc định chọn tất cả)
  const [selectedTables, setSelectedTables] = useState<string[]>(SYNC_TABLES);

  // Fetch tất cả các cơ sở (dành cho tài khoản master)
  useEffect(() => {
    const fetchFacilities = async () => {
      try {
        const { data, error } = await supabase.from('facilities' as any).select('*');
        if (error) throw error;
        if (data) {
          setFacilities(data as unknown as Facility[]);
        }
      } catch (err: any) {
        console.error('Lỗi khi tải danh sách cơ sở:', err);
        toast.error('Không thể tải danh sách cơ sở');
      } finally {
        setLoadingFacilities(false);
      }
    };
    fetchFacilities();
  }, []);

  const handleToggleTable = (table: string) => {
    setSelectedTables(prev => 
      prev.includes(table) 
        ? prev.filter(t => t !== table)
        : [...prev, table]
    );
  };

  const handleSync = async () => {
    if (!sourceId || !destId) {
      toast.error('Vui lòng chọn đầy đủ Cơ sở Nguồn và Đích!');
      return;
    }
    if (sourceId === destId) {
      toast.error('Cơ sở Đích phải khác Cơ sở Nguồn!');
      return;
    }
    if (selectedTables.length === 0) {
      toast.error('Vui lòng chọn ít nhất một bảng dữ liệu để đồng bộ!');
      return;
    }

    const sourceFacility = facilities.find(f => f.id === sourceId);
    const destFacility = facilities.find(f => f.id === destId);

    if (!sourceFacility || !destFacility) {
      toast.error('Không tìm thấy thông tin cơ sở!');
      return;
    }

    // Đảm bảo thứ tự các bảng đúng như SYNC_TABLES đã định nghĩa
    const orderedSelectedTables = SYNC_TABLES.filter(t => selectedTables.includes(t));

    // Reset log
    setProgressLog(orderedSelectedTables.map(table => ({ table, status: 'pending' })));
    setSyncing(true);

    try {
      await syncDataBetweenFacilities(
        sourceFacility as any,
        destFacility as any,
        orderedSelectedTables as any,
        (progress) => {
          setProgressLog(prev => prev.map(p => p.table === progress.table ? { ...p, ...progress } : p));
        }
      );
      toast.success('Đồng bộ hoàn tất!');
    } catch (error: any) {
      toast.error(error.message || 'Có lỗi xảy ra trong quá trình đồng bộ!');
    } finally {
      setSyncing(false);
    }
  };

  const getStatusIcon = (status: SyncProgress['status']) => {
    switch (status) {
      case 'pending': return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />;
      case 'syncing': return <RefreshCw size={20} className="text-blue-500 animate-spin" />;
      case 'success': return <CheckCircle size={20} className="text-green-500" />;
      case 'error': return <XCircle size={20} className="text-red-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-900 uppercase">Đồng bộ Dữ liệu</h1>
          <p className="text-gray-500 text-sm mt-1">Đồng bộ danh mục, sản phẩm và nguyên vật liệu từ cơ sở này sang cơ sở khác.</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1 w-full">
            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Cơ sở Nguồn (Copy từ)</label>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              disabled={syncing || loadingFacilities}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 py-3"
            >
              <option value="">{loadingFacilities ? 'Đang tải...' : '-- Chọn cơ sở --'}</option>
              {facilities.map((fac) => (
                <option key={fac.id} value={fac.id}>{fac.name}</option>
              ))}
            </select>
          </div>

          <div className="hidden md:flex mt-6 shrink-0">
            <ArrowRight size={24} className="text-gray-400" />
          </div>

          <div className="flex-1 w-full">
            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Cơ sở Đích (Ghi đè vào)</label>
            <select
              value={destId}
              onChange={(e) => setDestId(e.target.value)}
              disabled={syncing || loadingFacilities}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 py-3"
            >
              <option value="">{loadingFacilities ? 'Đang tải...' : '-- Chọn cơ sở --'}</option>
              {facilities.map((fac) => (
                <option key={fac.id} value={fac.id}>{fac.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Phần chọn bảng đồng bộ */}
        <div className="mt-8">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Các bảng dữ liệu (Sắp xếp theo thứ tự ưu tiên khóa ngoại)</h3>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {SYNC_TABLES.map((table, index) => (
              <label 
                key={table} 
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedTables.includes(table) ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-200 hover:bg-gray-100'}`}
              >
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-xs font-bold text-gray-600 shrink-0">
                  {index + 1}
                </div>
                <input 
                  type="checkbox"
                  className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                  checked={selectedTables.includes(table)}
                  onChange={() => handleToggleTable(table)}
                  disabled={syncing}
                />
                <span className="text-sm font-medium text-gray-800 break-all">{table}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <div className="flex items-start gap-3 bg-blue-50 text-blue-800 p-4 rounded-lg text-sm mb-6">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Lưu ý trước khi đồng bộ:</p>
              <ul className="list-disc list-inside mt-1 space-y-1 text-blue-700">
                <li>Dữ liệu tại cơ sở đích sẽ bị ghi đè (Cập nhật) nếu trùng ID.</li>
                <li>Chỉ đồng bộ các dữ liệu dùng chung (Danh mục, Sản phẩm, Công thức, Nguyên liệu, NCC).</li>
                <li>Hệ thống tự động sắp xếp thứ tự các bảng để không bị lỗi khóa ngoại.</li>
              </ul>
            </div>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing || !sourceId || !destId || selectedTables.length === 0}
            className="w-full md:w-auto px-8 py-3 bg-teal-600 text-white rounded-lg font-black uppercase tracking-wider hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md flex items-center justify-center gap-2 mx-auto"
          >
            {syncing ? (
              <>
                <RefreshCw size={20} className="animate-spin" />
                Đang xử lý...
              </>
            ) : (
              <>
                <Database size={20} />
                Bắt đầu đồng bộ
              </>
            )}
          </button>
        </div>
      </div>

      {progressLog.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-black text-gray-900 uppercase mb-4">Tiến trình đồng bộ</h2>
          <div className="space-y-4">
            {progressLog.map((log) => (
              <div key={log.table} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center gap-3">
                  {getStatusIcon(log.status)}
                  <span className="font-bold text-gray-700 capitalize">{log.table.replace(/_/g, ' ')}</span>
                </div>
                <div className="text-sm text-gray-500 font-medium text-right">
                  {log.status === 'success' && <span className="text-green-600">Hoàn tất ({log.count} bản ghi)</span>}
                  {log.status === 'error' && <span className="text-red-500">{log.message}</span>}
                  {log.status === 'syncing' && <span className="text-blue-500">Đang đồng bộ...</span>}
                  {log.status === 'pending' && <span>Chờ xử lý</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DataSync;
