import React, { useState, useEffect } from 'react';
import { useFacility } from '../../contexts/FacilityContext';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { usePermissions } from '../../hooks/usePermissions';

interface OrderType {
  id: string;
  name: string;
  description: string | null;
  created_at: string | null;
}

export const OrderTypesTab = () => {
  const { facilityClient: supabase } = useFacility();
  const { canEdit } = usePermissions('ingredients');
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({ name: '', description: '' });

  const fetchOrderTypes = async () => {
    setLoading(true);
    let query = supabase.from('ingredient_order_types' as any).select('*').order('created_at', { ascending: false });
    
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    
    const { data } = await query;
    if (data) setOrderTypes(data as unknown as OrderType[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrderTypes();
  }, [search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await supabase.from('ingredient_order_types' as any).update(formData).eq('id', editingId);
      } else {
        await supabase.from('ingredient_order_types' as any).insert([formData]);
      }
      setIsModalOpen(false);
      fetchOrderTypes();
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa loại đơn hàng này?')) {
      await supabase.from('ingredient_order_types' as any).delete().eq('id', id);
      fetchOrderTypes();
    }
  };

  const openModal = (type?: OrderType) => {
    if (type) {
      setEditingId(type.id);
      setFormData({ name: type.name, description: type.description || '' });
    } else {
      setEditingId(null);
      setFormData({ name: '', description: '' });
    }
    setIsModalOpen(true);
  };

  return (
    <div className="py-2">
      <div className="row g-3 mb-4">
        <div className="col-12 col-md-auto me-auto">
          <div className="input-group shadow-sm" style={{ maxWidth: '300px' }}>
            <span className="input-group-text bg-white border-end-0">
              <Search size={18} className="text-muted" />
            </span>
            <input
              type="text"
              placeholder="Tìm kiếm loại đơn hàng..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-control border-start-0 ps-0"
            />
          </div>
        </div>
        <div className="col-12 col-md-auto">
          {canEdit && (
            <button
              onClick={() => openModal()}
              className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2 rounded-3 shadow-sm fw-bold px-4"
            >
              <Plus size={18} /> <span>Thêm Loại Đơn</span>
            </button>
          )}
        </div>
      </div>

      <div className="table-responsive rounded-4 border shadow-sm overflow-hidden">
        <table className="table table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
          <thead className="table-light">
            <tr>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Tên Loại Đơn</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Mô tả</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Thao tác</th>
            </tr>
          </thead>
          <tbody className="border-top-0 bg-white">
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-5 text-center text-muted">Đang tải...</td></tr>
            ) : orderTypes.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-5 text-center text-muted">Không tìm thấy dữ liệu</td></tr>
            ) : (
              orderTypes.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 fw-bold text-dark">{t.name}</td>
                  <td className="px-4 py-3 text-muted small">{t.description || '-'}</td>
                  <td className="px-4 py-3 text-end">
                    <div className="d-flex justify-content-end gap-2">
                      {canEdit && (
                        <>
                          <button onClick={() => openModal(t)} className="btn btn-sm btn-outline-primary border-0 rounded-circle p-2 hover-shadow">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(t.id)} className="btn btn-sm btn-outline-danger border-0 rounded-circle p-2 hover-shadow">
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

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Sửa Loại Đơn Hàng' : 'Thêm Loại Đơn Hàng'}>
        <form onSubmit={handleSubmit} className="row g-3">
          <div className="col-12">
            <label className="form-label small fw-bold text-muted">Tên Loại Đơn (*)</label>
            <input 
              required type="text" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
              className="form-control" 
            />
          </div>
          <div className="col-12">
            <label className="form-label small fw-bold text-muted">Mô Tả</label>
            <textarea 
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})} 
              rows={3} 
              className="form-control" 
            />
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
