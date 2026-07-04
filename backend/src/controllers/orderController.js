const { Order, OrderItem, Product, RestaurantTable, User, sequelize } = require('../models');

exports.createOrder = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { table_id, items, note, used_points } = req.body;
        // Ưu tiên lấy userId từ Token để chính xác tuyệt đối
        const user_id = req.user ? req.user.id : (req.body.user_id || null);

        console.log(">>> Create Order Request:", { table_id, user_id, used_points });

        if (!items || !items.length) {
            return res.status(400).json({ message: "Đơn hàng phải có ít nhất một món ăn" });
        }

        let totalPrice = 0;
        const orderItemsData = [];

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

        // Xử lý điểm thưởng (1 điểm = 1đ)
        let discountAmount = 0;
        const pointsToUse = parseInt(used_points) || 0;

        if (user_id && pointsToUse > 0) {
            const user = await User.findByPk(user_id);
            console.log(">>> Found User for points:", user ? { id: user.id, points: user.points } : "Not Found");

            if (user && user.points >= pointsToUse) {
                discountAmount = pointsToUse;
                // Trừ điểm của người dùng
                const newPoints = user.points - pointsToUse;
                await user.update({ points: newPoints }, { transaction: t });
                console.log(`>>> Deducted ${pointsToUse} points. New points: ${newPoints}`);
            } else if (user && user.points < pointsToUse) {
                throw new Error(`Số điểm tích lũy (${user.points}) không đủ để áp dụng (${pointsToUse})`);
            }
        }

        const finalPrice = Math.max(0, totalPrice - discountAmount);
        console.log(">>> Pricing calculation:", { totalPrice, discountAmount, finalPrice });

        const order = await Order.create({
            table_id,
            user_id: user_id || null,
            totalPrice,
            discountAmount,
            finalPrice,
            note,
            status: 'PENDING',
            paymentStatus: 'UNPAID'
        }, { transaction: t });

        const itemsWithOrderId = orderItemsData.map(item => ({
            ...item,
            order_id: order.id
        }));
        await OrderItem.bulkCreate(itemsWithOrderId, { transaction: t });

        if (table_id) {
            await RestaurantTable.update(
                { status: 'OCCUPIED' },
                { where: { id: table_id }, transaction: t }
            );
        }

        await t.commit();

        const createdOrder = await Order.findByPk(order.id, {
            include: [
                { model: OrderItem, as: 'OrderItems', include: [{ model: Product, as: 'Product' }] }
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
                { model: User, as: 'User', attributes: ['id', 'fullName', 'phone'] },
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    include: [{ model: Product, as: 'Product' }]
                }
            ],
            order: [['created_at', 'DESC']]
        });
        res.json(orders);
    } catch (error) {
        console.error("Get All Orders Error:", error);
        next(error);
    }
};

exports.getOrderById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = await Order.findByPk(id, {
            include: [
                { model: RestaurantTable, as: 'RestaurantTable' },
                { model: User, as: 'User', attributes: ['id', 'fullName', 'phone'] },
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    include: [{ model: Product, as: 'Product' }]
                }
            ]
        });

        if (!order) {
            return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
        }
        res.json(order);
    } catch (error) {
        console.error("Get Order By Id Error:", error);
        next(error);
    }
};

exports.updateOrderStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
        }

        await order.update({ status });
        res.json({ message: "Cập nhật trạng thái thành công", data: order });
    } catch (error) {
        console.error("Update Order Status Error:", error);
        next(error);
    }
};

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
        console.error("Delete Order Error:", error);
        next(error);
    }
};

exports.getCurrentOrderByTable = async (req, res, next) => {
    try {
        const { tableId } = req.params;

        const orders = await Order.findAll({
            where: {
                table_id: tableId,
                paymentStatus: 'UNPAID',
                status: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY']
            },
            include: [
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    include: [{ model: Product, as: 'Product' }]
                }
            ]
        });

        if (!orders || orders.length === 0) {
            return res.status(404).json({ message: "Bàn hiện không có hóa đơn chưa thanh toán" });
        }

        res.json(orders);
    } catch (error) {
        console.error("Get Current Order By Table Error:", error);
        next(error);
    }
};

exports.payAllOrdersByTable = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { tableId } = req.params;
        const { paymentMethod } = req.body;

        const orders = await Order.findAll({
            where: {
                table_id: tableId,
                paymentStatus: 'UNPAID'
            }
        });

        if (orders.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy đơn hàng cần thanh toán" });
        }

        const orderIds = orders.map(o => o.id);

        await Order.update({
            paymentStatus: 'PAID',
            status: 'COMPLETED',
            paymentMethod: paymentMethod || 'CASH'
        }, {
            where: { id: orderIds },
            transaction: t
        });

        await RestaurantTable.update(
            { status: 'AVAILABLE' },
            { where: { id: tableId }, transaction: t }
        );

        await t.commit();
        res.json({ message: `Đã thanh toán thành công ${orders.length} đơn hàng.` });
    } catch (error) {
        if (t) await t.rollback();
        console.error("Pay All Orders Error:", error);
        next(error);
    }
};

exports.payOrder = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { paymentMethod } = req.body;

        const order = await Order.findByPk(id);

        if (!order) {
            return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
        }

        if (order.paymentStatus === 'PAID') {
            return res.status(400).json({ message: "Đơn hàng này đã được thanh toán trước đó" });
        }

        await order.update({
            paymentStatus: 'PAID',
            status: 'COMPLETED',
            paymentMethod: paymentMethod || 'CASH'
        }, { transaction: t });

        if (order.table_id) {
            await RestaurantTable.update(
                { status: 'AVAILABLE' },
                { where: { id: order.table_id }, transaction: t }
            );
        }

        await t.commit();
        res.json({ message: "Thanh toán thành công. Bàn hiện đã sẵn sàng." });
    } catch (error) {
        if (t) await t.rollback();
        console.error("Pay Order Error:", error);
        next(error);
    }
};

exports.getPaymentQR = async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = await Order.findByPk(id);

        if (!order) {
            return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
        }

        const BANK_ID = "970422";
        const ACCOUNT_NO = "0123456789";
        const ACCOUNT_NAME = "NHA HANG FUTURE SUSHI";

        const amount = Math.round(order.finalPrice);
        const description = `THANH TOAN DON HANG ${order.id}`;

        const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact.png?amount=${amount}&addInfo=${description}&accountName=${ACCOUNT_NAME}`;

        res.json({ qrUrl });
    } catch (error) {
        next(error);
    }
};

exports.getMyOrders = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const orders = await Order.findAll({
            where: { user_id: userId },
            include: [
                { model: RestaurantTable, as: 'RestaurantTable' },
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    include: [{ model: Product, as: 'Product' }]
                }
            ],
            order: [['created_at', 'DESC']]
        });
        res.json(orders);
    } catch (error) {
        console.error("Get My Orders Error:", error);
        next(error);
    }
};
