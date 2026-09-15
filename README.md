# Tour Booking — Website Đặt Tour Du Lịch Việt Nam

Full-stack: xem / tìm / lọc tour, đặt tour theo ngày + số khách, áp coupon,
quản lý booking, yêu thích, đánh giá + trang Admin quản lý tour/booking/user/coupon.

Stack: **React 19 + Vite + Tailwind v4** + **Express + Prisma 5 + PostgreSQL**,
auth **JWT**, đa ngôn ngữ **vi/en/ja/ko/zh**.

## Tính năng chính

- **Customer:** tìm kiếm + lọc (category/giá/rating/điểm đi) + sort + phân trang (đồng bộ URL),
  chi tiết tour (gallery, lịch trình, dịch vụ gồm/không gồm), checkout (`tourId/date/guests`
  trên URL nên F5 không mất), nhập coupon, thanh toán CASH/BANK_TRANSFER/CARD,
  hủy booking (hoàn ghế), yêu thích, review (chỉ khi booking COMPLETED, 1 review/booking).
- **Admin (`/admin`):** thống kê, CRUD tour, đổi trạng thái booking,
  đổi role/khóa user, CRUD coupon. Mọi action nguy hiểm đều có dialog xác nhận.

## Cấu trúc thư mục

```text
src/            # Frontend: pages/, components/, contexts/, routes/guards, services/api.ts, i18n/
backend/src/    # Backend: routes/ → controllers/ → services/ → Prisma
backend/prisma/ # schema.prisma (8 bảng) + seed.ts (35 tours, 4 coupons, 2 user demo)
```

## Chạy nhanh

Yêu cầu: Node 18+, PostgreSQL (tạo DB `TourBookingDB` trong pgAdmin).

```bash
# 1. Backend
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed   # 35 tours + 4 coupons + admin/customer
npm run dev          # http://localhost:5000

# 2. Frontend (terminal mới, ở thư mục gốc)
npm install
npm run dev          # http://localhost:3000
```

## Biến môi trường

| File | Biến |
|---|---|
| Root `.env` | `VITE_API_URL=http://localhost:5000/api` |
| `backend/.env` | `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN=7d`, `PORT=5000`, `FRONTEND_URL=http://localhost:3000` |

Mẫu: [`.env.example`](./.env.example). `.env` đã gitignore, không commit.

## Tài khoản & mã demo

```text
Admin:    admin@tourbooking.local / Admin123!
Customer: customer@tourbooking.local / Customer123!
Coupon: WELCOME10 (-10%), FIXED200K (-200k), SUMMER15 (-15%), VIP500K (-500k)
```

## Ghi chú nghiệp vụ

- Giá backend tự tính: `subtotal = price × guests`, `discount = min(coupon, subtotal)`.
- Tạo booking = 1 Prisma `$transaction`: Booking + BookingGuest + Payment (luôn `PENDING`)
  + trừ `availableSeats` + tăng `Coupon.usedCount`.
- DB: 8 bảng `User, Tour, Booking, BookingGuest, Payment, Coupon, Review, Favorite`
  (xem `backend/prisma/schema.prisma`).
