import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { FacilityProvider } from './contexts/FacilityContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import FacilitySelect from './pages/FacilitySelect';
import Dashboard from './pages/Dashboard';
import Ingredients from './pages/Ingredients';
import Products from './pages/Products';
import Stock from './pages/Stock';
import Transactions from './pages/Transactions';
import Sales from './pages/Sales';
import Audit from './pages/Audit';
import Analysis from './pages/Analysis';
import Forecast from './pages/Forecast';
import Expenses from './pages/Expenses';
import Users from './pages/Users';
import Profile from './pages/Profile';
import Scheduling from './pages/Scheduling';
import DataSync from './pages/DataSync';

import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <AuthProvider>
      <FacilityProvider>
        <Toaster position="top-right" />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/select-facility" element={<FacilitySelect />} />
            
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="ingredients" element={<Ingredients />} />
              <Route path="products" element={<Products />} />
              <Route path="recipes" element={<Products />} />
              <Route path="stock" element={<Stock />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="sales" element={<Sales />} />
              <Route path="audit" element={<Audit />} />
              <Route path="analysis" element={<Analysis />} />
              <Route path="forecast" element={<Forecast />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="users" element={<Users />} />
              <Route path="profile" element={<Profile />} />
              <Route path="scheduling" element={<Scheduling />} />
              <Route path="sync" element={<DataSync />} />
            </Route>
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </FacilityProvider>
    </AuthProvider>
  );
}

export default App;
