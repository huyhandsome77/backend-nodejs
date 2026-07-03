const PayOS = require("@payos/node");
const { Order, RestaurantTable } = require("../models");

// Cấu hình PayOS (Đây là bộ khóa TEST)


exports.createPaymentLink = async (req, res, next) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findByPk(orderId);

        if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

        const domain = "http://54.81.9.236:3000"; // Domain của bạn

        const paymentBody = {
            orderCode: Number(order.id),
            amount: Math.round(order.finalPrice),
            description: `Thanh toan đơn ${order.id}`,
            returnUrl: `${domain}/payment-success`,
            cancelUrl: `${domain}/payment-cancel`,
        };

        const paymentLinkResponse = await payos.createPaymentLink(paymentBody);
        res.json(paymentLinkResponse); // Trả về checkoutUrl

    } catch (error) {
        console.error("PayOS Create Error:", error);
        res.status(500).json({ message: "Lỗi kết nối PayOS", error: error.message });
    }
};

/**
 * PayOS Webhook - Nhận thông báo thanh toán thành công
 */
exports.payosWebhook = async (req, res) => {
    try {
        const webhookData = req.body;

        // Kiểm tra dữ liệu và cập nhật đơn hàng
        if (webhookData.code === "00") { // Thanh toán thành công
            const orderCode = webhookData.data.orderCode;
            const order = await Order.findByPk(orderCode);

            if (order && order.paymentStatus !== 'PAID') {
                await order.update({
                    paymentStatus: 'PAID',
                    status: 'COMPLETED',
                    paymentMethod: 'TRANSFER'
                });

                if (order.table_id) {
                    await RestaurantTable.update({ status: 'AVAILABLE' }, { where: { id: order.table_id } });
                }
                console.log(`Đơn hàng ${orderCode} đã thanh toán tự động qua PayOS.`);
            }
        }

        res.json({ message: "Success" });
    } catch (error) {
        console.error("PayOS Webhook Error:", error);
        res.status(500).json({ message: "Webhook Error" });
    }
};
