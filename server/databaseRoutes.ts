import { Router, Request, Response } from 'express';
import { 
  getDatabaseConfig, 
  saveDatabaseConfig, 
  testDatabaseConnection, 
  DatabaseConfig 
} from './databaseStorage.ts';

export const databaseRouter = Router();

// GET /api/database/config
databaseRouter.get('/config', (req: Request, res: Response) => {
  try {
    const config = getDatabaseConfig();
    // Mask password before returning to client
    const safeConfig = {
      ...config,
      password: config.password ? '••••••••' : ''
    };
    res.json({ success: true, data: safeConfig });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// POST /api/database/test
databaseRouter.post('/test', async (req: Request, res: Response) => {
  try {
    const inputConfig: DatabaseConfig = req.body;
    
    // If password is masked, use existing password from storage
    if (inputConfig.password === '••••••••' || !inputConfig.password) {
      const currentConfig = getDatabaseConfig();
      inputConfig.password = currentConfig.password;
    }

    const testResult = await testDatabaseConnection(inputConfig);
    res.json({
      success: testResult.success,
      message: testResult.message,
      latencyMs: testResult.latencyMs
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || String(error) });
  }
});

// POST /api/database/config
databaseRouter.post('/config', async (req: Request, res: Response) => {
  try {
    const inputConfig: DatabaseConfig = req.body;
    const currentConfig = getDatabaseConfig();

    // Preserve existing password if not modified
    if (inputConfig.password === '••••••••' || !inputConfig.password) {
      inputConfig.password = currentConfig.password;
    }

    // If switching to external, test connection first
    if (inputConfig.mode === 'external') {
      const testResult = await testDatabaseConnection(inputConfig);
      if (!testResult.success) {
        return res.status(400).json({
          success: false,
          error: `Không thể áp dụng cấu hình do kiểm tra kết nối thất bại: ${testResult.message}`
        });
      }
      inputConfig.status = 'connected';
      inputConfig.lastTested = new Date().toISOString();
    } else {
      inputConfig.status = 'connected';
      inputConfig.lastTested = new Date().toISOString();
    }

    const saved = saveDatabaseConfig(inputConfig);
    if (!saved) {
      return res.status(500).json({ success: false, error: 'Không thể lưu file cấu hình database.' });
    }

    res.json({
      success: true,
      message: 'Cập nhật cấu hình cơ sở dữ liệu thành công!',
      data: {
        ...inputConfig,
        password: inputConfig.password ? '••••••••' : ''
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});
