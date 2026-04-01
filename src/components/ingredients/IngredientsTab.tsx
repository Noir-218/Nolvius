import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Search, Upload } from 'lucide-react';
import { Modal } from '../ui/Modal';
import * as xlsx from 'xlsx';
import type { Database } from '../../types/database.types';

type Ingredient = Database['public']['Tables']['ingredients']['Row'] & {
  ingredient_categories: { name: string } | null;
  ingredient_order_types: { name: string } | null;
};

export const IngredientsTab = () => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<{ id: string, name: string }[]>([]);
  const [orderTypes, setOrderTypes] = useState<{ id: string, name: string }[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterOrderType, setFilterOrderType] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    id: '', name: '', category_id: '', unit: '', min_stock: 0, order_type_id: ''
  });
  const [conversionUnits, setConversionUnits] = useState<{ id?: string, unit_name: string, conversion_factor: number }[]>([]);

  const fetchData = async () => {
    setLoading(true);

    // Fetch filter data
    const [catsRes, typesRes, stocksRes] = await Promise.all([
      supabase.from('ingredient_categories').select('id, name'),
      supabase.from('ingredient_order_types' as any).select('id, name'),
      supabase.from('vw_current_stock').select('ingredient_id, current_stock')
    ]);

    if (catsRes.data) setCategories(catsRes.data);
    if (typesRes.data) setOrderTypes(typesRes.data as any);
    if (stocksRes.data) {
      const stockMap: Record<string, number> = {};
      stocksRes.data.forEach(s => {
        if (s.ingredient_id) stockMap[s.ingredient_id] = s.current_stock || 0;
      });
      setStocks(stockMap);
    }

    // Fetch ingredients
    let query = supabase.from('ingredients')
      .select(`*, ingredient_categories(name), ingredient_order_types(name)`)
      .order('created_at', { ascending: false });

    if (search) query = query.ilike('name', `%${search}%`);
    if (filterCategory) query = query.eq('category_id', filterCategory);
    if (filterOrderType) query = query.eq('order_type_id', filterOrderType);

    const { data, error } = await query;
    if (!error && data) {
      setIngredients(data as any[]);
    } else {
      setIngredients([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [search, filterCategory, filterOrderType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      category_id: formData.category_id || null,
      order_type_id: formData.order_type_id || null,
    };
    // Remove reorder_cycle_days from payload since it's being replaced
    delete (payload as any).reorder_cycle_days;

    try {
      if (editingId) {
        await supabase.from('ingredients').update(payload).eq('id', editingId);
        // Update conversion units
        // Simple approach: delete all and re-insert
        await supabase.from('ingredient_units').delete().eq('ingredient_id', editingId);
        if (conversionUnits.length > 0) {
          const unitsToInsert = conversionUnits
            .filter(u => u.unit_name && u.conversion_factor > 0)
            .map(u => ({
              ingredient_id: editingId,
              unit_name: u.unit_name,
              conversion_factor: u.conversion_factor
            }));
          if (unitsToInsert.length > 0) {
            await supabase.from('ingredient_units').insert(unitsToInsert);
          }
        }
      } else {
        const { data: newIng, error: ingError } = await supabase.from('ingredients').insert([payload]).select().single();
        if (ingError) throw ingError;
        
        // Insert conversion units for new ingredient
        if (newIng && conversionUnits.length > 0) {
          const unitsToInsert = conversionUnits
            .filter(u => u.unit_name && u.conversion_factor > 0)
            .map(u => ({
              ingredient_id: newIng.id,
              unit_name: u.unit_name,
              conversion_factor: u.conversion_factor
            }));
          if (unitsToInsert.length > 0) {
            await supabase.from('ingredient_units').insert(unitsToInsert);
          }
        }
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa nguyên liệu này?')) {
      await supabase.from('ingredients').delete().eq('id', id);
      fetchData();
    }
  };

  const openModal = async (ing?: Ingredient) => {
    if (ing) {
      setEditingId(ing.id);
      setFormData({
        id: ing.id,
        name: ing.name,
        category_id: ing.category_id || '',
        unit: ing.unit,
        min_stock: ing.min_stock || 0,
        order_type_id: (ing as any).order_type_id || ''
      });
      // Fetch conversion units
      const { data } = await supabase.from('ingredient_units').select('*').eq('ingredient_id', ing.id);
      setConversionUnits(data || []);
    } else {
      setEditingId(null);
      setFormData({ id: '', name: '', category_id: '', unit: '', min_stock: 0, order_type_id: '' });
      setConversionUnits([]);
    }
    setIsModalOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = xlsx.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });

        // Loại bỏ ký tự ẩn
        const clean = (val: any) =>
          String(val ?? '').replace(/[\u200b\u200c\u200d\uFEFF\u00A0]/g, '').trim();

        // Tìm dòng header chứa "mã" hoặc "tên"
        const headerKeywords = ['mã nguyên liệu', 'tên nguyên liệu', 'đơn vị', 'mã nl', 'tên nl'];
        const headerRowIndex = rawRows.findIndex(row =>
          row.some(cell => headerKeywords.includes(clean(cell).toLowerCase()))
        );

        if (headerRowIndex === -1) {
          alert('Không tìm thấy dòng tiêu đề. File cần có cột: Mã Nguyên Liệu | Tên Nguyên Liệu | Đơn Vị');
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        const headerRow = rawRows[headerRowIndex].map(c => clean(c).toLowerCase());
        const dataRows = rawRows.slice(headerRowIndex + 1);

        const colId = headerRow.findIndex(h => ['mã nguyên liệu', 'mã nl', 'mã', 'id', 'code'].includes(h));
        const colName = headerRow.findIndex(h => ['tên nguyên liệu', 'tên nl', 'tên', 'name'].includes(h));
        const colUnit = headerRow.findIndex(h => ['đơn vị', 'unit', 'dvt'].includes(h));
        const colConversion = headerRow.findIndex(h => ['đơn vị quy đổi', 'conversion', 'quy đổi', 'don vi quy doi'].includes(h));

        if (colName === -1) {
          alert('Không tìm thấy cột Tên Nguyên Liệu trong file!');
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        const inserts = dataRows
          .map(row => {
            const conversionStr = colConversion >= 0 ? clean(row[colConversion]) : '';
            const cUnits = conversionStr ? conversionStr.split(',').map(pair => {
              const parts = pair.split(':');
              return { 
                unit_name: clean(parts[0]), 
                conversion_factor: parseFloat(clean(parts[1])) || 1 
              };
            }).filter(u => u.unit_name) : [];

            return {
              id: colId >= 0 ? clean(row[colId]) : undefined,
              name: colName >= 0 ? clean(row[colName]) : '',
              unit: colUnit >= 0 ? clean(row[colUnit]) || 'kg' : 'kg',
              conversionUnits: cUnits
            };
          })
          .filter(r => r.name);

        // Tách thành có id và không có id
        const withId = inserts.filter(r => r.id) as any[];
        
        let successCount = 0;
        let errorCount = 0;

        if (withId.length > 0) {
          // Extract basic ingredient data for upsert
          const ingredientsToUpsert = withId.map(({ conversionUnits, ...rest }) => rest);
          
          const { error } = await supabase
            .from('ingredients')
            .upsert(ingredientsToUpsert)
            .select();

          if (error) {
            errorCount += withId.length;
            console.error('Import error:', error);
          } else {
            successCount += withId.length;
            
            // Handle conversion units
            const ingIds = withId.map(i => i.id);
            // Delete old units first
            await supabase.from('ingredient_units').delete().in('ingredient_id', ingIds);
            
            const allConvInserts: any[] = [];
            withId.forEach(ing => {
              if (ing.conversionUnits && ing.conversionUnits.length > 0) {
                ing.conversionUnits.forEach((cu: any) => {
                  allConvInserts.push({
                    ingredient_id: ing.id,
                    unit_name: cu.unit_name,
                    conversion_factor: cu.conversion_factor
                  });
                });
              }
            });

            if (allConvInserts.length > 0) {
              await supabase.from('ingredient_units').insert(allConvInserts);
            }
          }
        }

        const skippedCount = inserts.length - withId.length;

        if (successCount > 0) {
          alert(`Đã import thành công ${successCount} nguyên liệu!${errorCount > 0 ? `\n${errorCount} dòng bị lỗi.` : ''}${skippedCount > 0 ? `\n${skippedCount} dòng bị bỏ qua do thiếu mã.` : ''}`);
        } else {
          alert('Import thất bại! Vui lòng kiểm tra lại mã nguyên liệu hoặc định dạng file.');
        }

        fetchData();
      } catch (err) {
        alert('Có lỗi xảy ra khi đọc file Excel!');
        console.error(err);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const addConversionUnit = () => {
    setConversionUnits([...conversionUnits, { unit_name: '', conversion_factor: 1 }]);
  };

  const removeConversionUnit = (index: number) => {
    setConversionUnits(conversionUnits.filter((_, i) => i !== index));
  };

  const updateConversionUnit = (index: number, field: 'unit_name' | 'conversion_factor', value: string | number) => {
    const newUnits = [...conversionUnits];
    newUnits[index] = { ...newUnits[index], [field]: value };
    setConversionUnits(newUnits);
  };

  return (
    <div className="py-2">
      {/* Filters & Actions */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-lg-7">
          <div className="row g-2">
            <div className="col-12 col-md-6">
              <div className="input-group shadow-sm">
                <span className="input-group-text bg-white border-end-0">
                  <Search size={18} className="text-muted" />
                </span>
                <input
                  type="text"
                  placeholder="Tìm kiếm nguyên liệu..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="form-control border-start-0 ps-0"
                />
              </div>
            </div>
            <div className="col-6 col-md-3">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="form-select shadow-sm h-100"
              >
                <option value="">Tất cả danh mục</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-3">
              <select
                value={filterOrderType}
                onChange={(e) => setFilterOrderType(e.target.value)}
                className="form-select shadow-sm h-100"
              >
                <option value="">Tất cả loại đơn</option>
                {orderTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-5 d-flex gap-2">
          <input
            type="file"
            accept=".xlsx, .xls"
            className="d-none"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-outline-success flex-grow-1 d-flex align-items-center justify-content-center gap-2 rounded-3 shadow-sm"
          >
            <Upload size={18} /> <span className="d-none d-sm-inline">Import Excel</span>
          </button>
          <button
            onClick={() => openModal()}
            className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2 rounded-3 shadow-sm fw-bold"
          >
            <Plus size={18} /> <span>Thêm Mới</span>
          </button>
        </div>
      </div>

      {/* Database Table */}
      <div className="table-responsive rounded-4 border shadow-sm overflow-hidden">
        <table className="table table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
          <thead className="table-light">
            <tr>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Mã NL</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Tên Nguyên Liệu</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Danh Mục</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary d-none d-md-table-cell">Loại Đơn</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Tồn Hiện Tại</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end d-none d-md-table-cell">Tối Thiểu</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-center">ĐVT</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Thao tác</th>
            </tr>
          </thead>
          <tbody className="border-top-0 bg-white">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-5 text-center text-muted">Đang tải...</td></tr>
            ) : ingredients.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-5 text-center text-muted">Không tìm thấy dữ liệu</td></tr>
            ) : (
              ingredients.map((ing) => (
                <tr key={ing.id}>
                  <td className="px-4 py-3 font-monospace text-muted">{ing.id}</td>
                  <td className="px-4 py-3 fw-bold text-dark">{ing.name}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-light text-dark border fw-normal">{ing.ingredient_categories?.name || '-'}</span>
                  </td>
                  <td className="px-4 py-3 d-none d-md-table-cell">
                    <span className="small text-muted">{ing.ingredient_order_types?.name || '-'}</span>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <span className={`fw-black ${ (stocks[ing.id] ?? 0) <= (ing.min_stock || 0) ? 'text-danger' : 'text-primary' }`}>
                      {stocks[ing.id] ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end text-muted d-none d-md-table-cell">{ing.min_stock}</td>
                  <td className="px-4 py-3 text-center small text-secondary">{ing.unit}</td>
                  <td className="px-4 py-3">
                    <div className="d-flex justify-content-end gap-2 text-end">
                      <button onClick={() => openModal(ing)} className="btn btn-sm btn-outline-primary border-0 rounded-circle p-2 hover-shadow">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(ing.id)} className="btn btn-sm btn-outline-danger border-0 rounded-circle p-2 hover-shadow">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Sửa Nguyên Liệu' : 'Thêm Nguyên Liệu'}>
        <form onSubmit={handleSubmit} className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label small fw-bold text-muted">Mã Nguyên Liệu (*)</label>
            <input 
              required type="text" 
              value={formData.id} 
              onChange={e => setFormData({ ...formData, id: e.target.value })} 
              disabled={!!editingId} 
              className="form-control" 
            />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-bold text-muted">Tên Nguyên Liệu (*)</label>
            <input 
              required type="text" 
              value={formData.name} 
              onChange={e => setFormData({ ...formData, name: e.target.value })} 
              className="form-control" 
            />
          </div>
          <div className="col-12">
            <label className="form-label small fw-bold text-muted">Danh Mục</label>
            <select 
              value={formData.category_id} 
              onChange={e => setFormData({ ...formData, category_id: e.target.value })} 
              className="form-select"
            >
              <option value="">-- Chọn --</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label small fw-bold text-muted">Đơn Vị Nhỏ Nhất (*)</label>
            <input 
              required type="text" 
              placeholder="vào/gram..." 
              value={formData.unit} 
              onChange={e => setFormData({ ...formData, unit: e.target.value })} 
              className="form-control" 
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label small fw-bold text-muted">Tồn Tối Thiểu</label>
            <input 
              required type="number" 
              step="0.000001" 
              value={formData.min_stock} 
              onChange={e => setFormData({ ...formData, min_stock: parseFloat(e.target.value) || 0 })} 
              className="form-control text-end" 
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label small fw-bold text-muted">Loại Đơn Hàng</label>
            <select 
              value={formData.order_type_id} 
              onChange={e => setFormData({ ...formData, order_type_id: e.target.value })} 
              className="form-select"
            >
              <option value="">-- Chọn --</option>
              {orderTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="col-12 mt-4 pt-3 border-top">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <label className="small fw-black text-primary text-uppercase tracking-widest">Đơn vị quy đổi</label>
              <button 
                type="button" 
                onClick={addConversionUnit} 
                className="btn btn-sm btn-outline-primary rounded-pill px-3"
              >
                + Thêm quy cách
              </button>
            </div>
            
            <div className="row g-2">
              {conversionUnits.map((u, index) => (
                <div key={index} className="col-12">
                  <div className="card bg-light border-0 rounded-3 p-2">
                    <div className="row g-2 align-items-end">
                      <div className="col">
                        <label className="form-label mb-1" style={{ fontSize: '10px' }}>TÊN ĐƠN VỊ</label>
                        <input 
                          type="text" 
                          placeholder="Thùng, Dây..." 
                          value={u.unit_name} 
                          onChange={e => updateConversionUnit(index, 'unit_name', e.target.value)} 
                          className="form-control form-control-sm" 
                        />
                      </div>
                      <div className="col-4 col-md-3">
                        <label className="form-label mb-1" style={{ fontSize: '10px' }}>HỆ SỐ</label>
                        <input 
                          type="number" 
                          step="0.000001" 
                          value={u.conversion_factor} 
                          onChange={e => updateConversionUnit(index, 'conversion_factor', parseFloat(e.target.value) || 0)} 
                          className="form-control form-control-sm text-end fw-bold" 
                        />
                      </div>
                      <div className="col-auto">
                        <button 
                          type="button" 
                          onClick={() => removeConversionUnit(index)} 
                          className="btn btn-sm btn-outline-danger border-0 p-2"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="col-12 mt-1">
                        <span className="text-muted" style={{ fontSize: '11px' }}>
                          = <strong>{u.conversion_factor}</strong> {formData.unit || '?'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {conversionUnits.length === 0 && (
              <p className="small text-muted text-center py-2 opacity-50"><em>Chưa có quy cách quy đổi.</em></p>
            )}
          </div>

          <div className="col-12 d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
            <button 
              type="button" 
              onClick={() => setIsModalOpen(false)} 
              className="btn btn-light rounded-pill px-4 fw-bold"
            >
              Hủy
            </button>
            <button 
              type="submit" 
              className="btn btn-primary rounded-pill px-4 fw-bold shadow-sm"
            >
              Lưu Thay Đổi
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};