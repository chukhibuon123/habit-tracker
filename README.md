# Web3 Habit Tracker

Ứng dụng phi tập trung (dApp) giúp giữ kỷ luật bằng tiền cọc: bạn đặt cọc AVAX cho một mục tiêu kèm thời hạn. Hoàn thành đúng hạn thì nhận lại cọc, trễ hạn thì số cọc có thể bị tịch thu.

Dự án chạy trên mạng thử nghiệm Avalanche Fuji, chỉ dùng test AVAX.

## Demo

- Video demo: https://drive.google.com/file/d/1bpMIQ-9MbNGGf35T9gM6Bd7Y_rhOV-bw/view?usp=sharing

## Cách hoạt động

1. Người dùng kết nối ví MetaMask và tạo một task: tên mục tiêu, thời hạn (số ngày), số AVAX đặt cọc.
2. Smart contract giữ số AVAX đó và lưu task cùng deadline (dạng Unix timestamp, đơn vị giây).
3. Nếu người dùng bấm hoàn thành trước deadline, contract hoàn lại toàn bộ tiền cọc.
4. Nếu quá deadline mà task chưa hoàn thành, bất kỳ ai cũng có thể gọi `punishTask` để tịch thu số cọc đó; người gọi nhận số tiền bị tịch thu.

## Công nghệ

- Smart contract: Solidity `^0.8.19`, build và test bằng [Foundry](https://book.getfoundry.sh/)
- Frontend: React + Vite, [ethers.js](https://docs.ethers.org/) v6
- Ví: MetaMask
- Mạng: Avalanche Fuji C-Chain (testnet)

## Thông tin triển khai

| Mục | Giá trị |
| --- | --- |
| Mạng | Avalanche Fuji C-Chain |
| Chain ID | 43113 |
| RPC URL | `https://api.avax-test.network/ext/bc/C/rpc` |
| Địa chỉ contract | `0x17F825a57eB40bd8C192E38b61Cc242f48faE4E9` |

## Cấu trúc thư mục

```
.
├── src/HabitTracker.sol        # Smart contract
├── test/HabitTracker.t.sol     # Test bằng Foundry
├── frontend/                   # Giao diện React + Vite
│   └── src/App.jsx
└── README.md
```

## Chạy thử trên máy

Yêu cầu: [Foundry](https://book.getfoundry.sh/getting-started/installation), Node.js + npm, trình duyệt có MetaMask.

### 1. Contract và test

```bash
git clone --recurse-submodules URL_CUA_REPO
cd habit-tracker
forge build
forge test -vv
```

### 2. Giao diện

```bash
cd frontend
npm install
npm run dev
```

Mở địa chỉ localhost mà terminal in ra, **bằng trình duyệt đã cài MetaMask**. Trang sẽ đề nghị chuyển MetaMask sang mạng Avalanche Fuji.

Ví dùng để thử cần có **test AVAX** trên Fuji (xin từ faucet của Avalanche, ví dụ qua Builder Hub). Chỉ dùng ví phụ để test, tuyệt đối không dùng ví chứa tiền thật.

Địa chỉ contract được đặt ở biến `CONTRACT_ADDRESS` đầu file `frontend/src/App.jsx`. Nếu bạn tự deploy contract riêng, hãy thay địa chỉ này.

## Các hàm của contract

| Hàm | Mô tả |
| --- | --- |
| `createTask(string _name, uint256 _deadline)` (payable) | Tạo task và khóa số AVAX gửi kèm làm tiền cọc. Yêu cầu cọc lớn hơn 0 và deadline ở tương lai. |
| `completeTask(uint256 _taskIndex)` | Đánh dấu hoàn thành và hoàn cọc. Chỉ chủ task gọi được, và phải trước deadline. |
| `punishTask(address _lazyUser, uint256 _taskIndex)` | Tịch thu cọc của task đã quá hạn và chưa hoàn thành. Người gọi nhận số tiền tịch thu. |
| `getTasks(address _user)` (view) | Trả về toàn bộ task của một địa chỉ. |

## Bảo mật

- Các hàm chuyển tiền (`completeTask`, `punishTask`) cập nhật trạng thái trước khi gửi AVAX để giảm rủi ro tấn công reentrancy.
- Bộ test Foundry kiểm tra luồng tạo task, hoàn thành, tịch thu và các trường hợp bị từ chối (trễ hạn, hoàn thành hai lần, phạt khi chưa hết hạn, index sai...).

## Hạn chế đã biết

Đây là sản phẩm thử nghiệm, chưa được kiểm toán, và chỉ dành cho testnet.

- Lỗ hổng self-slash: vì người gọi `punishTask` nhận luôn số tiền tịch thu, một người trễ hạn có thể dùng ví thứ hai của chính mình để gọi `punishTask` và lấy lại tiền cọc. Khi đó việc trễ deadline không gây mất tiền thật, nên cơ chế cam kết chưa chặt. Lỗi này được ghi lại bằng test `test_KnownIssue_SelfSlashWithSecondWallet`.
- Tiền cọc có thể nằm lại trong contract: nếu một task quá hạn mà không ai gọi `punishTask`, số cọc vẫn bị khóa cho đến khi có người gọi.
- Deadline dựa trên `block.timestamp`: thời gian của mạng có thể lệch vài giây so với đồng hồ máy người dùng, nên ở sát deadline kết quả có thể khác với giao diện.
- Chưa có chức năng sửa hoặc hủy task.

### Hướng cải thiện

- Gửi số tiền tịch thu vào một địa chỉ cố định (quỹ chung hoặc địa chỉ đốt) thay vì cho người gọi, để loại bỏ lỗ hổng self-slash.
- Thêm sự kiện (events) để giao diện theo dõi thay đổi mà không cần tải lại danh sách.

## Giấy phép

Contract khai báo giấy phép MIT trong phần đầu file `HabitTracker.sol`.
