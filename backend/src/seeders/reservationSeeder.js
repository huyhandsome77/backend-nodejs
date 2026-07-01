const { Reservation, RestaurantTable } = require('../models');

const seedReservations = async () => {
    try {
        const count = await Reservation.count();
        if (count === 0) {
            const now = new Date();

            // 1. Bàn đang sử dụng -> Bàn 1
            const timePast = new Date(now.getTime() - 45 * 60000); // Đã vào bàn 45p trước

            // 2. Bàn sắp đến giờ (15p tới) -> Bàn 4
            const timeSoon = new Date(now.getTime() + 15 * 60000);

            // 3. Bàn trễ hẹn (10p trước) -> Bàn 5
            const timeLate = new Date(now.getTime() - 10 * 60000);

            const reservations = [
                {
                    id: 1,
                    table_id: 1,
                    guestName: "Khách Đang Ăn",
                    guestPhone: "0111222333",
                    reservationTime: timePast,
                    numberOfGuests: 4,
                    status: 'CHECKED_IN',
                    updated_at: timePast // Giả lập giờ check-in
                },
                {
                    id: 2,
                    table_id: 4,
                    guestName: "Nguyễn Văn A",
                    guestPhone: "0901234567",
                    reservationTime: timeSoon,
                    numberOfGuests: 4,
                    status: 'CONFIRMED'
                },
                {
                    id: 3,
                    table_id: 5,
                    guestName: "Trần Thị B",
                    guestPhone: "0987654321",
                    reservationTime: timeLate,
                    numberOfGuests: 2,
                    status: 'CONFIRMED'
                }
            ];

            await Reservation.bulkCreate(reservations);

            // Cập nhật trạng thái bàn 1 thành OCCUPIED
            await RestaurantTable.update({ status: 'OCCUPIED' }, { where: { id: 1 } });

            console.log('[Seeder] Đã tạo dữ liệu đặt bàn mẫu.');
        }
    } catch (error) {
        console.error('[Seeder] Lỗi khi tạo đặt bàn mẫu:', error);
    }
};

module.exports = { seedReservations };
