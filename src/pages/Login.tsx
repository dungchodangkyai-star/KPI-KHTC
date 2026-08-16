import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate login and redirect to monitor
    navigate('/monitor');
  };

  return (
    <div className="min-h-screen bg-[#f3f7fb] flex flex-col font-sans">
      {/* Header matching Image 1 exactly */}
      <header className="bg-[#1F4E78] text-white py-6 text-center shadow-md">
        <h3 className="text-xs md:text-sm font-semibold uppercase tracking-wider mb-2 text-blue-100">
          Ban Quản lý dự án đầu tư xây dựng công trình giao thông và nông nghiệp phát triển nông thôn tỉnh Đắk Lắk
        </h3>
        <h1 className="text-2xl md:text-[32px] font-black uppercase tracking-tight mb-2 text-white">
          HỆ THỐNG QUẢN LÝ CÔNG VIỆC VÀ ĐÁNH GIÁ KPI
        </h1>
        <h3 className="text-sm md:text-[15px] font-bold text-blue-200">
          Phòng Kế hoạch - Tài chính
        </h3>
      </header>

      {/* Main Form Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-[20px] shadow-sm border border-slate-200 p-8 md:p-10 w-full max-w-4xl">
          <h2 className="text-[28px] font-black text-[#0f2440] mb-8">Đăng nhập hệ thống KPI</h2>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[15px] font-bold text-slate-800 mb-2">Email hoặc họ tên</label>
                <input 
                  type="text" 
                  defaultValue="khvanson@gmail.com"
                  className="w-full px-4 py-3 bg-[#f0f4f8] border border-transparent rounded-lg text-[15px] focus:bg-white focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[15px] font-bold text-slate-800 mb-2">Mật mã truy cập</label>
                <input 
                  type="password" 
                  defaultValue="12345678"
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-[15px] focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] outline-none transition-all"
                />
              </div>
            </div>

            <button 
              type="submit"
              className="bg-[#1F4E78] hover:bg-[#173a5a] text-white px-6 py-2.5 rounded-lg text-[15px] font-bold transition-colors shadow-sm"
            >
              Đăng nhập
            </button>
          </form>

          <div className="mt-8 bg-[#f8fafc] border border-slate-200 rounded-xl p-5 text-[14px] text-slate-600">
            <p className="mb-1">Nếu quên tên đăng nhập hoặc mật mã truy cập, vui lòng liên hệ quản trị hệ thống để được hỗ trợ.</p>
            <p>
              <strong className="text-slate-800">Quản trị hệ thống:</strong> Khuất Văn Sơn | 
              <strong className="text-slate-800 ml-1">ĐT:</strong> 0906234585 | 
              <strong className="text-slate-800 ml-1">Email:</strong> khvanson@gmail.com
            </p>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-slate-500">
        © 2026 Hệ thống quản lý và đánh giá KPI. Tác giả: Khuất Văn Sơn | ĐT: 0906234585 | Email: khvanson@gmail.com
      </footer>
    </div>
  );
}