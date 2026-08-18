import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Save, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  FileText, 
  Layout, 
  MapPin, 
  UserCheck, 
  ShieldCheck, 
  Eye, 
  Info,
  Check,
  ChevronRight
} from 'lucide-react';
import { OrgConfig } from '../types';
import { DEFAULT_ORG_CONFIG, ORG_CONFIG_PRESETS, OrgPreset } from '../utils';
import { useOrgConfig } from '../contexts/OrgContext';

export default function OrgConfigSettings() {
  const { orgConfig, updateOrgConfig, resetOrgConfig, loading: contextLoading } = useOrgConfig();
  
  const [formData, setFormData] = useState<OrgConfig>(orgConfig || DEFAULT_ORG_CONFIG);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  useEffect(() => {
    if (orgConfig) {
      setFormData(orgConfig);
    }
  }, [orgConfig]);

  const handleApplyPreset = (preset: OrgPreset) => {
    setSelectedPresetId(preset.id);
    setFormData({
      ...preset.config
    });
    setMessage({
      type: 'success',
      text: `Đã áp dụng mẫu cấu hình: "${preset.name}". Nhấn "Lưu & Áp dụng" bên dưới để lưu vào hệ thống.`
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const res = await updateOrgConfig(formData);
      if (res.success) {
        setMessage({
          type: 'success',
          text: 'Đã lưu và áp dụng thông tin Cơ quan / Đơn vị thành công cho toàn bộ hệ thống (Header, Menu, Phiếu in, Báo cáo)!'
        });
      } else {
        setMessage({
          type: 'error',
          text: res.error || 'Có lỗi xảy ra khi lưu cấu hình.'
        });
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Lỗi kết nối khi lưu cấu hình.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Khôi phục cấu hình Cơ quan - Đơn vị về mặc định ban đầu?')) return;
    try {
      setResetting(true);
      setMessage(null);
      const res = await resetOrgConfig();
      if (res.success) {
        setFormData(DEFAULT_ORG_CONFIG);
        setSelectedPresetId('bql_khtc');
        setMessage({
          type: 'success',
          text: 'Đã khôi phục cấu hình Cơ quan - Đơn vị về mặc định!'
        });
      } else {
        setMessage({
          type: 'error',
          text: res.error || 'Không thể khôi phục mặc định.'
        });
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Lỗi khi khôi phục dữ liệu.' });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Introduction Banner */}
      <div className="bg-gradient-to-r from-[#1F4E78] to-[#2F75B5] rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-white/10 rounded-2xl backdrop-blur-xs border border-white/20">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Cấu hình Đơn vị, Cơ quan & Thông tin In ấn</h2>
              <p className="text-sm text-blue-100 mt-1 max-w-2xl">
                Tùy biến tên Cơ quan cấp trên, tên Phòng ban, Tiêu đề hệ thống, địa danh và các chức danh ký duyệt trên toàn bộ giao diện và các biểu mẫu in ấn (KPI, Làm thêm, Báo cáo).
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting || saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition border border-white/20"
            >
              <RotateCcw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
              Khôi phục mặc định
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || resetting}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-black shadow-md transition"
            >
              <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
              {saving ? 'Đang lưu...' : 'Lưu & Áp dụng'}
            </button>
          </div>
        </div>
      </div>

      {/* Alert Notification */}
      {message && (
        <div className={`p-4 rounded-2xl flex items-start gap-3 border transition-all ${
          message.type === 'success' 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-300' 
            : 'bg-rose-50 text-rose-900 border-rose-300'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-bold text-sm leading-relaxed">
            {message.text}
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600">
            &times;
          </button>
        </div>
      )}

      {/* 1. PRESET TEMPLATES (Mẫu gợi ý 1 chạm) */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="font-black text-slate-800 text-base">Gợi ý mẫu cấu hình nhanh (1 chạm)</h3>
          </div>
          <span className="text-xs font-bold text-slate-500">
            Chọn mẫu phù hợp để điền nhanh toàn bộ tham số
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {ORG_CONFIG_PRESETS.map((preset) => {
            const isSelected = selectedPresetId === preset.id || 
              (formData.departmentName === preset.config.departmentName && formData.parentAgency === preset.config.parentAgency);

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className={`text-left p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                  isSelected 
                    ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-300 shadow-sm' 
                    : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50 shadow-2xs'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-0 right-0 bg-[#1F4E78] text-white p-1 rounded-bl-xl">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {preset.category}
                    </span>
                    <span className="text-[10px] font-bold text-[#1F4E78]">
                      Mã: {preset.config.shortName}
                    </span>
                  </div>
                  <h4 className="font-extrabold text-sm text-slate-900 leading-snug">
                    {preset.name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    {preset.config.parentAgency}
                  </p>
                </div>
                
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-[#1F4E78]">{preset.config.departmentName}</span>
                  <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                    Áp dụng <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. FORM CONFIGURATION FIELDS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Input Form (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section A: Tên cơ quan & Đơn vị */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs">
            <h3 className="text-sm font-black text-[#1F4E78] uppercase tracking-wider flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-[#1F4E78]" />
              1. Tên Cơ quan & Đơn vị / Phòng ban
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên Cơ quan / Đơn vị cấp trên <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={formData.parentAgency || ''} 
                  onChange={e => setFormData({ ...formData, parentAgency: e.target.value })}
                  placeholder="Ví dụ: Ban Quản lý dự án ĐTXD CT Giao thông và NN PTNT tỉnh Đắk Lắk"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:bg-white focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] transition"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Hiển thị trên dòng tiêu đề cấp trên của Web App và góc trái trên cùng các biểu mẫu văn bản in ấn.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên Đơn vị / Phòng ban sử dụng <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={formData.departmentName || ''} 
                    onChange={e => setFormData({ ...formData, departmentName: e.target.value })}
                    placeholder="Ví dụ: Phòng Kế hoạch - Tài chính"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-[#1F4E78] focus:bg-white focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên viết tắt / Mã phòng
                  </label>
                  <input 
                    type="text" 
                    value={formData.shortName || ''} 
                    onChange={e => setFormData({ ...formData, shortName: e.target.value })}
                    placeholder="Ví dụ: KHTC"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 text-center focus:bg-white focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] transition uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tiêu đề Web App hiển thị
                </label>
                <input 
                  type="text" 
                  value={formData.systemTitle || ''} 
                  onChange={e => setFormData({ ...formData, systemTitle: e.target.value })}
                  placeholder="Ví dụ: HỆ THỐNG QUẢN LÝ CÔNG VIỆC VÀ ĐÁNH GIÁ KPI"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-extrabold text-slate-800 uppercase focus:bg-white focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] transition"
                />
              </div>
            </div>
          </div>

          {/* Section B: Thông tin In ấn & Chức danh Ký duyệt */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs">
            <h3 className="text-sm font-black text-[#1F4E78] uppercase tracking-wider flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
              <FileText className="w-4 h-4 text-[#1F4E78]" />
              2. Địa danh & Chức danh Ký duyệt trên Biểu mẫu in ấn
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                  Địa danh ký duyệt (Tỉnh / Thành phố / Huyện)
                </label>
                <input 
                  type="text" 
                  value={formData.location || ''} 
                  onChange={e => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Ví dụ: Đắk Lắk, TP. Buôn Ma Thuột, Hà Nội..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:bg-white focus:border-[#1F4E78] transition"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Được dùng để tự động điền phần ngày tháng ký: <em>"{formData.location || 'Đắk Lắk'}, ngày ... tháng ... năm ..."</em>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cột ký 1 (Người lập)
                  </label>
                  <input 
                    type="text" 
                    value={formData.creatorTitle || ''} 
                    onChange={e => setFormData({ ...formData, creatorTitle: e.target.value })}
                    placeholder="NGƯỜI LẬP BIỂU"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 text-xs focus:bg-white focus:border-[#1F4E78] transition uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cột ký 2 (Trưởng phòng)
                  </label>
                  <input 
                    type="text" 
                    value={formData.approverTitle || ''} 
                    onChange={e => setFormData({ ...formData, approverTitle: e.target.value })}
                    placeholder="TRƯỞNG PHÒNG"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 text-xs focus:bg-white focus:border-[#1F4E78] transition uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cột ký 3 (Lãnh đạo đơn vị)
                  </label>
                  <input 
                    type="text" 
                    value={formData.leaderTitle || ''} 
                    onChange={e => setFormData({ ...formData, leaderTitle: e.target.value })}
                    placeholder="LÃNH ĐẠO BAN"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 text-xs focus:bg-white focus:border-[#1F4E78] transition uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ghi chú bản quyền / Chân trang Web App
                </label>
                <input 
                  type="text" 
                  value={formData.footerNote || ''} 
                  onChange={e => setFormData({ ...formData, footerNote: e.target.value })}
                  placeholder="Ví dụ: Hệ thống Quản lý công việc & Đánh giá KPI"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800 text-sm focus:bg-white focus:border-[#1F4E78] transition"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting || saving}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold border border-slate-300 transition"
            >
              Khôi phục mặc định
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || resetting}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition"
            >
              <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
              {saving ? 'Đang lưu...' : 'Lưu & Áp dụng toàn hệ thống'}
            </button>
          </div>
        </div>

        {/* Right Column: Live Visual Previews (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-100 rounded-2xl p-5 border border-slate-200 sticky top-6">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#1F4E78]" />
                <h4 className="font-black text-sm text-slate-800 uppercase tracking-wider">Xem trước hiển thị trực quan</h4>
              </div>
              <span className="text-[10px] font-extrabold bg-blue-100 text-[#1F4E78] px-2 py-0.5 rounded-full border border-blue-200">
                Thời gian thực
              </span>
            </div>

            <div className="space-y-6">
              {/* Preview 1: Header Web App */}
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Layout className="w-3 h-3" /> A. Tiêu đề Header Web App
                </div>
                
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide truncate">
                    {formData.parentAgency || 'TÊN CƠ QUAN CẤP TRÊN'}
                  </div>
                  <div className="text-sm font-black text-[#0f2440] tracking-tight mt-0.5 truncate">
                    {formData.systemTitle || 'HỆ THỐNG QUẢN LÝ CÔNG VIỆC VÀ ĐÁNH GIÁ KPI'}
                  </div>
                  <div className="text-xs font-bold text-[#1F4E78] mt-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                    <span>{formData.departmentName || 'Tên Phòng ban / Đơn vị'}</span>
                    {formData.shortName && (
                      <span className="text-[10px] font-black bg-blue-100 text-[#1F4E78] px-1.5 py-0.2 rounded">
                        ({formData.shortName})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview 2: Document Header & Signatures */}
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> B. Góc Tiêu đề & Chữ ký trên Văn bản In ấn
                </div>

                <div className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200 text-slate-800 text-[11px] font-serif leading-tight space-y-4">
                  {/* National Header in Print */}
                  <div className="grid grid-cols-2 gap-2 border-b border-slate-200 pb-3">
                    <div className="text-center">
                      <div className="text-[9px] font-bold uppercase">{formData.parentAgency || 'TÊN CƠ QUAN'}</div>
                      <div className="text-[9.5px] font-black uppercase text-[#1F4E78] underline mt-0.5">
                        {formData.departmentName || 'TÊN PHÒNG BAN'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] font-bold uppercase">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                      <div className="text-[9px] font-bold underline mt-0.5">Độc lập - Tự do - Hạnh phúc</div>
                    </div>
                  </div>

                  {/* Document Title */}
                  <div className="text-center py-1">
                    <div className="font-bold text-xs uppercase text-[#0f2440]">
                      BẢNG TỔNG HỢP & TRA CỨU ĐÁNH GIÁ KẾT QUẢ KPI
                    </div>
                    <div className="text-[10px] text-slate-500 italic mt-0.5">
                      Tháng 08-2026 — Đơn vị: {formData.departmentName || 'Phòng KHTC'}
                    </div>
                  </div>

                  {/* Signatures */}
                  <div className="pt-2 border-t border-slate-200">
                    <div className="text-right italic text-[10px] text-slate-500 mb-2">
                      {formData.location || 'Đắk Lắk'}, ngày 31 tháng 08 năm 2026
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-center font-bold text-[9px] uppercase">
                      <div>
                        <div>{formData.creatorTitle || 'NGƯỜI LẬP BIỂU'}</div>
                        <div className="text-[8px] font-normal italic text-slate-400 mt-6">(Ký, họ tên)</div>
                      </div>
                      <div>
                        <div>{formData.approverTitle || 'TRƯỞNG PHÒNG'}</div>
                        <div className="text-[8px] font-normal italic text-slate-400 mt-6">(Ký, họ tên)</div>
                      </div>
                      <div>
                        <div>{formData.leaderTitle || 'LÃNH ĐẠO BAN'}</div>
                        <div className="text-[8px] font-normal italic text-slate-400 mt-6">(Ký, đóng dấu)</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notice */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  Khi nhấn <strong>"Lưu & Áp dụng"</strong>, toàn bộ các bảng biểu, phiếu in KPI, phiếu đăng ký OT, và màn hình điều hành sẽ tức thì chuyển sang thông tin đơn vị mới mà không cần sửa đổi mã nguồn.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
