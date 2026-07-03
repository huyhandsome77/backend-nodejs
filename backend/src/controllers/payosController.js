const { PayOS } = require("@payos/node");
const { Order, RestaurantTable } = require("../models");

const payos = new PayOS({
    clientId: process.env.PAYOS_CLIENT_ID,
    apiKey: process.env.PAYOS_API_KEY,
    checksumKey: process.env.PAYOS_CHECKSUM_KEY
});


exports.createPaymentLink = async (req, res, next) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findByPk(orderId);

        if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

        const domain = "http://54.81.9.236:3000";

        // TẠO MÃ ORDERCODE DUY NHẤT (PayOS yêu cầu Number và không trùng lặp)
        // Kết hợp ID đơn hàng với 4 số cuối của timestamp để đảm bảo không trùng khi nhấn lại
        const orderCode = Number(String(order.id) + String(Math.floor(Date.now() / 1000)).slice(-4));

        const paymentBody = {
            orderCode: orderCode,
            amount: Math.round(Number(order.finalPrice)),
            description: `THANH TOAN DH ${order.id}`, // Không dấu, ngắn gọn
            returnUrl: `${domain}/payment-success`,
            cancelUrl: `${domain}/payment-cancel`,
        };

        console.log("PayOS Creating Link with body:", paymentBody);

        const paymentLinkResponse = await payos.createPaymentLink(paymentBody);

        // Cập nhật lại note của đơn hàng để lưu mã orderCode này (dùng để Webhook tìm lại đơn)
        await order.update({ note: (order.note || "") + ` [PayOSCode:${orderCode}]` });

        res.json(paymentLinkResponse);

    } catch (error) {
        console.error("PayOS Create Error:", error);
        res.status(500).json({ message: "Lỗi kết nối PayOS", error: error.message });
    }
};

/**
 * PayOS Webhook - Tự động nhận thông báo thanh toán thành công
 */
exports.payosWebhook = async (req, res) => {
    try {
        const webhookData = req.body;
        console.log("PayOS Webhook Data:", JSON.stringify(webhookData));

        if (webhookData.code === "00") { // 00 là mã thành công của PayOS
            const { orderCode } = webhookData.data;

            // Tìm đơn hàng bằng cách lọc trong trường note có chứa mã PayOSCode
            const { Op } = require('sequelize');
            const order = await Order.findOne({
                where: {
                    note: { [Op.like]: `%[PayOSCode:${orderCode}]%` }
                }
            });

            if (order && order.paymentStatus !== 'PAID') {
                await order.update({
                    paymentStatus: 'PAID',
                    status: 'COMPLETED',
                    paymentMethod: 'TRANSFER'
                });

                if (order.table_id) {
                    await RestaurantTable.update({ status: 'AVAILABLE' }, { where: { id: order.table_id } });
                }
                console.log(`Đơn hàng ID ${order.id} đã tự động thanh toán qua PayOS thành công.`);
            }
        }

        res.json({ message: "Success" });
    } catch (error) {
        console.error("PayOS Webhook Error:", error);
        res.status(500).json({ message: "Webhook Error" });
    }
};
