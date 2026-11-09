# Mô hình một mã nguồn, nhiều phòng ban

## Nguyên tắc

- AI Studio và GitHub chỉ duy trì một bộ mã nguồn chuẩn.
- Mỗi phòng ban là một Cloud Run service độc lập.
- Mỗi phòng ban dùng một Secret Manager secret chứa `DATABASE_URL` riêng.
- Mỗi phòng ban có link cố định, cấu hình nhận diện và sao lưu độc lập.
- Một image được build cho mỗi commit và được dùng chung cho các service được chọn.

## Thêm phòng ban

1. Tạo cơ sở dữ liệu PostgreSQL riêng và hoàn tất khởi tạo/khôi phục dữ liệu hợp lệ.
2. Lưu chuỗi kết nối vào Google Secret Manager bằng một tên secret riêng.
3. Tạo Cloud Run service và cấu hình custom domain/link cố định.
4. Thêm một mục mới vào `config/deployments.json`; không dùng lại `databaseSecret`, `service` hoặc `fixedUrl` của phòng khác.
5. Chạy `npm run validate:deployments`.
6. Đồng bộ GitHub, chờ quy trình kiểm tra có dấu xanh.
7. Chạy workflow phát hành với `deployment_target` là mã phòng hoặc `all`.

## Biến môi trường được gắn tự động

- `DEPLOYMENT_CODE`
- `DEPLOYMENT_NAME`
- `DEPLOYMENT_SHORT_NAME`
- `PARENT_AGENCY`
- `ORG_LOCATION`
- `THEME_COLOR`
- `APP_URL`
- `DATABASE_URL` lấy trực tiếp từ Secret Manager, không ghi vào mã nguồn.

Endpoint `/api/health` trả về mã deployment. Workflow chỉ chuyển lưu lượng khi mã trả về đúng với phòng đang phát hành và PostgreSQL đã kết nối, schema đã sẵn sàng.
