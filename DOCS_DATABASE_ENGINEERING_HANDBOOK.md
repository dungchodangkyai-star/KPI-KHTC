# CẨM NANG KỸ THUẬT VẬN HÀNH CƠ SỞ DỮ LIỆU ĐA CHẾ ĐỘ
*(Database Engineering Handbook)*

## I. TỔNG QUAN KIẾN TRÚC
Hệ thống hỗ trợ 2 cơ chế lưu trữ linh hoạt:
1. **Chế độ Nội bộ Tự động (Local / Zero-Config)**: Sử dụng cơ sở dữ liệu độc lập đi kèm dự án trên Cloud của Google AI Studio. Tốc độ cao, không cần cấu hình.
2. **Chế độ PostgreSQL bên ngoài (External PostgreSQL)**: Cho phép kết nối máy chủ dữ liệu nội bộ (Synology NAS, On-premise server) hoặc máy chủ đám mây riêng (VPS, Supabase, Neon, AWS RDS, GCP Cloud SQL).

## II. ĐẢM BẢO AN TOÀN DỮ LIỆU 100%
- Khi thay đổi chế độ hoặc đổi máy chủ PostgreSQL, hệ thống **tuyệt đối không bao giờ chạy lệnh xóa (DROP/TRUNCATE)** trên dữ liệu cũ.
- Dữ liệu ở cơ sở dữ liệu cũ vẫn tồn tại nguyên vẹn và có thể chuyển đổi ngược lại bất kỳ lúc nào.

## III. BỘ TIỆN ÍCH EXCEL CHUẨN DOANH NGHIỆP (src/excelUtils.ts)
Được chuẩn hóa với màu nhận diện thương hiệu `#1F4E78` (Xanh Navy Hành chính), hỗ trợ đóng băng dòng tiêu đề (Freeze Header Row) và định dạng tự động cho số liệu, tỷ lệ %.
