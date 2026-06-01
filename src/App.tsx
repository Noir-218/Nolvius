import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
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
import Lounge from './pages/Lounge';
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
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
            <Route path="lounge" element={<Lounge />} />
          </Route>
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
