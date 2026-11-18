export type HelpRole = 'STAFF' | 'LEADER' | 'ADMIN';

export interface HelpSection {
  title: string;
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
}

export interface HelpArticle {
  id: string;
  category: string;
  title: string;
  summary: string;
  roles: HelpRole[];
  route?: string;
  keywords: string[];
  image?: string;
  imageAlt?: string;
  sections: HelpSection[];
  notes?: string[];
}

export const HELP_CATEGORIES = [
  'Bắt đầu sử dụng',
  'Công việc cá nhân',
  'Điều hành và phê duyệt',
  'KPI và báo cáo',
  'Quản trị hệ thống',
  'An toàn dữ liệu',
  'Xử lý lỗi thường gặp'
] as const;

const ALL: HelpRole[] = ['STAFF', 'LEADER', 'ADMIN'];
const LEADERS: HelpRole[] = ['LEADER', 'ADMIN'];
const ADMINS: HelpRole[] = ['ADMIN'];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'tong-quan',
    category: 'Bắt đầu sử dụng',
    title: 'Tổng quan hệ thống',
    summary: 'Hiểu chu trình công việc, phê duyệt, tính KPI và báo cáo trong một hệ thống thống nhất.',
    roles: ALL,
    keywords: ['tổng quan', 'bắt đầu', 'chức năng', 'quy trình', 'web app'],
    image: '/help/overview-monitor.png',
    imageAlt: 'Toàn cảnh màn hình theo dõi điều hành của web app KPI',
    sections: [
      {
        title: 'Hệ thống dùng để làm gì',
        paragraphs: [
          'Web app kết nối toàn bộ chu trình từ ghi nhận hoặc giao việc, cập nhật tiến độ, thẩm định kết quả, chấm KPI đến báo cáo điều hành. Mỗi dữ liệu chỉ nhập tại nơi phát sinh và được dùng lại cho các bước sau.',
          'Menu tự thay đổi theo quyền tài khoản. Nhân viên tập trung vào công việc và KPI cá nhân; lãnh đạo có thêm chức năng giao, duyệt, giám sát; quản trị viên có thêm tài khoản, danh mục và dữ liệu.'
        ]
      },
      {
        title: 'Chu trình nghiệp vụ',
        bullets: [
          'Ghi nhận công việc hoặc tiếp nhận nhiệm vụ được giao.',
          'Cập nhật tiến độ, sản phẩm, minh chứng và ngày hoàn thành thực tế.',
          'Lãnh đạo duyệt đạt, yêu cầu bổ sung hoặc không duyệt.',
          'Hệ thống tổng hợp A, B, C và D theo tháng.',
          'Dashboard, cảnh báo và báo cáo đọc từ dữ liệu đã được cập nhật.'
        ]
      }
    ]
  },
  {
    id: 'dang-ky-dang-nhap',
    category: 'Bắt đầu sử dụng',
    title: 'Đăng ký, đăng nhập và đổi mật mã',
    summary: 'Tạo yêu cầu tài khoản đúng phòng, đăng nhập lần đầu và bảo vệ tài khoản cá nhân.',
    roles: ALL,
    keywords: ['đăng ký', 'đăng nhập', 'mật khẩu', 'mật mã', 'tài khoản', 'quên mật khẩu'],
    image: '/help/account-registration.png',
    imageAlt: 'Biểu mẫu đăng ký tài khoản nhân sự',
    sections: [
      {
        title: 'Đăng ký tài khoản mới',
        steps: [
          'Mở đúng tên miền của phòng ban.',
          'Tại trang đăng nhập, chọn Đăng ký tài khoản mới.',
          'Nhập họ tên, email, số điện thoại và chọn vị trí Trưởng phòng, Phó phòng, Chuyên viên hoặc Khác.',
          'Gửi yêu cầu và chờ quản trị viên của phòng phê duyệt.',
          'Sau khi được duyệt, đăng nhập bằng email hoặc họ tên và mật mã được cấp.',
          'Đổi mật mã riêng ngay khi hệ thống yêu cầu.'
        ]
      },
      {
        title: 'Đăng nhập an toàn',
        bullets: [
          'Chỉ chọn Ghi nhớ tên đăng nhập trên thiết bị cá nhân.',
          'Luôn dùng nút Đăng xuất khi kết thúc trên máy dùng chung.',
          'Không gửi mật mã qua nhóm chat hoặc ghi trực tiếp trong nội dung công việc.'
        ]
      }
    ],
    notes: ['Yêu cầu đăng ký chỉ xuất hiện tại đúng cơ sở dữ liệu của phòng có tên miền đã mở.']
  },
  {
    id: 'dien-thoai-thong-bao',
    category: 'Bắt đầu sử dụng',
    title: 'Cài trên điện thoại và bật thông báo',
    summary: 'Thêm web app lên màn hình chính và nhận thông báo giao việc trên thiết bị.',
    roles: ALL,
    keywords: ['điện thoại', 'mobile', 'thông báo', 'chuông', 'android', 'iphone', 'cài ứng dụng'],
    sections: [
      {
        title: 'Thêm lên màn hình chính',
        steps: [
          'Android: mở bằng Chrome, mở menu trình duyệt rồi chọn Cài đặt ứng dụng hoặc Thêm vào màn hình chính.',
          'iPhone hoặc iPad: mở bằng Safari, chọn Chia sẻ rồi chọn Thêm vào Màn hình chính.',
          'Mở ứng dụng từ biểu tượng vừa tạo và đăng nhập.',
          'Mở biểu tượng chuông, chọn Bật thông báo giao việc cho thiết bị này và cho phép khi trình duyệt hỏi.',
          'Bấm gửi thử và xác nhận thiết bị nhận được thông báo.'
        ]
      },
      {
        title: 'Nếu không nhận được thông báo',
        bullets: [
          'Kiểm tra quyền Thông báo của trình duyệt hoặc ứng dụng.',
          'Tắt chế độ Không làm phiền và kiểm tra chế độ tiết kiệm pin.',
          'Mở lại biểu tượng chuông để xem trạng thái thiết bị.',
          'Thông báo không thay thế việc kiểm tra danh sách Công việc của tôi.'
        ]
      }
    ]
  },
  {
    id: 'nhap-cong-viec',
    category: 'Công việc cá nhân',
    title: 'Nhập công việc và đăng ký KPI',
    summary: 'Ghi nhận công việc, sản phẩm, tiến độ và thông tin dùng để tính KPI.',
    roles: ALL,
    route: '/input',
    keywords: ['nhập việc', 'đăng ký KPI', 'sản phẩm', 'điểm chuẩn', 'tính chất', 'minh chứng'],
    sections: [
      {
        title: 'Các bước thực hiện',
        steps: [
          'Chọn Nhập công việc trong nhóm Công việc hằng ngày.',
          'Chọn đúng tháng đánh giá và kiểm tra đúng tên nhân sự.',
          'Chọn nhóm công việc, nhiệm vụ chuẩn hoặc nhập tên nhiệm vụ thực tế.',
          'Nhập thời gian kế hoạch, trạng thái thực hiện và nội dung báo cáo.',
          'Chọn sản phẩm đầu ra, đơn vị tính, số lượng và gắn minh chứng nếu có.',
          'Kiểm tra điểm chuẩn, tính chất và công thức hệ thống đang hiển thị.',
          'Lưu công việc và đăng ký KPI.'
        ]
      },
      {
        title: 'Điểm tự chấm khi công việc đang thực hiện',
        paragraphs: [
          'Điểm tự chấm có thể phản ánh trạng thái hiện tại của công việc. Đây chưa phải điểm lãnh đạo duyệt. Điểm chính thức chỉ hình thành sau khi hồ sơ được thẩm định.'
        ]
      }
    ],
    notes: ['Không thay đổi tháng, điểm chuẩn hoặc tính chất chỉ để làm tăng điểm; dữ liệu phải phản ánh công việc thực tế.']
  },
  {
    id: 'cong-viec-cua-toi',
    category: 'Công việc cá nhân',
    title: 'Công việc của tôi',
    summary: 'Tiếp nhận nhiệm vụ, cập nhật tiến độ, sản phẩm, ngày thực tế và minh chứng.',
    roles: ALL,
    route: '/my-works',
    keywords: ['công việc của tôi', 'tiếp nhận', 'cập nhật', 'tiến độ', 'sửa việc', 'minh chứng'],
    sections: [
      {
        title: 'Tra cứu và cập nhật',
        steps: [
          'Chọn tháng, trạng thái hoặc trạng thái duyệt để tìm việc.',
          'Nếu có nhiệm vụ mới được giao, mở nội dung và bấm Tiếp nhận việc.',
          'Mở chi tiết để xem kế hoạch, điểm, sản phẩm và nhận xét lãnh đạo.',
          'Cập nhật tiến độ, ngày hoàn thành thực tế, sản phẩm và minh chứng.',
          'Lưu lại và kiểm tra trạng thái hồ sơ sau khi cập nhật.'
        ]
      },
      {
        title: 'Quy tắc khi sửa',
        bullets: [
          'Trường ảnh hưởng KPI của việc đã duyệt có thể làm hồ sơ trở lại trạng thái chờ duyệt.',
          'Công việc Cần bổ sung phải được hoàn thiện trên chính hồ sơ cũ, không tạo bản ghi trùng.',
          'Ngày hoàn thành thực tế trước ngày bắt đầu sẽ được cảnh báo là ngày bất thường.'
        ]
      }
    ]
  },
  {
    id: 'lam-them-ca-nhan',
    category: 'Công việc cá nhân',
    title: 'Đăng ký, theo dõi và in làm thêm',
    summary: 'Tạo hồ sơ làm thêm, theo dõi kết quả duyệt và in bảng tổng hợp cá nhân.',
    roles: ALL,
    route: '/ot-register',
    keywords: ['làm thêm', 'ngoài giờ', 'OT', 'đăng ký', 'in làm thêm'],
    sections: [
      {
        title: 'Đăng ký làm thêm',
        steps: [
          'Chọn Đăng ký làm thêm.',
          'Nhập ngày, khung giờ, số giờ, nội dung công việc, lý do và kết quả dự kiến.',
          'Gắn công việc hoặc minh chứng liên quan nếu biểu mẫu yêu cầu.',
          'Lưu hồ sơ để gửi chờ duyệt.',
          'Dùng Làm thêm của tôi để xem trạng thái và ý kiến duyệt.'
        ]
      },
      {
        title: 'In hồ sơ',
        steps: [
          'Mở In làm thêm.',
          'Chọn kỳ và kiểm tra đúng nhân sự.',
          'Tải Word hoặc chọn In và lưu PDF.'
        ]
      }
    ]
  },
  {
    id: 'tu-cham-a-kpi-ca-nhan',
    category: 'Công việc cá nhân',
    title: 'Tự chấm A và xem KPI cá nhân',
    summary: 'Tự chấm tiêu chí A, theo dõi A/B/C/D và in phiếu KPI tháng.',
    roles: ALL,
    route: '/self-score-a',
    keywords: ['tự chấm A', 'KPI cá nhân', 'A1', 'A7', 'in phiếu KPI', 'điểm B'],
    image: '/help/kpi-structure.png',
    imageAlt: 'Cơ cấu KPI mặc định và nguồn dữ liệu A B C D',
    sections: [
      {
        title: 'Tự chấm A',
        steps: [
          'Chọn đúng tháng đánh giá.',
          'Nhập điểm từng tiêu chí A1 đến A7, không vượt mức tối đa hiển thị.',
          'Có thể dùng Tự chấm chuẩn rồi điều chỉnh từng tiêu chí theo thực tế.',
          'Lưu kết quả và kiểm tra thông báo thành công.'
        ]
      },
      {
        title: 'Đọc kết quả KPI cá nhân',
        bullets: [
          'A là kết quả chấm tiêu chí cá nhân.',
          'B được hình thành từ dữ liệu công việc và tỷ trọng khối lượng.',
          'C gồm phần tự động và phần lãnh đạo thưởng.',
          'D là điểm trừ theo căn cứ vi phạm hoặc kết quả không đạt.',
          'Tổng điểm được trình bày theo cấu hình KPI đang áp dụng của phòng.'
        ]
      }
    ]
  },
  {
    id: 'giao-viec',
    category: 'Điều hành và phê duyệt',
    title: 'Giao việc và theo dõi việc đã giao',
    summary: 'Phân công nhiệm vụ, quy định thời hạn, sản phẩm và thông tin KPI cho người nhận.',
    roles: LEADERS,
    route: '/assign',
    keywords: ['giao việc', 'phân công', 'nhiệm vụ', 'người nhận', 'thời hạn'],
    sections: [
      {
        title: 'Tạo giao việc',
        steps: [
          'Chọn nhân sự nhận việc.',
          'Nhập tên nhiệm vụ, nội dung chỉ đạo và thời hạn.',
          'Chọn nhóm việc, nhiệm vụ chuẩn, sản phẩm, điểm chuẩn và tính chất nếu công việc tính KPI.',
          'Kiểm tra kênh thông báo.',
          'Giao việc và kiểm tra thông báo thành công.'
        ]
      },
      {
        title: 'Theo dõi sau khi giao',
        bullets: [
          'Kiểm tra trạng thái chưa nhận, đã nhận và đang triển khai.',
          'Chỉ sửa hoặc thu hồi khi đúng thẩm quyền và đọc kỹ cảnh báo.',
          'Việc đã phát sinh kết quả nên được giữ lịch sử thay vì xóa cứng.'
        ]
      }
    ]
  },
  {
    id: 'duyet-viec',
    category: 'Điều hành và phê duyệt',
    title: 'Duyệt công việc và xử lý bổ sung',
    summary: 'Thẩm định tiến độ, tính chất, điểm chính thức và ba kết quả duyệt hồ sơ.',
    roles: LEADERS,
    route: '/approve',
    keywords: ['duyệt việc', 'duyệt đạt', 'cần bổ sung', 'không duyệt', 'điểm chính thức', 'hệ số'],
    sections: [
      {
        title: 'Kiểm tra trước khi duyệt',
        steps: [
          'Chọn tháng, nhân sự và trạng thái cần xử lý.',
          'Đọc nội dung thực hiện, sản phẩm, minh chứng, ngày kế hoạch và ngày thực tế.',
          'Kiểm tra cảnh báo tiến độ và ngày bất thường.',
          'Đối chiếu điểm chuẩn và tính chất với kết quả thực tế.'
        ]
      },
      {
        title: 'Ba kết quả phê duyệt',
        bullets: [
          'Duyệt đạt: chọn tính chất, kiểm tra Điểm chuẩn nhân Hệ số duyệt và xác nhận điểm KPI chính thức. Điểm lãnh đạo duyệt không nhân hệ số tiến độ.',
          'Cần bổ sung: ghi rõ phần còn thiếu; hồ sơ chưa có điểm chính thức cho đến khi bổ sung và duyệt lại.',
          'Không duyệt: ghi lý do; điểm công việc bằng 0 và dữ liệu có thể làm căn cứ thống kê D.'
        ]
      }
    ],
    notes: ['Nếu lãnh đạo điều chỉnh điểm chính thức, nhận xét nên nêu đủ căn cứ để có thể giải trình.']
  },
  {
    id: 'duyet-lam-them',
    category: 'Điều hành và phê duyệt',
    title: 'Duyệt và tổng hợp làm thêm',
    summary: 'Kiểm tra hồ sơ ngoài giờ, duyệt kết quả và xuất tổng hợp toàn phòng.',
    roles: LEADERS,
    route: '/approve-ot',
    keywords: ['duyệt làm thêm', 'tổng hợp OT', 'ngoài giờ', 'số giờ'],
    sections: [
      {
        title: 'Duyệt hồ sơ',
        steps: [
          'Lọc theo tháng, nhân sự hoặc trạng thái.',
          'Kiểm tra ngày, khung giờ, số giờ, nội dung, lý do và minh chứng.',
          'Chọn duyệt, yêu cầu bổ sung hoặc từ chối và ghi nhận xét khi cần.',
          'Chỉ duyệt hàng loạt sau khi đã kiểm tra từng dòng được chọn.'
        ]
      },
      {
        title: 'Tổng hợp',
        steps: [
          'Mở Tổng hợp làm thêm.',
          'Chọn tháng và phạm vi báo cáo.',
          'Kiểm tra tổng giờ và danh sách chi tiết.',
          'Tải Word, Excel hoặc in PDF theo nhu cầu.'
        ]
      }
    ]
  },
  {
    id: 'cham-kpi-acd',
    category: 'KPI và báo cáo',
    title: 'Chấm duyệt KPI A C D',
    summary: 'Duyệt A, kiểm tra C1, nhập C2 và xử lý các căn cứ điểm trừ D.',
    roles: LEADERS,
    route: '/score-acd',
    keywords: ['chấm ACD', 'C1', 'C2', 'điểm D', 'điểm trừ', 'phê duyệt KPI'],
    sections: [
      {
        title: 'Trình tự chấm',
        steps: [
          'Chọn tháng và nhân sự.',
          'Kiểm tra công việc và điểm B; xử lý việc chờ duyệt trước khi chốt KPI.',
          'Duyệt từng tiêu chí A và xử lý tiêu chí nhân viên chưa tự chấm.',
          'Kiểm tra C1 tự động; nhập C2 và lý do nếu có thưởng.',
          'Xem căn cứ D; xác nhận, miễn hoặc giảm điểm phạt kèm nhận xét.',
          'Lưu và xác nhận phê duyệt KPI.'
        ]
      }
    ],
    notes: ['Không chốt KPI khi danh sách công việc có hồ sơ quan trọng còn chờ duyệt.']
  },
  {
    id: 'theo-doi-canh-bao',
    category: 'KPI và báo cáo',
    title: 'Theo dõi, giám sát và cảnh báo',
    summary: 'Nhận biết việc quá hạn, đến hạn, sắp đến hạn và hồ sơ chờ xử lý.',
    roles: LEADERS,
    route: '/monitor',
    keywords: ['theo dõi', 'giám sát', 'cảnh báo', 'quá hạn', 'đến hạn', 'dashboard'],
    image: '/help/alerts.png',
    imageAlt: 'Các thẻ cảnh báo tiến độ và điều hành',
    sections: [
      {
        title: 'Cách sử dụng',
        steps: [
          'Chọn tháng và nhân sự cần theo dõi.',
          'Bấm thẻ Quá hạn, Đến hạn hôm nay hoặc Sắp đến hạn để lọc nhanh.',
          'Mở công việc từ danh sách chi tiết.',
          'Thực hiện nhắc việc, cập nhật, duyệt hoặc yêu cầu bổ sung theo tình trạng thực tế.',
          'Cập nhật lại màn hình và xác nhận số cảnh báo đã thay đổi.'
        ]
      }
    ]
  },
  {
    id: 'tong-hop-kpi',
    category: 'KPI và báo cáo',
    title: 'Tổng hợp KPI và tính lại KPI phòng',
    summary: 'Tra cứu kết quả toàn phòng và chủ động đồng bộ lại các thành phần phụ thuộc dữ liệu chung.',
    roles: LEADERS,
    route: '/department-kpi',
    keywords: ['tổng hợp KPI', 'tính lại KPI phòng', 'điểm B', 'C1', 'xếp loại', 'nhật ký'],
    sections: [
      {
        title: 'Khi nào cần tính lại',
        paragraphs: [
          'Hệ thống tự động cập nhật trong các luồng nghiệp vụ chính. Nút Tính lại KPI phòng là công cụ đồng bộ có kiểm soát sau khi nhiều dữ liệu của tháng đã thay đổi, sau khôi phục dữ liệu hoặc khi cần xác minh lại kết quả toàn phòng.'
        ]
      },
      {
        title: 'Cách thực hiện',
        steps: [
          'Chọn đúng tháng.',
          'Đảm bảo các công việc cần thiết đã được duyệt.',
          'Bấm Tính lại KPI phòng.',
          'Đọc nhật ký số nhân sự thành công và thất bại.',
          'Đối chiếu ngẫu nhiên ít nhất một hồ sơ trước và sau khi tính lại.'
        ]
      }
    ]
  },
  {
    id: 'thong-ke-bao-cao',
    category: 'KPI và báo cáo',
    title: 'Dashboard, thống kê và xuất báo cáo',
    summary: 'Đọc chỉ số điều hành, lọc số liệu và xuất Word, Excel hoặc PDF.',
    roles: LEADERS,
    route: '/stats',
    keywords: ['thống kê', 'báo cáo', 'dashboard', 'xuất excel', 'word', 'pdf'],
    image: '/help/work-monitoring.png',
    imageAlt: 'Bảng theo dõi công việc và làm thêm theo trạng thái',
    sections: [
      {
        title: 'Thống kê và báo cáo',
        steps: [
          'Chọn tháng, nhân sự, nhóm công việc và trạng thái.',
          'Đọc các chỉ số tổng quan và mở chi tiết từ số liệu cần kiểm tra.',
          'Chuyển giữa thống kê nhóm việc, nhiệm vụ, sản phẩm, nhân sự và đầu việc.',
          'Xuất Excel hoặc bản in sau khi xác nhận đúng bộ lọc.'
        ]
      },
      {
        title: 'Nguyên tắc đối chiếu',
        bullets: [
          'Số liệu phụ thuộc tháng và phạm vi lọc đang chọn.',
          'Công việc bị thu hồi hoặc chưa đủ điều kiện có thể không được tính vào một số báo cáo.',
          'Khi vừa thay đổi dữ liệu KPI, nên tính lại phòng và tải lại báo cáo trước khi xuất.'
        ]
      }
    ]
  },
  {
    id: 'nhan-su-phan-quyen',
    category: 'Quản trị hệ thống',
    title: 'Nhân sự, tài khoản và phân quyền',
    summary: 'Duyệt đăng ký, tạo hoặc cập nhật nhân sự và cấp đúng quyền theo vai trò.',
    roles: ADMINS,
    route: '/admin/users',
    keywords: ['nhân sự', 'tài khoản', 'phân quyền', 'duyệt đăng ký', 'leader', 'admin'],
    sections: [
      {
        title: 'Phê duyệt đăng ký',
        steps: [
          'Mở Nhân sự và Tài khoản.',
          'Chọn danh sách Chờ duyệt.',
          'Kiểm tra họ tên, email, số điện thoại và vị trí.',
          'Duyệt để kích hoạt hoặc từ chối nếu thông tin không hợp lệ.',
          'Thông báo mật mã mặc định và yêu cầu đổi trong lần đăng nhập đầu.'
        ]
      },
      {
        title: 'Quy tắc quản trị',
        bullets: [
          'Chỉ cấp quyền cần thiết cho công việc thực tế.',
          'Không dùng tài khoản quản trị chung cho nhiều người.',
          'Tài khoản đã phát sinh nghiệp vụ nên chuyển nghỉ việc và lưu lịch sử thay vì xóa cứng.',
          'Tài khoản quản trị kỹ thuật ẩn không được tính là nhân sự KPI.'
        ]
      }
    ]
  },
  {
    id: 'cau-hinh-danh-muc',
    category: 'Quản trị hệ thống',
    title: 'Cấu hình tổ chức, KPI và danh mục',
    summary: 'Quản lý tên phòng, tham số KPI, nhóm việc, nhiệm vụ, sản phẩm và tính chất.',
    roles: ADMINS,
    route: '/admin/settings',
    keywords: ['cấu hình', 'danh mục', 'tổ chức', 'phân bổ điểm', 'xếp loại', 'nhiệm vụ'],
    sections: [
      {
        title: 'Cấu hình tổ chức',
        steps: [
          'Mở Cài đặt danh mục và chọn Cấu hình tổ chức.',
          'Nhập cơ quan chủ quản, tên phòng, tên viết tắt, tiêu đề, địa điểm và chức danh ký.',
          'Lưu và mở lại trang để kiểm tra tiêu đề, báo cáo và chân trang.'
        ]
      },
      {
        title: 'Cấu hình KPI và danh mục',
        bullets: [
          'Chỉ thay đổi phân bổ điểm và ngưỡng xếp loại khi có quy định được phê duyệt.',
          'Ghi nhận ngày áp dụng và kiểm tra trên một tháng thử.',
          'Không xóa danh mục đã được dữ liệu nghiệp vụ tham chiếu; ưu tiên ngừng sử dụng.'
        ]
      }
    ]
  },
  {
    id: 'dong-bo-import',
    category: 'Quản trị hệ thống',
    title: 'Đồng bộ và import dữ liệu',
    summary: 'Nhập dữ liệu Excel đúng cấu trúc và đối chiếu kết quả sau xử lý.',
    roles: ADMINS,
    route: '/admin/sync',
    keywords: ['đồng bộ', 'import', 'excel', 'file mẫu', 'app script'],
    sections: [
      {
        title: 'Import an toàn',
        steps: [
          'Tải file mẫu chuẩn hóa từ chính hệ thống.',
          'Điền dữ liệu đúng cột và không tự ý đổi tên sheet.',
          'Chọn file, kiểm tra loại dữ liệu và cảnh báo trên màn hình xem trước.',
          'Thực hiện import và đọc số bản ghi thành công, bỏ qua hoặc lỗi.',
          'Mở màn hình nghiệp vụ liên quan để đối chiếu sau import.'
        ]
      }
    ],
    notes: ['Tạo bản sao lưu trước khi import khối lượng lớn.']
  },
  {
    id: 'sao-luu-khoi-phuc',
    category: 'An toàn dữ liệu',
    title: 'Sao lưu, khôi phục và dọn dẹp dữ liệu',
    summary: 'Tạo snapshot, sao lưu ngoại vi, khôi phục JSON và dọn dữ liệu theo kỳ.',
    roles: ADMINS,
    route: '/admin/database',
    keywords: ['cơ sở dữ liệu', 'sao lưu', 'khôi phục', 'JSON', 'dọn dẹp', 'Neon', 'Google Drive'],
    image: '/help/data-architecture.png',
    imageAlt: 'Kiến trúc ứng dụng, cơ sở dữ liệu và sao lưu',
    sections: [
      {
        title: 'Kiểm tra trước khi thao tác',
        bullets: [
          'Bản chính thức phải hiển thị PostgreSQL Production và kết nối thành công.',
          'Nếu thấy chế độ lưu cục bộ trên bản chính thức, dừng nhập dữ liệu và báo quản trị kỹ thuật.',
          'Luôn tạo bản sao mới trước khi khôi phục, import lớn hoặc dọn dẹp.'
        ]
      },
      {
        title: 'Sao lưu và khôi phục',
        steps: [
          'Bấm Sao lưu ngay và kiểm tra thời gian, kích thước, số bản ghi của snapshot.',
          'Kiểm tra bản sao ngoại vi trên Google Drive nếu chức năng Offsite đang bật.',
          'Khi khôi phục, chọn đúng file JSON và đọc kỹ phiên bản, thời gian, số nhân sự, công việc, làm thêm và KPI.',
          'Chỉ xác nhận khi số lượng hợp lý; chờ giao dịch hoàn tất.',
          'Đăng xuất, đăng nhập lại và đối chiếu dữ liệu cùng Tổng hợp KPI.'
        ]
      },
      {
        title: 'Dọn dẹp',
        bullets: [
          'Dọn theo kỳ phải chọn đúng tháng và đọc số lượng dự kiến.',
          'Xóa trắng chỉ dùng khi chủ động khởi tạo lại toàn bộ dữ liệu.',
          'Không đóng trang hoặc phát hành phiên bản mới khi giao dịch dữ liệu đang chạy.'
        ]
      }
    ]
  },
  {
    id: 'xu-ly-loi',
    category: 'Xử lý lỗi thường gặp',
    title: 'Kiểm tra nhanh khi hệ thống báo lỗi',
    summary: 'Phân biệt lỗi phiên đăng nhập, dữ liệu, mạng và thao tác trước khi xử lý.',
    roles: ALL,
    keywords: ['lỗi', 'không tải được', 'phiên đăng nhập', 'mạng', 'tải lại', 'hỗ trợ'],
    sections: [
      {
        title: 'Trình tự xử lý an toàn',
        steps: [
          'Đọc nguyên văn thông báo lỗi và ghi lại thời điểm, tên phòng, màn hình và thao tác vừa thực hiện.',
          'Nếu báo phiên đăng nhập không hợp lệ, đăng xuất rồi đăng nhập lại; không bấm lặp thao tác ghi dữ liệu.',
          'Tải lại trang một lần và kiểm tra kết nối mạng.',
          'Thử lại trên đúng tên miền của phòng và đúng tài khoản.',
          'Nếu lỗi còn lặp lại, chụp màn hình đầy đủ và gửi quản trị kỹ thuật.'
        ]
      },
      {
        title: 'Các thao tác phải dừng',
        bullets: [
          'Không khôi phục dữ liệu nhiều lần khi chưa hiểu lỗi.',
          'Không xóa trắng hoặc dọn kỳ để thử sửa một lỗi giao diện.',
          'Không sửa trực tiếp cấu hình cơ sở dữ liệu trên bản đang hoạt động.',
          'Không phát hành phiên bản mới khi chưa có kết quả build và kiểm tra.'
        ]
      }
    ]
  }
];

