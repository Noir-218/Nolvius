import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Search, Trash2, Edit2, X, ChevronDown, ChevronRight, Eye, Copy, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Modal } from '../components/ui/Modal';
import { format, startOfMonth, parseISO } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { Navigate } from 'react-router-dom';

const TYPE_LABELS: Record<string, string> = {
  'IN': 'Nhập Hàng',
  'OUT': 'Điều Chuyển Đi',
  'IN_TRANSFER': 'Nhận Điều Chuyển',
  'WASTE': 'Hủy Hàng',
  'WASTE_SYSTEM': 'Hủy Hệ Quầy',
  'SALES_USAGE': 'Tiêu Hao (Bán)',
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

interface SelectedWasteProduct {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  ingredientUsages: Record<string, number>;
}

interface LineItem {
  id: string;
  ingredient_id: string;
  quantity: string;
  unit_name: string; // The name of the selected unit
  searchTerm?: string;
  isDropdownOpen?: boolean;
  selectedIndex?: number;
}

const emptyLine = (): LineItem => ({
  id: crypto.randomUUID(),
  ingredient_id: '',
  quantity: '',
  unit_name: 'base',
  searchTerm: '',
  isDropdownOpen: false,
  selectedIndex: -1,
});

export default function Transactions() {
  const { user, role } = useAuth();
  
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
  const [combinedSearchTerm, setCombinedSearchTerm] = useState<string>('');
  const [isCombinedDropdownOpen, setIsCombinedDropdownOpen] = useState(false);
  const [combinedSelectedIndex, setCombinedSelectedIndex] = useState(-1);
  const [selectedIngSummary, setSelectedIngSummary] = useState<{
    id: string;
    name: string;
    unit: string;
    stats: Record<string, number>;
  } | null>(null);

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
  const [shouldFocusLast, setShouldFocusLast] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [txRevenue, setTxRevenue] = useState<string>('');
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
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productQty, setProductQty] = useState('');
  const [resolvingRecipe, setResolvingRecipe] = useState(false);
  const [selectedWasteProducts, setSelectedWasteProducts] = useState<SelectedWasteProduct[]>([]);

  // Waste by Product search states
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [productSelectedIndex, setProductSelectedIndex] = useState(-1);

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
      .select('id, name, unit, unit_price, category_id, substitute_id, ingredient_categories(id, name)')
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

  // Tự động tính toán lại số liệu tổng hợp nguyên liệu khi transactions thay đổi do bộ lọc
  useEffect(() => {
    if (!selectedIngSummary) return;

    const ingTransactions = transactions.filter(t => t.ingredient_id === selectedIngSummary.id);
    const stats: Record<string, number> = {
      'IN': 0,
      'IN_TRANSFER': 0,
      'OUT': 0,
      'WASTE': 0,
      'SALES_USAGE': 0
    };

    ingTransactions.forEach(t => {
      if (stats[t.type] !== undefined) {
        stats[t.type] += Math.abs(t.quantity);
      }
    });

    setSelectedIngSummary(prev => {
      if (!prev) return null;
      const hasChanged = Object.keys(stats).some(
        key => stats[key] !== prev.stats[key]
      );
      if (hasChanged) {
        return { ...prev, stats };
      }
      return prev;
    });
  }, [transactions]);


  // Focus the search input of the newly added line
  useEffect(() => {
    if (shouldFocusLast && lines.length > 0) {
      const lastLineId = lines[lines.length - 1].id;
      setTimeout(() => {
        const el = document.getElementById(`search-input-${lastLineId}`);
        if (el) (el as HTMLInputElement).focus();
        setShouldFocusLast(false);
      }, 50);
    }
  }, [lines.length, shouldFocusLast]);

  // Tự động tải doanh thu ngày cho phiếu hủy (WASTE) khi ngày thay đổi hoặc chuyển sang loại Hủy hàng
  useEffect(() => {
    if (txType !== 'WASTE' || !txDate) return;

    const fetchDailyRevenue = async () => {
      // 1. Thử hiển thị từ cache trước để có trải nghiệm mượt mà không có độ trễ
      const cached = localStorage.getItem(`daily_revenue_${txDate}`);
      if (cached) {
        setTxRevenue(cached);
      } else {
        setTxRevenue('');
      }

      // 2. Truy vấn từ database để đảm bảo tính chính xác tuyệt đối (đề phòng trường hợp đã xóa phiếu/dọn dẹp dữ liệu)
      try {
        const { data, error } = await supabase
          .from('stock_transactions')
          .select('notes')
          .eq('transaction_date', txDate)
          .eq('type', 'SALES_USAGE')
          .is('ingredient_id', null)
          .limit(1);

        if (!error && data && data[0]?.notes) {
          const match = data[0].notes.match(/^\[REVENUE: ([\d,.]+)\]/);
          if (match) {
            const rev = match[1].replace(/,/g, '');
            setTxRevenue(rev);
            localStorage.setItem(`daily_revenue_${txDate}`, rev);
          } else {
            setTxRevenue('');
            localStorage.removeItem(`daily_revenue_${txDate}`);
          }
        } else {
          setTxRevenue('');
          localStorage.removeItem(`daily_revenue_${txDate}`);
        }
      } catch (err) {
        console.error('Lỗi khi tải doanh thu ngày:', err);
      }
    };

    fetchDailyRevenue();
  }, [txDate, txType]);

  if (role === 'staff') {
    return <Navigate to="/audit" replace />;
  }

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
    setTxRevenue('');
    setLines([emptyLine()]);
    
    // Waste by Product reset
    setSelectedProductId('');
    setProductQty('');
    setProductSearchTerm('');
    setIsProductDropdownOpen(false);
    setProductSelectedIndex(-1);
    setSelectedWasteProducts([]);
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter(l => l.ingredient_id && l.quantity && parseFloat(l.quantity) > 0);
    if (validLines.length === 0) {
      toast.error('Nhập ít nhất 1 dòng hợp lệ!');
      return;
    }

    setSaving(true);
    const isNeg = ['OUT', 'WASTE', 'WASTE_SYSTEM', 'SALES_USAGE'].includes(txType);
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
          notes: (txType === 'WASTE' && txRevenue) ? `[DT: ${parseFloat(txRevenue).toLocaleString()}] ${txNotes}` : (txNotes || null),
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
      toast.error('Lỗi: ' + err.message);
    }
    setSaving(false);
  };

  const handleResolveProductWaste = async () => {
    if (!selectedProductId || !productQty || parseFloat(productQty) <= 0) {
      toast.error('Vui lòng chọn sản phẩm và nhập số lượng!');
      return;
    }

    setResolvingRecipe(true);
    try {
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
        toast.error('Sản phẩm này chưa có định mức công thức!');
        return;
      }

      // Calculate available stock for ingredients up to txDate (similar to Sales.tsx)
      const dateObj = parseISO(txDate);
      const yearMonth = format(dateObj, 'yyyy-MM');

      // Fetch opening stock
      const { data: openingData } = await supabase
        .from('monthly_opening_stock')
        .select('ingredient_id, opening_stock')
        .eq('year_month', yearMonth);
      
      const openingMap: Record<string, number> = {};
      if (openingData) {
        openingData.forEach(m => {
          openingMap[m.ingredient_id] = m.opening_stock ?? 0;
        });
      }

      // Fetch audits
      const { data: auditsData } = await supabase
        .from('stock_audits')
        .select('ingredient_id, actual_stock, audit_date')
        .lt('audit_date', txDate)
        .order('audit_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10000);

      const latestAuditMap: Record<string, { actual_stock: number, audit_date: string }> = {};
      if (auditsData) {
        auditsData.forEach(a => {
          if (a.ingredient_id && latestAuditMap[a.ingredient_id] === undefined) {
            latestAuditMap[a.ingredient_id] = {
              actual_stock: a.actual_stock ?? 0,
              audit_date: a.audit_date
            };
          }
        });
      }

      const auditDates = Object.values(latestAuditMap).map(a => a.audit_date.slice(0, 10));
      const earliestAuditDate = auditDates.length > 0
        ? auditDates.reduce((min, d) => d < min ? d : min, auditDates[0])
        : format(dateObj, 'yyyy-MM-01');

      const txFetchTo = txDate + 'T23:59:59+07:00';
      const { data: txsData } = await supabase
        .from('stock_transactions')
        .select('ingredient_id, type, quantity, transaction_date, branch_id')
        .gte('transaction_date', earliestAuditDate)
        .lte('transaction_date', txFetchTo)
        .order('transaction_date', { ascending: true })
        .limit(10000);

      // Fetch sealed branch ids
      const { data: allBranches } = await supabase.from('branches').select('id, name');
      const sealedBranchIds = new Set(
        (allBranches || [])
          .filter(b => {
            const n = (b.name || '').toLowerCase();
            if (n.includes('quầy') || n.includes('shop') || n.includes('vườn hoa')) return false;
            return n.includes('niêm phong') || n.includes('sealed') || n.includes('lưu trữ') || n.includes('kho cũ');
          })
          .map(b => b.id)
      );

      const availableStock: Record<string, number> = {};
      ingredients.forEach(ing => {
        const audit = latestAuditMap[ing.id];
        let stock = 0;
        if (audit) {
          stock = audit.actual_stock;
          const auditDate = audit.audit_date.slice(0, 10);
          const ingTxs = txsData?.filter(tx => tx.ingredient_id === ing.id) || [];
          ingTxs.forEach(tx => {
            const txDateStr = tx.transaction_date.slice(0, 10);
            if (txDateStr > auditDate) {
              const qty = Number(tx.quantity);
              if (['IN', 'IN_TRANSFER'].includes(tx.type)) {
                if (!tx.branch_id || !sealedBranchIds.has(tx.branch_id)) {
                  stock += qty;
                }
              } else {
                stock -= Math.abs(qty);
              }
            }
          });
        } else {
          stock = openingMap[ing.id] ?? 0;
          if (txsData) {
            txsData.forEach(tx => {
              if (tx.ingredient_id === ing.id) {
                const qty = Number(tx.quantity);
                if (['IN', 'IN_TRANSFER'].includes(tx.type)) {
                  if (!tx.branch_id || !sealedBranchIds.has(tx.branch_id)) {
                    stock += qty;
                  }
                } else {
                  stock -= Math.abs(qty);
                }
              }
            });
          }
        }
        availableStock[ing.id] = stock;
      });

      // Apply FIFO / substitute resolution logic
      const finalUsage: Record<string, number> = {};

      Object.entries(calcUsages).forEach(([ingId, qty]) => {
        let currentId = ingId;
        let needed = qty;
        const visitedChain = new Set<string>();

        while (needed > 0) {
          visitedChain.add(currentId);
          const ingredient = ingredients.find(i => i.id === currentId);
          const stock = availableStock[currentId] ?? 0;
          const successorId = ingredient?.substitute_id;

          if (successorId && !visitedChain.has(successorId)) {
            const availableToTake = Math.max(0, stock);
            const taken = Math.min(needed, availableToTake);

            if (taken > 0) {
              finalUsage[currentId] = (finalUsage[currentId] || 0) + taken;
              needed -= taken;
              availableStock[currentId] -= taken;
            }

            if (needed > 0) {
              currentId = successorId;
            }
          } else {
            finalUsage[currentId] = (finalUsage[currentId] || 0) + needed;
            availableStock[currentId] -= needed;
            needed = 0;
          }
        }
      });

      const product = productList.find(p => p.id === selectedProductId);
      const newSelectedEntry: SelectedWasteProduct = {
        id: crypto.randomUUID(),
        productId: selectedProductId,
        name: product?.name || 'Sản phẩm',
        quantity: pQty,
        ingredientUsages: { ...finalUsage }
      };

      setSelectedWasteProducts(prev => [...prev, newSelectedEntry]);

      setLines(prev => {
        let updatedLines = [...prev.filter(l => l.ingredient_id && l.quantity)];
        
        Object.entries(finalUsage).forEach(([ingId, qty]) => {
          const existingIdx = updatedLines.findIndex(l => l.ingredient_id === ingId && l.unit_name === 'base');
          if (existingIdx !== -1) {
            const currentQty = parseFloat(updatedLines[existingIdx].quantity || '0');
            updatedLines[existingIdx] = {
              ...updatedLines[existingIdx],
              quantity: (currentQty + qty).toString()
            };
          } else {
            const ing = (ingredients || []).find(i => i.id === ingId);
            updatedLines.push({
              id: crypto.randomUUID(),
              ingredient_id: ingId,
              quantity: qty.toString(),
              unit_name: 'base',
              searchTerm: ing?.name || '',
              isDropdownOpen: false
            });
          }
        });
        
        return updatedLines;
      });

      setSelectedProductId('');
      setProductSearchTerm('');
      setProductQty('');
      toast.success(`Đã quy đổi và gộp nguyên liệu cho ${product?.name}.`);
    } catch (err: any) {
      toast.error('Lỗi quy đổi công thức: ' + err.message);
    } finally {
      setResolvingRecipe(false);
    }
  };

  const removeWasteProduct = (entry: SelectedWasteProduct) => {
    setLines(prev => {
      let updatedLines = [...prev];
      Object.entries(entry.ingredientUsages).forEach(([ingId, qty]) => {
        const idx = updatedLines.findIndex(l => l.ingredient_id === ingId && l.unit_name === 'base');
        if (idx !== -1) {
          const currentQty = parseFloat(updatedLines[idx].quantity || '0');
          const newQty = Math.max(0, currentQty - qty);
          if (newQty <= 0.000001) {
             updatedLines = updatedLines.filter((_, i) => i !== idx);
          } else {
            updatedLines[idx] = { ...updatedLines[idx], quantity: newQty.toString() };
          }
        }
      });
      return updatedLines.length === 0 ? [emptyLine()] : updatedLines;
    });
    setSelectedWasteProducts(prev => prev.filter(p => p.id !== entry.id));
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
    else toast.error('Lỗi xóa!');
  };

  const startEdit = (group: TransactionGroup) => {
    const isLegacy = group.id.includes('|');
    setEditingReferenceId(isLegacy ? null : group.id); 
    setTxType(group.type);
    setTxDate(group.transaction_date || today);
    setTxSupplier(group.items[0]?.supplier_id || '');
    setTxBranch(group.items[0]?.branch_id || '');
    setTxIsFast(group.is_fast_entered);
    setTxIsApproved(group.is_approved || false);
    setTxIsExported(group.is_transfer_exported || false);
    
    if ((group.type === 'WASTE' || group.type === 'WASTE_SYSTEM') && group.notes) {
      const match = group.notes.match(/^\[DT: ([\d,.]+)\]/);
      if (match) {
        setTxRevenue(match[1].replace(/,/g, ''));
        setTxNotes(group.notes.replace(/^\[DT: [\d,.]+\]\s*/, ''));
      } else {
        setTxRevenue('');
        setTxNotes(group.notes);
      }
    } else {
      setTxRevenue('');
      setTxNotes(group.notes || '');
    }

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

  const startDuplicate = (group: TransactionGroup) => {
    // Tạo phiếu mới dựa trên phiếu cũ, nhưng:
    // - Không có editingReferenceId (tạo mới, không sửa)
    // - Ngày = hôm nay
    // - Số lượng = 0
    // - Trạng thái (FAST, Duyệt, Xuất DC) = false
    // - Ghi chú = trống
    setEditingReferenceId(null);
    setTxType(group.type);
    setTxDate(today);
    setTxSupplier(group.items[0]?.supplier_id || '');
    setTxBranch(group.items[0]?.branch_id || '');
    setTxNotes('');
    setTxIsFast(false);
    setTxIsApproved(false);
    setTxIsExported(false);
    setLines(group.items.map(item => ({
      id: crypto.randomUUID(),
      ingredient_id: item.ingredient_id,
      quantity: '0',
      unit_name: 'base',
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

  const handleExportExcel = (group: TransactionGroup) => {
    try {
      const toastId = toast.loading('Đang tạo file Excel...');
      
      const headers = [
        "Mã hàng", "Tên mặt hàng", "Đvt", "Mã kho", "Mã lô", "Số lượng", 
        "Giá đích danh", "Giá", "Tiền", "Mã nx", "Tk nợ", "Tk có", 
        "Vụ việc", "Bộ phận", "Lsx", "Sản phẩm", "Hợp đồng", "Phí", "Khế ước"
      ];
      
      // Tạo worksheet trống
      const worksheet: XLSX.WorkSheet = {};
      
      // Ghi hàng tiêu đề vào hàng 5 (index 4)
      headers.forEach((h, c) => {
        worksheet[XLSX.utils.encode_cell({ r: 4, c })] = { t: 's', v: h };
      });
      
      // Ghi dữ liệu từ hàng 6 trở đi — CHỈ ghi các cột có dữ liệu, 
      // các cột trống sẽ không tạo cell → giống hệt file mẫu gốc
      let currentRow = 5; // index 5 = hàng 6
      for (const item of group.items) {
        const code = item.ingredient_id || '';
        const name = item.ingredients?.name || '';
        const unit = item.ingredients?.unit || '';
        const qty = Math.abs(item.quantity);
        
        if (code) worksheet[XLSX.utils.encode_cell({ r: currentRow, c: 0 })] = { t: 's', v: code };
        if (name) worksheet[XLSX.utils.encode_cell({ r: currentRow, c: 1 })] = { t: 's', v: name };
        if (unit) worksheet[XLSX.utils.encode_cell({ r: currentRow, c: 2 })] = { t: 's', v: unit };
        worksheet[XLSX.utils.encode_cell({ r: currentRow, c: 5 })] = { t: 'n', v: qty };
        
        currentRow++;
      }
      
      // Thiết lập phạm vi dữ liệu (ref) từ A5 đến S(lastRow)
      const lastRow = currentRow - 1;
      worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: lastRow, c: 18 } });
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      const shortId = group.id.substring(0, 8);
      a.download = `phieu_huy_${shortId}_${group.transaction_date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Xuất file Excel thành công!', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi khi xuất file Excel: ' + err.message);
    }
  };

  const handleCreateOrUpdateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) {
      toast.error('Vui lòng nhập tên cơ sở!');
      return;
    }
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
      toast.error('Lỗi: ' + err.message);
    }
    setSavingBranch(false);
  };

  const deleteBranch = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa cơ sở này?')) return;
    const { error } = await supabase.from('branches').delete().eq('id', id);
    if (error) {
      toast.error('Không thể xóa cơ sở này (có thể do đã có giao dịch liên quan).');
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
      g.items.some(t => unsignedString(t.ingredients?.name ?? '').includes(unsignedString(search))) ||
      unsignedString(g.supplier_name ?? '').includes(unsignedString(search)) ||
      unsignedString(g.notes ?? '').includes(unsignedString(search))
    )
    : groupedTransactions;

  const handleSelectCombined = (ing: any) => {
    setCombinedSearchTerm(ing.name);
    setSearch(ing.name);
    setIsCombinedDropdownOpen(false);

    // Calculate summary
    const ingTransactions = transactions.filter(t => t.ingredient_id === ing.id);
    const stats: Record<string, number> = {
      'IN': 0,
      'IN_TRANSFER': 0,
      'OUT': 0,
      'WASTE': 0,
      'SALES_USAGE': 0
    };

    ingTransactions.forEach(t => {
      if (stats[t.type] !== undefined) {
        stats[t.type] += Math.abs(t.quantity);
      }
    });

    setSelectedIngSummary({
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      stats
    });
  };

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
                <div className="col-12 col-md flex-grow-1 position-relative">
                  <label className="form-label mb-1 text-uppercase fw-black text-secondary" style={{ fontSize: '10px' }}>Tìm tổng hợp nguyên liệu</label>
                  <div className="input-group input-group-sm shadow-sm">
                    <span className="input-group-text bg-white border-end-0 text-muted"><Search size={14} /></span>
                    <input 
                      id="main-search-input"
                      type="text" 
                      placeholder="Gõ tên nguyên liệu để xem tổng hợp..." 
                      value={combinedSearchTerm} 
                      onChange={e => {
                        setCombinedSearchTerm(e.target.value);
                        setIsCombinedDropdownOpen(true);
                        setCombinedSelectedIndex(-1);
                        if (!e.target.value) {
                          setSearch('');
                          setSelectedIngSummary(null);
                        }
                      }} 
                      onFocus={() => setIsCombinedDropdownOpen(true)}
                      onKeyDown={(e) => {
                        const filteredIngs = ingredients.filter(i => unsignedString(i.name).includes(unsignedString(combinedSearchTerm)));
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setCombinedSelectedIndex(prev => (prev + 1) % filteredIngs.length);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setCombinedSelectedIndex(prev => (prev - 1 + filteredIngs.length) % filteredIngs.length);
                        } else if (e.key === 'Enter' || e.key === 'Tab') {
                          if (combinedSelectedIndex >= 0 && combinedSelectedIndex < filteredIngs.length) {
                            e.preventDefault();
                            const ing = filteredIngs[combinedSelectedIndex];
                            handleSelectCombined(ing);
                          }
                        }
                      }}
                      className="form-control border-start-0 ps-0 fw-bold" 
                    />
                    {combinedSearchTerm && (
                      <button 
                        className="btn btn-outline-secondary border-start-0 border-end border-top border-bottom" 
                        onClick={() => {
                          setCombinedSearchTerm('');
                          setSearch('');
                          setSelectedIngSummary(null);
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Dropdown for Combined Search */}
                  {isCombinedDropdownOpen && combinedSearchTerm && (
                    <div className="position-absolute w-100 mt-1 shadow-lg bg-white rounded-3 overflow-hidden border" style={{ zIndex: 1050 }}>
                      <div className="list-group list-group-flush" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {ingredients
                          .filter(i => unsignedString(i.name).includes(unsignedString(combinedSearchTerm)))
                          .map((i, idx) => (
                            <button
                              key={i.id}
                              type="button"
                              className={`list-group-item list-group-item-action border-0 py-2 px-3 small d-flex justify-content-between align-items-center ${combinedSelectedIndex === idx ? 'bg-primary text-white' : ''}`}
                              onClick={() => handleSelectCombined(i)}
                            >
                              <div>
                                <span className="fw-bold">{i.name}</span>
                                <div className={`${combinedSelectedIndex === idx ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '10px' }}>{i.ingredient_categories?.name || 'Không có danh mục'}</div>
                              </div>
                              <span className={`badge rounded-pill ${combinedSelectedIndex === idx ? 'bg-white text-primary' : 'bg-light text-secondary'}`}>{i.unit}</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Summary Card for Combined Search */}
              {selectedIngSummary && (
                <div className="card border-0 bg-primary bg-opacity-10 rounded-4 p-3 p-md-4 mb-4 shadow-sm border-start border-4 border-primary animate__animated animate__fadeIn">
                  <div className="row g-3 align-items-center">
                    <div className="col-12 col-md-4">
                      <div className="d-flex align-items-center gap-3">
                        <div className="bg-primary text-white p-3 rounded-3 shadow-sm">
                          <Plus size={24} />
                        </div>
                        <div>
                          <h6 className="fw-black text-primary text-uppercase tracking-widest mb-0" style={{ fontSize: '11px' }}>Tổng hợp giao dịch</h6>
                          <h4 className="fw-black text-dark mb-0">{selectedIngSummary.name}</h4>
                          <span className="badge bg-white text-primary border border-primary-subtle rounded-pill small">{selectedIngSummary.unit}</span>
                        </div>
                      </div>
                    </div>
                    <div className="col-12 col-md-8">
                      <div className="row g-2">
                        <div className="col-4 col-md">
                          <div className="bg-white p-2 rounded-3 text-center shadow-sm h-100">
                            <div className="text-uppercase fw-bold text-muted mb-1" style={{ fontSize: '9px' }}>Nhập hàng</div>
                            <div className="fw-black text-success small">{selectedIngSummary.stats['IN'].toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="col-4 col-md">
                          <div className="bg-white p-2 rounded-3 text-center shadow-sm h-100 border-start border-3 border-info">
                            <div className="text-uppercase fw-bold text-muted mb-1" style={{ fontSize: '9px' }}>Nhập chuyển</div>
                            <div className="fw-black text-info small">{selectedIngSummary.stats['IN_TRANSFER'].toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="col-4 col-md">
                          <div className="bg-white p-2 rounded-3 text-center shadow-sm h-100 border-start border-3 border-warning">
                            <div className="text-uppercase fw-bold text-muted mb-1" style={{ fontSize: '9px' }}>Xuất chuyển</div>
                            <div className="fw-black text-warning small">{selectedIngSummary.stats['OUT'].toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="col-4 col-md">
                          <div className="bg-white p-2 rounded-3 text-center shadow-sm h-100 border-start border-3 border-danger">
                            <div className="text-uppercase fw-bold text-muted mb-1" style={{ fontSize: '9px' }}>Hủy hàng</div>
                            <div className="fw-black text-danger small">{selectedIngSummary.stats['WASTE'].toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="col-4 col-md">
                          <div className="bg-white p-2 rounded-3 text-center shadow-sm h-100 border-start border-3 border-primary">
                            <div className="text-uppercase fw-bold text-muted mb-1" style={{ fontSize: '9px' }}>Bán hàng</div>
                            <div className="fw-black text-primary small">{selectedIngSummary.stats['SALES_USAGE'].toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                                  <button onClick={() => toggleGroup(group.id)} className="btn btn-sm btn-outline-secondary border-0 rounded-circle p-2 hover-shadow" title="Xem chi tiết">
                                    <Eye size={16} />
                                  </button>
                                  <button onClick={() => startEdit(group)} className="btn btn-sm btn-outline-primary border-0 rounded-circle p-2 hover-shadow" title="Sửa phiếu">
                                    <Edit2 size={16} />
                                  </button>
                                  {(group.type === 'IN' || group.type === 'WASTE' || group.type === 'WASTE_SYSTEM') && (
                                    <button
                                      onClick={() => startDuplicate(group)}
                                      className="btn btn-sm border-0 rounded-circle p-2 hover-shadow"
                                      style={{ color: '#0d9488', backgroundColor: 'transparent' }}
                                      title="Chép dữ liệu sang phiếu mới (số lượng = 0)"
                                    >
                                      <Copy size={16} />
                                    </button>
                                  )}
                                  {(group.type === 'WASTE' || group.type === 'WASTE_SYSTEM') && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleExportExcel(group);
                                      }}
                                      className="btn btn-sm border-0 rounded-circle p-2 hover-shadow text-success"
                                      title="Xuất file Excel"
                                    >
                                      <FileSpreadsheet size={16} />
                                    </button>
                                  )}
                                  <button onClick={() => handleDelete(group)} className="btn btn-sm btn-outline-danger border-0 rounded-circle p-2 hover-shadow" title="Xóa phiếu">
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
              <option value="WASTE">🗑️ Hủy / Hư Hỏng (Tính phí)</option>
              <option value="WASTE_SYSTEM">⚙️ Hủy Hệ Quầy (Không tính phí)</option>
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
              {(() => {
                const selectedBranch = branches.find(b => b.id === txBranch);
                const isSealed = selectedBranch && /niêm phong|niemphong|sealed|lưu trữ|luutru/i.test(selectedBranch.name);
                if (isSealed) {
                  return (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-3 text-amber-800 small d-flex items-start gap-2">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <p className="mb-0">
                        <strong>Lưu ý:</strong> Khi điều chuyển vào <strong>{selectedBranch.name}</strong>, số hàng này sẽ được niêm phong và <strong>không tính vào tiêu hao bán lẻ</strong> hàng ngày.
                      </p>
                    </div>
                  );
                }
                return (
                  <p className="text-secondary opacity-75 mt-1 small italic" style={{ fontSize: '11px' }}>
                    Chọn cơ sở nơi bạn {txType === 'IN_TRANSFER' ? 'nhận hàng về' : 'chuyển hàng đi'}.
                  </p>
                );
              })()}
            </div>
          )}

          {(txType === 'WASTE' || txType === 'WASTE_SYSTEM') && (
            <div className="col-12">
              {txType === 'WASTE' && (
                <div className="row g-3 mb-3">
                <div className="col-12 col-md-6">
                  <div className="card p-3 border-0 bg-primary bg-opacity-10 rounded-4 h-100 shadow-sm border-start border-4 border-primary">
                    <label className="form-label small fw-black text-primary text-uppercase tracking-widest mb-2">Doanh Thu Ngày/Ca</label>
                    <div className="input-group">
                      <input 
                        type="number" 
                        className="form-control form-control-lg fw-black text-primary border-0 bg-white" 
                        placeholder="Nhập doanh thu..." 
                        value={txRevenue}
                        onChange={e => setTxRevenue(e.target.value)}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                      />
                      <span className="input-group-text border-0 bg-white fw-bold text-muted">VND</span>
                    </div>
                    <div className="mt-2 d-flex justify-content-between align-items-center">
                      <span className="small text-secondary fw-bold">Hạn mức (0.075%):</span>
                      <span className="badge bg-white text-primary border border-primary-subtle rounded-pill">
                        {(parseFloat(txRevenue || '0') * 0.00075).toLocaleString()} VND
                      </span>
                    </div>
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  {(() => {
                    const limit = parseFloat(txRevenue || '0') * 0.00075;
                    const actual = lines.reduce((sum, l) => {
                      const ing = ingredients.find(i => i.id === l.ingredient_id);
                      if (!ing || !l.quantity) return sum;
                      let factor = 1;
                      if (l.unit_name !== 'base') {
                        const unit = allUnits.find(u => u.ingredient_id === l.ingredient_id && u.unit_name === l.unit_name);
                        if (unit) factor = unit.conversion_factor;
                      }
                      return sum + (parseFloat(l.quantity) * factor * (ing.unit_price || 0));
                    }, 0);
                    const diff = limit - actual;
                    const statusClass = diff >= 0 ? 'border-success' : 'border-danger';
                    const textClass = diff >= 0 ? 'text-success' : 'text-danger';

                    return (
                      <div className={`card p-3 border-0 bg-light rounded-4 h-100 shadow-sm border-start border-4 ${statusClass}`}>
                        <label className="form-label small fw-black text-secondary text-uppercase tracking-widest mb-2">Thực Tế Hủy</label>
                        <h3 className={`fw-black mb-1 ${textClass}`}>{actual.toLocaleString()} <small style={{ fontSize: '14px' }}>VND</small></h3>
                        <div className="mt-auto pt-2 d-flex justify-content-between align-items-center border-top border-secondary border-opacity-10">
                          <span className="small text-muted fw-bold">{diff >= 0 ? 'Còn lại:' : 'Vượt mức:'}</span>
                          <span className={`fw-black small ${textClass}`}>{Math.abs(diff).toLocaleString()} VND</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              )}

              <div className="card p-3 border-0 bg-warning-subtle rounded-4 mb-2">
                <h6 className="fw-black text-warning-emphasis text-uppercase small mb-3">Hủy Theo Sản Phẩm (Quy đổi tự động)</h6>
                <div className="row g-2">
                  <div className="col-12 col-md-9 position-relative">
                    <label className="form-label small text-muted mb-1">Chọn sản phẩm cần hủy</label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-white border-end-0 text-muted"><Search size={14} /></span>
                      <input
                        type="text"
                        className="form-control border-start-0 ps-0 fw-bold"
                        placeholder="Gõ để tìm nhanh sản phẩm..."
                        value={productSearchTerm}
                        onChange={(e) => {
                          const term = e.target.value;
                          setProductSearchTerm(term);
                          setIsProductDropdownOpen(true);
                          setSelectedProductId(term === '' ? '' : selectedProductId);
                          setProductSelectedIndex(-1);
                        }}
                        onFocus={() => setIsProductDropdownOpen(true)}
                        onBlur={() => {
                          setTimeout(() => {
                            setIsProductDropdownOpen(false);
                          }, 200);
                        }}
                        onKeyDown={(e) => {
                          if (!isProductDropdownOpen) return;
                          const filteredProducts = productList
                            .filter(p => unsignedString(p.name).includes(unsignedString(productSearchTerm)));
                          if (filteredProducts.length === 0) return;

                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setProductSelectedIndex(prev => (prev + 1) % filteredProducts.length);
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setProductSelectedIndex(prev => (prev - 1 + filteredProducts.length) % filteredProducts.length);
                          } else if (e.key === 'Enter' || e.key === 'Tab') {
                            if (productSelectedIndex >= 0 && productSelectedIndex < filteredProducts.length) {
                              e.preventDefault();
                              const selectedProd = filteredProducts[productSelectedIndex];
                              setSelectedProductId(selectedProd.id);
                              setProductSearchTerm(selectedProd.name);
                              setIsProductDropdownOpen(false);
                              setProductSelectedIndex(-1);
                            }
                          }
                        }}
                      />
                    </div>
                    
                    {/* Dropdown for Product Search */}
                    {isProductDropdownOpen && (
                      <div className="position-absolute w-100 mt-1 shadow-lg bg-white rounded-3 overflow-hidden border" style={{ zIndex: 1050, left: 0, right: 0 }}>
                        <div className="list-group list-group-flush" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                          {(() => {
                            const filteredProducts = productList
                              .filter(p => unsignedString(p.name).includes(unsignedString(productSearchTerm)));
                            
                            if (filteredProducts.length === 0) {
                              return <div className="p-2 text-muted small text-center">Không tìm thấy sản phẩm nào</div>;
                            }
                            
                            return filteredProducts.map((p, idx) => (
                              <button
                                key={p.id}
                                type="button"
                                className={`list-group-item list-group-item-action border-0 py-2 px-3 small d-flex justify-content-between align-items-center ${productSelectedIndex === idx ? 'bg-primary text-white' : ''}`}
                                onMouseDown={() => {
                                  setSelectedProductId(p.id);
                                  setProductSearchTerm(p.name);
                                  setIsProductDropdownOpen(false);
                                  setProductSelectedIndex(-1);
                                }}
                              >
                                <div>
                                  <span className="fw-bold">{p.name}</span>
                                  <div className={`${productSelectedIndex === idx ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '10px' }}>
                                    {productCategories.find(c => c.id === p.category_id)?.name || 'Không có danh mục'}
                                  </div>
                                </div>
                                <span className={`badge rounded-pill ${productSelectedIndex === idx ? 'bg-white text-primary' : 'bg-light text-secondary'}`}>
                                  {p.unit || '-'}
                                </span>
                              </button>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="col-8 col-md-2">
                    <label className="form-label small text-muted mb-1">Số lượng</label>
                    <input 
                      type="number" 
                      className="form-control form-control-sm text-end fw-bold" 
                      placeholder="0" 
                      value={productQty} 
                      onChange={e => setProductQty(e.target.value)}
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
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

                {selectedWasteProducts.length > 0 && (
                  <div className="mt-3 pt-3 border-top border-warning border-opacity-25">
                    <label className="form-label small fw-black text-warning-emphasis text-uppercase tracking-widest mb-2" style={{ fontSize: '10px' }}>Sản phẩm đã chọn hủy:</label>
                    <div className="d-flex flex-wrap gap-2">
                      {selectedWasteProducts.map(p => (
                        <div key={p.id} className="badge bg-white text-dark border border-warning-subtle d-flex align-items-center gap-2 px-3 py-2 rounded-3 shadow-sm shadow-hover-sm transition-all">
                          <span className="fw-black text-warning-emphasis">{p.quantity}</span>
                          <span className="fw-bold">{p.name}</span>
                          <button 
                            type="button" 
                            onClick={() => removeWasteProduct(p)}
                            className="btn-close" 
                            style={{ fontSize: '10px', padding: '0.25rem' }}
                            title="Xóa sản phẩm này"
                          ></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                              id={`search-input-${line.id}`}
                              type="text"
                              className="form-control border-start-0 ps-0 fw-bold"
                              placeholder="Gõ để tìm nhanh (vd: sữa, cafe...)"
                              value={line.searchTerm || ''}
                              onChange={(e) => {
                                const term = e.target.value;
                                setLines(prev => prev.map(l => 
                                  l.id === line.id ? { ...l, searchTerm: term, isDropdownOpen: true, ingredient_id: term === '' ? '' : l.ingredient_id, selectedIndex: -1 } : l
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
                              onKeyDown={(e) => {
                                if (!line.isDropdownOpen) return;
                                const filtered = ingredients.filter(i => unsignedString(i.name).includes(unsignedString(line.searchTerm || '')));
                                if (filtered.length === 0) return;

                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  setLines(prev => prev.map(l => 
                                    l.id === line.id ? { ...l, selectedIndex: ((l.selectedIndex ?? -1) + 1) % filtered.length } : l
                                  ));
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  setLines(prev => prev.map(l => 
                                    l.id === line.id ? { ...l, selectedIndex: ((l.selectedIndex ?? -1) - 1 + filtered.length) % filtered.length } : l
                                  ));
                                } else if (e.key === 'Enter' || e.key === 'Tab') {
                                  const idx = line.selectedIndex ?? -1;
                                  if (idx >= 0 && idx < filtered.length) {
                                    e.preventDefault();
                                    const item = filtered[idx];
                                    setLines(prev => prev.map(l => 
                                      l.id === line.id ? { ...l, ingredient_id: item.id, searchTerm: item.name, isDropdownOpen: false, unit_name: 'base', selectedIndex: -1 } : l
                                    ));
                                  }
                                }
                              }}
                            />
                          </div>
                          
                          {/* Dropdown Results */}
                          {line.isDropdownOpen && (line.searchTerm || '').length > 0 && (
                            <div className="position-absolute w-100 mt-1 shadow-lg bg-white rounded-3 overflow-hidden border" style={{ zIndex: 1050, left: 0, right: 0 }}>
                              <div className="list-group list-group-flush" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                {ingredients
                                  .filter(i => unsignedString(i.name).includes(unsignedString(line.searchTerm || '')))
                                  .map((i, idx) => (
                                    <button
                                      key={i.id}
                                      type="button"
                                      className={`list-group-item list-group-item-action border-0 py-2 px-3 small d-flex justify-content-between align-items-center ${line.selectedIndex === idx ? 'bg-primary text-white' : ''}`}
                                      onClick={() => {
                                        setLines(prev => prev.map(l => 
                                          l.id === line.id ? { ...l, ingredient_id: i.id, searchTerm: i.name, isDropdownOpen: false, unit_name: 'base', selectedIndex: -1 } : l
                                        ));
                                      }}
                                    >
                                      <div>
                                        <span className="fw-bold">{i.name}</span>
                                        <div className={`${line.selectedIndex === idx ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '10px' }}>{i.ingredient_categories?.name || 'Không có danh mục'}</div>
                                      </div>
                                      <span className={`badge rounded-pill ${line.selectedIndex === idx ? 'bg-white text-primary' : 'bg-light text-secondary'}`}>{i.unit}</span>
                                    </button>
                                  ))}
                                {ingredients.filter(i => unsignedString(i.name).includes(unsignedString(line.searchTerm || ''))).length === 0 && (
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
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
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
                        {txType === 'WASTE' && selectedIng && line.quantity && (
                          <div className="col-12 text-end mt-1">
                            <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill">
                              Giá trị hủy: {((parseFloat(line.quantity) || 0) * (availableUnits.find(u => u.unit_name === line.unit_name)?.conversion_factor || 1) * (selectedIng.unit_price || 0)).toLocaleString()} VND
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button 
              type="button" 
              onClick={() => {
                setLines(prev => [...prev, emptyLine()]);
                setShouldFocusLast(true);
              }} 
              className="btn btn-link link-primary p-0 fw-bold small mt-2"
            >
              + Thêm dòng nguyên liệu
            </button>
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