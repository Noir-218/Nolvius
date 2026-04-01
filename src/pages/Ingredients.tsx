import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SuppliersTab } from '../components/ingredients/SuppliersTab';
import { CategoriesTab } from '../components/ingredients/CategoriesTab';
import { IngredientsTab } from '../components/ingredients/IngredientsTab';
import { OrderTypesTab } from '../components/ingredients/OrderTypesTab';
import { Package, FolderTree, Truck, ClipboardList } from 'lucide-react';

const Ingredients = () => {
  const { role } = useAuth();
  if (role === 'staff') return <Navigate to="/audit" replace />;
  const [activeTab, setActiveTab] = useState<'ingredients' | 'categories' | 'order-types' | 'suppliers'>('ingredients');

  const tabs = [
    { id: 'ingredients', label: 'Nguyên Liệu', icon: Package },
    { id: 'categories', label: 'Danh Mục', icon: FolderTree },
    { id: 'order-types', label: 'Loại Đơn Hàng', icon: ClipboardList },
    { id: 'suppliers', label: 'Nhà Cung Cấp', icon: Truck },
  ] as const;

  return (
    <div className="container-fluid py-4">
      <div className="mb-4">
        <h1 className="h3 fw-black text-dark mb-1">QUẢN LÝ NGUYÊN VẬT LIỆU</h1>
        <p className="text-secondary small mb-0">Quản lý danh sách nguyên liệu, danh mục, loại đơn và nhà cung cấp.</p>
      </div>

      <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
        <div className="card-header bg-light p-2 border-0">
          <ul className="nav nav-pills nav-fill bg-light p-0">
            {tabs.map((tab) => (
              <li className="nav-item" key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`nav-link rounded-pill fw-bold small transition-all py-2 ${
                    activeTab === tab.id 
                      ? 'active shadow-sm' 
                      : 'text-secondary hover-bg-light'
                  }`}
                >
                  <tab.icon size={16} className="me-2 d-none d-sm-inline-block" />
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card-body p-3 p-md-4">
          <div className="tab-content transition-all duration-300">
            {activeTab === 'ingredients' && <IngredientsTab />}
            {activeTab === 'categories' && <CategoriesTab />}
            {activeTab === 'order-types' && <OrderTypesTab />}
            {activeTab === 'suppliers' && <SuppliersTab />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Ingredients;
