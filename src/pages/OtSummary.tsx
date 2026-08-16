import React, { useState, useEffect } from 'react';
import { Printer, ArrowLeft, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { STANDARD_MONTHS } from '../utils';

export default function OtSummary() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [overtimes, setOvertimes] = useState<any[]>([]);
  
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  useEffect(() => {
    const fetchInit = async () => {
      try {
        const [resU, resO] = await Promise.all([
          fetch('/api/users'),
          fetch('/api/overtimes')
        ]);
        const [dU, dO] = await Promise.all([resU.json(), resO.json()]);
        if (dU.success) setUsers(dU.data || []);
        if (dO.success) setOvertimes(dO.data || []);
      } catch (e) {
        console.error(e);
      }
    };
    fetchInit();
  }, []);

  const calculateHours = (start: string, end: string) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 + m2/60) - (h1 + m1/60);
    return diff > 0 ? diff : 0;
  };

  // Group overtimes by user for the selected month
  const getSummaryData = () => {
    const filteredOvertimes = overtimes.filter(o => 
      o.month === selectedMonth && 
      (selectedUserId === 'all' || o.userId === Number(selectedUserId)) &&
      (selectedStatus === 'all' || (selectedStatus === 'approved' && o.status === 'Đã duyệt'))
    );

    const summaryMap = new Map();
    
    // Initialize users
    if (selectedUserId === 'all') {
      users.forEach(u => {
        summaryMap.set(u.id, { name: u.name, count: 0, days: new Set(), totalHours: 0, approvedHours: 0 });
      });
    } else {
      const u = users.find(u => u.id === Number(selectedUserId));
      if (u) summaryMap.set(u.id, { name: u.name, count: 0, days: new Set(), totalHours: 0, approvedHours: 0 });
    }

    // Accumulate
    filteredOvertimes.forEach(o => {
      if (!summaryMap.has(o.userId)) return;
      const stats = summaryMap.get(o.userId);
      stats.count += 1;
      stats.days.add(o.date);
      const hrs = calculateHours(o.startTime, o.endTime);
      stats.totalHours += hrs;
      if (o.status === 'Đã duyệt') {
        stats.approvedHours += hrs;
      }
    });

    // Convert to array and filter out zeros if needed (or keep them)
    return Array.from(summaryMap.values()).filter(s => s.count > 0);
  };

  const summaryData = getSummaryData();
  const grandTotalCount = summaryData.reduce((acc, s) => acc + s.count, 0);
  const grandTotalDays = summaryData.reduce((acc, s) => acc + s.days.size, 0); // Note: distinct days per user
  const grandTotalHours = summaryData.reduce((acc, s) => acc + s.totalHours, 0);
  const grandTotalApproved = summaryData.reduce((acc, s) => acc + s.approvedHours, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleExportWord = () => {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export HTML To Doc</title></head><body>";
    const footer = "</body></html>";
    const sourceHTML = header + document.getElementById("print-area")?.innerHTML + footer;
    
    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = 'Tong_Hop_Lam_Them.doc';
    fileDownload.click();
    document.body.removeChild(fileDownload);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6 print:hidden">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Tổng hợp làm thêm toàn phòng</h1>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col print:border-none print:shadow-none">
        
        {/* Filters */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-4 items-end print:hidden">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Tháng</label>
            <select 
              value={selectedMonth} 
              onChange={e => setSelectedMonth(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
            >
              {STANDARD_MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Nhân viên</label>
            <select 
              value={selectedUserId} 
              onChange={e => setSelectedUserId(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
            >
              <option value="all">Tất cả</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Dữ liệu</label>
            <select 
              value={selectedStatus} 
              onChange={e => setSelectedStatus(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
            >
              <option value="all">Tất cả đăng ký</option>
              <option value="approved">Chỉ đăng ký đã duyệt</option>
            </select>
          </div>
          <button className="px-4 py-2 bg-[#1F4E78] text-white rounded-lg text-sm font-bold shadow-sm">
            Tạo tổng hợp
          </button>
        </div>

        {/* Print Area */}
        <div className="p-8 overflow-y-auto bg-white flex-1 relative print:p-0 print:overflow-visible">
          <div id="print-area" className="max-w-4xl mx-auto font-serif text-[14px] leading-relaxed text-black">
            
            {/* Header */}
            <div className="flex justify-between mb-8 text-center">
              <div className="w-[45%]">
                <div className="font-bold">UBND TỈNH ĐẮK LẮK</div>
                <div className="font-bold">BAN QLDA ĐẦU TƯ XDCT</div>
                <div className="font-bold">GIAO THÔNG VÀ NÔNG NGHIỆP PTNT</div>
                <div className="mx-auto w-16 border-b border-black mt-1"></div>
              </div>
              <div className="w-[55%]">
                <div className="font-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                <div className="font-bold">Độc lập - Tự do - Hạnh phúc</div>
                <div className="mx-auto w-32 border-b border-black mt-1"></div>
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-6">
              <h2 className="text-[20px] font-bold">BẢNG TỔNG HỢP LÀM THÊM NGOÀI GIỜ TOÀN PHÒNG</h2>
            </div>

            {/* Info */}
            <div className="mb-4">
              <div><span className="font-bold">Đơn vị:</span> Phòng Kế hoạch - Tài chính</div>
              <div><span className="font-bold">Tháng:</span> {selectedMonth}</div>
            </div>

            {/* Table */}
            <table className="w-full border-collapse border border-black mb-4 text-[13px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-black p-2 text-center w-12">STT</th>
                  <th className="border border-black p-2 text-center">Nhân viên</th>
                  <th className="border border-black p-2 text-center w-28">Số dòng đăng ký</th>
                  <th className="border border-black p-2 text-center w-28">Số ngày làm thêm</th>
                  <th className="border border-black p-2 text-center w-24">Giờ đăng ký</th>
                  <th className="border border-black p-2 text-center w-28">Giờ được duyệt</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="border border-black p-4 text-center text-gray-500">
                      Không có dữ liệu làm thêm phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  summaryData.map((row, idx) => (
                    <tr key={idx}>
                      <td className="border border-black p-2 text-center">{idx + 1}</td>
                      <td className="border border-black p-2">{row.name}</td>
                      <td className="border border-black p-2 text-center">{row.count}</td>
                      <td className="border border-black p-2 text-center">{row.days.size}</td>
                      <td className="border border-black p-2 text-center">{row.totalHours}</td>
                      <td className="border border-black p-2 text-center">{row.approvedHours}</td>
                    </tr>
                  ))
                )}
                {summaryData.length > 0 && (
                  <tr className="font-bold">
                    <td colSpan={2} className="border border-black p-2 text-center">Tổng cộng</td>
                    <td className="border border-black p-2 text-center">{grandTotalCount}</td>
                    <td className="border border-black p-2 text-center">{grandTotalDays}</td>
                    <td className="border border-black p-2 text-center">{grandTotalHours}</td>
                    <td className="border border-black p-2 text-center">{grandTotalApproved}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Signatures */}
            <div className="flex justify-between text-center mt-8 pb-20">
              <div className="w-1/3">
                <div className="font-bold">NGƯỜI LẬP BẢNG</div>
                <div className="italic text-sm">(Ký, ghi rõ họ tên)</div>
                <div className="mt-20 border-b border-dotted border-gray-400 w-3/4 mx-auto"></div>
              </div>
              <div className="w-1/3">
                <div className="font-bold">LÃNH ĐẠO PHÒNG</div>
                <div className="italic text-sm">(Ký, ghi rõ họ tên)</div>
                <div className="mt-20 border-b border-dotted border-gray-400 w-3/4 mx-auto"></div>
              </div>
              <div className="w-1/3">
                <div className="font-bold">VĂN PHÒNG</div>
                <div className="italic text-sm">(Ký, ghi rõ họ tên)</div>
                <div className="mt-20 border-b border-dotted border-gray-400 w-3/4 mx-auto"></div>
              </div>
            </div>

          </div>
          
          <div className="max-w-4xl mx-auto mt-6 flex gap-3 print:hidden pb-10">
            <button 
              onClick={handlePrint}
              className="px-5 py-2.5 bg-[#1F4E78] text-white rounded-lg font-bold text-sm hover:bg-opacity-90 flex items-center gap-2 shadow-sm"
            >
              <Printer className="w-4 h-4" /> In / Lưu PDF
            </button>
            <button 
              onClick={handleExportWord}
              className="px-5 py-2.5 bg-blue-700 text-white rounded-lg font-bold text-sm hover:bg-opacity-90 flex items-center gap-2 shadow-sm"
            >
              <FileText className="w-4 h-4" /> Tải file Word
            </button>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          table { page-break-inside:auto }
          tr    { page-break-inside:avoid; page-break-after:auto }
          thead { display:table-header-group }
          tfoot { display:table-footer-group }
        }
      `}} />
    </div>
  );
}
