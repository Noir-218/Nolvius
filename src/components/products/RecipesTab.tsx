import { useState, useEffect } from 'react';
import { useFacility } from '../../contexts/FacilityContext';
import { Edit2, X, Search } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { usePermissions } from '../../hooks/usePermissions';

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

export const RecipesTab = () => {
  const { facilityClient: supabase } = useFacility();
  const { canEdit } = usePermissions('products');
  const [products, setProducts] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  
  const [categories, setCategories] = useState<any[]>([]);
  const [productCategories, setProductCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<{
    type: 'ingredient' | 'product';
    component_id: string;
    quantity: string;
    searchTerm: string;
    isDropdownOpen: boolean;
    selectedIndex: number;
  }[]>([
    { type: 'ingredient', component_id: '', quantity: '0', searchTerm: '', isDropdownOpen: false, selectedIndex: -1 }
  ]);

  // Auto-scroll dropdown active item into view
  useEffect(() => {
    const activeItem = document.querySelector('.dropdown-active-item');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  });

  const fetchData = async () => {
    setLoading(true);
    const [pRes, iRes, rRes, icRes, pcRes] = await Promise.all([
      supabase.from('products').select('id, name, category_id, unit'),
      supabase.from('ingredients').select('id, name, unit, category_id'),
      supabase.from('recipes').select('*, ingredients(name, unit), products:sub_product_id(name, unit)'),
      supabase.from('ingredient_categories').select('id, name'),
      supabase.from('product_categories').select('id, name')
    ]);
    
    if (pRes.data) setProducts(pRes.data);
    if (iRes.data) setIngredients(iRes.data);
    if (rRes.data) setRecipes(rRes.data);
    if (icRes.data) setCategories(icRes.data);
    if (pcRes.data) setProductCategories(pcRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openModal = (productId: string) => {
    setSelectedProduct(productId);
    const existingReqs = recipes.filter(r => r.product_id === productId);
    if (existingReqs.length > 0) {
      setFormData(existingReqs.map(r => {
        const isProduct = !!r.sub_product_id;
        const compId = r.sub_product_id || r.ingredient_id;
        const name = isProduct ? (r.products?.name || '') : (r.ingredients?.name || '');
        return {
          type: isProduct ? 'product' : 'ingredient',
          component_id: compId,
          quantity: r.quantity.toString(),
          searchTerm: name,
          isDropdownOpen: false,
          selectedIndex: -1,
        };
      }));
    } else {
      setFormData([{ type: 'ingredient', component_id: '', quantity: '0', searchTerm: '', isDropdownOpen: false, selectedIndex: -1 }]);
    }
    setIsModalOpen(true);
  };

  const handleSaveRecipe = async () => {
    if (!selectedProduct) return;
    
    const validData = formData.filter(f => f.component_id && (parseFloat(f.quantity) || 0) > 0);
    if (validData.length === 0) {
      alert('Vui lòng thêm ít nhất 1 thành phần có định lượng > 0');
      return;
    }

    await supabase.from('recipes').delete().eq('product_id', selectedProduct);
    
    const inserts = validData.map(f => ({
      product_id: selectedProduct,
      ingredient_id: f.type === 'ingredient' ? f.component_id : null,
      sub_product_id: f.type === 'product' ? f.component_id : null,
      quantity: parseFloat(f.quantity) || 0
    }));
    await supabase.from('recipes').insert(inserts);
    
    setIsModalOpen(false);
    fetchData();
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = !search || unsignedString(p.name).includes(unsignedString(search));
    const matchesCategory = !filterCategory || p.category_id === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="row g-4">
      <div className="col-12 col-md-4 border-end">
        <div className="rounded-3 mb-3 p-3" style={{ background: '#F0EDE4', border: '1px solid #DDD9CE' }}>
          <div className="d-flex flex-column gap-2">
            <div className="input-group input-group-sm">
              <span className="input-group-text"><Search size={14} /></span>
              <input
                id="main-search-input"
                type="text" 
                placeholder="Tìm kiếm SP..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
                className="form-control"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="form-select form-select-sm"
            >
              <option value="">Tất cả danh mục SP</option>
              {productCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="list-group list-group-flush rounded-3 border shadow-sm overflow-auto" style={{ maxHeight: '600px' }}>
          {filteredProducts.map(p => {
            const hasRecipe = recipes.some(r => r.product_id === p.id);
            const isActive = selectedProduct === p.id;
            return (
              <button 
                key={p.id} 
                onClick={() => setSelectedProduct(p.id)}
                className={`list-group-item list-group-item-action border-start-4 transition-all py-3 ${isActive ? 'active border-primary shadow-sm bg-primary-subtle' : 'border-transparent'}`}
              >
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <div className={`fw-black mb-1 ${isActive ? 'text-primary' : 'text-dark text-uppercase small tracking-tight'}`}>{p.name}</div>
                    <div className="small">
                      {hasRecipe ? (
                        <span className="badge bg-success-subtle text-success border border-success fw-bold p-1 px-2" style={{fontSize: '9px'}}>ĐÃ CÓ CÔNG THỨC</span>
                      ) : (
                        <span className="badge bg-danger-subtle text-danger border border-danger fw-bold p-1 px-2" style={{fontSize: '9px'}}>CHƯA CÓ CÔNG THỨC</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="col-12 col-md-8">
        {selectedProduct ? (
          <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div className="card-header bg-white p-4 border-bottom d-flex justify-content-between align-items-center">
              <div>
                <h5 className="mb-0 fw-black text-dark text-uppercase tracking-widest">
                  Công thức: <span className="text-primary">{products.find(p => p.id === selectedProduct)?.name}</span>
                </h5>
                <p className="text-secondary small mb-0 mt-1 italic">Các nguyên liệu tiêu hao khi bán 1 sản phẩm này.</p>
              </div>
              {canEdit && (
                <button 
                  onClick={() => openModal(selectedProduct)} 
                  className="btn btn-primary d-flex align-items-center gap-2 rounded-pill fw-bold shadow-sm px-4 btn-sm"
                >
                  <Edit2 size={16} /> <span>Chỉnh sửa</span>
                </button>
              )}
            </div>
            
            <div className="card-body p-0">
              {loading ? (
                <div className="p-5 text-center text-muted">Đang tải...</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0" style={{ fontSize: '14px' }}>
                    <thead className="table-light">
                      <tr>
                        <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Thành Phần</th>
                        <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Loại</th>
                        <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Định Lượng</th>
                        <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Đơn Vị</th>
                      </tr>
                    </thead>
                    <tbody className="border-top-0">
                      {recipes.filter(r => r.product_id === selectedProduct).length === 0 ? (
                        <tr><td colSpan={3} className="px-4 py-5 text-center text-muted italic">Sản phẩm này chưa được thiết lập công thức.</td></tr>
                      ) : (
                        recipes.filter(r => r.product_id === selectedProduct).map((r, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-3 fw-bold text-dark">
                              {r.ingredients?.name || r.products?.name}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`badge rounded-pill fw-bold ${r.sub_product_id ? 'bg-info-subtle text-info border border-info' : 'bg-primary-subtle text-primary border border-primary'}`} style={{fontSize: '10px'}}>
                                {r.sub_product_id ? 'SẢN PHẨM' : 'NGUYÊN LIỆU'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-end fw-black text-primary fs-5">{r.quantity}</td>
                            <td className="px-4 py-3 text-secondary">
                              {r.ingredients?.unit || r.products?.unit || '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-100 d-flex flex-column align-items-center justify-content-center text-muted border-2 border-dashed rounded-4 bg-light bg-opacity-50 p-5 min-vh-50">
            <Search size={48} className="mb-3 opacity-25" />
            <p className="fw-bold mb-1">CHƯA CHỌN SẢN PHẨM</p>
            <p className="small italic text-center">Vui lòng chọn một đồ uống từ danh sách bên trái để xem hoặc cập nhật công thức pha chế.</p>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Chỉnh sửa công thức" size="lg">
        <div className="row g-3">
          <div className="col-12 pb-2 border-bottom">
            <h6 className="fw-black text-primary text-uppercase tracking-widest mb-1">SẢN PHẨM</h6>
            <p className="h5 fw-black text-dark mb-0">{products.find(p => p.id === selectedProduct)?.name}</p>
          </div>

          <div className="col-12">
            <div className="space-y-3">
              {formData.map((row, idx) => {
                const options = row.type === 'ingredient'
                  ? ingredients
                  : products.filter(p => p.id !== selectedProduct);

                const filteredOptions = options.filter(o =>
                  unsignedString(o.name).includes(unsignedString(row.searchTerm || ''))
                );

                const selectedItem = options.find(o => o.id === row.component_id);

                return (
                  <div key={idx} className="card border-0 bg-light p-3 rounded-4 shadow-hover-sm transition-all position-relative mb-3" style={{ overflow: 'visible' }}>
                    <div className="row g-2 align-items-start">
                      <div className="col-12 col-md-2">
                        <label className="form-label mb-1 text-uppercase fw-bold text-secondary opacity-75" style={{ fontSize: '10px' }}>Loại</label>
                        <select 
                          className="form-select form-select-sm fw-bold"
                          value={row.type}
                          onChange={e => {
                            const newF = [...formData];
                            newF[idx] = {
                              ...newF[idx],
                              type: e.target.value as 'ingredient' | 'product',
                              component_id: '',
                              searchTerm: '',
                              isDropdownOpen: false,
                              selectedIndex: -1,
                            };
                            setFormData(newF);
                          }}
                        >
                          <option value="ingredient">Nguyên liệu</option>
                          <option value="product">Sản phẩm</option>
                        </select>
                      </div>

                      <div className="col-12 col-md-5 position-relative">
                        <label className="form-label mb-1 text-uppercase fw-bold text-secondary opacity-75" style={{ fontSize: '10px' }}>
                          {row.type === 'ingredient' ? 'Tìm Nguyên Liệu' : 'Tìm Sản Phẩm Con'}
                        </label>
                        <div className="input-group input-group-sm">
                          <span className="input-group-text bg-white border-end-0 text-muted"><Search size={13} /></span>
                          <input
                            type="text"
                            className={`form-control border-start-0 ps-0 fw-bold ${row.component_id ? 'border-primary-subtle' : ''}`}
                            placeholder={row.type === 'ingredient' ? 'Gõ để tìm nguyên liệu...' : 'Gõ để tìm sản phẩm...'}
                            value={row.searchTerm || ''}
                            onChange={e => {
                              const term = e.target.value;
                              const newF = [...formData];
                              newF[idx] = {
                                ...newF[idx],
                                searchTerm: term,
                                isDropdownOpen: true,
                                component_id: term === '' ? '' : newF[idx].component_id,
                                selectedIndex: -1,
                              };
                              setFormData(newF);
                            }}
                            onFocus={() => {
                              const newF = [...formData];
                              newF[idx] = { ...newF[idx], isDropdownOpen: true };
                              setFormData(newF);
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                const newF = [...formData];
                                newF[idx] = { ...newF[idx], isDropdownOpen: false };
                                setFormData(newF);
                              }, 200);
                            }}
                            onKeyDown={e => {
                              if (!row.isDropdownOpen || filteredOptions.length === 0) return;
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                const newF = [...formData];
                                newF[idx] = { ...newF[idx], selectedIndex: ((row.selectedIndex ?? -1) + 1) % filteredOptions.length };
                                setFormData(newF);
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                const newF = [...formData];
                                newF[idx] = { ...newF[idx], selectedIndex: ((row.selectedIndex ?? -1) - 1 + filteredOptions.length) % filteredOptions.length };
                                setFormData(newF);
                              } else if (e.key === 'Enter' || e.key === 'Tab') {
                                const selIdx = row.selectedIndex ?? -1;
                                if (selIdx >= 0 && selIdx < filteredOptions.length) {
                                  e.preventDefault();
                                  const item = filteredOptions[selIdx];
                                  const newF = [...formData];
                                  newF[idx] = { ...newF[idx], component_id: item.id, searchTerm: item.name, isDropdownOpen: false, selectedIndex: -1 };
                                  setFormData(newF);
                                }
                              }
                            }}
                          />
                        </div>

                        {selectedItem && !row.isDropdownOpen && (
                          <div className="mt-1">
                            <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2" style={{ fontSize: '10px' }}>
                              ✓ {selectedItem.name} · {selectedItem.unit || '-'}
                            </span>
                          </div>
                        )}

                        {row.isDropdownOpen && (row.searchTerm || '').length > 0 && (
                          <div className="position-absolute w-100 shadow-lg bg-white rounded-3 overflow-hidden border" style={{ zIndex: 1060, left: 0, right: 0, top: 'calc(100% + 4px)' }}>
                            <div className="list-group list-group-flush" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                              {filteredOptions.length === 0 ? (
                                <div className="p-3 text-center text-muted small italic">Không tìm thấy kết quả</div>
                              ) : (
                                filteredOptions.map((o, oIdx) => (
                                  <button
                                    key={o.id}
                                    type="button"
                                    className={`list-group-item list-group-item-action border-0 py-2 px-3 small d-flex justify-content-between align-items-center ${row.selectedIndex === oIdx ? 'bg-light dropdown-active-item' : ''}`}
                                    onMouseDown={() => {
                                      const newF = [...formData];
                                      newF[idx] = { ...newF[idx], component_id: o.id, searchTerm: o.name, isDropdownOpen: false, selectedIndex: -1 };
                                      setFormData(newF);
                                    }}
                                  >
                                    <div>
                                      <span className="fw-bold">{o.name}</span>
                                      {row.type === 'ingredient' && (
                                        <div className="text-muted" style={{ fontSize: '10px' }}>
                                          {categories.find(c => c.id === o.category_id)?.name || 'Không có danh mục'}
                                        </div>
                                      )}
                                    </div>
                                    <span className="badge rounded-pill bg-light text-secondary">
                                      {o.unit || '-'}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="col-8 col-md-4">
                        <label className="form-label mb-1 text-uppercase fw-bold text-secondary opacity-75" style={{ fontSize: '10px' }}>Định lượng</label>
                        <div className="input-group input-group-sm">
                          <input 
                            type="number" step="0.000001" min="0" 
                            value={row.quantity} 
                            onChange={e => {
                              const newF = [...formData];
                              newF[idx].quantity = e.target.value;
                              setFormData(newF);
                            }}
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                            className="form-control text-end fw-black text-primary"
                            placeholder="Số lượng"
                          />
                          <span className="input-group-text bg-white small text-secondary">
                            {row.type === 'ingredient' 
                              ? (ingredients.find(i => i.id === row.component_id)?.unit || 'unit')
                              : (products.find(p => p.id === row.component_id)?.unit || 'unit')
                            }
                          </span>
                        </div>
                      </div>

                      <div className="col-4 col-md-1 text-end pt-3 pt-md-0 d-flex align-items-end justify-content-end">
                        <button 
                          onClick={() => setFormData(formData.filter((_, i) => i !== idx))}
                          className="btn btn-outline-danger border-0 rounded-circle p-2 hover-shadow"
                          title="Xóa dòng"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="col-12 mt-2">
            <button 
              type="button" 
              onClick={() => setFormData([...formData, { type: 'ingredient', component_id: '', quantity: '0', searchTerm: '', isDropdownOpen: false, selectedIndex: -1 }])}
              className="btn btn-outline-primary w-100 py-3 border-2 border-dashed rounded-4 fw-bold shadow-hover-sm transition-all"
            >
              + Thêm Thành Phần Mới
            </button>
          </div>
          
          <div className="col-12 d-flex justify-content-end gap-2 mt-4 pt-4 border-top">
            <button onClick={() => setIsModalOpen(false)} className="btn btn-light rounded-pill px-4 fw-bold">Hủy</button>
            <button onClick={handleSaveRecipe} className="btn btn-primary rounded-pill px-5 fw-black shadow-sm">
              LƯU CÔNG THỨC
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
