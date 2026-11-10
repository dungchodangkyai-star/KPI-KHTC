# Phát hành KPI KHTC bằng một nút

Sau khi AI Studio đã sửa xong và đồng bộ mã nguồn lên nhánh `main`:

1. Mở trang **Actions** của kho `KPI-KHTC` trên GitHub.
2. Chờ quy trình **Kiem tra dong bo AI Studio** hoàn thành và có dấu xanh.
3. Chỉ khi quy trình kiểm tra có dấu xanh, chọn **Phat hanh KPI KHTC**.
4. Bấm **Run workflow**.
5. Đánh dấu ô xác nhận phát hành.
6. Bấm nút xanh **Run workflow**.

## Quy tắc bắt buộc khi đồng bộ từ AI Studio

- Không được xóa `package-lock.json` khi sửa code hoặc giao diện.
- `package-lock.json` phải nằm cùng cấp với `package.json`.
- Mỗi lần có commit mới trên nhánh `main`, GitHub tự động chạy `npm ci`, kiểm tra TypeScript, 108 bài kiểm tra hồi quy và production build.
- Nếu thiếu hoặc sai lockfile, quy trình kiểm tra sẽ báo đỏ và bản đó không được phát hành.
- Không thay `npm ci` bằng `npm install` để né lỗi vì có thể làm thay đổi phiên bản thư viện ngoài kiểm soát.

Hệ thống sẽ tự kiểm tra mã nguồn, sao lưu Neon, build image, tạo revision Cloud Run chưa nhận lưu lượng, kiểm tra kết nối dữ liệu, sau đó mới chuyển người dùng sang phiên bản mới. Nếu kiểm tra sau khi chuyển lưu lượng thất bại, hệ thống tự quay lại revision trước đó.

Link người dùng luôn giữ nguyên: <https://khtc.kpi-bana.vn>
