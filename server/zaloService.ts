import fs from 'fs';
import path from 'path';

export interface ZaloConfig {
  method: 'webhook' | 'group_webhook' | 'oa_zns' | 'direct_app';
  webhookUrl?: string;
  groupWebhookUrl?: string;
  oaAccessToken?: string;
  oaTemplateId?: string;
  senderName?: string;
  senderPhone?: string;
  defaultTemplate?: string;
  lastUpdated?: string;
}

const ZALO_CONFIG_PATH = path.join(process.cwd(), 'data', 'zalo-config.json');

const ensureDataDir = () => {
  const dir = path.dirname(ZALO_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const DEFAULT_ZALO_TEMPLATE = 
`🔔 [THÔNG BÁO GIAO VIỆC MỚI]
Kính gửi: {NGUOI_NHAN}
Lãnh đạo: {NGUOI_GIAO} vừa giao nhiệm vụ cho Anh/Chị trên Hệ thống KPI:

📌 Nhiệm vụ: {TEN_VIEC} ({MA_VIEC})
📁 Nhóm việc: {NHOM_VIEC}
⏱️ Điểm chuẩn / Hệ số: {DIEM_CHUAN} điểm (Hệ số K: {HE_SO})
🎯 Yêu cầu sản phẩm: {SAN_PHAM}
📅 Hạn hoàn thành: {HAN_CHOT}
💡 Ý kiến chỉ đạo: {Y_KIEN_CHI_DAO}
⭐ Vai trò: {VAI_TRO}

👉 Vui lòng truy cập để nhận việc và báo cáo tiến độ:
🔗 {LINK_APP}`;

export const getZaloConfig = (): ZaloConfig => {
  try {
    ensureDataDir();
    if (fs.existsSync(ZALO_CONFIG_PATH)) {
      const content = fs.readFileSync(ZALO_CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        defaultTemplate: DEFAULT_ZALO_TEMPLATE,
        ...parsed
      };
    }
  } catch (error) {
    console.error('Error reading zalo config:', error);
  }

  return {
    method: 'webhook',
    webhookUrl: '',
    groupWebhookUrl: '',
    oaAccessToken: '',
    oaTemplateId: '',
    senderName: 'Lãnh đạo Phòng',
    senderPhone: '',
    defaultTemplate: DEFAULT_ZALO_TEMPLATE,
    lastUpdated: new Date().toISOString()
  };
};

export const saveZaloConfig = (config: Partial<ZaloConfig>): boolean => {
  try {
    ensureDataDir();
    const current = getZaloConfig();
    const updated: ZaloConfig = {
      ...current,
      ...config,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(ZALO_CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error saving zalo config:', error);
    return false;
  }
};

export interface ZaloMessageParams {
  receiverName: string;
  receiverPhone?: string;
  assignerName: string;
  taskName: string;
  taskCode?: string;
  taskGroup?: string;
  score?: number | string;
  coef?: number | string;
  productRequired?: string;
  deadline?: string;
  leaderNote?: string;
  role?: string;
  customLink?: string;
}

export const formatZaloMessage = (template: string, params: ZaloMessageParams): string => {
  let msg = template || DEFAULT_ZALO_TEMPLATE;
  const appLink = params.customLink || process.env.APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://ais-dev-k63vaxyblc4oqjg5j56dxt-824823270737.asia-southeast1.run.app');
  
  const replacements: Record<string, string> = {
    '{NGUOI_NHAN}': params.receiverName || 'Anh/Chị',
    '{NGUOI_GIAO}': params.assignerName || 'Lãnh đạo Phòng',
    '{TEN_VIEC}': params.taskName || 'Nhiệm vụ chuyên môn',
    '{MA_VIEC}': params.taskCode || 'NV',
    '{NHOM_VIEC}': params.taskGroup || 'Chuyên môn',
    '{DIEM_CHUAN}': String(params.score || '10'),
    '{HE_SO}': String(params.coef || '1.0'),
    '{SAN_PHAM}': params.productRequired || 'Báo cáo / Sản phẩm hoàn thành',
    '{HAN_CHOT}': params.deadline || 'Theo quy định',
    '{Y_KIEN_CHI_DAO}': params.leaderNote || 'Thực hiện đúng tiến độ và chất lượng yêu cầu',
    '{VAI_TRO}': params.role || 'Chủ trì',
    '{LINK_APP}': `${appLink}/assign`
  };

  for (const [key, value] of Object.entries(replacements)) {
    msg = msg.split(key).join(value);
  }

  return msg;
};

export const sendZaloNotification = async (params: ZaloMessageParams): Promise<{ success: boolean; message: string; data?: any; directLink?: string }> => {
  const config = getZaloConfig();
  const messageText = formatZaloMessage(config.defaultTemplate || DEFAULT_ZALO_TEMPLATE, params);
  const cleanPhone = (params.receiverPhone || '').replace(/[^0-9]/g, '');

  // 1. Direct App URL (Universal Zalo deep-link / chat link fallback)
  const encodedText = encodeURIComponent(messageText);
  const directLink = cleanPhone ? `https://zalo.me/${cleanPhone}?text=${encodedText}` : `https://zalo.me/?text=${encodedText}`;

  // If method is direct_app or webhook not configured, provide instant direct link
  if (config.method === 'direct_app') {
    return {
      success: true,
      message: 'Đã chuẩn bị thông điệp Zalo 1-Chạm!',
      directLink,
      data: { messageText, phone: cleanPhone }
    };
  }

  // 2. Webhook (Zalo Chat Bot / Automation Webhook / n8n / Make / ChatWork / Discord / Telegram proxy)
  if (config.method === 'webhook' && config.webhookUrl) {
    try {
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: {
            phone: cleanPhone,
            name: params.receiverName
          },
          message: {
            text: messageText
          },
          rawParams: params,
          sentAt: new Date().toISOString()
        })
      });

      if (response.ok) {
        return {
          success: true,
          message: `Đã tự động gửi thông báo Zalo qua Webhook tới ${params.receiverName}!`,
          directLink,
          data: await response.text().catch(() => ({}))
        };
      } else {
        return {
          success: false,
          message: `Webhook phản hồi mã lỗi ${response.status}. Dự phòng mở liên kết Zalo 1-Chạm.`,
          directLink
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi kết nối Webhook: ${err?.message || String(err)}. Sẵn sàng link Zalo dự phòng.`,
        directLink
      };
    }
  }

  // 3. Group Webhook
  if (config.method === 'group_webhook' && config.groupWebhookUrl) {
    try {
      const response = await fetch(config.groupWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: messageText,
          mention: cleanPhone ? `@${cleanPhone}` : undefined
        })
      });

      if (response.ok) {
        return {
          success: true,
          message: `Đã phát thông báo lên Nhóm Zalo chung!`,
          directLink
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi gửi Group Webhook: ${err?.message}`,
        directLink
      };
    }
  }

  // 4. Zalo OA ZNS (Official Account Template Notification)
  if (config.method === 'oa_zns' && config.oaAccessToken) {
    try {
      const znsPayload = {
        phone: cleanPhone.startsWith('0') ? '84' + cleanPhone.substring(1) : cleanPhone,
        template_id: config.oaTemplateId || '',
        template_data: {
          customer_name: params.receiverName,
          task_name: params.taskName,
          deadline: params.deadline || 'Trong tháng',
          score: String(params.score || '10')
        }
      };

      const res = await fetch('https://business.openapi.zalo.me/message/template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': config.oaAccessToken
        },
        body: JSON.stringify(znsPayload)
      });

      const data = await res.json();
      if (data.error === 0) {
        return {
          success: true,
          message: `Đã gửi tin Zalo ZNS chính thức tới ${params.receiverName}!`,
          directLink,
          data
        };
      } else {
        return {
          success: false,
          message: `Zalo OA báo lỗi: ${data.message || 'Mã lỗi ' + data.error}`,
          directLink
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi Zalo ZNS: ${err?.message}`,
        directLink
      };
    }
  }

  // Default fallback
  return {
    success: true,
    message: 'Thông điệp Zalo đã tạo sẵn sàng gửi!',
    directLink,
    data: { messageText }
  };
};
