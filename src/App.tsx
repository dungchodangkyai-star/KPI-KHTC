import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import InputWork from './pages/InputWork';
import MyWorks from './pages/MyWorks';
import OtRegister from './pages/OtRegister';
import OtMy from './pages/OtMy';
import OtPrint from './pages/OtPrint';
import PersonalKpi from './pages/PersonalKpi';
import Monitor from './pages/Monitor';
import Login from './pages/Login';
import AdminSync from './pages/AdminSync';
import AdminSettings from './pages/AdminSettings';
import AdminUsers from './pages/AdminUsers';
import OtSummary from './pages/OtSummary';
import AdminOnline from './pages/AdminOnline';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-4 md:p-8 h-full flex">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center flex flex-col items-center justify-center flex-1">
        <h2 className="text-2xl font-bold text-[#0f2440] mb-2">{title}</h2>
        <p className="text-slate-500">Màn hình đang được xây dựng theo kiến trúc mới.</p>
      </div>
    </div>
  );
}

// Helper to wrap protected routes
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/monitor" element={<ProtectedRoute><Monitor /></ProtectedRoute>} />
        <Route path="/input" element={<ProtectedRoute><InputWork /></ProtectedRoute>} />
        <Route path="/my-works" element={<ProtectedRoute><MyWorks /></ProtectedRoute>} />
        <Route path="/ot-register" element={<ProtectedRoute><OtRegister /></ProtectedRoute>} />
        <Route path="/ot-my" element={<ProtectedRoute><OtMy /></ProtectedRoute>} />
        <Route path="/ot-print" element={<ProtectedRoute><OtPrint /></ProtectedRoute>} />
        <Route path="/score-acd" element={<ProtectedRoute><Placeholder title="Chấm A/C/D" /></ProtectedRoute>} />
        <Route path="/kpi" element={<ProtectedRoute><PersonalKpi /></ProtectedRoute>} />
        <Route path="/print-personal" element={<ProtectedRoute><PersonalKpi /></ProtectedRoute>} />
        <Route path="/assign" element={<ProtectedRoute><Placeholder title="Giao việc" /></ProtectedRoute>} />
        <Route path="/approve" element={<ProtectedRoute><Placeholder title="Duyệt việc" /></ProtectedRoute>} />
        <Route path="/stats" element={<ProtectedRoute><Placeholder title="Thống kê - Báo cáo" /></ProtectedRoute>} />
        
        {/* Admin Routes */}
        <Route path="/ot-summary" element={<ProtectedRoute><OtSummary /></ProtectedRoute>} />
        <Route path="/admin/online" element={<ProtectedRoute><AdminOnline /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="/admin/sync" element={<ProtectedRoute><AdminSync /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
        
        {/* Redirect unknown routes to login for now */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
