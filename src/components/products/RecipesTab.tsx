import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Edit2, X, Search } from 'lucide-react';
import { Modal } from '../ui/Modal';

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
  const [formData, setFormData] = useState<{type: 'ingredient' | 'product', component_id: string, quantity: string}[]>([
    { type: 'ingredient', component_id: '', quantity: '0' }
  ]);

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
      setFormData(existingReqs.map(r => ({
        type: r.sub_product_id ? 'product' : 'ingredient',
        component_id: r.sub_product_id || r.ingredient_id,
        quantity: r.quantity.toString()
      })));
    } else {
      setFormData([{ type: 'ingredient', component_id: '', quantity: '0' }]);
    }
    setIsModalOpen(true);
  };

  const handleSaveRecipe = async () => {
    if (!selectedProduct) return;
    
    // Check validation
    const validData = formData.filter(f => f.component_id && (parseFloat(f.quantity) || 0) > 0);
    if (validData.length === 0) {
      alert('Vui lòng thêm ít nhất 1 thành phần có định lượng > 0');
      return;
    }

    // Delete old recipe lines
    await supabase.from('recipes').delete().eq('product_id', selectedProduct);
    
    // Insert new
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
      {/* Product List */}
      <div className="col-12 col-md-4 border-end">
        <div className="mb-3 space-y-2">
          <div className="input-group input-group-sm mb-2 shadow-sm">
            <span className="input-group-text bg-white border-end-0 text-muted"><Search size={14} /></span>
            <input
              id="main-search-input"
              type="text" 
              placeholder="Tìm kiếm SP..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="form-control border-start-0 ps-0"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="form-select form-select-sm shadow-sm"
          >
            <option value="">Tất cả danh mục SP</option>
            {productCategories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
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

      {/* Recipe Details */}
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
              <button 
                onClick={() => openModal(selectedProduct)} 
                className="btn btn-primary d-flex align-items-center gap-2 rounded-pill fw-bold shadow-sm px-4 btn-sm"
              >
                <Edit2 size={16} /> <span>Chỉnh sửa</span>
              </button>
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
              {formData.map((row, idx) => (
                <div key={idx} className="card border-0 bg-light p-3 rounded-4 shadow-hover-sm transition-all position-relative overflow-hidden mb-3">
                   <div className="row g-2 align-items-center">
                    <div className="col-12 col-md-2">
                       <label className="form-label mb-1 text-uppercase fw-bold text-secondary opacity-75" style={{ fontSize: '10px' }}>Loại</label>
                       <select 
                        className="form-select form-select-sm fw-bold"
                        value={row.type}
                        onChange={e => {
                          const newF = [...formData];
                          newF[idx].type = e.target.value as 'ingredient' | 'product';
                          newF[idx].component_id = '';
                          setFormData(newF);
                        }}
                       >
                         <option value="ingredient">Nguyên liệu</option>
                         <option value="product">Sản phẩm</option>
                       </select>
                    </div>
                    <div className="col-12 col-md-5">
                      <label className="form-label mb-1 text-uppercase fw-bold text-secondary opacity-75" style={{ fontSize: '10px' }}>{row.type === 'ingredient' ? 'Chọn Nguyên Liệu' : 'Chọn Sản Phẩm Con'}</label>
                      <select 
                        value={row.component_id} 
                        onChange={e => {
                          const newF = [...formData];
                          newF[idx].component_id = e.target.value;
                          setFormData(newF);
                        }}
                        className="form-select form-select-sm fw-bold border-primary-subtle"
                      >
                        <option value="">-- Chọn thành phần --</option>
                        {row.type === 'ingredient' ? (
                          <>
                            {categories.map(cat => {
                              const groupItems = ingredients.filter(i => i.category_id === cat.id);
                              if (groupItems.length === 0) return null;
                              return (
                                <optgroup key={cat.id} label={cat.name}>
                                  {groupItems.map(i => (
                                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                                  ))}
                                </optgroup>
                              );
                            })}
                            {ingredients.some(i => !i.category_id) && (
                              <optgroup label="Khác">
                                {ingredients
                                  .filter(i => !i.category_id)
                                  .map(i => (
                                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                                  ))
                                }
                              </optgroup>
                            )}
                          </>
                        ) : (
                          <>
                             {productCategories.map(cat => {
                              const groupItems = products.filter(p => p.category_id === cat.id && p.id !== selectedProduct);
                              if (groupItems.length === 0) return null;
                              return (
                                <optgroup key={cat.id} label={cat.name}>
                                  {groupItems.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.unit || '-'})</option>
                                  ))}
                                </optgroup>
                              );
                            })}
                             {products.some(p => !p.category_id && p.id !== selectedProduct) && (
                              <optgroup label="Khác">
                                {products
                                  .filter(p => !p.category_id && p.id !== selectedProduct)
                                  .map(p => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.unit || '-'})</option>
                                  ))
                                }
                              </optgroup>
                            )}
                          </>
                        )}
                      </select>
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
                    <div className="col-4 col-md-1 text-end pt-3 pt-md-0">
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
              ))}
            </div>
          </div>
          
          <div className="col-12 mt-2">
            <button 
              type="button" 
              onClick={() => setFormData([...formData, { type: 'ingredient', component_id: '', quantity: '0' }])}
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
