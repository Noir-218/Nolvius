import { useState, useEffect } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { ProductsTab } from '../components/products/ProductsTab';
import { CategoriesTab } from '../components/products/CategoriesTab';
import { RecipesTab } from '../components/products/RecipesTab';
import { useAuth } from '../contexts/AuthContext';

const Products = () => {
  const { role } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'recipes'>(
    location.pathname.includes('recipes') ? 'recipes' : 'products'
  );

  useEffect(() => {
    if (location.pathname.includes('recipes')) {
      setActiveTab('recipes');
    } else if (location.pathname.includes('products')) {
      setActiveTab('products');
    }
  }, [location.pathname]);

  if (role === 'staff') return <Navigate to="/audit" replace />;

  const tabs = [
    { id: 'products', label: 'Sản Phẩm' },
    { id: 'categories', label: 'Danh Mục' },
    { id: 'recipes', label: 'Công Thức Pha Chế' },
  ] as const;

  return (
    <div className="container-fluid py-4">
      <div className="row g-3 align-items-center mb-4 text-center text-md-start">
        <div className="col-12 col-md-auto me-auto">
          <h1 className="h3 fw-black text-dark mb-1">QUẢN LÝ ĐỒ UỐNG & SẢN PHẨM</h1>
          <p className="text-secondary small mb-0">Danh sách món, giá bán và công thức chuẩn để trừ tự động vào kho.</p>
        </div>
      </div>

      <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
        <div className="card-header bg-light p-2 border-0 shadow-sm">
          <ul className="nav nav-pills nav-fill bg-light p-0">
            {tabs.map((tab) => (
              <li key={tab.id} className="nav-item">
                <button
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`nav-link rounded-pill fw-bold small transition-all py-2 ${activeTab === tab.id ? 'active shadow-sm' : 'text-secondary hover-bg-light'}`}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card-body p-3 p-md-4">
          <div className="mt-2 transition-all">
            {activeTab === 'products' && <ProductsTab />}
            {activeTab === 'categories' && <CategoriesTab />}
            {activeTab === 'recipes' && <RecipesTab />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Products;
