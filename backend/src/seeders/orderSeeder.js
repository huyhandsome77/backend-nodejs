const { Order, OrderItem, Product } = require('../models');

const seedOrders = async () => {
    try {
        const count = await Order.count();
        if (count === 0) {
            const products = await Product.findAll({ limit: 2 });
            if (products.length < 2) return;

            const order = await Order.create({
                table_id: 1, // Bàn 1 đang OCCUPIED
                totalPrice: 420000,
                finalPrice: 420000,
                status: 'CONFIRMED',
                paymentStatus: 'UNPAID'
            });

            await OrderItem.bulkCreate([
                {
                    order_id: order.id,
                    product_id: products[0].id,
                    quantity: 2,
                    unitPrice: products[0].price,
                    totalPrice: products[0].price * 2,
                    status: 'DONE'
                },
                {
                    order_id: order.id,
                    product_id: products[1].id,
                    quantity: 1,
                    unitPrice: products[1].price,
                    totalPrice: products[1].price,
                    status: 'DONE'
                }
            ]);

            console.log('[Seeder] Đã tạo đơn hàng mẫu cho Bàn 1.');
        }
    } catch (error) {
        console.error('[Seeder] Lỗi khi tạo đơn hàng mẫu:', error);
    }
};

module.exports = { seedOrders };
