const { Reservation, RestaurantTable, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Tạo đặt bàn mới
 */
exports.createReservation = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { table_id, guestName, guestPhone, reservationTime, numberOfGuests, note, user_id } = req.body;

        // Kiểm tra xem bàn có tồn tại không
        const table = await RestaurantTable.findByPk(table_id);
        if (!table) {
            return res.status(404).json({ message: "Không tìm thấy bàn" });
        }

        // Tạo bản ghi đặt bàn
        const reservation = await Reservation.create({
            table_id,
            user_id,
            guestName,
            guestPhone,
            reservationTime,
            numberOfGuests,
            note,
            status: 'CONFIRMED'
        }, { transaction: t });

        await t.commit();
        res.status(201).json({
            message: "Đặt bàn thành công",
            data: reservation
        });
    } catch (error) {
        await t.rollback();
        next(error);
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
