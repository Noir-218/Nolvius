import React, { useState, useEffect, useRef } from 'react';
import { useFacility } from '../../contexts/FacilityContext';
import { Plus, Edit2, Trash2, Search, Upload } from 'lucide-react';
import { Modal } from '../ui/Modal';
import * as xlsx from 'xlsx';
import type { Database } from '../../types/database.types';
import { usePermissions } from '../../hooks/usePermissions';

type Product = Database['public']['Tables']['products']['Row'] & {
  product_categories: { name: string } | null;
  unit: string | null;
};

const unsignedString = (str: string) => {
  return str
    .normalize('NFC')
    .toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[\u0300\u0301\u0309\u0303\u0327\u0309\u0323]/g, '');
};

export const ProductsTab = () => {
  const { facilityClient: supabase } = useFacility();
  const { canEdit } = usePermissions('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    id: '', name: '', category_id: '', price: 0, is_active: true, unit: ''
  });

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch categories
    const catsRes = await supabase.from('product_categories').select('id, name');
    if (catsRes.data) setCategories(catsRes.data);

    // Fetch products
    let query = supabase.from('products')
      .select(`*, product_categories(name)`)
      .order('created_at', { ascending: false });
    
    if (filterCategory) query = query.eq('category_id', filterCategory);
    
    const { data } = await query;
    if (data) {
      if (search) {
        const filtered = (data as any[]).filter(p => 
          unsignedString(p.name).includes(unsignedString(search))
        );
        setProducts(filtered);
      } else {
        setProducts(data as any);
      }
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [search, filterCategory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      category_id: formData.category_id || null,
    };

    if (editingId) {
      await supabase.from('products').update(payload).eq('id', editingId);
    } else {
      await supabase.from('products').insert([payload]);
    }
    setIsModalOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa sản phẩm này? Công thức liên quan cũng sẽ bị xóa.')) {
      await supabase.from('products').delete().eq('id', id);
      fetchData();
    }
  };

  const openModal = (prod?: Product) => {
    if (prod) {
      setEditingId(prod.id);
      setFormData({
        id: prod.id,
        name: prod.name,
        category_id: prod.category_id || '',
        price: prod.price || 0,
        is_active: prod.is_active ?? true,
        unit: prod.unit || ''
      });
    } else {
      setEditingId(null);
      setFormData({ id: '', name: '', category_id: '', price: 0, is_active: true, unit: '' });
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

        // Clean values helper
        const clean = (val: any) =>
          String(val ?? '').replace(/[\u200b\u200c\u200d\uFEFF\u00A0]/g, '').trim();

        // Find header row
        const headerRowIndex = rawRows.findIndex(row =>
          row.some(cell => ['mã sản phẩm', 'tên sản phẩm', 'mã sp', 'tên sp'].includes(clean(cell).toLowerCase()))
        );

        if (headerRowIndex === -1) {
          alert('Không tìm thấy dòng tiêu đề hợp lệ. File cần có các cột: Mã Sản Phẩm | Tên Sản Phẩm');
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        const headerRow = rawRows[headerRowIndex].map(c => clean(c).toLowerCase());
        const dataRows = rawRows.slice(headerRowIndex + 1);

        const colId = headerRow.findIndex(h => ['mã sản phẩm', 'mã sp', 'mã', 'id', 'code'].includes(h));
        const colName = headerRow.findIndex(h => ['tên sản phẩm', 'tên sp', 'tên', 'name', 'sản phẩm'].includes(h));
        const colPrice = headerRow.findIndex(h => ['giá bán', 'giá', 'price'].includes(h));
        const colCategory = headerRow.findIndex(h => ['danh mục', 'loại', 'category'].includes(h));
        const colStatus = headerRow.findIndex(h => ['trạng thái', 'status'].includes(h));

        if (colId === -1 || colName === -1) {
          alert('Thiếu cột Mã Sản Phẩm hoặc Tên Sản Phẩm trong file!');
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        const inserts = dataRows
          .map(row => {
            return {
              id: clean(row[colId]),
              name: clean(row[colName]),
              price: colPrice >= 0 ? parseInt(clean(row[colPrice])) || 0 : 0,
              category_id: null as string | null, // Will map later
              _temp_category_name: colCategory >= 0 ? clean(row[colCategory]) : '',
              is_active: colStatus >= 0 ? clean(row[colStatus]) !== 'Ngừng Bán' : true
            };
          })
          .filter(r => r.id && r.name);

        if (inserts.length === 0) {
          alert('Không có dữ liệu hợp lệ để import (kiểm tra lại Mã và Tên sản phẩm).');
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        // Map categories if present
        if (colCategory >= 0) {
          const catNames = Array.from(new Set(inserts.map(i => i._temp_category_name).filter(Boolean)));
          if (catNames.length > 0) {
            // Check existing cats
            const { data: existingCats } = await supabase.from('product_categories').select('id, name');
            const catMap: Record<string, string> = {};
            existingCats?.forEach(c => catMap[c.name.toLowerCase()] = c.id);

            for (const name of catNames) {
              if (!catMap[name.toLowerCase()]) {
                const { data: newCat } = await supabase.from('product_categories').insert({ name }).select().single();
                if (newCat) catMap[name.toLowerCase()] = newCat.id;
              }
            }
            
            inserts.forEach(i => {
              if (i._temp_category_name) {
                i.category_id = catMap[i._temp_category_name.toLowerCase()] || null;
              }
            });
          }
        }

        // Final clean-up of temp fields before upsert
        const finalData = inserts.map(({ _temp_category_name, ...rest }) => rest);

        const { error } = await supabase.from('products').upsert(finalData);

        if (error) {
          alert('Lỗi khi lưu dữ liệu vào database: ' + error.message);
        } else {
          alert(`Đã import thành công ${finalData.length} sản phẩm!`);
          fetchData();
        }
      } catch (err) {
        alert('Có lỗi xảy ra khi đọc file Excel!');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

   return (
    <div>
      {/* Toolbar */}
      <div className="rounded-3 mb-4 p-3" style={{ background: '#F0EDE4', border: '1px solid #DDD9CE' }}>
        <div className="row g-2 align-items-center">
          <div className="col-12 col-md-4">
            <div className="input-group">
              <span className="input-group-text">
                <Search size={16} />
              </span>
              <input
                id="main-search-input"
                type="text"
                placeholder="Tìm kiếm SP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-control"
              />
            </div>
          </div>
          <div className="col-12 col-md-3">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="form-select"
            >
              <option value="">Tất cả danh mục</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-5 d-flex gap-2 justify-content-md-end">
            <input type="file" accept=".xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            {canEdit && (
              <>
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="btn btn-outline-secondary d-flex align-items-center gap-2 rounded-3 fw-semibold flex-grow-1 flex-md-grow-0"
                >
                  <Upload size={16} /> <span>Import</span>
                </button>
                <button 
                  onClick={() => openModal()} 
                  className="btn btn-primary d-flex align-items-center gap-2 rounded-3 fw-semibold shadow-sm flex-grow-1 flex-md-grow-0"
                >
                  <Plus size={16} /> <span>Thêm Mới</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table-responsive rounded-4 border shadow-sm">
        <table className="table table-hover align-middle mb-0" style={{ fontSize: '14px' }}>
          <thead className="table-light">
            <tr>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Mã SP</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Tên SP</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Danh Mục</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">ĐVT</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Giá Bán</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-center">Trạng Thái</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Thao tác</th>
            </tr>
          </thead>
          <tbody className="bg-white border-top-0">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-5 text-center text-muted">Đang tải...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-5 text-center text-muted italic">Không tìm thấy sản phẩm nào.</td></tr>
            ) : (
              products.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 fw-bold text-dark">{p.id}</td>
                  <td className="px-4 py-3 fw-black text-primary">{p.name}</td>
                  <td className="px-4 py-3 text-secondary">{p.product_categories?.name || '-'}</td>
                  <td className="px-4 py-3 text-muted small">{p.unit || '-'}</td>
                  <td className="px-4 py-3 text-end fw-black text-success">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p.price || 0)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`badge rounded-pill fw-black small text-uppercase ${p.is_active ? 'bg-success-subtle text-success border border-success' : 'bg-danger-subtle text-danger border border-danger'}`}>
                      {p.is_active ? 'Đang bán' : 'Ngừng bán'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="d-flex justify-content-end gap-1">
                      {canEdit && (
                        <>
                          <button onClick={() => openModal(p)} className="btn btn-sm btn-outline-primary border-0 rounded-circle p-2 hover-shadow">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(p.id)} className="btn btn-sm btn-outline-danger border-0 rounded-circle p-2 hover-shadow">
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Sửa Sản Phẩm' : 'Thêm Sản Phẩm'} size="md">
        <form onSubmit={handleSubmit} className="row g-3">
          <div className="col-12">
            <label className="form-label small fw-bold text-muted">Mã Sản Phẩm (*)</label>
            <input 
              required type="text" 
              value={formData.id} 
              onChange={e => setFormData({...formData, id: e.target.value})} 
              disabled={!!editingId} 
              className="form-control fw-bold border-primary-subtle" 
              placeholder="VD: TRASUA_01"
            />
          </div>
          <div className="col-12">
            <label className="form-label small fw-bold text-muted">Tên Sản Phẩm (*)</label>
            <input 
              required type="text" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
              className="form-control fw-bold" 
              placeholder="Nhập tên đồ uống / sản phẩm..."
            />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-bold text-muted">Danh Mục</label>
            <select 
              value={formData.category_id} 
              onChange={e => setFormData({...formData, category_id: e.target.value})} 
              className="form-select"
            >
              <option value="">-- Chọn danh mục --</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-bold text-muted">Đơn Vị Tính</label>
            <input 
              type="text" 
              value={formData.unit} 
              onChange={e => setFormData({...formData, unit: e.target.value})} 
              className="form-control" 
              placeholder="VD: Ly, Cái, Chai..."
            />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-bold text-muted">Giá Bán (VNĐ)</label>
            <input 
              required type="number" 
              value={formData.price} 
              onChange={e => setFormData({...formData, price: parseInt(e.target.value)})} 
              className="form-control text-end fw-black text-success"
              placeholder="0"
            />
          </div>
          <div className="col-12">
            <div className={`card p-3 border-0 rounded-3 ${formData.is_active ? 'bg-success-subtle border-success border text-success' : 'bg-danger-subtle border-danger border text-danger'}`}>
              <div className="form-check form-switch d-flex align-items-center gap-3">
                <input 
                  className="form-check-input" 
                  type="checkbox" 
                  role="switch" 
                  id="isActiveSwitch"
                  checked={formData.is_active} 
                  onChange={e => setFormData({...formData, is_active: e.target.checked})} 
                  style={{ width: '45px', height: '22px' }}
                />
                <label className="form-check-label fw-black text-uppercase tracking-widest small mb-0" htmlFor="isActiveSwitch">
                  {formData.is_active ? 'ĐANG KINH DOANH' : 'NGỪNG KINH DOANH'}
                </label>
              </div>
            </div>
          </div>
          <div className="col-12 d-flex justify-content-end gap-2 mt-4 pt-4 border-top">
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-light rounded-pill px-4 fw-bold">Hủy</button>
            <button type="submit" className="btn btn-primary rounded-pill px-5 fw-black shadow-sm">
              LƯU THÔNG TIN
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
