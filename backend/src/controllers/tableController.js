const { RestaurantTable, Reservation } = require('../models');
const { Op } = require('sequelize');

exports.getAllTables = async (req, res, next) => {
    try {
        const tables = await RestaurantTable.findAll();
        const now = new Date();
        const bookingThreshold = new Date(now.getTime() + 30 * 60000);
        const expiryThreshold = new Date(now.getTime() - 30 * 60000);

        const updatedTables = await Promise.all(tables.map(async (table) => {
            const tableData = table.toJSON();

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

            const activeReservation = await Reservation.findOne({
                where: {
                    table_id: table.id,
                    status: 'CONFIRMED',
                    reservationTime: {
                        [Op.gte]: expiryThreshold
                    }
                },
                order: [['reservationTime', 'ASC']]
            });

            if (activeReservation) {
                const resTime = new Date(activeReservation.reservationTime);
                if (now >= new Date(resTime.getTime() - 30 * 60000)) {
                    tableData.calculatedStatus = 'BOOKED';
                    tableData.activeReservation = activeReservation;

                    if (now >= resTime) {
                        tableData.waitingAlert = true;
                    }
                }
            }

            if (table.status === 'OCCUPIED') {
                tableData.calculatedStatus = 'OCCUPIED';
            } else if (!tableData.calculatedStatus) {
                tableData.calculatedStatus = table.status;
            }

            return tableData;
        }));

        res.json(updatedTables);
    } catch (error) {
        console.error('Error in getAllTables:', error);
        next(error);
    }
};

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

exports.bulkCreateTables = async (req, res, next) => {
    try {
        const tables = req.body;

        if (!Array.isArray(tables)) {
            return res.status(400).json({ message: "Dữ liệu gửi lên phải là một mảng" });
        }

        const results = await RestaurantTable.bulkCreate(tables, {
            updateOnDuplicate: ['capacity', 'qrCode', 'status']
        });

        res.status(201).json({
            message: `Đã xử lý thành công ${results.length} bàn trong hệ thống`,
            data: results
        });
    } catch (error) {
        console.error("Bulk Create Tables Error:", error);
        res.status(500).json({ message: "Lỗi khi nạp dữ liệu bàn", error: error.message });
    }
};
