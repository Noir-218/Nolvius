import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Search, Trash2, Edit2, X, ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { format, startOfMonth, parseISO } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

const TYPE_LABELS: Record<string, string> = {
  'IN': 'Nhập Hàng',
  'OUT': 'Điều Chuyển Đi',
  'IN_TRANSFER': 'Nhận Điều Chuyển',
  'WASTE': 'Hủy Hàng',
  'SALES_USAGE': 'Tiêu Hao (Bán)',
};


interface Transaction {
  id: string;
  ingredient_id: string;
  type: string;
  quantity: number;
  transaction_date: string;
  supplier_id: string | null;
  branch_id: string | null;
  notes: string | null;
  is_fast_entered: boolean;
  is_approved: boolean;
  is_transfer_exported: boolean;
  reference_id: string | null;
  ingredients: { name: string; unit: string } | null;
  suppliers: { name: string } | null;
  branches: { name: string } | null;
  created_at: string;
}

interface TransactionGroup {
  id: string; // reference_id or first item id
  transaction_date: string;
  type: string;
  is_fast_entered: boolean;
  is_approved: boolean;
  is_transfer_exported: boolean;
  notes: string | null;
  supplier_name: string | null;
  branch_name: string | null;
  items: Transaction[];
}

interface LineItem {
  id: string;
  ingredient_id: string;
  quantity: string;
  unit_name: string; // The name of the selected unit
  searchTerm?: string;
  isDropdownOpen?: boolean;
}

const emptyLine = (): LineItem => ({
  id: crypto.randomUUID(),
  ingredient_id: '',
  quantity: '',
  unit_name: 'base',
  searchTerm: '',
  isDropdownOpen: false,
});

