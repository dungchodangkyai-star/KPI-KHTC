import React from 'react';
import { Radio, Users, Clock, Shield, Monitor } from 'lucide-react';

export default function AdminOnline() {
  const dummySessions = [
    { id: 1, user: 'Nguyễn Văn A', email: 'nva@example.com', role: 'STAFF', ip: '192.168.1.105', device: 'Windows / Chrome', loginTime: '08:30:15', lastActive: 'Vừa xong', status: 'Online' },
    { id: 2, user: 'Khuất Văn Sơn', email: 'khvanson@gmail.com', role: 'ADMIN', ip: '192.168.1.20', device: 'MacOS / Safari', loginTime: '07:45:00', lastActive: '5 phút trước', status: 'Online' },
    { id: 3, user: 'Đặng Văn Định', email: 'dinhdv@gmail.com', role: 'LEADER', ip: '113.190.23.45', device: 'Windows / Edge', loginTime: '09:15:22', lastActive: 'Vừa xong', status: 'Online' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-green-600 bg-opacity-10 rounded-xl">
          <Radio className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Theo dõi phiên truy cập</h1>
          <p className="text-sm text-slate-500">Giám sát người dùng đang hoạt động trong hệ thống</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600">
            <Radio className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-500">Đang Online</div>
            <div className="text-2xl font-black text-slate-800">2</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-500">Tạm nghỉ (Idle)</div>
            <div className="text-2xl font-black text-slate-800">1</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-500">Tổng truy cập (Trong ngày)</div>
            <div className="text-2xl font-black text-slate-800">18</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="font-bold text-slate-800">Danh sách phiên hoạt động</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="p-4">Tài khoản</th>
                <th className="p-4">Thiết bị / IP</th>
                <th className="p-4">Thời gian đăng nhập</th>
                <th className="p-4">Hoạt động cuối</th>
                <th className="p-4">Trạng thái</th>
                <th className="p-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {dummySessions.map((session) => (
                <tr key={session.id} className="hover:bg-slate-50">
                  <td className="p-4">
                    <div className="font-bold text-slate-800">{session.user}</div>
                    <div className="text-xs text-slate-500">{session.email}</div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 text-slate-700">
                      <Monitor className="w-3 h-3 text-slate-400" /> {session.device}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{session.ip}</div>
                  </td>
                  <td className="p-4 text-slate-600">{session.loginTime}</td>
                  <td className="p-4 text-slate-600">{session.lastActive}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                      session.status === 'Online' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {session.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button className="text-xs font-bold text-red-600 hover:text-red-800 px-3 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                      Ngắt phiên
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
