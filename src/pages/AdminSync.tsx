import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Database, Upload, Download, CheckCircle2, AlertCircle, RefreshCw, FileDown } from 'lucide-react';

const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwl6pG6LVw8oAXIX00pgNOpj4Q2pjSg-g75Za0UCjDp5H3140QzPO3fMFV7sje7aFWt/exec';

export default function AdminSync() {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [dataPreview, setDataPreview] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: KH_Cong_viec_Ngay
    const ws1 = XLSX.utils.json_to_sheet([{
      'Mã việc': 'A8-GV-2026-001',
      'Người nhận': 'nva@example.com',
      'Nhóm việc': 'Kế hoạch vốn',
      'Nội dung': 'Theo dõi kế hoạch vốn theo dự án',
      'Điểm chuẩn (Đc)': 10,
      'Tính chất': 'Trung bình',
      'Ngày giao': '01/08/2026',
      'Deadline': '15/08/2026',
      'Loại sản phẩm': 'Bảng tổng hợp'
    }]);
    XLSX.utils.book_append_sheet(wb, ws1, "KH_Cong_viec_Ngay");

    // Sheet 2: DM_Nhan_su
    const ws2 = XLSX.utils.json_to_sheet([{
      'Họ và tên': 'Nguyễn Văn A',
      'Email': 'nva@example.com',
      'Chức vụ': 'Chuyên viên',
      'Nhóm': 'Tài chính',
      'Vai trò': 'STAFF'
    }]);
    XLSX.utils.book_append_sheet(wb, ws2, "DM_Nhan_su");

    XLSX.writeFile(wb, "Mau_Dong_Bo_Du_Lieu.xlsx");
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncStatus('processing');
    setLogs([]);
    setDataPreview([]);
    addLog(`Đang đọc file Excel: ${file.name}...`);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        
        addLog(`Đã tải thành công workbook. Gồm ${wb.SheetNames.length} sheet.`);
        
        // Find specific target sheets
        const worksSheetName = wb.SheetNames.find(n => n.includes('KH_Cong_viec_Ngay') || n.includes('KH_CV'));
        const usersSheetName = wb.SheetNames.find(n => n.includes('DM_Nhan_su') || n.includes('DM Nhân sự'));
        
        let worksData: any[] = [];
        let usersData: any[] = [];

        if (worksSheetName) {
           addLog(`Tìm thấy sheet công việc: "${worksSheetName}". Đang bóc tách...`);
           // KPI V8 uses row 3 as header (0-indexed 2)
           worksData = XLSX.utils.sheet_to_json(wb.Sheets[worksSheetName], { range: 2 });
           addLog(`Đã đọc ${worksData.length} dòng dữ liệu công việc.`);
        } else {
           addLog(`Không tìm thấy sheet KH_Cong_viec_Ngay. Đọc mặc định từ sheet 1.`);
           worksData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { range: 2 });
        }

        if (usersSheetName) {
           addLog(`Tìm thấy sheet nhân sự: "${usersSheetName}". Đang bóc tách...`);
           usersData = XLSX.utils.sheet_to_json(wb.Sheets[usersSheetName], { range: 2 });
           addLog(`Đã đọc ${usersData.length} tài khoản nhân sự.`);
        }

        setDataPreview(worksData.slice(0, 10)); // show top 10 rows
        
        addLog('Bắt đầu đồng bộ Nhân sự vào Database PostgreSQL...');
        
        // 1. Sync Users
        const usersRes = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'users', data: usersData })
        });
        const usersResult = await usersRes.json();
        if (usersResult.error) throw new Error(usersResult.error);
        addLog(`✅ Đã đồng bộ xong ${usersData.length} nhân sự.`);

        addLog('Bắt đầu đồng bộ Công việc vào Database PostgreSQL...');
        
        // 2. Sync Works
        const worksRes = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'works', data: worksData })
        });
        const worksResult = await worksRes.json();
        if (worksResult.error) throw new Error(worksResult.error);
        
        setSyncStatus('success');
        addLog(`✅ Đồng bộ công việc thành công: ${worksResult.message || 'Dữ liệu đã được cập nhật!'}`);
        addLog(`Dữ liệu xem trước bên dưới là báo cáo THẬT được trích xuất từ file Excel của bạn.`);

      } catch (err) {
        setSyncStatus('error');
        addLog(`Lỗi xử lý file Excel: ${String(err)}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleAppScriptSync = async () => {
    setSyncStatus('processing');
    setLogs([]);
    setDataPreview([]);
    addLog(`Đang kết nối tới App Script (Backend V8.9)...`);
    
    try {
      addLog(`Gửi tín hiệu lấy dữ liệu qua Proxy...`);
      // Send a ping to check the connection and get basic info via our backend proxy
      const res = await fetch(`/api/appscript?ping=1`);
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.error) {
         throw new Error(data.error);
      }

      addLog(`Kết nối thành công!`);
      addLog(`Trạng thái: ${data.message || 'Hệ thống OK'}`);
      addLog(`Phiên bản đang chạy: ${data.version || 'Không xác định'}`);
      
      if (data.sheets) {
        const sheetsCount = Object.keys(data.sheets).length;
        addLog(`Phát hiện ${sheetsCount} bảng dữ liệu (Sheets) trên Cloud.`);
      }

      setDataPreview([data]); // Show raw status data in preview for now
      setSyncStatus('success');
    } catch (err) {
      setSyncStatus('error');
      addLog(`Lỗi kết nối: ${String(err)}`);
    }
  };

  return (
    <div className="max-w-[1200px] h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#0f2440]">Đồng bộ dữ liệu (Sync)</h1>
          <p className="text-slate-500 mt-1">Import dữ liệu từ file Excel (.xlsx) cũ hoặc kết nối Backend App Script</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Panel */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col gap-6">
          <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm border border-blue-100 flex gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>
              <strong>Hướng dẫn:</strong><br />
              Tải file Excel báo cáo cũ lên đây, hoặc nhấn <strong>Kết nối App Script</strong> để tự động kéo dữ liệu từ hệ thống của bạn qua Web App URL.
            </p>
          </div>

          <div 
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx, .xls, .csv"
              className="hidden" 
            />
            <div className="w-12 h-12 bg-blue-100 text-[#1F4E78] rounded-full flex items-center justify-center mb-3">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-700">Tải lên file Excel/CSV</h3>
            <p className="text-xs text-slate-500 mt-1">Hỗ trợ .xlsx, .xls, .csv</p>
          </div>

          <div className="flex flex-col gap-3 mt-auto">
             <button 
                onClick={handleDownloadTemplate}
               className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors"
             >
               <FileDown className="w-4 h-4" /> Tải file mẫu đồng bộ
             </button>
             <button 
               onClick={handleAppScriptSync}
               className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition-colors"
             >
               <RefreshCw className="w-4 h-4" /> Kết nối App Script (Kéo dữ liệu)
             </button>
          </div>
        </div>

        {/* Logs and Preview */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[250px]">
             <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
               <h3 className="font-bold text-slate-700 text-sm">Tiến trình hệ thống</h3>
               {syncStatus === 'processing' && <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />}
               {syncStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
             </div>
             <div className="flex-1 p-4 bg-slate-900 text-green-400 font-mono text-xs overflow-y-auto custom-scrollbar">
               {logs.length === 0 ? (
                 <div className="text-slate-500 italic">Chưa có tiến trình nào chạy...</div>
               ) : (
                 logs.map((l, i) => <div key={i}>{l}</div>)
               )}
             </div>
          </div>

          {dataPreview.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                <h3 className="font-bold text-slate-700 text-sm">Xem trước dữ liệu</h3>
              </div>
              <div className="p-0 overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-sm min-w-max">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      {Object.keys(dataPreview[0]).map((key) => (
                        <th key={key} className="p-3 border-r border-slate-200 last:border-0">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataPreview.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        {Object.values(row).map((val: any, idx) => (
                          <td key={idx} className="p-3 text-slate-700 border-r border-slate-100 last:border-0 truncate max-w-[300px]">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
