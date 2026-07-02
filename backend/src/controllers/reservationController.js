const { Reservation, RestaurantTable, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Tạo đặt bàn mới - Tự động phân bổ bàn
 */
exports.createReservation = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { guestName, guestPhone, reservationTime, numberOfGuests, note, user_id } = req.body;

        // 1. Xác định khung giờ đặt (Giả định mỗi lượt là 2 tiếng)
        const startTime = new Date(reservationTime);
        const durationHours = 2;
        const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);

        // 2. Tìm tất cả các đơn đặt bàn có khả năng chồng lấn thời gian
        // Chồng lấn khi: (Bắt đầu mới < Kết thúc cũ) AND (Kết thúc mới > Bắt đầu cũ)
        const overlappingReservations = await Reservation.findAll({
            where: {
                status: { [Op.in]: ['CONFIRMED', 'CHECKED_IN'] },
                [Op.and]: [
                    {
                        reservationTime: {
                            [Op.lt]: endTime // Bắt đầu cũ < Kết thúc mới
                        }
                    },
                    sequelize.where(
                        sequelize.fn('DATE_ADD', sequelize.col('reservationTime'), sequelize.literal(`INTERVAL ${durationHours} HOUR`)),
                        { [Op.gt]: startTime } // Kết thúc cũ > Bắt đầu mới
                    )
                ]
            },
            attributes: ['table_id'],
            transaction: t
        });

        const occupiedTableIds = overlappingReservations.map(r => r.table_id);

        // 3. Tìm bàn trống phù hợp
        // Điều kiện: Sức chứa đủ, Không nằm trong danh sách bàn đã bận, và Sắp xếp theo sức chứa tăng dần để tối ưu
        const availableTable = await RestaurantTable.findOne({
            where: {
                capacity: { [Op.gte]: numberOfGuests },
                id: { [Op.notIn]: occupiedTableIds.length > 0 ? occupiedTableIds : [-1] },
                status: { [Op.ne]: 'CLEANING' } // Không chọn bàn đang dọn dẹp
            },
            order: [['capacity', 'ASC']],
            transaction: t
        });

        if (!availableTable) {
            await t.rollback();
            return res.status(400).json({
                message: "Rất tiếc, hiện tại không còn bàn trống phù hợp với số lượng khách và khung giờ bạn yêu cầu. Vui lòng chọn khung giờ khác!"
            });
        }

        // 4. Tạo bản ghi đặt bàn với table_id đã tìm được
        const reservation = await Reservation.create({
            table_id: availableTable.id,
            user_id: user_id || null,
            guestName,
            guestPhone,
            reservationTime: startTime,
            numberOfGuests,
            note,
            status: 'CONFIRMED'
        }, { transaction: t });

        await t.commit();
        res.status(201).json({
            message: "Đặt bàn thành công",
            data: {
                ...reservation.toJSON(),
                tableNumber: availableTable.tableNumber
            }
        });
    } catch (error) {
        await t.rollback();
        console.error("Create Reservation Error:", error);
        res.status(500).json({ message: "Lỗi hệ thống khi đặt bàn", error: error.message });
    }
};

/**
 * Xác nhận khách đã đến (Check-in)
 */
exports.checkIn = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const reservation = await Reservation.findByPk(id);

        if (!reservation) {
            return res.status(404).json({ message: "Không tìm thấy thông tin đặt bàn" });
        }

        if (reservation.status !== 'CONFIRMED') {
            return res.status(400).json({ message: "Trạng thái đặt bàn không hợp lệ để check-in" });
        }

        // Cập nhật trạng thái đặt bàn
        reservation.status = 'CHECKED_IN';
        await reservation.save({ transaction: t });

        // Cập nhật trạng thái bàn sang OCCUPIED
        await RestaurantTable.update(
            { status: 'OCCUPIED' },
            { where: { id: reservation.table_id }, transaction: t }
        );

        await t.commit();
        res.json({ message: "Xác nhận nhận bàn thành công" });
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

/**
 * Hủy đặt bàn
 */
exports.cancelReservation = async (req, res, next) => {
    try {
        const { id } = req.params;
        const reservation = await Reservation.findByPk(id);

        if (!reservation) {
            return res.status(404).json({ message: "Không tìm thấy thông tin đặt bàn" });
        }

        reservation.status = 'CANCELLED';
        await reservation.save();

        res.json({ message: "Đã hủy đặt bàn" });
    } catch (error) {
        next(error);
    }
};

/**
 * Lấy danh sách đặt bàn của người dùng đang đăng nhập
 */
exports.getMyReservations = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const reservations = await Reservation.findAll({
            where: { user_id: userId },
            include: [{ model: RestaurantTable, as: 'table' }],
            order: [['reservationTime', 'DESC']]
        });
        res.json(reservations);
    } catch (error) {
        next(error);
    }
};

/**
 * Lấy danh sách đặt bàn
 */
exports.getAllReservations = async (req, res, next) => {
    try {
        const reservations = await Reservation.findAll({
            include: [{ model: RestaurantTable, as: 'table' }],
            order: [['reservationTime', 'ASC']]
        });
        res.json(reservations);
    } catch (error) {
        next(error);
    }
};

/**
 * Lấy danh sách đặt bàn của người dùng đang đăng nhập
 */
exports.getMyReservations = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const reservations = await Reservation.findAll({
            where: { user_id: userId },
            include: [{ model: RestaurantTable, as: 'table' }],
            order: [['reservationTime', 'DESC']]
        });
        res.json(reservations);
    } catch (error) {
        next(error);
    }
};