export const HELP_ROUTE_MAP: Record<string, string> = {
  '/input': 'nhap-cong-viec',
  '/my-works': 'cong-viec-cua-toi',
  '/ot-register': 'lam-them-ca-nhan',
  '/ot-my': 'lam-them-ca-nhan',
  '/ot-print': 'lam-them-ca-nhan',
  '/self-score-a': 'tu-cham-a-kpi-ca-nhan',
  '/kpi': 'tu-cham-a-kpi-ca-nhan',
  '/print-personal': 'tu-cham-a-kpi-ca-nhan',
  '/assign': 'giao-viec',
  '/approve': 'duyet-viec',
  '/approve-ot': 'duyet-lam-them',
  '/ot-summary': 'duyet-lam-them',
  '/score-acd': 'cham-kpi-acd',
  '/monitor': 'theo-doi-canh-bao',
  '/department-kpi': 'tong-hop-kpi',
  '/print-department': 'tong-hop-kpi',
  '/stats': 'thong-ke-bao-cao',
  '/admin/users': 'nhan-su-phan-quyen',
  '/admin/settings': 'cau-hinh-danh-muc',
  '/admin/sync': 'dong-bo-import',
  '/admin/database': 'sao-luu-khoi-phuc'
};

export function normalizeHelpText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

