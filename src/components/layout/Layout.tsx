import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Activity, PlusCircle, List, 
  Clock, CheckCircle2, Printer, 
  Edit, Award, FileText, 
  Send, CheckSquare, Settings, 
  Database, Users, LayoutDashboard, BarChart3, Radio
} from 'lucide-react';
import { cn } from '../../utils';

const navGroups = [
  {
    title: 'CÔNG VIỆC HẰNG NGÀY',
    items: [
      { name: 'Theo dõi công việc', href: '/monitor', icon: Activity, desc: 'Theo dõi toàn phòng và cảnh báo' },
      { name: 'Nhập công việc', href: '/input', icon: PlusCircle, desc: 'Ghi nhận phát sinh' },
      { name: 'Công việc của tôi', href: '/my-works', icon: List, desc: 'Tra cứu đã nhập' },
    ]
  },
  {
    title: 'LÀM THÊM NGOÀI GIỜ',
    items: [
      { name: 'Đăng ký làm thêm', href: '/ot-register', icon: Clock, desc: 'Tạo đăng ký theo ngày' },
      { name: 'Làm thêm của tôi', href: '/ot-my', icon: CheckCircle2, desc: 'Theo dõi trạng thái' },
      { name: 'In làm thêm', href: '/ot-print', icon: Printer, desc: 'Bảng tổng hợp cá nhân' },
    ]
  },
  {
    title: 'KPI CÁ NHÂN',
    items: [
      { name: 'Chấm A/C/D', href: '/score-acd', icon: Edit, desc: 'Chấm và duyệt theo quyền được giao' },
      { name: 'KPI cá nhân', href: '/kpi', icon: Award, desc: 'Xem kết quả tháng' },
      { name: 'In phiếu KPI', href: '/print-personal', icon: FileText, desc: 'Tải/In phiếu cá nhân' },
    ]
  },
  {
    title: 'ĐIỀU HÀNH & PHÊ DUYỆT',
    items: [
      { name: 'Giao việc', href: '/assign', icon: Send, desc: 'Phân công nhiệm vụ' },
      { name: 'Duyệt việc', href: '/approve', icon: CheckSquare, desc: 'Phê duyệt công việc' },
    ]
  },
  {
    title: 'BÁO CÁO & TỔNG HỢP',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard, desc: 'Tổng quan tháng' },
      { name: 'Thống kê - Báo cáo', href: '/stats', icon: BarChart3, desc: 'Số liệu điều hành' },
      { name: 'In báo cáo phòng', href: '/print-department', icon: Printer, desc: 'Báo cáo KPI phòng' },
      { name: 'Tổng hợp làm thêm', href: '/ot-summary', icon: Database, desc: 'Bảng làm thêm toàn phòng' },
    ]
  },
  {
    title: 'QUẢN TRỊ HỆ THỐNG',
    items: [
      { name: 'Đang online', href: '/admin/online', icon: Radio, desc: 'Theo dõi phiên truy cập' },
      { name: 'Nhân sự/Tài khoản', href: '/admin/users', icon: Users, desc: 'Quản lý tài khoản và quyền' },
      { name: 'Đồng bộ dữ liệu', href: '/admin/sync', icon: Database, desc: 'Import từ Excel / App Script' },
      { name: 'Cài đặt danh mục', href: '/admin/settings', icon: Settings, desc: 'Cấu hình tham số' },
    ]
  }
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex h-screen w-full bg-[#f3f7fb] font-sans text-slate-800 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[280px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full shadow-[2px_0_8px_-4px_rgba(0,0,0,0.1)] z-20">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-4 pt-6">
            <h2 className="text-[#1F4E78] font-black text-sm mb-4 px-2 uppercase tracking-wide">CHỨC NĂNG HỆ THỐNG</h2>
            <div className="space-y-6">
              {navGroups.map((group, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between px-2 mb-2 cursor-pointer group">
                    <h3 className="text-xs font-bold text-[#1F4E78] uppercase tracking-wider">{group.title}</h3>
                    <span className="text-blue-400 group-hover:text-blue-600 transition-colors">⌃</span>
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const isActive = location.pathname === item.href;
                      return (
                        <Link
                          key={item.name}
                          to={item.href}
                          className={cn(
                            "flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 border",
                            isActive 
                              ? "bg-gradient-to-r from-[#1F4E78] to-[#2F75B5] text-white border-transparent shadow-md shadow-blue-900/20" 
                              : "bg-transparent text-slate-700 border-transparent hover:bg-slate-50 hover:border-slate-200"
                          )}
                        >
                          <div className={cn(
                            "mt-0.5 p-1 rounded-md flex items-center justify-center shrink-0 transition-colors",
                            isActive ? "bg-white/20 text-white" : "bg-blue-50 text-[#1F4E78]"
                          )}>
                            <item.icon className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-bold leading-tight">{item.name}</span>
                            <span className={cn(
                              "text-[10px] leading-tight mt-0.5",
                              isActive ? "text-blue-100" : "text-slate-500"
                            )}>
                              {item.desc}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400">© 2026 Hệ thống quản lý KPI.</p>
          <p className="text-[10px] text-slate-400">Tác giả: Khuất Văn Sơn</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header matching screenshot */}
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-10">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-slate-500 tracking-wide uppercase">Ban Quản lý dự án đầu tư xây dựng công trình giao thông và nông nghiệp phát triển nông thôn tỉnh Đắk Lắk</span>
            <span className="text-xl font-black text-[#0f2440] tracking-tight mt-0.5">HỆ THỐNG QUẢN LÝ CÔNG VIỆC VÀ ĐÁNH GIÁ KPI</span>
            <span className="text-[13px] font-bold text-slate-500 mt-0.5">Phòng Kế hoạch - Tài chính</span>
          </div>
          
          <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3 pl-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#17466e] to-[#2f75b5] shadow-sm flex items-center justify-center text-white font-black text-sm">
                KS
              </div>
              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#0f2440] text-[15px] leading-none">Khuất Văn Sơn</span>
                  <span className="bg-[#e9f2ff] text-[#1f4e78] text-[10px] font-black px-2 py-0.5 rounded-full border border-[#cfe1f7]">Quản trị</span>
                </div>
                <span className="text-xs text-slate-500 mt-1 leading-none">khvanson@gmail.com</span>
              </div>
            </div>
            <div className="h-8 w-px bg-slate-200 mx-1"></div>
            <div className="flex items-center gap-2 pr-1">
              <button className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold transition-colors">
                Đổi mã truy cập
              </button>
              <button className="px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg text-xs font-bold shadow-sm transition-colors">
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-4 md:p-6 custom-scrollbar">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}