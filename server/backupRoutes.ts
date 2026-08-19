import { Router, Request, Response } from 'express';
import { 
  getBackupConfig, 
  saveBackupConfig, 
  performBackup, 
  listBackups, 
  deleteBackupFile, 
  getBackupContent, 
  restoreFromBackup,
  autoPruneBackups
} from './backupService.ts';

export const backupRouter = Router();

// GET /api/backups/config
backupRouter.get('/config', (req: Request, res: Response) => {
  try {
    const config = getBackupConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// POST /api/backups/config
backupRouter.post('/config', (req: Request, res: Response) => {
  try {
    const saved = saveBackupConfig(req.body);
    res.json({ success: true, data: saved, message: 'Đã lưu cấu hình tự động sao lưu thành công!' });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// POST /api/backups/test-webhook
backupRouter.post('/test-webhook', async (req: Request, res: Response) => {
  try {
    const { destinationUrl, provider, authHeaderName, authHeaderValue } = req.body;
    if (!destinationUrl) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập Địa chỉ Webhook / URL Web App.' });
    }

    const testPayload = {
      id: 'test_connection_' + Date.now(),
      filename: 'test_connection.json',
      createdAt: new Date().toISOString(),
      provider: provider || 'google_drive',
      metadata: {
        id: 'test_connection',
        filename: 'test_connection.json',
        createdAt: new Date().toISOString(),
        sizeBytes: 120,
        recordCounts: { users: 1, works: 1, assignments: 1, overtimes: 0, categories: 1 },
        triggerType: 'manual'
      },
      contentBase64: Buffer.from(JSON.stringify({ test: true, message: 'Kiểm tra kết nối Google Drive Webhook từ hệ thống PMO1' }), 'utf-8').toString('base64'),
      contentJson: { test: true, message: 'Kiểm tra kết nối Google Drive Webhook từ hệ thống PMO1' }
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-backup-id': testPayload.id,
      'x-backup-filename': testPayload.filename
    };
    if (authHeaderName && authHeaderValue) {
      headers[authHeaderName] = authHeaderValue;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const startMs = Date.now();

    const fetchRes = await fetch(destinationUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(testPayload),
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - startMs;

    if (fetchRes.ok) {
      let responseJson: any = null;
      try {
        responseJson = await fetchRes.json();
      } catch {}

      return res.json({
        success: true,
        message: `Kết nối thành công tới Google Drive Webhook (HTTP ${fetchRes.status})! ${responseJson?.message ? responseJson.message : ''}`,
        latencyMs,
        response: responseJson
      });
    } else {
      const errText = await fetchRes.text().catch(() => '');
      return res.json({
        success: false,
        message: `Máy chủ Google trả về mã lỗi HTTP ${fetchRes.status}: ${errText.slice(0, 150)}`
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Lỗi kết nối Webhook: ${err?.message || String(err)}`
    });
  }
});

// GET /api/backups/list
backupRouter.get('/list', (req: Request, res: Response) => {
  try {
    const list = listBackups();
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// POST /api/backups/run
backupRouter.post('/run', async (req: Request, res: Response) => {
  try {
    const result = await performBackup('manual');
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Đã thực hiện sao lưu toàn bộ dữ liệu thành công!',
        data: result.metadata 
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/backups/download/:filename
backupRouter.get('/download/:filename', (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    const content = getBackupContent(filename);
    if (!content) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy file sao lưu' });
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(content, null, 2));
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// DELETE /api/backups/:filename
backupRouter.delete('/:filename', (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    const ok = deleteBackupFile(filename);
    if (ok) {
      res.json({ success: true, message: 'Đã xóa bản sao lưu thành công!' });
    } else {
      res.status(404).json({ success: false, error: 'Không tìm thấy file để xóa' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// POST /api/backups/prune
backupRouter.post('/prune', async (req: Request, res: Response) => {
  try {
    const maxCopies = parseInt(req.body.maxCopies) || 30;
    const prunedCount = await autoPruneBackups(maxCopies);
    res.json({ success: true, message: `Đã dọn dẹp ${prunedCount} bản sao lưu cũ để giải phóng bộ nhớ!`, prunedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// POST /api/backups/restore
backupRouter.post('/restore', async (req: Request, res: Response) => {
  try {
    const { filename, backupPayload } = req.body;
    let dataToRestore = backupPayload;

    if (filename && !dataToRestore) {
      dataToRestore = getBackupContent(filename);
    }

    if (!dataToRestore) {
      return res.status(400).json({ success: false, error: 'Không tìm thấy dữ liệu sao lưu để phục hồi.' });
    }

    const result = await restoreFromBackup(dataToRestore);
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});
