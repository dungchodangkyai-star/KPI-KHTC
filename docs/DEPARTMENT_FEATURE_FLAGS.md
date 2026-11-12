# Cách ly tính năng riêng theo phòng

## Trạng thái bắt buộc

- Hệ thống dùng một mã nguồn và một container image.
- Mỗi phòng có Cloud Run service, `DATABASE_URL` và ma trận feature flags riêng.
- Mọi cờ phải được khai báo `true` hoặc `false` cho cả tám phòng; không dùng cấu hình thiếu để suy diễn.
- Công thức KPI, quy tắc chấm điểm và migration phá vỡ tương thích không được đặt sau feature flag.

## Ranh giới mã nguồn

| Thành phần | Vị trí bắt buộc | Cổng bảo vệ |
|---|---|---|
| Giao diện riêng | `src/department-features/<feature>/index.tsx` | `DepartmentFeature` |
| API riêng | `server/department-features/<feature>/index.ts` | `mountDepartmentFeatureRouter` |
| Danh mục | `config/department-features.json` | `validate:department-isolation` |
| Phòng được bật | `config/deployments.json` | Giá trị boolean tường minh |

Không khai báo trực tiếp đường dẫn `/api/department-features/...` trong `server.ts` hoặc router dùng chung. Script kiểm tra sẽ chặn.

## Bật cho một phòng

Trong `config/deployments.json`, đổi đúng một cờ của đúng phòng. Các phòng còn lại vẫn phải giữ đầy đủ ba cờ.

```json
{
  "code": "qlkt1",
  "features": {
    "specializedWorkFields": false,
    "specializedApprovalFlow": false,
    "specializedReports": true
  }
}
```

## Mẫu entrypoint giao diện

```tsx
import { DepartmentFeature } from '../../DepartmentFeature.tsx';

export function SpecializedReportsEntry() {
  return (
    <DepartmentFeature feature="specializedReports">
      <SpecializedReports />
    </DepartmentFeature>
  );
}
```

## Mẫu entrypoint API

```ts
import { Router } from 'express';
import { mountDepartmentFeatureRouter } from '../../departmentFeatureRouter.ts';

export function mountSpecializedReports(app) {
  const router = Router();
  router.get('/', handler);
  mountDepartmentFeatureRouter(app, 'specializedReports', router);
}
```

## Kiểm tra tự động

`npm test` và hai workflow đồng bộ/phát hành tự chạy:

1. `validate:deployments`: kiểm tra URL, service, secret và đủ cờ boolean.
2. `validate:department-isolation`: đối chiếu catalog, registry, tám phòng, thư mục module và cổng API/UI.
3. `testDepartmentFeatureMatrix`: giả lập lần lượt tám cấu hình và xác nhận cờ tắt bị chặn ở máy chủ.
4. Workflow phát hành kiểm tra `/api/health` và `/api/public/org-identity` trả về đúng commit, phòng, PostgreSQL và ma trận feature flags trước khi chuyển traffic.
5. Nếu kiểm tra sau chuyển traffic thất bại, workflow tự đưa service về revision trước.

## Giới hạn kỹ thuật

GitHub không thể tự hiểu ý nghĩa nghiệp vụ của một thay đổi tùy ý trong file lõi. Vì vậy yêu cầu Studio phải ghi rõ `CORE` hoặc `DEPARTMENT`, và thay đổi `DEPARTMENT` phải tuân theo đúng ranh giới thư mục trên. Nếu Studio sửa trực tiếp file lõi cho một nhu cầu riêng, người duyệt phải từ chối thay đổi đó trước khi đồng bộ.
