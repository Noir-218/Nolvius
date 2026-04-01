import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, AlertTriangle, AlertCircle, CheckCircle2, ClipboardList, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface IngredientRow {
  id: string;
  name: string;
  unit: string;
  min_stock: number | null;
  category_name: string | null;
  // from latest audit
  stock_in_store: number | null;
  stock_in_counter: number | null;
  actual_stock: number | null;
  audit_date: string | null;
}

const Stock = () => {
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  const fetchStock = async () => {
    setLoading(true);

    // 1. Fetch all ingredients
    const { data: ingData } = await supabase
      .from('ingredients')
      .select('id, name, unit, min_stock, ingredient_categories(name)')
      .order('name');

    if (!ingData) {
      setLoading(false);
      return;
    }

    // 2. Fetch most recent audit for each ingredient
    const { data: auditData } = await supabase
      .from('stock_audits')
      .select('ingredient_id, stock_in_store, stock_in_counter, actual_stock, audit_date')
      .order('audit_date', { ascending: false })
      .order('created_at', { ascending: false });

    // Build map: ingredient_id → latest audit data
    const latestAuditMap: Record<string, any> = {};
    if (auditData) {
      auditData.forEach((a: any) => {
        if (a.ingredient_id && latestAuditMap[a.ingredient_id] === undefined) {
          latestAuditMap[a.ingredient_id] = {
            stock_in_store: a.stock_in_store,
            stock_in_counter: a.stock_in_counter,
            actual_stock: a.actual_stock ?? 0,
            audit_date: a.audit_date,
          };
        }
      });
    }

    // 3. Merge
    const merged: IngredientRow[] = ingData.map((ing: any) => {
      const latest = latestAuditMap[ing.id];
      return {
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        min_stock: ing.min_stock ?? 0,
        category_name: ing.ingredient_categories?.name ?? null,
        stock_in_store: latest ? latest.stock_in_store : null,
        stock_in_counter: latest ? latest.stock_in_counter : null,
        actual_stock: latest ? latest.actual_stock : null,
        audit_date: latest ? latest.audit_date : null,
      };
    });

    setRows(merged);
    const cats = Array.from(
      new Set(merged.map(r => r.category_name).filter(Boolean))
    ) as string[];
    setCategories(cats);
    setLoading(false);
  };

  useEffect(() => {
    fetchStock();
  }, []);

  const getStatus = (current: number | null, min: number | null) => {
    if (current === null) return { label: 'Chưa kiểm kê', color: 'text-gray-500 bg-gray-100', icon: ClipboardList };
    if (current <= 0) return { label: 'Hết hàng', color: 'text-red-600 bg-red-100', icon: AlertCircle };
    if (current <= (min ?? 0)) return { label: 'Sắp hết', color: 'text-orange-600 bg-orange-100', icon: AlertTriangle };
    return { label: 'Đủ hàng', color: 'text-green-600 bg-green-100', icon: CheckCircle2 };
  };

  const filtered = rows.filter(r => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory ? r.category_name === filterCategory : true;
    return matchSearch && matchCat;
  });

  // Stats
  const audited = rows.filter(r => r.actual_stock !== null);
  const outOfStock = audited.filter(r => (r.actual_stock ?? 0) <= 0);
  const lowStock = audited.filter(r => (r.actual_stock ?? 0) > 0 && (r.actual_stock ?? 0) <= (r.min_stock ?? 0));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản Lý Tồn Kho</h1>
        <p className="text-gray-500 mt-1">
          Tồn kho hiển thị từ <span className="font-medium text-blue-600">số liệu thực tế của phiếu kiểm kê gần nhất</span> cho mỗi nguyên liệu.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-xs text-green-600 font-medium">Đã kiểm kê</p>
          <p className="text-2xl font-bold text-green-700">{audited.length} / {rows.length}</p>
          <p className="text-xs text-green-500 mt-0.5">nguyên liệu</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="text-xs text-orange-600 font-medium">Sắp hết</p>
          <p className="text-2xl font-bold text-orange-700">{lowStock.length}</p>
          <p className="text-xs text-orange-500 mt-0.5">nguyên liệu dưới định mức</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-xs text-red-600 font-medium">Hết hàng</p>
          <p className="text-2xl font-bold text-red-700">{outOfStock.length}</p>
          <p className="text-xs text-red-500 mt-0.5">nguyên liệu cần nhập</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 border-b pb-4">
        <div className="flex gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder="Tìm kiếm nguyên liệu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500"
            />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-blue-500 flex-1 md:w-48 bg-white"
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((c, idx) => <option key={idx} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tên Nguyên Liệu</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Đơn Vị</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tồn Kho</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tồn Quầy</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tổng Tồn</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Định Mức</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Kiểm Kê Gần Nhất</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Trạng Thái</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">Đang tải dữ liệu tồn kho...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">Không có dữ liệu</td></tr>
            ) : (
              filtered.map((item) => {
                const status = getStatus(item.actual_stock, item.min_stock);
                const StatusIcon = status.icon;
                const hasAudit = item.actual_stock !== null;

                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">{item.unit}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {hasAudit ? item.stock_in_store : '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {hasAudit ? item.stock_in_counter : '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      {hasAudit ? (
                        <span className="text-base font-bold text-gray-900">{item.actual_stock}</span>
                      ) : (
                        <span className="text-sm text-gray-400 italic">Chưa có</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">{item.min_stock ?? '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-xs text-gray-400">
                      {item.audit_date ? (
                        <span className="flex items-center justify-center gap-1">
                          <Calendar size={13} />
                          {format(parseISO(item.audit_date), 'dd/MM/yyyy')}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${status.color}`}>
                        <StatusIcon size={14} />
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Stock;
