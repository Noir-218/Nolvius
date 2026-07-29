import React, { useState, useEffect } from 'react';
import { useFacility } from '../../contexts/FacilityContext';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { Modal } from '../ui/Modal';
import type { Database } from '../../types/database.types';
import { usePermissions } from '../../hooks/usePermissions';

type Category = Database['public']['Tables']['product_categories']['Row'];

export const CategoriesTab = () => {
  const { facilityClient: supabase } = useFacility();
  const { canEdit } = usePermissions('products');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  const fetchCategories = async () => {
    setLoading(true);
    let query = supabase.from('product_categories').select('*').order('created_at', { ascending: false });
    if (search) query = query.ilike('name', `%${search}%`);
    const { data } = await query;
    if (data) setCategories(data);
    setLoading(false);
  };

  useEffect(() => { fetchCategories(); }, [search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await supabase.from('product_categories').update(formData).eq('id', editingId);
    } else {
      await supabase.from('product_categories').insert([formData]);
    }
    setIsModalOpen(false);
    fetchCategories();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa danh mục này?')) {
      await supabase.from('product_categories').delete().eq('id', id);
      fetchCategories();
    }
  };

  const openModal = (cat?: Category) => {
    if (cat) {
      setEditingId(cat.id);
      setFormData({ name: cat.name, description: cat.description || '' });
    } else {
      setEditingId(null);
      setFormData({ name: '', description: '' });
    }
    setIsModalOpen(true);
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
                type="text"
                placeholder="Tìm kiếm danh mục..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-control"
              />
            </div>
          </div>
          <div className="col-12 col-md-auto ms-auto text-end">
            {canEdit && (
              <button 
                onClick={() => openModal()} 
                className="btn btn-primary d-flex align-items-center gap-2 rounded-3 fw-semibold shadow-sm w-100 w-md-auto justify-content-center"
              >
                <Plus size={16} /> <span>Thêm Danh Mục</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table-responsive rounded-4 border shadow-sm">
        <table className="table table-hover align-middle mb-0" style={{ fontSize: '14px' }}>
          <thead className="table-light">
            <tr>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Tên Danh Mục</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Mô tả</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Thao tác</th>
            </tr>
          </thead>
          <tbody className="bg-white border-top-0">
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-5 text-center text-muted">Đang tải...</td></tr>
            ) : categories.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-5 text-center text-muted italic">Chưa có danh mục nào.</td></tr>
            ) : (
              categories.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 fw-black text-primary text-uppercase">{c.name}</td>
                  <td className="px-4 py-3 text-secondary small italic">{c.description || '-'}</td>
                  <td className="px-4 py-3 text-end">
                    <div className="d-flex justify-content-end gap-1">
                      {canEdit && (
                        <>
                          <button onClick={() => openModal(c)} className="btn btn-sm btn-outline-primary border-0 rounded-circle p-2 hover-shadow">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(c.id)} className="btn btn-sm btn-outline-danger border-0 rounded-circle p-2 hover-shadow">
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

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Sửa Danh Mục' : 'Thêm Danh Mục'} size="md">
        <form onSubmit={handleSubmit} className="row g-3">
          <div className="col-12">
            <label className="form-label small fw-bold text-muted">Tên Danh Mục (*)</label>
            <input 
              required type="text" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
              className="form-control fw-bold border-primary-subtle" 
              placeholder="VD: Cà phê, Trà sữa..."
            />
          </div>
          <div className="col-12">
            <label className="form-label small fw-bold text-muted">Mô Tả</label>
            <textarea 
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})} 
              rows={3} 
              className="form-control" 
              placeholder="Mô tả ngắn gọn về danh mục này..."
            />
          </div>
          <div className="col-12 d-flex justify-content-end gap-2 mt-4 pt-4 border-top">
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-light rounded-pill px-4 fw-bold">Hủy</button>
            <button type="submit" className="btn btn-primary rounded-pill px-5 fw-black shadow-sm">
              LƯU DANH MỤC
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
