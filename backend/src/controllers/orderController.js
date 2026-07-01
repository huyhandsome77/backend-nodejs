const { Order, OrderItem, Product, RestaurantTable, User, sequelize } = require('../models');

/**
 * Tạo đơn hàng mới (Dùng cho cả QR Order và App Order)
 */
exports.createOrder = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { table_id, items, note, user_id } = req.body;

        if (!items || !items.length) {
            return res.status(400).json({ message: "Đơn hàng phải có ít nhất một món ăn" });
        }

        let totalPrice = 0;
        const orderItemsData = [];

        // Kiểm tra và tính giá từng item
        for (const item of items) {
            const product = await Product.findByPk(item.product_id);
            if (!product) {
                throw new Error(`Sản phẩm với ID ${item.product_id} không tồn tại`);
            }
            const itemTotal = product.price * item.quantity;
            totalPrice += itemTotal;

            orderItemsData.push({
                product_id: item.product_id,
                quantity: item.quantity,
                unitPrice: product.price,
                totalPrice: itemTotal,
                note: item.note || ""
            });
        }

        // Tạo Order
        const order = await Order.create({
            table_id,
            user_id: user_id || null, // Có thể null nếu khách vãng lai quét QR
            totalPrice,
            finalPrice: totalPrice, // Tạm thời chưa tính discount
            note,
            status: 'PENDING',
            paymentStatus: 'UNPAID'
        }, { transaction: t });

        // Tạo OrderItems
        const itemsWithOrderId = orderItemsData.map(item => ({
            ...item,
            order_id: order.id
        }));
        await OrderItem.bulkCreate(itemsWithOrderId, { transaction: t });

        // Nếu có table_id, cập nhật trạng thái bàn sang OCCUPIED
        if (table_id) {
            await RestaurantTable.update(
                { status: 'OCCUPIED' },
                { where: { id: table_id }, transaction: t }
            );
        }

        await t.commit();

        // Lấy lại order kèm chi tiết để trả về
        const createdOrder = await Order.findByPk(order.id, {
            include: [
                { model: OrderItem, include: [Product] }
            ]
        });

        res.status(201).json({
            message: "Đặt món thành công",
            data: createdOrder
        });

    } catch (error) {
        await t.rollback();
        console.error("Create Order Error:", error);
        res.status(400).json({ message: error.message });
    }
};

/**
 * Lấy tất cả đơn hàng (có phân trang và lọc)
 */
exports.getAllOrders = async (req, res, next) => {
    try {
        const { status, paymentStatus } = req.query;
        const whereClause = {};
        if (status) whereClause.status = status;
        if (paymentStatus) whereClause.paymentStatus = paymentStatus;

        const orders = await Order.findAll({
            where: whereClause,
            include: [
                { model: RestaurantTable, as: 'RestaurantTable' },
                { model: User, attributes: ['id', 'fullName', 'phone'] },
                {
                    model: OrderItem,
                    include: [{ model: Product }]
                }
            ],
            order: [['created_at', 'DESC']]
        });
        res.json(orders);
    } catch (error) {
        next(error);
    }
};

/**
 * Lấy chi tiết một đơn hàng
 */
exports.getOrderById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = await Order.findByPk(id, {
            include: [
                { model: RestaurantTable, as: 'RestaurantTable' },
                { model: User, attributes: ['id', 'fullName', 'phone'] },
                {
                    model: OrderItem,
                    include: [{ model: Product }]
                }
            ]
        });

        if (!order) {
            return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
        }
        res.json(order);
    } catch (error) {
        next(error);
    }
};

/**
 * Cập nhật trạng thái đơn hàng
 */
exports.updateOrderStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, paymentStatus } = req.body;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
        }

        const updateData = {};
        if (status) updateData.status = status;
        if (paymentStatus) updateData.paymentStatus = paymentStatus;

        await order.update(updateData);
        res.json({ message: "Cập nhật đơn hàng thành công", data: order });
    } catch (error) {
        next(error);
    }
};

/**
 * Xóa đơn hàng (thường là Soft Delete hoặc chỉ cho phép xóa khi PENDING/CANCELLED)
 */
exports.deleteOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
        }

        await order.destroy();
        res.json({ message: "Xóa đơn hàng thành công" });
    } catch (error) {
        next(error);
    }
};

/**
 * Lấy hóa đơn hiện tại của một bàn
 */
exports.getCurrentOrderByTable = async (req, res, next) => {
    try {
        const { tableId } = req.params;

        const order = await Order.findOne({
            where: {
                table_id: tableId,
                paymentStatus: 'UNPAID',
                status: ['CONFIRMED', 'PREPARING', 'READY']
            },
            include: [
                {
                    model: OrderItem,
                    include: [{ model: Product }]
                }
            ]
        });

        if (!order) {
            return res.status(404).json({ message: "Bàn hiện không có hóa đơn chưa thanh toán" });
        }

        res.json(order);
    } catch (error) {
        next(error);
    }
};

/**
 * Thanh toán hóa đơn
 */
exports.payOrder = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const order = await Order.findByPk(id);

        if (!order) {
            return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
        }

        if (order.paymentStatus === 'PAID') {
            return res.status(400).json({ message: "Đơn hàng này đã được thanh toán trước đó" });
        }

        // Cập nhật trạng thái đơn hàng
        await order.update({
            paymentStatus: 'PAID',
            status: 'COMPLETED'
        }, { transaction: t });

        // Cập nhật trạng thái bàn về CLEANING (đang dọn dẹp) hoặc AVAILABLE
        if (order.table_id) {
            await RestaurantTable.update(
                { status: 'AVAILABLE' }, // Chuyển về Trống luôn cho tiện test
                { where: { id: order.table_id }, transaction: t }
            );
        }

        await t.commit();
        res.json({ message: "Thanh toán thành công. Bàn hiện đã sẵn sàng." });
    } catch (error) {
        await t.rollback();
        next(error);
    }
};
