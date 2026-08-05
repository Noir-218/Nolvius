import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFacility } from '../contexts/FacilityContext';
import { Upload, CheckCircle2, AlertCircle, Calendar, Trash2, Edit2, Save, X, RefreshCw, TrendingDown, Eye } from 'lucide-react';
import * as xlsx from 'xlsx';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { format, parseISO } from 'date-fns';

interface ParsedSale {
  product_name: string;
  product_code?: string;
  quantity: number;
  sale_date: string;
  matched_product_id?: string;
  is_direct_ingredient?: boolean;
  net_revenue?: number;
}

interface IngredientUsage {
  ingredient_id: string;
  name: string;
  unit: string;
  total_usage: number;
}

interface SaleRecord {
  id: string;
  product_id: string;
  quantity: number;
  sale_date: string;
  products: {
    name: string;
  } | null;
}

export default function Sales() {
  const { user } = useAuth();
  const { canEdit } = usePermissions('sales');
  const { facilityClient } = useFacility();
  const supabase = facilityClient!;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'import' | 'history'>('import');

  // Import states
  const [sales, setSales] = useState<ParsedSale[]>([]);
  const [usages, setUsages] = useState<IngredientUsage[]>([]);
  const [unmatched, setUnmatched] = useState<ParsedSale[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [processing, setProcessing] = useState(false);
  const [importDate, setImportDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // History states
  const [history, setHistory] = useState<SaleRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState<number>(0);

  // ═══════════════════════════════════════════════════════════════════════
  // IMPORT LOGIC
  // ═══════════════════════════════════════════════════════════════════════

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = xlsx.read(bstr, { type: 'binary' });

        const cleanString = (str: string) =>
          str.replace(/\u200b|\u200c|\u200d|\uFEFF|\u00A0/g, '').trim();

        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = xlsx.utils.sheet_to_json(ws, { header: 1 }) as string[][];

        const headerKeywords = ['mã hàng', 'mã sản phẩm', 'mã sp', 'mã món', 'tên hàng', 'tên sản phẩm', 'tên món'];
        const headerRowIndex = rawRows.findIndex(row =>
          row.some(cell => cell && headerKeywords.includes(String(cell).toLowerCase().trim()))
        );

        if (headerRowIndex === -1) {
          alert('Không tìm thấy dòng tiêu đề (Mã hàng / Tên hàng / Tên món) trong file. Vui lòng kiểm tra lại.');
          return;
        }

        const headerRow = rawRows[headerRowIndex].map(cell => String(cell ?? '').toLowerCase().trim());
        const dataRows = rawRows.slice(headerRowIndex + 1);

        const colCode = headerRow.findIndex(h => ['mã hàng', 'mã sản phẩm', 'mã sp', 'mã món', 'mã số', 'mã', 'id', 'code', 'product code'].includes(h));
        const colName = headerRow.findIndex(h => ['tên hàng', 'tên sản phẩm', 'tên món', 'product name', 'name', 'sản phẩm'].includes(h));
        let colQty = headerRow.findIndex(h => ['số lượng', 'sl', 'đã bán', 'quantity', 'qty', 'số lượng bán'].includes(h));
        if (colQty === -1) {
          const firstDataRow = dataRows.find(r => r[colCode] || r[colName]);
          if (firstDataRow) {
            colQty = firstDataRow.findIndex((cell, idx) =>
              idx > Math.max(colCode, colName) && typeof cell === 'number' && cell > 0
            );
          }
        }
        const colNetRevenue = headerRow.findIndex(h => ['doanh thu (net)', 'doanh thu net', 'net revenue', 'doanh thu'].includes(h));

        const { data: dbProducts } = await supabase.from('products').select('id, name').limit(10000);
        const { data: dbIngredients } = await supabase.from('ingredients').select('id, name').limit(10000);
        
        const nameMap = new Map((dbProducts || []).map(p => [cleanString(p.name.toLowerCase()), p.id]));
        const codeMap = new Map((dbProducts || []).map(p => [cleanString(p.id.toLowerCase()), p.id]));
        
        const ingNameMap = new Map((dbIngredients || []).map(i => [cleanString(i.name.toLowerCase()), i.id]));
        const ingCodeMap = new Map((dbIngredients || []).map(i => [cleanString(i.id.toLowerCase()), i.id]));

        const parsed: ParsedSale[] = dataRows.map((row) => {
          const rawCode = colCode >= 0 ? cleanString(String(row[colCode] ?? '')) : '';
          let rawName = colName >= 0 ? cleanString(String(row[colName] ?? '')) : '';
          
          // Tự động làm sạch tên món: bỏ phần giá bán đằng sau dấu chấm phẩy ';' nếu có
          if (rawName.includes(';')) {
            rawName = cleanString(rawName.split(';')[0]);
          }

          const rawQty = colQty >= 0 ? row[colQty] : undefined;
          const qty = parseInt(String(rawQty ?? '0').replace(/[^0-9]/g, '')) || 0;

          const rawNet = colNetRevenue >= 0 ? row[colNetRevenue] : undefined;
          const netVal = parseFloat(String(rawNet ?? '0').replace(/[^0-9.-]/g, '')) || 0;

          return {
            product_name: rawName || rawCode || '',
            product_code: rawCode,
            quantity: qty,
            sale_date: importDate,
            net_revenue: netVal
          };
        }).filter(r => (r.product_name || r.product_code) && r.quantity > 0);

        const matched: ParsedSale[] = [];
        const unmatchedItems: ParsedSale[] = [];

        parsed.forEach(p => {
          const lName = cleanString(p.product_name.toLowerCase());
          const lCode = cleanString(p.product_code?.toLowerCase() || '');

          let pid = p.product_code ? codeMap.get(lCode) : undefined;
          if (!pid && p.product_name) pid = nameMap.get(lName);

          if (pid) {
            matched.push({ ...p, matched_product_id: pid });
          } else {
            let iid = p.product_code ? ingCodeMap.get(lCode) : undefined;
            if (!iid && p.product_name) iid = ingNameMap.get(lName);
            
            if (iid) {
              matched.push({ ...p, matched_product_id: iid, is_direct_ingredient: true });
            } else {
              unmatchedItems.push(p);
            }
          }
        });

        const qtyByProduct: Record<string, number> = {};
        matched.forEach(m => {
          if (m.matched_product_id) {
            qtyByProduct[m.matched_product_id] = (qtyByProduct[m.matched_product_id] || 0) + m.quantity;
          }
        });

        const productIds = Object.keys(qtyByProduct);
        if (productIds.length > 0) {
          // 1. Fetch ALL ingredients for metadata
          const { data: allIngs } = await supabase.from('ingredients').select('id, name, unit').limit(10000);
          const ingMetadata: Record<string, {name: string, unit: string}> = {};
          (allIngs || []).forEach(i => ingMetadata[i.id] = { name: i.name, unit: i.unit });

          // 2. Fetch ALL recipes to resolve recursively
          const { data: allRecipes } = await supabase.from('recipes').select('*').limit(10000);
          
          const calcUsages: Record<string, number> = {};
          const ingIds = new Set((allIngs || []).map(i => i.id));

          // Recursive resolver
          const resolve = (pid: string, qty: number, visited: Set<string> = new Set()) => {
            if (visited.has(pid)) return; // Prevent infinite loops
            visited.add(pid);

            const productRows = (allRecipes || []) as unknown as { product_id: string; ingredient_id?: string; sub_product_id?: string; quantity: number }[];
            const matches = productRows.filter(r => r.product_id === pid);
            if (matches.length > 0) {
              matches.forEach(row => {
                if (row.ingredient_id) {
                  calcUsages[row.ingredient_id] = (calcUsages[row.ingredient_id] || 0) + (row.quantity * qty);
                } else if (row.sub_product_id) {
                  resolve(row.sub_product_id, row.quantity * qty, new Set(visited));
                }
              });
            } else if (ingIds.has(pid)) {
              // Direct ingredient fallback (1:1)
              calcUsages[pid] = (calcUsages[pid] || 0) + qty;
            }
          };

          productIds.forEach(pid => {
            const saleQty = qtyByProduct[pid] || 0;
            resolve(pid, saleQty);
          });

          const usageList: IngredientUsage[] = Object.entries(calcUsages).map(([id, qty]) => ({
            ingredient_id: id,
            name: ingMetadata[id]?.name || 'Unknown',
            unit: ingMetadata[id]?.unit || '',
            total_usage: qty
          }));

          setUsages(usageList);
        } else {
          setUsages([]);
        }

        setSales(matched);
        setUnmatched(unmatchedItems);
        setStep(2);

      } catch (err) {
        alert('Có lỗi xảy ra khi đọc file Excel. Vui lòng kiểm tra lại định dạng file.');
        console.error(err);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const confirmImport = async () => {
    setProcessing(true);
    try {
      const directIngs = sales.filter(s => s.is_direct_ingredient && s.matched_product_id);
      if (directIngs.length > 0) {
        const uniqueDirectIds = [...new Set(directIngs.map(s => s.matched_product_id!))];
        const productUpserts = uniqueDirectIds.map(id => {
          const s = directIngs.find(item => item.matched_product_id === id);
          return {
            id,
            name: s?.product_name || 'Hàng bán thẳng',
            is_active: true
          };
        });
        await supabase.from('products').upsert(productUpserts);
      }

      const uniqueDates = [...new Set(sales.map(s => s.sale_date))];
      const totalRevenue = sales.reduce((sum, s) => sum + (s.net_revenue || 0), 0);
      
      // 1. Delete existing sales for these dates to prevent duplicates
      for (const date of uniqueDates) {
        const { error: delErr } = await supabase.from('sales').delete().eq('sale_date', date);
        if (delErr) console.error(`Error clearing old sales for ${date}:`, delErr);
      }

      // 2. Insert new sales
      const salesInserts = sales.map(s => ({
        product_id: s.matched_product_id,
        quantity: s.quantity,
        sale_date: s.sale_date,
        processed: true
      }));
      
      if (salesInserts.length > 0) {
        const { error } = await supabase.from('sales').insert(salesInserts);
        if (error) throw error;
      }

      // 3. Sync stock transactions
      for (const date of uniqueDates) {
        await syncStockTransactions(date, totalRevenue);
      }

      alert('Đã import thành công!');
      setStep(1);
      setSales([]);
      setUsages([]);
      setUnmatched([]);
      setFilterDate(importDate);
      setActiveTab('history');
    } catch (err) {
      alert('Lỗi khi lưu dữ liệu!');
      console.error(err);
    }
    setProcessing(false);
  };

  const syncStockTransactions = async (date: string, totalRevenue?: number) => {
    // Tự động bảo toàn doanh thu cũ nếu không truyền totalRevenue (ví dụ khi sửa/xóa dòng đơn lẻ ở Lịch sử)
    let revenueToSave = totalRevenue;
    if (revenueToSave === undefined) {
      const { data } = await supabase
        .from('stock_transactions')
        .select('notes')
        .eq('transaction_date', date)
        .eq('type', 'SALES_USAGE')
        .is('ingredient_id', null)
        .limit(1);
      if (data && data[0]?.notes) {
        const match = data[0].notes.match(/^\[REVENUE: ([\d,.]+)\]/);
        if (match) {
          revenueToSave = parseFloat(match[1].replace(/,/g, ''));
        }
      }
    }

    // A. Xóa các giao dịch tiêu hao cũ của ngày này để tính lại từ đầu
    await supabase.from('stock_transactions').delete().eq('transaction_date', date).eq('type', 'SALES_USAGE');
    
    const { data: daySales } = await supabase.from('sales').select('product_id, quantity').eq('sale_date', date);
    if (!daySales || daySales.length === 0) {
      // Nếu không còn lượt bán nào mà có doanh thu lưu trữ trước đó, xóa sạch
      localStorage.removeItem(`daily_revenue_${date}`);
      return;
    }

    const qtyByProduct: Record<string, number> = {};
    daySales.forEach(s => { if (s.product_id) qtyByProduct[s.product_id] = (qtyByProduct[s.product_id] || 0) + s.quantity; });

    const productIds = Object.keys(qtyByProduct);
    const { data: allRecipes } = await supabase.from('recipes').select('*').limit(10000);
    const { data: allIngs } = await supabase.from('ingredients').select('id, name, substitute_id').limit(10000);
    if (!allIngs) return;

    // Fetch branches to identify sealed ones
    const { data: allBranches } = await supabase.from('branches').select('id, name');
    const sealedBranchIds = new Set(
      (allBranches || [])
        .filter(b => {
          const n = (b.name || '').toLowerCase();
          // Bảo mật: Không bao giờ niêm phong chi nhánh mặc định hoặc có tên "shop", "quầy", "vườn hoa"
          if (n.includes('quầy') || n.includes('shop') || n.includes('vườn hoa')) return false;
          return n.includes('niêm phong') || n.includes('sealed') || n.includes('lưu trữ') || n.includes('kho cũ');
        })
        .map(b => b.id)
    );
    console.log('Sealed Branch IDs:', Array.from(sealedBranchIds));

    const ingIds = new Set(allIngs.map(i => i.id));
    const ingredientsMap: Record<string, typeof allIngs[0]> = {};
    allIngs.forEach(i => { ingredientsMap[i.id] = i; });

    // 1. Tính toán Tồn kho khả dụng của từng nguyên liệu trước khi bán ngày date
    const dateObj = parseISO(date);
    const yearMonth = format(dateObj, 'yyyy-MM');

    // Fetch opening stock của tháng
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

    // Fetch audits trước ngày date (audit_date < date)
    const { data: auditsData } = await supabase
      .from('stock_audits')
      .select('ingredient_id, actual_stock, audit_date')
      .lt('audit_date', date)
      .order('audit_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10000);

    // Map chứa audit mới nhất trước ngày date của từng nguyên liệu
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

    // Xác định ngày audit sớm nhất trong map để fetch tx từ đó (tránh giới hạn 1000 row của Supabase)
    const monthStart = format(dateObj, 'yyyy-MM-01');
    const auditDates = Object.values(latestAuditMap).map(a => a.audit_date.slice(0, 10));
    // FIX: Luôn fetch từ đầu tháng để đảm bảo nguyên liệu không có audit không bị thiếu SALES_USAGE
    // Nếu có audit từ trước đầu tháng thì lấy từ ngày audit sớm nhất đó
    const earliestAuditDate = auditDates.length > 0
      ? auditDates.reduce((min, d) => d < min ? d : min, monthStart)
      : monthStart;

    const txFetchTo = date + 'T23:59:59+07:00';
    const { data: txsData } = await supabase
      .from('stock_transactions')
      .select('ingredient_id, type, quantity, transaction_date, branch_id')
      .gte('transaction_date', earliestAuditDate)
      .lte('transaction_date', txFetchTo)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10000);

    console.log(`[SYNC DEBUG] Date: ${date}, txFetchFrom: ${earliestAuditDate}, txFetchTo: ${txFetchTo}`);
    console.log(`[SYNC DEBUG] txsData count: ${txsData?.length ?? 'null'}`);
    if (txsData && txsData.length > 0) {
      console.log(`[SYNC DEBUG] tx[0]:`, JSON.stringify(txsData[0]));
      console.log(`[SYNC DEBUG] tx[last]:`, JSON.stringify(txsData[txsData.length - 1]));
    }


    // Tính toán Tồn kho khả dụng
    const availableStock: Record<string, number> = {};
    allIngs.forEach(ing => {
      const audit = latestAuditMap[ing.id];
      let stock = 0;
      if (audit) {
        stock = audit.actual_stock;
        const auditDate = audit.audit_date.slice(0, 10);
        const ingTxs = txsData?.filter(tx => tx.ingredient_id === ing.id) || [];
        
        // DEBUG: Log cho nguyên liệu có audit
        if (ingTxs.length > 0) {
          console.log(`[SYNC DEBUG] Ing "${ing.name}" | audit: ${auditDate} (${stock}) | txs after audit:`,
            ingTxs.filter(tx => tx.transaction_date.slice(0, 10) > auditDate).map(tx => `[${tx.type}] ${tx.quantity} @ ${tx.transaction_date.slice(0, 10)}`)
          );
        }

        ingTxs.forEach(tx => {
          const txDate = tx.transaction_date.slice(0, 10);
          if (txDate > auditDate) {
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
        // Không có audit: dùng tồn đầu tháng + tất cả tx từ đầu tháng đến ngày bán
        // FIX: Lọc theo monthStart để không phụ thuộc vào earliestAuditDate của nguyên liệu khác
        stock = openingMap[ing.id] ?? 0;
        if (txsData) {
          txsData.forEach(tx => {
            if (tx.ingredient_id === ing.id) {
              const txDate = tx.transaction_date.slice(0, 10);
              // Chỉ tính từ đầu tháng trở đi (openingMap đã bao gồm tồn trước tháng)
              if (txDate >= monthStart) {
                const qty = Number(tx.quantity);
                if (['IN', 'IN_TRANSFER'].includes(tx.type)) {
                  if (!tx.branch_id || !sealedBranchIds.has(tx.branch_id)) {
                    stock += qty;
                  }
                } else {
                  stock -= Math.abs(qty);
                }
              }
            }
          });
        }
      }
      availableStock[ing.id] = stock;
    });
    console.log('[SYNC DEBUG] availableStock sample:', JSON.stringify(Object.entries(availableStock).slice(0, 5)));

    // 2. Tính toán lượng tiêu hao định lượng thô dựa trên file bán hàng
    const totalUsage: Record<string, number> = {};

    const resolve = (pid: string, qty: number, visited: Set<string> = new Set()) => {
      if (visited.has(pid)) return;
      visited.add(pid);

      const productRows = (allRecipes || []) as unknown as { product_id: string; ingredient_id?: string; sub_product_id?: string; quantity: number }[];
      const matches = productRows.filter(r => r.product_id === pid);
      if (matches.length > 0) {
        matches.forEach(row => {
          if (row.ingredient_id) {
            totalUsage[row.ingredient_id] = (totalUsage[row.ingredient_id] || 0) + (row.quantity * qty);
          } else if (row.sub_product_id) {
            resolve(row.sub_product_id, row.quantity * qty, new Set(visited));
          }
        });
      } else if (ingIds.has(pid)) {
        totalUsage[pid] = (totalUsage[pid] || 0) + qty;
      }
    };

    productIds.forEach(pid => {
      const saleQty = qtyByProduct[pid];
      resolve(pid, saleQty);
    });

    // 3. Phân bổ tiêu hao dựa trên thuật toán FIFO Trừ Kho Thông Minh (Nguyên Liệu Thay Thế)
    const finalUsage: Record<string, number> = {};

    Object.entries(totalUsage).forEach(([ingId, qty]) => {
      let currentId = ingId;
      let needed = qty;
      const visitedChain = new Set<string>();

      while (needed > 0) {
        visitedChain.add(currentId);
        const ingredient = ingredientsMap[currentId];
        const stock = availableStock[currentId] ?? 0;
        const successorId = ingredient?.substitute_id;

        if (successorId && !visitedChain.has(successorId)) {
          // Có nguyên liệu thay thế cấu hình: Chỉ trừ tối đa số lượng tồn khả dụng (nếu > 0)
          const availableToTake = Math.max(0, stock);
          const taken = Math.min(needed, availableToTake);

          if (taken > 0) {
            finalUsage[currentId] = (finalUsage[currentId] || 0) + taken;
            needed -= taken;
            availableStock[currentId] -= taken;
          }

          if (needed > 0) {
            // Chuyển sang nguyên liệu thay thế kế nhiệm
            currentId = successorId;
          }
        } else {
          // Không còn nguyên liệu thay thế (hoặc bị vòng lặp vô hạn):
          // Trừ toàn bộ lượng còn thiếu vào nguyên liệu này (cho phép tồn âm)
          finalUsage[currentId] = (finalUsage[currentId] || 0) + needed;
          availableStock[currentId] -= needed;
          needed = 0;
        }
      }
    });

    // 4. Tạo các giao dịch stock_transactions loại SALES_USAGE
    const referenceId = crypto.randomUUID();
    const txInserts = Object.entries(finalUsage).map(([ingId, qty]) => ({
      ingredient_id: ingId,
      type: 'SALES_USAGE',
      quantity: -qty,
      transaction_date: date,
      notes: `Đồng bộ tiêu hao ngày ${date} (Tự động FIFO)`,
      created_by: user?.id,
      reference_id: referenceId,
      is_approved: true
    }));

    if (revenueToSave !== undefined && revenueToSave > 0) {
      txInserts.push({
        ingredient_id: null as any,
        type: 'SALES_USAGE',
        quantity: 0,
        transaction_date: date,
        notes: `[REVENUE: ${revenueToSave}]`,
        created_by: user?.id,
        reference_id: referenceId,
        is_approved: true
      });
      localStorage.setItem(`daily_revenue_${date}`, revenueToSave.toString());
    }

    if (txInserts.length > 0) await supabase.from('stock_transactions').insert(txInserts);
  };

  const fetchHistory = useCallback(async (date?: string) => {
    setLoadingHistory(true);
    const targetDate = date ?? filterDate;
    const { data, error } = await supabase
      .from('sales')
      .select('*, products(name)')
      .eq('sale_date', targetDate)
      .order('imported_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching sales history:', error);
      alert('Lỗi khi tải lịch sử bán hàng: ' + error.message);
    } else {
      setHistory(data as unknown as SaleRecord[]);
    }
    setLoadingHistory(false);
  }, [filterDate]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, filterDate, fetchHistory]);

  const handleDeleteSale = async (id: string) => {
    const saleToDelete = history.find(s => s.id === id);
    if (!saleToDelete) return;
    const saleDate = saleToDelete.sale_date;
    if (!confirm('Xóa dòng này?')) return;
    const { error } = await supabase.from('sales').delete().eq('id', id);
    if (!error) {
      await syncStockTransactions(saleDate);
      fetchHistory();
    } else alert('Lỗi!');
  };

  const handleUpdateSale = async (id: string) => {
    const saleToUpdate = history.find(s => s.id === id);
    if (!saleToUpdate) return;
    const saleDate = saleToUpdate.sale_date;
    const { error } = await supabase.from('sales').update({ quantity: editingQty }).eq('id', id);
    if (!error) {
      setEditingId(null);
      await syncStockTransactions(saleDate);
      fetchHistory();
    } else alert('Lỗi!');
  };

  return (
    <div className="container-fluid py-3 py-md-4">
      <div className="row align-items-center mb-4 g-3">
        <div className="col-12 col-md-auto me-auto">
          <h1 className="h3 fw-black text-dark mb-1">DOANH SỐ BÁN HÀNG</h1>
          <p className="text-secondary small mb-0">Quản lý dữ liệu bán hàng và khấu trừ nguyên liệu.</p>
        </div>
        {!canEdit && (
          <div className="col-auto">
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-3 py-2 fw-bold d-flex align-items-center gap-2">
              <Eye size={14} /> Chỉ xem
            </span>
          </div>
        )}
      </div>

      <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
        <div className="card-header bg-light p-2 border-0">
          <ul className="nav nav-pills nav-fill">
            {canEdit && (
              <li className="nav-item">
                <button
                  className={`nav-link rounded-pill fw-bold small transition-all ${activeTab === 'import' ? 'active shadow-sm' : 'text-secondary'}`}
                  onClick={() => setActiveTab('import')}
                >
                  <Upload size={16} className="me-2" /> Import POS (Excel)
                </button>
              </li>
            )}
            <li className="nav-item">
              <button
                className={`nav-link rounded-pill fw-bold small transition-all ${activeTab === 'history' ? 'active shadow-sm' : 'text-secondary'}`}
                onClick={() => setActiveTab('history')}
              >
                <Calendar size={16} className="me-2" /> Lịch Sử Bán Hàng
              </button>
            </li>
          </ul>
        </div>

        <div className="card-body p-3 p-md-4">
          {activeTab === 'import' ? (
            <div className="py-2">
              {step === 1 ? (
                <div className="row justify-content-center">
                  <div className="col-12 col-md-6 text-center">
                    <div className="rounded-3 p-4 mb-4" style={{ background: '#F0EDE4', border: '1px solid #DDD9CE' }}>
                      <label className="small fw-semibold text-secondary text-uppercase tracking-widest mb-3">Chọn ngày nhập số bán:</label>
                      <div className="input-group input-group-lg">
                        <span className="input-group-text"><Calendar size={24} /></span>
                        <input
                          type="date"
                          value={importDate}
                          onChange={e => setImportDate(e.target.value)}
                          className="form-control fw-bold"
                          style={{ fontSize: '1.25rem' }}
                        />
                      </div>
                    </div>

                    <div className="p-5 border-2 border-dashed rounded-4 bg-white text-center hover-shadow transition-all" 
                         style={{ cursor: 'pointer', borderColor: '#dee2e6' }}
                         onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="bg-primary bg-opacity-10 text-primary rounded-circle d-inline-flex align-items-center justify-content-center mb-4" style={{ width: '80px', height: '80px' }}>
                        <Upload size={40} />
                      </div>
                      <h4 className="fw-bold text-dark mb-2">Tải file POS lên</h4>
                      <p className="text-secondary small mb-4">Click để chọn file Excel (.xlsx, .xls)</p>
                      <input type="file" accept=".xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                      <button className="btn btn-primary btn-lg rounded-pill px-5 fw-bold shadow">Chọn File Excel</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="fw-bold text-dark mb-0">Kết quả xử lý file</h5>
                    <button onClick={() => setStep(1)} className="btn btn-sm btn-outline-danger rounded-pill px-3 fw-bold">Hủy và tải lại</button>
                  </div>

                  {unmatched.length > 0 && (
                    <div className="alert alert-warning border-0 shadow-sm rounded-4 mb-4">
                       <div className="d-flex align-items-center gap-2 fw-bold text-warning-emphasis mb-2">
                        <AlertCircle size={20} /> Sản phẩm không khớp ({unmatched.length})
                      </div>
                      <div className="p-3 bg-white bg-opacity-50 rounded-3 small text-dark border overflow-auto" style={{ maxHeight: '100px' }}>
                        {unmatched.map((u, idx) => (
                           <span key={idx} className="badge bg-light text-dark border me-1 mb-1">{u.product_name} x{u.quantity}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="row g-4 mb-4">
                    <div className="col-12 col-xl-6">
                      <div className="card h-100 border-0 shadow-sm rounded-4 overflow-hidden">
                        <div className="card-header bg-success bg-opacity-10 border-0 pt-3 px-4">
                           <h6 className="fw-bold text-success d-flex align-items-center gap-2 mb-0">
                            <CheckCircle2 size={18} /> Món Hợp Lệ ({sales.length})
                          </h6>
                        </div>
                        <div className="table-responsive" style={{ maxHeight: '400px' }}>
                          <table className="table table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
                            <thead className="table-light sticky-top">
                              <tr>
                                <th className="px-4 py-3 border-0">Ngày</th>
                                <th className="px-4 py-3 border-0">Tên Món</th>
                                <th className="px-4 py-3 border-0 text-end">Số lượng</th>
                              </tr>
                            </thead>
                            <tbody className="border-top-0">
                              {sales.map((s, idx) => (
                                <tr key={idx}>
                                  <td className="px-4 py-3 text-muted">{s.sale_date}</td>
                                  <td className="px-4 py-3 fw-bold">{s.product_name}</td>
                                  <td className="px-4 py-3 text-end font-monospace fw-black text-primary">{s.quantity}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="col-12 col-xl-6">
                      <div className="card h-100 border-0 shadow-sm rounded-4 overflow-hidden">
                        <div className="card-header bg-primary bg-opacity-10 border-0 pt-3 px-4">
                           <h6 className="fw-bold text-primary d-flex align-items-center gap-2 mb-0">
                            <TrendingDown size={18} /> Tổng Tiêu Hao Nguyên Liệu
                          </h6>
                        </div>
                        <div className="table-responsive" style={{ maxHeight: '400px' }}>
                          <table className="table table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
                            <thead className="table-light sticky-top">
                              <tr>
                                <th className="px-4 py-3 border-0">Nguyên Liệu</th>
                                <th className="px-3 py-3 border-0 text-end">Lượng dùng</th>
                              </tr>
                            </thead>
                            <tbody className="border-top-0">
                              {usages.length === 0 ? (
                                <tr><td colSpan={2} className="px-4 py-5 text-center text-muted italic">Không có dữ liệu</td></tr>
                              ) : (
                                usages.map((u, idx) => (
                                  <tr key={idx}>
                                    <td className="px-4 py-3 fw-bold">{u.name}</td>
                                    <td className="px-3 py-3 text-end fw-black text-danger">
                                      -{u.total_usage.toFixed(2)} <small className="fw-normal">{u.unit}</small>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card border-0 bg-primary bg-opacity-10 rounded-4 p-4 text-center border-start border-4 border-primary">
                    <button
                      onClick={confirmImport} disabled={processing}
                      className="btn btn-primary btn-lg rounded-pill px-5 fw-black shadow-lg hover-scale"
                    >
                      {processing ? <RefreshCw className="animate-spin" /> : 'XÁC NHẬN IMPORT VÀO KHO'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-2">
              <div className="rounded-3 mb-4 p-3" style={{ background: '#F0EDE4', border: '1px solid #DDD9CE' }}>
                <div className="row g-2 align-items-center">
                  <div className="col-12 col-md-auto">
                    <div className="d-flex align-items-center gap-2 small fw-semibold text-secondary text-uppercase tracking-widest ps-2">
                      Xem ngày:
                    </div>
                  </div>
                  <div className="col-12 col-md-4">
                    <div className="input-group">
                      <span className="input-group-text"><Calendar size={16} /></span>
                      <input
                        type="date"
                        value={filterDate}
                        onChange={e => setFilterDate(e.target.value)}
                        className="form-control"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="table-responsive rounded-3 overflow-hidden border">
                <table className="table table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
                  <thead className="table-light">
                    <tr>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Sản Phẩm</th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-center">Số lượng</th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="border-top-0 bg-white">
                    {loadingHistory ? (
                      <tr><td colSpan={3} className="px-4 py-5 text-center text-muted">Đang tải...</td></tr>
                    ) : history.length === 0 ? (
                      <tr><td colSpan={3} className="px-4 py-5 text-center text-muted">Không có dữ liệu.</td></tr>
                    ) : (
                      history.map(item => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 fw-bold text-dark">{item.products?.name || '---'}</td>
                          <td className="px-4 py-3 text-center">
                            {editingId === item.id ? (
                              <input
                                type="number"
                                value={editingQty}
                                onChange={e => setEditingQty(parseInt(e.target.value))}
                                onWheel={e => (e.target as HTMLInputElement).blur()}
                                onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                                className="form-control form-control-sm text-center fw-bold mx-auto border-primary"
                                style={{ maxWidth: '100px' }}
                              />
                            ) : (
                              <span className="h6 fw-black text-primary mb-0">{item.quantity}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-end">
                            <div className="d-flex justify-content-end gap-2">
                              {editingId === item.id ? (
                                <>
                                  <button onClick={() => handleUpdateSale(item.id)} className="btn btn-sm btn-success rounded-pill px-3 shadow-sm"><Save size={16} /></button>
                                  <button onClick={() => setEditingId(null)} className="btn btn-sm btn-light border rounded-pill px-3"><X size={16} /></button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => { setEditingId(item.id); setEditingQty(item.quantity); }} className="btn btn-sm btn-outline-primary border-0 rounded-circle p-2"><Edit2 size={16} /></button>
                                  <button onClick={() => handleDeleteSale(item.id)} className="btn btn-sm btn-outline-danger border-0 rounded-circle p-2"><Trash2 size={16} /></button>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}