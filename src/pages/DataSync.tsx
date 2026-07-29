import React, { useState, useEffect } from 'react';
import { Facility } from '../contexts/FacilityContext';
import { supabase } from '../lib/supabase';
import {
  SYNC_TABLES,
  syncDataBetweenFacilities,
  SyncProgress,
  getSchemaInfo,
  diffSchemas,
  applyMissingColumns,
  MissingColumn,
} from '../lib/syncService';
import {
  Database,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
  Layers,
  Search,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';

type TabType = 'data' | 'schema';

const DataSync: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('data');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loadingFacilities, setLoadingFacilities] = useState(true);

  // ── Data Sync state ──
  const [sourceId, setSourceId] = useState<string>('');
  const [destId, setDestId] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [progressLog, setProgressLog] = useState<SyncProgress[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>(SYNC_TABLES);

  // ── Schema Sync state ──
  const [schemaSourceId, setSchemaSourceId] = useState<string>('');
  const [schemaDestId, setSchemaDestId] = useState<string>('');
  const [checkingSchema, setCheckingSchema] = useState(false);
  const [applyingSchema, setApplyingSchema] = useState(false);
  const [missingColumns, setMissingColumns] = useState<MissingColumn[] | null>(null);

  useEffect(() => {
    const fetchFacilities = async () => {
      try {
        const { data, error } = await supabase.from('facilities' as any).select('*');
        if (error) throw error;
        if (data) setFacilities(data as unknown as Facility[]);
      } catch (err: any) {
        toast.error('Không thể tải danh sách cơ sở');
      } finally {
        setLoadingFacilities(false);
      }
    };
    fetchFacilities();
  }, []);

  // ── Data Sync handlers ──
  const handleToggleTable = (table: string) => {
    setSelectedTables(prev =>
      prev.includes(table) ? prev.filter(t => t !== table) : [...prev, table]
    );
  };

  const handleSync = async () => {
    if (!sourceId || !destId) { toast.error('Vui lòng chọn đầy đủ Cơ sở Nguồn và Đích!'); return; }
    if (sourceId === destId) { toast.error('Cơ sở Đích phải khác Cơ sở Nguồn!'); return; }
    if (selectedTables.length === 0) { toast.error('Vui lòng chọn ít nhất một bảng!'); return; }

    const sourceFacility = facilities.find(f => f.id === sourceId);
    const destFacility = facilities.find(f => f.id === destId);
    if (!sourceFacility || !destFacility) { toast.error('Không tìm thấy thông tin cơ sở!'); return; }

    const orderedSelectedTables = SYNC_TABLES.filter(t => selectedTables.includes(t));
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
      toast.error(error.message || 'Có lỗi xảy ra!');
    } finally {
      setSyncing(false);
    }
  };

  // ── Schema Sync handlers ──
  const handleCheckSchema = async () => {
    if (!schemaSourceId || !schemaDestId) { toast.error('Vui lòng chọn Cơ sở Nguồn và Đích!'); return; }
    if (schemaSourceId === schemaDestId) { toast.error('Cơ sở Đích phải khác Cơ sở Nguồn!'); return; }

    const sourceFac = facilities.find(f => f.id === schemaSourceId) as any;
    const destFac = facilities.find(f => f.id === schemaDestId) as any;
    if (!sourceFac || !destFac) { toast.error('Không tìm thấy thông tin cơ sở!'); return; }

    setCheckingSchema(true);
    setMissingColumns(null);
    try {
      const [sourceSchema, destSchema] = await Promise.all([
        getSchemaInfo(sourceFac),
        getSchemaInfo(destFac),
      ]);
      const diff = diffSchemas(sourceSchema, destSchema);
      setMissingColumns(diff);
      if (diff.length === 0) {
        toast.success('Schema đang đồng bộ hoàn toàn!');
      } else {
        toast(`Phát hiện ${diff.length} cột còn thiếu.`, { icon: '⚠️' });
      }
    } catch (err: any) {
      toast.error(err.message || 'Không thể đọc schema!');
    } finally {
      setCheckingSchema(false);
    }
  };

  const handleApplySchema = async () => {
    if (!missingColumns || missingColumns.length === 0) return;
    const destFac = facilities.find(f => f.id === schemaDestId) as any;
    if (!destFac) { toast.error('Không tìm thấy cơ sở đích!'); return; }

    setApplyingSchema(true);
    try {
      await applyMissingColumns(
        destFac,
        missingColumns,
        (updated) => {
          setMissingColumns(prev =>
            prev ? prev.map(c =>
              c.table_name === updated.table_name && c.column_name === updated.column_name
                ? updated : c
            ) : prev
          );
        }
      );
      toast.success('Đồng bộ cấu trúc hoàn tất!');
    } catch (err: any) {
      toast.error(err.message || 'Có lỗi xảy ra!');
    } finally {
      setApplyingSchema(false);
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

  const getColStatusIcon = (status: MissingColumn['status']) => {
    switch (status) {
      case 'pending': return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />;
      case 'applying': return <RefreshCw size={16} className="text-blue-500 animate-spin" />;
      case 'added': return <CheckCircle size={16} className="text-green-500" />;
      case 'exists': return <ShieldCheck size={16} className="text-gray-400" />;
      case 'error': return <XCircle size={16} className="text-red-500" />;
    }
  };

  const pendingMissing = missingColumns?.filter(c => c.status === 'pending') ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 uppercase">Đồng bộ Hệ thống</h1>
        <p className="text-gray-500 text-sm mt-1">Đồng bộ dữ liệu và cấu trúc bảng giữa các cơ sở.</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('data')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'data'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Database size={16} />
          Đồng bộ Dữ liệu
        </button>
        <button
          onClick={() => setActiveTab('schema')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'schema'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Layers size={16} />
          Đồng bộ Cấu trúc
        </button>
      </div>

      {/* ── DATA SYNC TAB ── */}
      {activeTab === 'data' && (
        <>
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

            <div className="mt-8">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Các bảng dữ liệu (Sắp xếp theo thứ tự ưu tiên khóa ngoại)</h3>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {SYNC_TABLES.map((table, index) => (
                  <label
                    key={table}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedTables.includes(table) ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-200 hover:bg-gray-100'}`}
                  >
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-xs font-bold text-gray-600 shrink-0">{index + 1}</div>
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
                  <><RefreshCw size={20} className="animate-spin" />Đang xử lý...</>
                ) : (
                  <><Database size={20} />Bắt đầu đồng bộ</>
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
        </>
      )}

      {/* ── SCHEMA SYNC TAB ── */}
      {activeTab === 'schema' && (
        <>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-start gap-3 bg-amber-50 text-amber-800 p-4 rounded-lg text-sm mb-6 border border-amber-200">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Khi nào cần dùng chức năng này?</p>
                <p className="mt-1 text-amber-700">
                  Khi bạn vừa thêm cột mới vào bảng của cơ sở Gốc (Master), các cơ sở khác có thể chưa có cột đó.
                  Hãy chọn Master làm Nguồn, cơ sở cần cập nhật làm Đích, rồi bấm <strong>Kiểm tra</strong> để phát hiện sự chênh lệch,
                  sau đó bấm <strong>Đồng bộ</strong> để áp dụng.
                </p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1 w-full">
                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Cơ sở Nguồn (Schema chuẩn)</label>
                <select
                  value={schemaSourceId}
                  onChange={(e) => { setSchemaSourceId(e.target.value); setMissingColumns(null); }}
                  disabled={checkingSchema || applyingSchema || loadingFacilities}
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
                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Cơ sở Đích (Cần cập nhật)</label>
                <select
                  value={schemaDestId}
                  onChange={(e) => { setSchemaDestId(e.target.value); setMissingColumns(null); }}
                  disabled={checkingSchema || applyingSchema || loadingFacilities}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 py-3"
                >
                  <option value="">{loadingFacilities ? 'Đang tải...' : '-- Chọn cơ sở --'}</option>
                  {facilities.map((fac) => (
                    <option key={fac.id} value={fac.id}>{fac.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={handleCheckSchema}
                disabled={checkingSchema || applyingSchema || !schemaSourceId || !schemaDestId}
                className="px-6 py-2.5 bg-gray-800 text-white rounded-lg font-bold text-sm hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {checkingSchema ? (
                  <><RefreshCw size={16} className="animate-spin" />Đang kiểm tra...</>
                ) : (
                  <><Search size={16} />Kiểm tra Schema</>
                )}
              </button>

              {missingColumns && missingColumns.length > 0 && pendingMissing.length > 0 && (
                <button
                  onClick={handleApplySchema}
                  disabled={applyingSchema || checkingSchema}
                  className="px-6 py-2.5 bg-teal-600 text-white rounded-lg font-bold text-sm hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {applyingSchema ? (
                    <><RefreshCw size={16} className="animate-spin" />Đang đồng bộ...</>
                  ) : (
                    <><Plus size={16} />Đồng bộ {pendingMissing.length} cột thiếu</>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Schema Diff Result */}
          {missingColumns !== null && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-gray-900 uppercase">Kết quả kiểm tra</h2>
                {missingColumns.length === 0 ? (
                  <span className="flex items-center gap-2 text-green-600 font-bold text-sm bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
                    <CheckCircle size={16} /> Schema đồng bộ hoàn toàn
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-amber-700 font-bold text-sm bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
                    <AlertCircle size={16} /> {missingColumns.length} cột thiếu
                  </span>
                )}
              </div>

              {missingColumns.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">
                  Cơ sở đích đã có đầy đủ cột so với cơ sở nguồn. Không cần đồng bộ.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-xs font-black text-gray-500 uppercase tracking-wide">Trạng thái</th>
                        <th className="text-left py-2 px-3 text-xs font-black text-gray-500 uppercase tracking-wide">Bảng</th>
                        <th className="text-left py-2 px-3 text-xs font-black text-gray-500 uppercase tracking-wide">Cột thiếu</th>
                        <th className="text-left py-2 px-3 text-xs font-black text-gray-500 uppercase tracking-wide">Kiểu dữ liệu</th>
                        <th className="text-left py-2 px-3 text-xs font-black text-gray-500 uppercase tracking-wide">Default</th>
                        <th className="text-left py-2 px-3 text-xs font-black text-gray-500 uppercase tracking-wide">Kết quả</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {missingColumns.map((col) => (
                        <tr key={`${col.table_name}::${col.column_name}`} className={`
                          ${col.status === 'added' ? 'bg-green-50' : ''}
                          ${col.status === 'error' ? 'bg-red-50' : ''}
                          ${col.status === 'applying' ? 'bg-blue-50' : ''}
                        `}>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-center w-6">
                              {getColStatusIcon(col.status)}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs text-gray-700 font-bold">{col.table_name}</td>
                          <td className="py-2.5 px-3 font-mono text-xs text-teal-700 font-bold">{col.column_name}</td>
                          <td className="py-2.5 px-3 font-mono text-xs text-gray-500">{col.data_type}</td>
                          <td className="py-2.5 px-3 font-mono text-xs text-gray-400">{col.column_default ?? '—'}</td>
                          <td className="py-2.5 px-3 text-xs">
                            {col.status === 'added' && <span className="text-green-600 font-bold">✓ Đã thêm</span>}
                            {col.status === 'exists' && <span className="text-gray-400">Đã tồn tại</span>}
                            {col.status === 'error' && <span className="text-red-500">{col.message}</span>}
                            {col.status === 'applying' && <span className="text-blue-500">Đang thêm...</span>}
                            {col.status === 'pending' && <span className="text-gray-400">Chờ đồng bộ</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DataSync;
