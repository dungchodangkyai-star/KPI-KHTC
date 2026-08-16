import React, { useState, useEffect } from 'react';
import { Printer, Calendar, ArrowLeft, Download, Check, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { STANDARD_MONTHS } from '../utils';

export default function OtPrint() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [overtimes, setOvertimes] = useState<any[]>([]);
  
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [selectedStatus, setSelectedStatus] = useState('approved');
  
  // Dummy "current user"
  const currentUser = users[0] || { name: 'Nguyễn Văn A', position: 'Chuyên viên' };

  useEffect(() => {
    const fetchInit = async () => {
      try {
        const [resU, resO] = await Promise.all([
          fetch('/api/users'),
          fetch('/api/overtimes')
        ]);
        const [dU, dO] = await Promise.all([resU.json(), resO.json()]);
        if (dU.success && dU.data?.length > 0) {
          setUsers(dU.data);
        }
        if (dO.success) setOvertimes(dO.data || []);
      } catch (e) {
        console.error(e);
      }
    };
    fetchInit();
  }, []);

  const printData = overtimes.filter(o => 
    o.month === selectedMonth && 
    o.userId === currentUser.id &&
    (selectedStatus === 'all' || (selectedStatus === 'approved' && o.status === 'Đã duyệt'))
  );

  const totalDays = new Set(printData.map(d => d.date)).size;
  
  const calculateHours = (start: string, end: string) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 + m2/60) - (h1 + m1/60);
    return diff > 0 ? diff : 0;
  };
  
  const totalHours = printData.reduce((acc, curr) => acc + calculateHours(curr.startTime, curr.endTime), 0);

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
    fileDownload.download = 'In_Lam_Them.doc';
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
          <h1 className="text-2xl font-black text-slate-800">In làm thêm cá nhân</h1>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col print:border-none print:shadow-none">
        
        {/* Filters (Hidden when printing) */}
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
            <label className="block text-xs font-bold text-slate-600 mb-1">Dữ liệu in</label>
            <select 
              value={selectedStatus} 
              onChange={e => setSelectedStatus(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
            >
              <option value="approved">Chỉ đăng ký đã duyệt</option>
              <option value="all">Tất cả đăng ký</option>
            </select>
          </div>
          <button className="px-4 py-2 bg-[#1F4E78] text-white rounded-lg text-sm font-bold shadow-sm">
            Tạo bảng in
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
              <h2 className="text-[20px] font-bold">BẢNG TỔNG HỢP LÀM THÊM NGOÀI GIỜ</h2>
            </div>

            {/* Info */}
            <div className="mb-4">
              <div><span className="font-bold">Đơn vị:</span> Phòng Kế hoạch - Tài chính</div>
              <div className="flex gap-8">
                <div><span className="font-bold">Họ và tên:</span> {currentUser?.name}</div>
                <div><span className="font-bold">Vị trí:</span> {currentUser?.position || 'Chuyên viên'}</div>
              </div>
              <div><span className="font-bold">Tháng:</span> {selectedMonth}</div>
            </div>

            {/* Table */}
            <table className="w-full border-collapse border border-black mb-4 text-[13px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-black p-2 text-center w-10">STT</th>
                  <th className="border border-black p-2 text-center w-24">Ngày làm thêm</th>
                  <th className="border border-black p-2 text-center w-24">Thời gian</th>
                  <th className="border border-black p-2 text-center w-16">Giờ ĐK</th>
                  <th className="border border-black p-2 text-center w-16">Giờ duyệt</th>
                  <th className="border border-black p-2 text-center">Nội dung đăng ký</th>
                  <th className="border border-black p-2 text-center w-32">Kết quả thực hiện</th>
                  <th className="border border-black p-2 text-center w-24">Minh chứng</th>
                  <th className="border border-black p-2 text-center w-20">Ghi chú duyệt</th>
                </tr>
              </thead>
              <tbody>
                {printData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="border border-black p-4 text-center text-gray-500">
                      Không có dữ liệu làm thêm phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  printData.map((row, idx) => {
                    const hours = calculateHours(row.startTime, row.endTime);
                    return (
                      <tr key={idx}>
                        <td className="border border-black p-2 text-center">{idx + 1}</td>
                        <td className="border border-black p-2 text-center">{new Date(row.date).toLocaleDateString('vi-VN')}</td>
                        <td className="border border-black p-2 text-center">{row.startTime} - {row.endTime}</td>
                        <td className="border border-black p-2 text-center">{hours}</td>
                        <td className="border border-black p-2 text-center">{row.status === 'Đã duyệt' ? hours : ''}</td>
                        <td className="border border-black p-2">{row.content}</td>
                        <td className="border border-black p-2">Đã hoàn thành</td>
                        <td className="border border-black p-2"></td>
                        <td className="border border-black p-2">{row.note}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Summary */}
            <div className="flex gap-6 font-bold mb-8">
              <div>Tổng số ngày làm thêm: {totalDays}</div>
              <div>Tổng giờ đăng ký: {totalHours}</div>
              <div>Tổng giờ được duyệt: {selectedStatus === 'approved' ? totalHours : printData.filter(d => d.status === 'Đã duyệt').reduce((acc, curr) => acc + calculateHours(curr.startTime, curr.endTime), 0)}</div>
            </div>

            {/* Signatures */}
            <div className="flex justify-between text-center mt-4 pb-20">
              <div className="w-1/3">
                <div className="font-bold">NGƯỜI ĐĂNG KÝ LÀM THÊM</div>
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
