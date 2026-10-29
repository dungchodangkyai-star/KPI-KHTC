# Phát hành KPI KHTC bằng một nút

Sau khi AI Studio đã sửa xong và đồng bộ mã nguồn lên nhánh `main`:

1. Mở trang **Actions** của kho `KPI-KHTC` trên GitHub.
2. Chọn quy trình **Phat hanh KPI KHTC**.
3. Bấm **Run workflow**.
4. Đánh dấu ô xác nhận phát hành.
5. Bấm nút xanh **Run workflow**.

Hệ thống sẽ tự kiểm tra mã nguồn, sao lưu Neon, build image, tạo revision Cloud Run chưa nhận lưu lượng, kiểm tra kết nối dữ liệu, sau đó mới chuyển người dùng sang phiên bản mới. Nếu kiểm tra sau khi chuyển lưu lượng thất bại, hệ thống tự quay lại revision trước đó.

Link người dùng luôn giữ nguyên: <https://kpi-khtc.ai.studio>
