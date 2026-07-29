import React, { useState, useEffect } from 'react';
import { useFacility } from '../../contexts/FacilityContext';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { Modal } from '../ui/Modal';
import type { Database } from '../../types/database.types';
import { usePermissions } from '../../hooks/usePermissions';

type Supplier = Database['public']['Tables']['suppliers']['Row'];

export const SuppliersTab = () => {
  const { facilityClient: supabase } = useFacility();
  const { canEdit } = usePermissions('ingredients');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '', contact_person: '', phone: '', email: '', address: '', notes: ''
  });

  const fetchSuppliers = async () => {
    setLoading(true);
    let query = supabase.from('suppliers').select('*').order('created_at', { ascending: false });
    
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    
    const { data } = await query;
    if (data) setSuppliers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchSuppliers();
  }, [search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await supabase.from('suppliers').update(formData).eq('id', editingId);
    } else {
      await supabase.from('suppliers').insert([formData]);
    }
    setIsModalOpen(false);
    fetchSuppliers();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa nhà cung cấp này?')) {
      await supabase.from('suppliers').delete().eq('id', id);
      fetchSuppliers();
    }
  };

  const openModal = (supplier?: Supplier) => {
    if (supplier) {
      setEditingId(supplier.id);
      setFormData({
        name: supplier.name,
        contact_person: supplier.contact_person || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        address: supplier.address || '',
        notes: supplier.notes || ''
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', contact_person: '', phone: '', email: '', address: '', notes: '' });
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
              placeholder="Tìm kiếm nhà cung cấp..."
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
              <Plus size={18} /> <span>Thêm Nhà Cung Cấp</span>
            </button>
          )}
        </div>
      </div>

      <div className="table-responsive rounded-4 border shadow-sm overflow-hidden">
        <table className="table table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
          <thead className="table-light">
            <tr>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Tên NCC</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Liên hệ</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Điện thoại</th>
              <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Thao tác</th>
            </tr>
          </thead>
          <tbody className="border-top-0 bg-white">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-5 text-center text-muted">Đang tải...</td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-5 text-center text-muted">Không tìm thấy dữ liệu</td></tr>
            ) : (
              suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 fw-bold text-dark">{s.name}</td>
                  <td className="px-4 py-3 text-muted">{s.contact_person || '-'}</td>
                  <td className="px-4 py-3 text-secondary font-monospace">{s.phone || '-'}</td>
                  <td className="px-4 py-3 text-end">
                    <div className="d-flex justify-content-end gap-2">
                      {canEdit && (
                        <>
                          <button onClick={() => openModal(s)} className="btn btn-sm btn-outline-primary border-0 rounded-circle p-2 hover-shadow">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(s.id)} className="btn btn-sm btn-outline-danger border-0 rounded-circle p-2 hover-shadow">
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

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Sửa Nhà Cung Cấp' : 'Thêm Nhà Cung Cấp'}>
        <form onSubmit={handleSubmit} className="row g-3">
          <div className="col-12">
            <label className="form-label small fw-bold text-muted">Tên Nhà Cung Cấp (*)</label>
            <input 
              required type="text" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
              className="form-control" 
            />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-bold text-muted">Người Liên Hệ</label>
            <input 
              type="text" 
              value={formData.contact_person} 
              onChange={e => setFormData({...formData, contact_person: e.target.value})} 
              className="form-control" 
            />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-bold text-muted">Điện Thoại</label>
            <input 
              type="text" 
              value={formData.phone} 
              onChange={e => setFormData({...formData, phone: e.target.value})} 
              className="form-control" 
            />
          </div>
          <div className="col-12">
            <label className="form-label small fw-bold text-muted">Địa Chỉ</label>
            <input 
              type="text" 
              value={formData.address} 
              onChange={e => setFormData({...formData, address: e.target.value})} 
              className="form-control" 
            />
          </div>
          <div className="col-12">
            <label className="form-label small fw-bold text-muted">Ghi chú</label>
            <textarea 
              value={formData.notes} 
              onChange={e => setFormData({...formData, notes: e.target.value})} 
              rows={2} 
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
