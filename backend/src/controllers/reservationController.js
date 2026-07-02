const { Reservation, RestaurantTable, User, sequelize } = require('../models');
const { Op } = require('sequelize');

exports.createReservation = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { guestName, guestPhone, reservationTime, numberOfGuests, note, user_id } = req.body;

        const startTime = new Date(reservationTime);
        const durationHours = 2;
        const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);

        const overlappingReservations = await Reservation.findAll({
            where: {
                status: { [Op.in]: ['CONFIRMED', 'CHECKED_IN'] },
                [Op.and]: [
                    {
                        reservationTime: {
                            [Op.lt]: endTime
                        }
                    },
                    sequelize.where(
                        sequelize.fn('DATE_ADD', sequelize.col('reservationTime'), sequelize.literal(`INTERVAL ${durationHours} HOUR`)),
                        { [Op.gt]: startTime }
                    )
                ]
            },
            attributes: ['table_id'],
            transaction: t
        });

        const occupiedTableIds = overlappingReservations.map(r => r.table_id);

        const availableTable = await RestaurantTable.findOne({
            where: {
                capacity: { [Op.gte]: numberOfGuests },
                id: { [Op.notIn]: occupiedTableIds.length > 0 ? occupiedTableIds : [-1] },
                status: { [Op.ne]: 'CLEANING' }
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

        reservation.status = 'CHECKED_IN';
        await reservation.save({ transaction: t });

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

exports.getAllReservations = async (req, res, next) => {
    try {
        const reservations = await Reservation.findAll({
            include: [{ model: RestaurantTable, as: 'table' }, { model: User, as: 'User' }],
            order: [['reservationTime', 'ASC']]
        });
        res.json(reservations);
    } catch (error) {
        next(error);
    }
};
