const { RestaurantTable, Reservation } = require('../models');
const { Op } = require('sequelize');

/**
 * Lấy danh sách bàn kèm theo trạng thái được tính toán theo thời gian thực
 */
exports.getAllTables = async (req, res, next) => {
    try {
        const tables = await RestaurantTable.findAll();
        const now = new Date();

        // Khoảng thời gian để chuyển sang "Đã đặt" (30 phút trước)
        const bookingThreshold = new Date(now.getTime() + 30 * 60000);

        // Khoảng thời gian để "Hết hạn" (ví dụ 30 phút sau giờ đặt)
        const expiryThreshold = new Date(now.getTime() - 30 * 60000);

        const updatedTables = await Promise.all(tables.map(async (table) => {
            const tableData = table.toJSON();

            // Nếu bàn đang OCCUPIED, tìm giờ check-in để tính thời gian sử dụng
            if (table.status === 'OCCUPIED') {
                const checkInRes = await Reservation.findOne({
                    where: {
                        table_id: table.id,
                        status: 'CHECKED_IN'
                    },
                    order: [['updated_at', 'DESC']]
                });

                if (checkInRes) {
                    const diffMs = now - new Date(checkInRes.updated_at || checkInRes.updatedAt);
                    const diffMins = Math.floor(diffMs / 60000);
                    tableData.timeUsed = diffMins > 60
                        ? `${Math.floor(diffMins / 60)}h ${diffMins % 60}p`
                        : `${diffMins}p`;
                    tableData.guestCount = checkInRes.numberOfGuests;
                }
            }

            // Tìm đặt bàn gần nhất đang chờ (CONFIRMED)
            const activeReservation = await Reservation.findOne({
                where: {
                    table_id: table.id,
                    status: 'CONFIRMED',
                    reservationTime: {
                        [Op.gte]: expiryThreshold // Chỉ lấy các booking chưa quá hạn quá lâu
                    }
                },
                order: [['reservationTime', 'ASC']]
            });

            if (activeReservation) {
                const resTime = new Date(activeReservation.reservationTime);

                // Nếu hiện tại nằm trong khoảng [Giờ đặt - 30p, Giờ đặt + 30p]
                if (now >= new Date(resTime.getTime() - 30 * 60000)) {
                    // Nếu chưa đến giờ thì là Đã đặt, nếu quá giờ thì là Chờ khách (vẫn hiển thị BOOKED)
                    tableData.calculatedStatus = 'BOOKED';
                    tableData.activeReservation = activeReservation;

                    if (now >= resTime) {
                        tableData.waitingAlert = true; // Thông báo chờ khách
                    }
                }
            }

            // Nếu bàn đang OCCUPIED thì giữ nguyên
            if (table.status === 'OCCUPIED') {
                tableData.calculatedStatus = 'OCCUPIED';
            } else if (!tableData.calculatedStatus) {
                tableData.calculatedStatus = table.status; // AVAILABLE hoặc CLEANING
            }

            return tableData;
        }));

        res.json(updatedTables);
    } catch (error) {
        console.error('Error in getAllTables:', error);
        next(error);
    }
};

/**
 * Cập nhật trạng thái bàn thủ công (ví dụ: xong việc dọn dẹp)
 */
exports.updateTableStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await RestaurantTable.update({ status }, { where: { id } });
        res.json({ message: "Cập nhật trạng thái bàn thành công" });
    } catch (error) {
        next(error);
    }
};

/**
 * Lấy thông tin bàn bằng mã QR
 */
exports.getTableByQRCode = async (req, res, next) => {
    try {
        const { qrCode } = req.params;
        const table = await RestaurantTable.findOne({
            where: { qrCode }
        });

        if (!table) {
            return res.status(404).json({ message: "Không tìm thấy bàn với mã QR này" });
        }

        res.json(table);
    } catch (error) {
        next(error);
    }
};
