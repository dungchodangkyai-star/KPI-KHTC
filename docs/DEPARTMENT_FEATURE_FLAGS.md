# Cấu hình tính năng riêng theo phòng

## Nguyên tắc

- Toàn hệ thống tiếp tục dùng một mã nguồn chính thức.
- Mỗi tính năng riêng phải là một mô-đun độc lập và có khóa ở cả giao diện lẫn API.
- Mặc định mọi tính năng riêng đều tắt. Thiếu hoặc sai cấu hình thì hệ thống không tự bật.
- Công thức KPI và quy tắc chấm điểm lõi không được đưa vào feature flag. Nếu cần khác nhau, phải xây dựng bộ quy tắc có phiên bản và kiểm thử riêng.

## Danh sách khóa hiện có

| Khóa | Mục đích |
|---|---|
| `specializedWorkFields` | Trường nhập công việc đặc thù |
| `specializedApprovalFlow` | Luồng duyệt đặc thù |
| `specializedReports` | Báo cáo đặc thù |

## Bật cho một phòng

Trong `config/deployments.json`, chỉ thêm `features` vào đúng phòng cần sử dụng:

```json
{
  "code": "qlkt1",
  "features": {
    "specializedReports": true
  }
}
```

Các khóa không khai báo được hiểu là `false`. Không sửa `defaults.features` để bật một tính năng riêng, vì giá trị mặc định áp dụng cho tất cả phòng.

## Dùng trong giao diện

```tsx
import { useFeatureFlag } from '../contexts/OrgContext';

const enabled = useFeatureFlag('specializedReports');
return enabled ? <SpecializedReports /> : null;
```

## Khóa API phía máy chủ

```ts
import { requireDeploymentFeature } from './featureGate.ts';

router.get(
  '/specialized-reports',
  requireDeploymentFeature('specializedReports'),
  handler
);
```

Không được chỉ ẩn nút trên giao diện mà bỏ khóa API.

## Quy trình phát hành

1. Viết mô-đun riêng và kiểm thử trong mã nguồn chung.
2. Thêm khóa vào registry `src/deploymentFeatures.ts` nếu là tính năng mới.
3. Thêm khóa vào `scripts/validate-deployments.mjs` và giá trị mặc định trong hai workflow phát hành/khởi tạo.
4. Bật khóa tại đúng phòng trong `config/deployments.json`.
5. Đồng bộ lên GitHub.
6. Có thể phát hành riêng phòng đó hoặc phát hành tất cả. Workflow sẽ đối chiếu cấu hình tính năng trước và sau khi chuyển lưu lượng.

Nếu cấu hình có khóa lạ, giá trị không phải boolean hoặc Cloud Run nhận sai cấu hình, kiểm tra/phát hành sẽ thất bại trước khi đưa bản mới vào sử dụng.

