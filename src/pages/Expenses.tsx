import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { Modal } from '../components/ui/Modal';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface Expense {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  category: string;
  created_at: string;
}

export default function Expenses() {
  const { user, role } = useAuth();
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(today);

  // Form
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Khác');
  const [date, setDate] = useState(today);

  const fetchExpenses = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('expenses' as any)
      .select('*')
      .eq('expense_date', selectedDate)
      .order('created_at', { ascending: false });
    if (data) setExpenses(data as any[]);
    setLoading(false);
  };

  useEffect(() => { fetchExpenses(); }, [selectedDate]);

  if (role !== 'master') {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !amount) {
      toast.error('Vui lòng nhập đủ thông tin!');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('expenses' as any).insert({
      description: desc,
      amount: parseFloat(amount),
      expense_date: date,
      category,
      created_by: user?.id
    });

    if (!error) {
      setIsModalOpen(false);
      setDesc('');
      setAmount('');
      setCategory('Khác');
      fetchExpenses();
    } else {
      toast.error('Lỗi: ' + error.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa phiếu chi này?')) return;
    const { error } = await supabase.from('expenses' as any).delete().eq('id', id);
    if (!error) fetchExpenses();
  };

  const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="container-fluid py-3 py-md-4">
      <div className="row align-items-center mb-4 g-3">
        <div className="col-12 col-md-auto me-auto">
          <h1 className="display-6 fw-black text-dark mb-1">QUẢN LÝ THU CHI</h1>
          <p className="text-secondary fw-medium mb-0">Ghi chép các khoản chi phí vận hành cửa hàng.</p>
        </div>
        <div className="col-12 col-md-auto">
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn btn-danger btn-lg w-100 px-4 py-2 rounded-3 shadow-sm d-flex align-items-center justify-content-center gap-2"
            style={{ fontWeight: 900 }}
          >
            <Plus size={20} /> Tạo Phiếu Chi
          </button>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-12 col-md-auto">
          <div className="card border-0 shadow-sm rounded-3 overflow-hidden">
            <div className="card-body p-2 bg-light d-flex align-items-center gap-2">
               <button onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))} className="btn btn-sm btn-white bg-white border shadow-sm"><ChevronLeft size={18} /></button>
               <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="form-control form-control-sm border-0 bg-transparent fw-bold" style={{ width: '130px' }} />
               <button onClick={() => {
                 const next = format(new Date(new Date(selectedDate).getTime() + 86400000), 'yyyy-MM-dd');
                 if (next <= today) setSelectedDate(next);
               }} disabled={selectedDate >= today} className="btn btn-sm btn-white bg-white border shadow-sm disabled:opacity-50"><ChevronRight size={18} /></button>
            </div>
          </div>
        </div>
        <div className="col-12 col-md me-md-auto"></div>
        <div className="col-12 col-md-auto">
          <div className="card border-0 shadow-sm rounded-3 bg-danger-subtle border-start border-danger border-4">
             <div className="card-body py-2 px-3 d-flex align-items-center gap-3">
                <span className="text-xs fw-bold text-danger text-uppercase tracking-wider">TỔNG CHI NGÀY:</span>
                <span className="h4 mb-0 fw-black text-danger">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}</span>
             </div>
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm rounded-3 overflow-hidden">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th className="px-3 py-3 text-secondary text-uppercase small fw-black tracking-widest border-0">Nội dung chi</th>
                <th className="px-3 py-3 text-secondary text-uppercase small fw-black tracking-widest border-0">Hạng mục</th>
                <th className="px-3 py-3 text-secondary text-uppercase small fw-black tracking-widest border-0 text-end">Số tiền</th>
                <th className="px-3 py-3 text-secondary text-uppercase small fw-black tracking-widest border-0 text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody className="border-top-0">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-5 text-center text-muted fst-italic">Đang tải dữ liệu...</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-5 text-center text-muted fst-italic">Không có khoản chi nào trong ngày này.</td></tr>
              ) : (
                expenses.map(e => (
                  <tr key={e.id}>
                    <td className="px-3 py-3">
                      <div className="d-flex align-items-center gap-3">
                         <div className="bg-light p-2 rounded-circle text-muted"><FileText size={18} /></div>
                         <span className="fw-bold text-dark">{e.description}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                       <span className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle fw-bold">
                          {e.category}
                       </span>
                    </td>
                    <td className="px-3 py-3 text-end fw-black text-danger">
                      {new Intl.NumberFormat('vi-VN').format(e.amount)}
                    </td>
                    <td className="px-3 py-3 text-end">
                      <button onClick={() => handleDelete(e.id)} className="btn btn-sm btn-outline-danger border-0">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Tạo Phiếu Chi Mới">
        <form onSubmit={handleSubmit} className="row g-3">
          <div className="col-12">
            <label className="form-label text-uppercase small fw-bold text-muted">Nội dung chi</label>
            <input type="text" value={desc} onChange={e => setDesc(e.target.value)} className="form-control form-control-lg border-2" placeholder="Nhập lý do chi..." />
          </div>
          <div className="col-md-6">
            <label className="form-label text-uppercase small fw-bold text-muted">Số tiền (VND)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="form-control form-control-lg border-2 fw-black text-danger" placeholder="0" />
          </div>
          <div className="col-md-6">
            <label className="form-label text-uppercase small fw-bold text-muted">Hạng mục</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="form-select form-select-lg border-2">
              <option value="Nguyên liệu">Nguyên liệu</option>
              <option value="Tiền điện/nước">Tiền điện/nước</option>
              <option value="Lương nhân viên">Lương nhân viên</option>
              <option value="Mặt bằng">Mặt bằng</option>
              <option value="Marketing">Marketing</option>
              <option value="Sửa chữa">Sửa chữa</option>
              <option value="Khác">Khác</option>
            </select>
          </div>
          <div className="col-12">
            <label className="form-label text-uppercase small fw-bold text-muted">Ngày chi</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-control form-control-lg border-2 fw-bold" />
          </div>
          <div className="col-12 d-flex justify-content-end gap-2 pt-3">
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-link text-decoration-none text-muted fw-bold">Hủy</button>
            <button type="submit" disabled={saving} className="btn btn-danger btn-lg px-5 rounded-3 fw-bold shadow-sm">
              {saving ? 'Đang lưu...' : 'LƯU PHIẾU CHI'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
