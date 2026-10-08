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
  LEADS: {
    name: 'Leads',
    headers: ['ID', 'Tên lead', 'Liên hệ', 'Giai đoạn', 'Giá trị', 'Next action', 'Hạn next action',
      'Nguồn', 'Ghi chú', 'Ngày tạo', 'Liên hệ cuối', 'Cập nhật', 'Lý do thua'],
  },
  LEAD_LOG: {
    name: 'LeadLog',
    headers: ['Ngày', 'ID lead', 'Tên lead', 'Ghi chú', 'Thời gian'],
  },
};

// Phễu bán hàng. Sheet lưu `label`; `alias` là các cách gõ tắt (đã bỏ dấu, chữ thường).
const LEAD_STAGES = [
  { key: 'new', label: 'Mới', alias: ['moi', 'new'] },
  { key: 'contacted', label: 'Đã liên hệ', alias: ['lien he', 'da lien he', 'contacted'] },
  { key: 'meeting', label: 'Họp/Demo', alias: ['hop', 'demo', 'hop demo', 'meeting'] },
  { key: 'proposal', label: 'Báo giá', alias: ['bao gia', 'proposal', 'quote'] },
  { key: 'negotiating', label: 'Đàm phán', alias: ['dam phan', 'negotiating'] },
  { key: 'won', label: 'Thắng', alias: ['thang', 'won', 'chot'] },
  { key: 'lost', label: 'Thua', alias: ['thua', 'lost', 'rot'] },
];
const LEAD_CLOSED = ['won', 'lost'];
const STALE_DAYS = 7; // quá số ngày này không liên hệ thì lead bị gắn cờ “nguội”

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
