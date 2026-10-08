/**
 * Cấu hình chung. Các giá trị bí mật (token, API key) để trong Script Properties,
 * KHÔNG hard-code ở đây. Xem README.md mục "Cài đặt".
 */

const TZ = 'Asia/Ho_Chi_Minh';

const SHEETS = {
  EXPENSES: {
    name: 'Expenses',
    headers: ['Thời gian', 'Ngày', 'Số tiền', 'Danh mục', 'Mô tả', 'Nguồn', 'Tin nhắn gốc'],
  },
  HABITS: {
    name: 'Habits',
    headers: ['Thói quen', 'Mục tiêu/tuần', 'Đang theo dõi', 'Ngày tạo'],
  },
  HABIT_LOG: {
    name: 'HabitLog',
    headers: ['Ngày', 'Thói quen', 'Ghi chú', 'Thời gian'],
  },
  TASKS: {
    name: 'Tasks',
    headers: ['ID', 'Công việc', 'Trạng thái', 'Hạn', 'Dự án', 'Ngày tạo', 'Ngày xong'],
  },
};

// Từ khoá -> danh mục chi tiêu. Khớp theo từ khoá dài nhất; sửa tuỳ ý.
const CATEGORIES = {
  'Ăn uống': ['ăn', 'cơm', 'phở', 'bún', 'miến', 'cháo', 'bánh mì', 'cafe', 'cà phê', 'cf', 'trà sữa',
    'trà', 'bia', 'nhậu', 'lẩu', 'nướng', 'bánh', 'highlands', 'starbucks', 'đi chợ', 'siêu thị', 'grabfood', 'shopeefood'],
  'Đi lại': ['grab', 'xăng', 'taxi', 'gojek', 'xanh sm', 'gửi xe', 'vé xe', 'bus', 'vé máy bay', 'rửa xe', 'sửa xe'],
  'Mua sắm': ['quần', 'áo', 'giày', 'dép', 'túi', 'shopee', 'lazada', 'tiki', 'tiktok shop', 'mỹ phẩm'],
  'Nhà cửa': ['tiền nhà', 'thuê nhà', 'tiền điện', 'tiền nước', 'internet', 'wifi', 'gas', 'đồ gia dụng'],
  'Sức khỏe': ['thuốc', 'khám', 'gym', 'bệnh viện', 'nha khoa', 'vitamin', 'yoga'],
  'Giải trí': ['phim', 'netflix', 'spotify', 'youtube', 'game', 'du lịch', 'karaoke', 'concert'],
  'Học tập': ['sách', 'khóa học', 'khoá học', 'học phí', 'udemy', 'coursera'],
  'Hóa đơn': ['điện thoại', '4g', '5g', 'nạp thẻ', 'bảo hiểm', 'icloud', 'google one', 'chatgpt', 'claude'],
  'Quà tặng': ['quà', 'biếu', 'mừng', 'đám cưới', 'sinh nhật', 'từ thiện'],
};
const DEFAULT_CATEGORY = 'Khác';

const TASK_STATUS = { TODO: 'todo', DOING: 'doing', DONE: 'done' };

// Script Properties
function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}