export default function Transactions() {
  const { user, role } = useAuth();
  
  if (role === 'staff') {
    return <Navigate to="/audit" replace />;
  }
  const [activeTab, setActiveTab] = useState<'history' | 'branches'>('history');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [allUnits, setAllUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Filters
  const today = format(new Date(), 'yyyy-MM-dd');
  const [filterDateFrom, setFilterDateFrom] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [filterDateTo, setFilterDateTo] = useState<string>(today);
  const [filterType, setFilterType] = useState<string>('');
  const [filterBranch, setFilterBranch] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // Modal / Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReferenceId, setEditingReferenceId] = useState<string | null>(null);
  const [txType, setTxType] = useState<string>('IN');
  const [txDate, setTxDate] = useState<string>(today);
  const [txSupplier, setTxSupplier] = useState<string>('');
  const [txBranch, setTxBranch] = useState<string>('');
  const [txNotes, setTxNotes] = useState<string>('');
  const [txIsFast, setTxIsFast] = useState<boolean>(false);
  const [txIsApproved, setTxIsApproved] = useState<boolean>(false);
  const [txIsExported, setTxIsExported] = useState<boolean>(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  // Branch Modal / Form
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchNotes, setBranchNotes] = useState('');
  const [savingBranch, setSavingBranch] = useState(false);
  
  // Waste by Product
  const [productList, setProductList] = useState<any[]>([]);
  const [productCategories, setProductCategories] = useState<any[]>([]);
  const [selectedProductCategory, setSelectedProductCategory] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productQty, setProductQty] = useState('');
  const [resolvingRecipe, setResolvingRecipe] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    let query = supabase
      .from('stock_transactions')
      .select('*, ingredients(name, unit), suppliers(name), branches(name)')
      .gte('transaction_date', filterDateFrom)
      .lte('transaction_date', filterDateTo);

    if (filterType) query = query.eq('type', filterType);
    if (filterBranch) query = query.eq('branch_id', filterBranch);
    
    // Status filters
    if (filterStatus === 'FAST') query = query.eq('is_fast_entered', true);
    if (filterStatus === 'NOT_FAST') query = query.eq('is_fast_entered', false);
    if (filterStatus === 'APPROVED') query = query.eq('is_approved', true);
    if (filterStatus === 'NOT_APPROVED') query = query.eq('is_approved', false);
    if (filterStatus === 'EXPORTED') query = query.eq('is_transfer_exported', true);
    if (filterStatus === 'NOT_EXPORTED') query = query.eq('is_transfer_exported', false);

    const { data } = await query.order('transaction_date', { ascending: false }).order('created_at', { ascending: false });
    if (data) {
      setTransactions(data as any[]);
    }

    // Fetch dependencies
    const { data: ingData } = await supabase
      .from('ingredients')
      .select('id, name, unit, category_id, ingredient_categories(id, name)')
      .order('name');
    if (ingData) setIngredients(ingData as any[]);

    const { data: unitsData } = await supabase.from('ingredient_units').select('*');
    if (unitsData) setAllUnits(unitsData);

    const { data: supData } = await supabase.from('suppliers').select('id, name').order('name');
    if (supData) setSuppliers(supData);

    const { data: branchData } = await supabase.from('branches').select('id, name').order('name');
    if (branchData) setBranches(branchData);

    // Fetch products and categories for waste conversion
    const { data: prodData } = await supabase.from('products').select('id, name, category_id, unit').eq('is_active', true).order('name');
    if (prodData) setProductList(prodData);
    
    const { data: pCatData } = await supabase.from('product_categories').select('id, name').order('name');
    if (pCatData) setProductCategories(pCatData);

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filterDateFrom, filterDateTo, filterType, filterBranch, filterStatus]);

  const resetForm = () => {
    setEditingReferenceId(null);
    setTxType('IN');
    setTxDate(today);
    setTxSupplier('');
    setTxBranch('');
    setTxNotes('');
    setTxIsFast(false);
    setTxIsApproved(false);
    setTxIsExported(false);
    setLines([emptyLine()]);
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter(l => l.ingredient_id && l.quantity && parseFloat(l.quantity) > 0);
    if (validLines.length === 0) return alert('Nhập ít nhất 1 dòng hợp lệ!');

    setSaving(true);
    const isNeg = ['OUT', 'WASTE', 'SALES_USAGE'].includes(txType);
    const referenceId = editingReferenceId || crypto.randomUUID();

    try {
      if (editingReferenceId) {
        // Simple approach: Delete old batch and insert new one
        await supabase.from('stock_transactions').delete().eq('reference_id', editingReferenceId);
      }

      const inserts = validLines.map(l => {
        const qty = parseFloat(l.quantity);
        let factor = 1;
        if (l.unit_name !== 'base') {
          const unit = allUnits.find(u => u.ingredient_id === l.ingredient_id && u.unit_name === l.unit_name);
          if (unit) factor = unit.conversion_factor;
        }

        const finalQty = qty * factor;

        return {
          ingredient_id: l.ingredient_id,
          type: txType,
          quantity: isNeg ? -Math.abs(finalQty) : Math.abs(finalQty),
          transaction_date: txDate,
          supplier_id: txType === 'IN' && txSupplier ? txSupplier : null,
          branch_id: (txType === 'IN_TRANSFER' || txType === 'OUT') && txBranch ? txBranch : null,
          notes: txNotes || null,
          is_fast_entered: txIsFast,
          is_approved: txIsApproved,
          is_transfer_exported: txIsExported,
          reference_id: referenceId,
          created_by: user?.id
        };
      });

      const { error } = await supabase.from('stock_transactions').insert(inserts);
      if (error) throw error;

      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
    setSaving(false);
  };

  const handleResolveProductWaste = async () => {
    if (!selectedProductId || !productQty || parseFloat(productQty) <= 0) {
      alert('Vui lòng chọn sản phẩm và nhập số lượng!');
      return;
    }

    setResolvingRecipe(true);
    try {
      // Fetch all recipes to resolve recursively
      const { data: allRecipes, error } = await supabase.from('recipes').select('*');
      if (error) throw error;

      const calcUsages: Record<string, number> = {};
      
      const resolve = (pid: string, qty: number, visited: Set<string> = new Set()) => {
        if (visited.has(pid)) return false;
        visited.add(pid);

        const rows = (allRecipes || []).filter(r => (r as any).product_id === pid);
        if (rows.length === 0) return false;

        rows.forEach(r => {
          const row = r as any;
          if (row.ingredient_id) {
            calcUsages[row.ingredient_id] = (calcUsages[row.ingredient_id] || 0) + (row.quantity * qty);
          } else if (row.sub_product_id) {
            resolve(row.sub_product_id, row.quantity * qty, new Set(visited));
          }
        });
        return true;
      };

      const pQty = parseFloat(productQty);
      const hasRecipe = resolve(selectedProductId, pQty);

      if (!hasRecipe) {
        alert('Sản phẩm này chưa có định mức công thức!');
        return;
      }

      const newLines: LineItem[] = Object.entries(calcUsages).map(([ingId, qty]) => {
        const ing = (ingredients || []).find(i => i.id === ingId);
        return {
          id: crypto.randomUUID(),
          ingredient_id: ingId,
          quantity: qty.toString(),
          unit_name: 'base',
          searchTerm: ing?.name || '',
          isDropdownOpen: false
        };
      });

      // Add to existing lines, filter out empty first line
      setLines(prev => {
        const filtered = prev.filter(l => l.ingredient_id && l.quantity);
        return [...filtered, ...newLines];
      });

      // Clear product selection
      setSelectedProductId('');
      setProductQty('');
      alert(`Đã quy đổi ${newLines.length} nguyên liệu từ các cấp công thức.`);
    } catch (err: any) {
      alert('Lỗi quy đổi công thức: ' + err.message);
    } finally {
      setResolvingRecipe(false);
    }
  };

  const handleDelete = async (group: TransactionGroup) => {
    if (!confirm('Bạn có chắc chắn muốn xóa giao dịch này?')) return;
    
    let query = supabase.from('stock_transactions').delete();
    if (group.id.includes('|')) {
      // It's a generated ID for old data
      const ids = group.items.map(i => i.id);
      query = query.in('id', ids);
    } else {
      query = query.eq('reference_id', group.id);
    }
    
    const { error } = await query;
    if (!error) fetchData();
    else alert('Lỗi xóa!');
  };

  const startEdit = (group: TransactionGroup) => {
    const isLegacy = group.id.includes('|');
    setEditingReferenceId(isLegacy ? null : group.id); 
    setTxType(group.type);
    setTxDate(group.transaction_date || today);
    setTxSupplier(group.items[0]?.supplier_id || '');
    setTxBranch(group.items[0]?.branch_id || '');
    setTxNotes(group.notes || '');
    setTxIsFast(group.is_fast_entered);
    setTxIsApproved(group.is_approved || false);
    setTxIsExported(group.is_transfer_exported || false);
    setLines(group.items.map(item => ({
      id: crypto.randomUUID(),
      ingredient_id: item.ingredient_id,
      quantity: Math.abs(item.quantity).toString(),
      unit_name: 'base', // On edit, we don't know the original unit used, so default to base
      searchTerm: item.ingredients?.name || '',
      isDropdownOpen: false
    })));
    setIsModalOpen(true);
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => 
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const handleCreateOrUpdateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) return alert('Vui lòng nhập tên cơ sở!');
    setSavingBranch(true);
    try {
      if (editingBranch) {
        const { error } = await supabase.from('branches').update({ 
          name: branchName, 
          address: branchAddress, 
          notes: branchNotes,
          updated_at: new Date().toISOString()
        }).eq('id', editingBranch.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('branches').insert({ 
          name: branchName, 
          address: branchAddress, 
          notes: branchNotes 
        });
        if (error) throw error;
      }
      setIsBranchModalOpen(false);
      setEditingBranch(null);
      setBranchName('');
      setBranchAddress('');
      setBranchNotes('');
      fetchData(); // Refresh branch list
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
    setSavingBranch(false);
  };

  const deleteBranch = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa cơ sở này?')) return;
    const { error } = await supabase.from('branches').delete().eq('id', id);
    if (error) {
      alert('Không thể xóa cơ sở này (có thể do đã có giao dịch liên quan).');
    } else {
      fetchData();
    }
  };

  const startEditBranch = (branch: any) => {
    setEditingBranch(branch);
    setBranchName(branch.name);
    setBranchAddress(branch.address || '');
    setBranchNotes(branch.notes || '');
    setIsBranchModalOpen(true);
  };

  // Grouping logic
  const groupedTransactions: TransactionGroup[] = [];
  const groupsByRef: Record<string, TransactionGroup> = {};

  transactions.forEach(tx => {
    // If no reference_id, group by timestamp and type
    const ref = tx.reference_id || `legacy|${tx.transaction_date}|${tx.type}|${tx.notes}|${tx.created_at.substring(0, 16)}`;
    
    if (!groupsByRef[ref]) {
      groupsByRef[ref] = {
        id: tx.reference_id || ref,
        transaction_date: tx.transaction_date,
        type: tx.type,
        is_fast_entered: tx.is_fast_entered || false,
        is_approved: tx.is_approved || false,
        is_transfer_exported: tx.is_transfer_exported || false,
        notes: tx.notes,
        supplier_name: tx.suppliers?.name || null,
        branch_name: tx.branches?.name || null,
        items: []
      };
      groupedTransactions.push(groupsByRef[ref]);
    }
    groupsByRef[ref].items.push(tx);
  });

  const filtered = search
    ? groupedTransactions.filter(g =>
      g.items.some(t => t.ingredients?.name?.toLowerCase().includes(search.toLowerCase())) ||
      g.supplier_name?.toLowerCase().includes(search.toLowerCase()) ||
      g.notes?.toLowerCase()?.includes(search.toLowerCase())
    )
    : groupedTransactions;

  return (
    <div className="container-fluid py-4">
      <div className="row g-3 align-items-center mb-4">
        <div className="col-12 col-md-auto me-auto">
          <h1 className="h3 fw-black text-dark mb-1">GIAO DỊCH KHO</h1>
          <p className="text-secondary small mb-0">Nhập, xuất, hủy và điều chuyển theo phiếu.</p>
        </div>
        <div className="col-12 col-md-auto">
          <button
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2 rounded-3 shadow-sm fw-bold px-4 py-2"
          >
            <Plus size={20} /> <span>Tạo Phiếu Mới</span>
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
        <div className="card-header bg-light p-2 border-0">
          <ul className="nav nav-pills nav-fill bg-light p-0">
            <li className="nav-item">
              <button
                onClick={() => setActiveTab('history')}
                className={`nav-link rounded-pill fw-bold small transition-all py-2 ${activeTab === 'history' ? 'active shadow-sm' : 'text-secondary hover-bg-light'}`}
              >
                Lịch Sử Giao Dịch
              </button>
            </li>
            <li className="nav-item">
              <button
                onClick={() => setActiveTab('branches')}
                className={`nav-link rounded-pill fw-bold small transition-all py-2 ${activeTab === 'branches' ? 'active shadow-sm' : 'text-secondary hover-bg-light'}`}
              >
                Danh Mục Cơ Sở
              </button>
            </li>
          </ul>
        </div>

        <div className="card-body p-3 p-md-4">
          {activeTab === 'history' ? (
            <>
              {/* Filters */}
              <div className="row g-2 mb-4">
                <div className="col-6 col-md-auto">
                  <label className="form-label mb-1 text-uppercase fw-black text-secondary" style={{ fontSize: '10px' }}>Từ ngày</label>
                  <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="form-control form-control-sm shadow-sm" />
                </div>
                <div className="col-6 col-md-auto">
                  <label className="form-label mb-1 text-uppercase fw-black text-secondary" style={{ fontSize: '10px' }}>Đến ngày</label>
                  <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="form-control form-control-sm shadow-sm" />
                </div>
                <div className="col-6 col-md-auto">
                  <label className="form-label mb-1 text-uppercase fw-black text-secondary" style={{ fontSize: '10px' }}>Cơ Sở</label>
                  <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="form-select form-select-sm shadow-sm">
                    <option value="">Tất cả</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="col-6 col-md-auto">
                  <label className="form-label mb-1 text-uppercase fw-black text-secondary" style={{ fontSize: '10px' }}>Loại</label>
                  <select value={filterType} onChange={e => setFilterType(e.target.value)} className="form-select form-select-sm shadow-sm">
                    <option value="">Tất cả</option>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="col-6 col-md-auto">
                  <label className="form-label mb-1 text-uppercase fw-black text-secondary" style={{ fontSize: '10px' }}>Trạng Thái</label>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="form-select form-select-sm shadow-sm">
                    <option value="">Tất cả</option>
                    <optgroup label="Chứng từ FAST">
                      <option value="FAST">Đã nhập FAST</option>
                      <option value="NOT_FAST">Chưa nhập FAST</option>
                    </optgroup>
                    <optgroup label="Phiếu lĩnh (Điều chuyển)">
                      <option value="APPROVED">Đã duyệt</option>
                      <option value="NOT_APPROVED">Chưa duyệt</option>
                      <option value="EXPORTED">Đã làm phiếu xuất</option>
                      <option value="NOT_EXPORTED">Chưa làm phiếu xuất</option>
                    </optgroup>
                  </select>
                </div>
                <div className="col-12 col-md flex-grow-1">
                  <label className="form-label mb-1 text-uppercase fw-black text-secondary" style={{ fontSize: '10px' }}>Tìm nhanh</label>
                  <div className="input-group input-group-sm shadow-sm">
                    <span className="input-group-text bg-white border-end-0 text-muted"><Search size={14} /></span>
                    <input type="text" placeholder="Tìm phiếu, nguyên liệu..." value={search} onChange={e => setSearch(e.target.value)} className="form-control border-start-0 ps-0" />
                  </div>
                </div>
              </div>

              {/* Transaction Table */}
              <div className="table-responsive rounded-4 border shadow-sm">
                <table className="table table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
                  <thead className="table-light">
                    <tr>
                      <th className="px-4 py-3 border-0 text-center" style={{ width: '40px' }}></th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Ngày</th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Loại Phiếu</th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-center">Trạng Thái</th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Ghi Chú</th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="border-top-0 bg-white">
                    {loading ? (
                      <tr><td colSpan={6} className="px-4 py-5 text-center text-muted">Đang tải...</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-5 text-center text-muted italic">Không tìm thấy giao dịch nào.</td></tr>
                    ) : (
                      filtered.map(group => {
                        const isExpanded = expandedGroups.includes(group.id);
                        const typeLabel = TYPE_LABELS[group.type] || group.type;
                        const typeClass = group.type === 'IN' ? 'bg-success' :
                                          group.type === 'OUT' ? 'bg-warning text-dark' :
                                          group.type === 'WASTE' ? 'bg-danger' :
                                          'bg-primary';

                        return (
                          <React.Fragment key={group.id}>
                            <tr className={`border-bottom cursor-pointer ${isExpanded ? 'bg-light bg-opacity-50' : ''}`} onClick={() => toggleGroup(group.id)}>
                              <td className="px-4 py-3 text-center">
                                {isExpanded ? <ChevronDown size={18} className="text-primary" /> : <ChevronRight size={18} className="text-muted opacity-50" />}
                              </td>
                              <td className="px-4 py-3 font-monospace fw-bold text-dark">
                                {group.transaction_date ? format(parseISO(group.transaction_date), 'dd/MM/yyyy') : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`badge ${typeClass} rounded-pill px-3 py-1 fw-black small text-uppercase tracking-wider`}>
                                  {typeLabel}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="d-flex flex-column align-items-center gap-1">
                                  {group.type === 'IN_TRANSFER' ? (
                                    <>
                                      {group.is_fast_entered ? (
                                        <span className="badge bg-success-subtle text-success border border-success fw-black small" style={{ fontSize: '9px' }}>LĨNH: OK</span>
                                      ) : (
                                        <span className="badge bg-danger-subtle text-danger border border-danger fw-black small" style={{ fontSize: '9px' }}>CHƯA LĨNH</span>
                                      )}
                                      {group.is_approved ? (
                                        <span className="badge bg-primary-subtle text-primary border border-primary fw-black small" style={{ fontSize: '9px' }}>ĐÃ DUYỆT</span>
                                      ) : (
                                        <span className="badge bg-secondary-subtle text-secondary border border-secondary fw-black small" style={{ fontSize: '9px' }}>CHƯA DUYỆT</span>
                                      )}
                                    </>
                                  ) : group.type === 'OUT' ? (
                                    <>
                                      {group.is_fast_entered ? (
                                        <span className="badge bg-success-subtle text-success border border-success fw-black small" style={{ fontSize: '9px' }}>NHẬN: OK</span>
                                      ) : (
                                        <span className="badge bg-danger-subtle text-danger border border-danger fw-black small" style={{ fontSize: '9px' }}>CHƯA NHẬN</span>
                                      )}
                                      {group.is_transfer_exported ? (
                                        <span className="badge bg-primary-subtle text-primary border border-primary fw-black small" style={{ fontSize: '9px' }}>ĐÃ XUẤT DC</span>
                                      ) : (
                                        <span className="badge bg-secondary-subtle text-secondary border border-secondary fw-black small" style={{ fontSize: '9px' }}>CHƯA XUẤT</span>
                                      )}
                                    </>
                                  ) : (
                                    group.is_fast_entered ? (
                                      <span className="badge bg-success-subtle text-success border border-success fw-black small" style={{ fontSize: '9px' }}>FAST: OK</span>
                                    ) : (
                                      <span className="badge bg-danger-subtle text-danger border border-danger fw-black small" style={{ fontSize: '9px' }}>PENDING</span>
                                    )
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted small truncate max-w-200">
                                {group.notes || group.supplier_name || group.branch_name || '-'}
                              </td>
                              <td className="px-4 py-3 text-end" onClick={e => e.stopPropagation()}>
                                <div className="d-flex justify-content-end gap-1">
                                  <button onClick={() => toggleGroup(group.id)} className="btn btn-sm btn-outline-secondary border-0 rounded-circle p-2 hover-shadow">
                                    <Eye size={16} />
                                  </button>
                                  <button onClick={() => startEdit(group)} className="btn btn-sm btn-outline-primary border-0 rounded-circle p-2 hover-shadow">
                                    <Edit2 size={16} />
                                  </button>
                                  <button onClick={() => handleDelete(group)} className="btn btn-sm btn-outline-danger border-0 rounded-circle p-2 hover-shadow">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} className="px-5 py-3 bg-light bg-opacity-25 border-bottom">
                                  <div className="card border-0 shadow-sm rounded-3 overflow-hidden">
                                    <table className="table table-sm table-borderless mb-0 bg-transparent" style={{ fontSize: '12px' }}>
                                      <thead>
                                        <tr className="bg-white border-bottom shadow-sm">
                                          <th className="px-4 py-2 small fw-black text-secondary text-uppercase tracking-widest">Nguyên Liệu</th>
                                          <th className="px-4 py-2 small fw-black text-secondary text-uppercase tracking-widest text-end">Số Lượng</th>
                                          <th className="px-4 py-2 small fw-black text-secondary text-uppercase tracking-widest text-center">Đơn Vị</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {group.items.map(item => (
                                          <tr key={item.id}>
                                            <td className="px-4 py-2 fw-bold text-dark">{item.ingredients?.name}</td>
                                            <td className={`px-4 py-2 text-end fw-black ${item.quantity > 0 ? 'text-success' : 'text-danger'}`}>
                                              {item.quantity > 0 ? '+' : ''}{item.quantity}
                                            </td>
                                            <td className="px-4 py-2 text-center text-muted small">{item.ingredients?.unit}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              {/* Branch Tab */}
              <div className="row g-3">
                <div className="col-12">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="mb-0 fw-black text-dark text-uppercase tracking-widest">Quản Lý Cơ Sở</h5>
                    <button
                      onClick={() => { setEditingBranch(null); setBranchName(''); setBranchAddress(''); setBranchNotes(''); setIsBranchModalOpen(true); }}
                      className="btn btn-primary d-flex align-items-center gap-2 rounded-3 shadow-sm fw-bold px-3 btn-sm"
                    >
                      <Plus size={16} /> Thêm Cơ Sở
                    </button>
                  </div>
                  
                  <div className="table-responsive rounded-4 border shadow-sm">
                    <table className="table table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
                      <thead className="table-light">
                        <tr>
                          <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Tên Cơ Sở</th>
                          <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Địa Chỉ</th>
                          <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Ghi Chú</th>
                          <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {branches.length === 0 ? (
                          <tr><td colSpan={4} className="px-4 py-5 text-center text-muted">Chưa có cơ sở nào.</td></tr>
                        ) : (
                          branches.map(b => (
                            <tr key={b.id}>
                              <td className="px-4 py-3 fw-black text-primary uppercase">{b.name}</td>
                              <td className="px-4 py-3 text-muted small">{b.address || '-'}</td>
                              <td className="px-4 py-3 text-muted small italic">{b.notes || '-'}</td>
                              <td className="px-4 py-3 text-end">
                                <div className="d-flex justify-content-end gap-2">
                                  <button onClick={() => startEditBranch(b)} className="btn btn-sm btn-outline-primary border-0 rounded-circle p-2 hover-shadow"><Edit2 size={16} /></button>
                                  <button onClick={() => deleteBranch(b.id)} className="btn btn-sm btn-outline-danger border-0 rounded-circle p-2 hover-shadow"><Trash2 size={16} /></button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Transaction Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingReferenceId ? "Sửa Phiếu Giao Dịch" : "Tạo Phiếu Mới"} size="lg">
        <form onSubmit={handleCreateOrUpdate} className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label small fw-bold text-muted">Loại Giao Dịch</label>
            <select value={txType} onChange={e => setTxType(e.target.value)} className="form-select border-primary-subtle fw-bold">
              <option value="IN">📥 Nhập Hàng</option>
              <option value="IN_TRANSFER">🔀 Nhận Điều Chuyển</option>
              <option value="OUT">📤 Điều Chuyển Đi</option>
              <option value="WASTE">🗑️ Hủy / Hư Hỏng</option>
            </select>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-bold text-muted">Ngày Giao Dịch</label>
            <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className="form-control" />
          </div>

          {txType === 'IN' && (
            <div className="col-12">
              <label className="form-label small fw-bold text-muted">Nhà Cung Cấp</label>
              <select value={txSupplier} onChange={e => setTxSupplier(e.target.value)} className="form-select">
                <option value="">-- Chọn nhà cung cấp --</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {(txType === 'IN_TRANSFER' || txType === 'OUT') && (
            <div className="col-12">
              <label className="form-label small fw-bold text-muted">Cơ Sở (Gửi/Nhận)</label>
              <select value={txBranch} onChange={e => setTxBranch(e.target.value)} className="form-select border-primary-subtle fw-black text-primary">
                <option value="">-- Chọn cơ sở --</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <p className="text-secondary opacity-75 mt-1 small italic" style={{ fontSize: '11px' }}>
                Chọn cơ sở nơi bạn {txType === 'IN_TRANSFER' ? 'nhận hàng về' : 'chuyển hàng đi'}.
              </p>
            </div>
          )}

          {txType === 'WASTE' && (
            <div className="col-12">
              <div className="card p-3 border-0 bg-warning-subtle rounded-4 mb-2">
                <h6 className="fw-black text-warning-emphasis text-uppercase small mb-3">Hủy Theo Sản Phẩm (Quy đổi tự động)</h6>
                <div className="row g-2">
                  <div className="col-12 col-md-4">
                    <label className="form-label small text-muted mb-1">Danh mục SP</label>
                    <select 
                      className="form-select form-select-sm" 
                      value={selectedProductCategory} 
                      onChange={e => setSelectedProductCategory(e.target.value)}
                    >
                      <option value="">Tất cả danh mục</option>
                      {productCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="col-12 col-md-5">
                    <label className="form-label small text-muted mb-1">Chọn sản phẩm cần hủy</label>
                    <select 
                      className="form-select form-select-sm fw-bold" 
                      value={selectedProductId} 
                      onChange={e => setSelectedProductId(e.target.value)}
                    >
                      <option value="">-- Chọn sản phẩm --</option>
                      {productList
                        .filter(p => !selectedProductCategory || p.category_id === selectedProductCategory)
                        .map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit || '-'})</option>)
                      }
                    </select>
                  </div>
                  <div className="col-8 col-md-2">
                    <label className="form-label small text-muted mb-1">Số lượng</label>
                    <input 
                      type="number" 
                      className="form-control form-control-sm text-end fw-bold" 
                      placeholder="0" 
                      value={productQty} 
                      onChange={e => setProductQty(e.target.value)}
                    />
                  </div>
                  <div className="col-4 col-md-1 d-flex align-items-end">
                    <button 
                      type="button" 
                      onClick={handleResolveProductWaste}
                      disabled={resolvingRecipe}
                      className="btn btn-warning btn-sm w-100 fw-bold shadow-sm"
                      title="Quy đổi ra nguyên vật liệu"
                    >
                      {resolvingRecipe ? '...' : 'OK'}
                    </button>
                  </div>
                </div>
                <div className="mt-2 small text-muted italic">
                  * Nhập sản phẩm và nhấn OK để hệ thống tự động tính toán lượng nguyên liệu cần hủy theo công thức.
                </div>
              </div>
            </div>
          )}

          <div className="col-12">
            <div className="row g-2">
              {/* Primary status switch (Repurposed is_fast_entered) */}
              <div className="col-12">
                <div className={`card p-2 p-md-3 border-0 rounded-3 ${txIsFast ? 'bg-success-subtle border-success border text-success' : 'bg-danger-subtle border-danger border text-danger'}`}>
                  <div className="form-check form-switch d-flex align-items-center gap-3">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id="isFastSwitch"
                      checked={txIsFast}
                      onChange={e => setTxIsFast(e.target.checked)}
                      style={{ width: '45px', height: '22px' }}
                    />
                    <label className="form-check-label fw-black text-uppercase tracking-widest small mb-0" htmlFor="isFastSwitch">
                      {txType === 'IN_TRANSFER' 
                        ? (txIsFast ? 'ĐÃ LÀM PHIẾU LĨNH VẬT TƯ' : 'CHƯA LÀM PHIẾU LĨNH VẬT TƯ')
                        : txType === 'OUT'
                        ? (txIsFast ? 'BÊN NHẬN ĐÃ LÀM PHIẾU LĨNH' : 'BÊN NHẬN CHƯA LÀM PHIẾU LĨNH')
                        : (txIsFast ? 'ĐÃ NHẬP PHẦN MỀM FAST' : 'CHƯA NHẬP PHẦN MỀM FAST')
                      }
                    </label>
                  </div>
                </div>
              </div>

              {/* Specific switches for Transfer */}
              {txType === 'IN_TRANSFER' && (
                <div className="col-12">
                  <div className={`card p-2 p-md-3 border-0 rounded-3 ${txIsApproved ? 'bg-primary-subtle border-primary border text-primary' : 'bg-secondary-subtle border-secondary border text-secondary'}`}>
                    <div className="form-check form-switch d-flex align-items-center gap-3">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        role="switch"
                        id="isApprovedSwitch"
                        checked={txIsApproved}
                        onChange={e => setTxIsApproved(e.target.checked)}
                        style={{ width: '45px', height: '22px' }}
                      />
                      <label className="form-check-label fw-black text-uppercase tracking-widest small mb-0" htmlFor="isApprovedSwitch">
                        {txIsApproved ? 'ĐÃ DUYỆT PHIẾU NHẬP ĐIỀU CHUYỂN' : 'CHƯA DUYỆT PHIẾU NHẬP ĐIỀU CHUYỂN'}
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {txType === 'OUT' && (
                <div className="col-12">
                  <div className={`card p-2 p-md-3 border-0 rounded-3 ${txIsExported ? 'bg-primary-subtle border-primary border text-primary' : 'bg-secondary-subtle border-secondary border text-secondary'}`}>
                    <div className="form-check form-switch d-flex align-items-center gap-3">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        role="switch"
                        id="isExportedSwitch"
                        checked={txIsExported}
                        onChange={e => setTxIsExported(e.target.checked)}
                        style={{ width: '45px', height: '22px' }}
                      />
                      <label className="form-check-label fw-black text-uppercase tracking-widest small mb-0" htmlFor="isExportedSwitch">
                        {txIsExported ? 'ĐÀ LÀM PHIẾU XUẤT ĐIỀU CHUYỂN' : 'CHƯA LÀM PHIẾU XUẤT ĐIỀU CHUYỂN'}
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="col-12 pt-3">
            <h6 className="fw-black text-dark text-uppercase tracking-widest small mb-3 border-bottom pb-2">Danh Sách Nguyên Liệu</h6>
            <div className="row g-3">
              {lines.map((line) => {
                const selectedIng = ingredients.find((i: any) => i.id === line.ingredient_id);
                const availableUnits = allUnits.filter(u => u.ingredient_id === line.ingredient_id);

                return (
                  <div key={line.id} className="col-12">
                    <div className="card border-0 bg-light p-3 rounded-4 shadow-sm position-relative shadow-hover-sm transition-all border-hover-primary">
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLines(prev => prev.filter(l => l.id !== line.id))}
                          className="btn btn-link link-danger p-0 position-absolute end-0 top-0 mt-3 me-3 opacity-50 hover-opacity-100"
                        >
                          <X size={18} />
                        </button>
                      )}
                      
                      <div className="row g-2">
                        <div className="col-12 col-md-8 position-relative">
                          <label className="form-label mb-1 text-uppercase fw-bold text-secondary opacity-75" style={{ fontSize: '10px' }}>Tìm Nguyên Liệu</label>
                          <div className="input-group input-group-sm">
                            <span className="input-group-text bg-white border-end-0 text-muted"><Search size={14} /></span>
                            <input
                              type="text"
                              className="form-control border-start-0 ps-0 fw-bold"
                              placeholder="Gõ để tìm nhanh (vd: sữa, cafe...)"
                              value={line.searchTerm || ''}
                              onChange={(e) => {
                                const term = e.target.value;
                                setLines(prev => prev.map(l => 
                                  l.id === line.id ? { ...l, searchTerm: term, isDropdownOpen: true, ingredient_id: term === '' ? '' : l.ingredient_id } : l
                                ));
                              }}
                              onFocus={() => {
                                setLines(prev => prev.map(l => 
                                  l.id === line.id ? { ...l, isDropdownOpen: true } : l
                                ));
                              }}
                              onBlur={() => {
                                setTimeout(() => {
                                  setLines(prev => prev.map(l => 
                                    l.id === line.id ? { ...l, isDropdownOpen: false } : l
                                  ));
                                }, 200);
                              }}
                            />
                          </div>
                          
                          {/* Dropdown Results */}
                          {line.isDropdownOpen && (line.searchTerm || '').length > 0 && (
                            <div className="position-absolute w-100 mt-1 shadow-lg bg-white rounded-3 overflow-hidden border" style={{ zIndex: 1050, left: 0, right: 0 }}>
                              <div className="list-group list-group-flush" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                {ingredients
                                  .filter(i => i.name.toLowerCase().includes((line.searchTerm || '').toLowerCase()))
                                  .map(i => (
                                    <button
                                      key={i.id}
                                      type="button"
                                      className="list-group-item list-group-item-action border-0 py-2 px-3 small d-flex justify-content-between align-items-center"
                                      onClick={() => {
                                        setLines(prev => prev.map(l => 
                                          l.id === line.id ? { ...l, ingredient_id: i.id, searchTerm: i.name, isDropdownOpen: false, unit_name: 'base' } : l
                                        ));
                                      }}
                                    >
                                      <div>
                                        <span className="fw-bold">{i.name}</span>
                                        <div className="text-muted" style={{ fontSize: '10px' }}>{i.ingredient_categories?.name || 'Không có danh mục'}</div>
                                      </div>
                                      <span className="badge bg-light text-secondary rounded-pill">{i.unit}</span>
                                    </button>
                                  ))}
                                {ingredients.filter(i => i.name.toLowerCase().includes((line.searchTerm || '').toLowerCase())).length === 0 && (
                                  <div className="p-3 text-center text-muted small italic">Không tìm thấy kết quả</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="col-4 col-md-2">
                          <label className="form-label mb-1 text-uppercase fw-bold text-secondary opacity-75" style={{ fontSize: '10px' }}>Số Lượng</label>
                          <input
                            type="number" step="0.000001" min="0"
                            className="form-control form-control-sm text-end fw-black text-primary"
                            value={line.quantity}
                            onChange={e => setLines(prev => prev.map(l =>
                              l.id === line.id ? { ...l, quantity: e.target.value } : l
                            ))}
                            placeholder="0"
                          />
                        </div>
                        <div className="col-4 col-md-2">
                          <label className="form-label mb-1 text-uppercase fw-bold text-secondary opacity-75" style={{ fontSize: '10px' }}>Quy Cách</label>
                          <select
                            className="form-select form-select-sm fw-bold text-secondary"
                            value={line.unit_name}
                            onChange={e => setLines(prev => prev.map(l =>
                              l.id === line.id ? { ...l, unit_name: e.target.value } : l
                            ))}
                          >
                            <option value="base">{selectedIng?.unit || 'DVT'}</option>
                            {availableUnits.map(u => (
                              <option key={u.id} value={u.unit_name}>{u.unit_name} (x{u.conversion_factor})</option>
                            ))}
                          </select>
                        </div>
                        {line.unit_name !== 'base' && line.quantity && (
                          <div className="col-12 text-end">
                            <span className="small text-muted italic" style={{ fontSize: '11px' }}>
                              = <strong>{(parseFloat(line.quantity) || 0) * (availableUnits.find(u => u.unit_name === line.unit_name)?.conversion_factor || 1)}</strong> {selectedIng?.unit}
                              <span className="ms-1">(Tổng quy đổi về đơn vị nhỏ nhất)</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => setLines(prev => [...prev, emptyLine()])} className="btn btn-link link-primary p-0 fw-bold small mt-2">+ Thêm dòng nguyên liệu</button>
          </div>

          <div className="col-12 mt-4">
            <label className="form-label small fw-bold text-muted text-uppercase tracking-widest">Ghi chú phiếu</label>
            <textarea value={txNotes} onChange={e => setTxNotes(e.target.value)} className="form-control" rows={2} placeholder="Nhập nội dung ghi chú cho cả phiếu này..." />
          </div>

          <div className="col-12 d-flex justify-content-end gap-2 mt-4 pt-4 border-top">
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-light rounded-pill px-4 fw-bold">Hủy</button>
            <button type="submit" disabled={saving} className="btn btn-primary rounded-pill px-5 fw-black shadow-sm" style={{ letterSpacing: '0.05rem' }}>
              {saving ? 'ĐANG LƯU...' : (editingReferenceId ? 'CẬP NHẬT PHIẾU' : 'XÁC NHẬN TẠO PHIẾU')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Branch Modal */}
      <Modal isOpen={isBranchModalOpen} onClose={() => setIsBranchModalOpen(false)} title={editingBranch ? "Sửa Cơ Sở" : "Thêm Cơ Sở Mới"} size="md">
        <form onSubmit={handleCreateOrUpdateBranch} className="row g-3">
          <div className="col-12">
            <label className="form-label small fw-bold text-muted">Tên Cơ Sở (*)</label>
            <input 
              type="text" value={branchName} onChange={e => setBranchName(e.target.value)} 
              className="form-control fw-bold border-primary-subtle" 
              placeholder="VD: Kho Tổng, Cơ sở 1..." required 
            />
          </div>
          <div className="col-12">
            <label className="form-label small fw-bold text-muted">Địa Chỉ</label>
            <input 
              type="text" value={branchAddress} onChange={e => setBranchAddress(e.target.value)} 
              className="form-control" 
              placeholder="Địa chỉ chi nhánh..." 
            />
          </div>
          <div className="col-12">
            <label className="form-label small fw-bold text-muted">Ghi Chú</label>
            <textarea 
              value={branchNotes} onChange={e => setBranchNotes(e.target.value)} 
              className="form-control" 
              rows={3} 
              placeholder="Ghi chú thêm về cơ sở này..." 
            />
          </div>
          <div className="col-12 d-flex justify-content-end gap-2 mt-4 pt-4 border-top">
            <button type="button" onClick={() => setIsBranchModalOpen(false)} className="btn btn-light rounded-pill px-4 fw-bold">Hủy</button>
            <button type="submit" disabled={savingBranch} className="btn btn-primary rounded-pill px-4 fw-black shadow-sm">
              {savingBranch ? 'ĐANG LƯU...' : (editingBranch ? 'CẬP NHẬT' : 'XÁC NHẬN THÊM')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}