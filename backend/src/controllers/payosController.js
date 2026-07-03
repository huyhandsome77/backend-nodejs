const PayOS = require("@payos/node");
const { Order, RestaurantTable } = require("../models");

const PayOSClass = (typeof PayOS === 'function') ? PayOS : (PayOS.default || PayOS.PayOS);
const payos = new PayOSClass(
    process.env.PAYOS_CLIENT_ID,
    process.env.PAYOS_API_KEY,
    process.env.PAYOS_CHECKSUM_KEY
);

exports.createPaymentLink = async (req, res, next) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findByPk(orderId);
        if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

        const domain = "http://54.81.9.236:3000";
        // Tạo orderCode duy nhất (PayOS yêu cầu kiểu Number)
        const orderCode = Number(String(order.id) + String(Math.floor(Date.now() / 1000)).slice(-4));

        const paymentBody = {
            orderCode: orderCode,
            amount: Math.round(Number(order.finalPrice)),
            description: `THANH TOAN DH ${order.id}`,
            returnUrl: `${domain}/api/payos/payment-success`,
            cancelUrl: `${domain}/api/payos/payment-cancel`,
        };

        const paymentLinkResponse = await payos.createPaymentLink(paymentBody);

        // Lưu lại mã orderCode để đối soát trong Webhook
        await order.update({ note: (order.note || "") + ` [PayOSCode:${orderCode}]` });

        res.json(paymentLinkResponse);
    } catch (error) {
        console.error("PayOS Create Error:", error);
        res.status(500).json({ message: "Lỗi tạo link thanh toán", error: error.message });
    }
};

exports.payosWebhook = async (req, res) => {
    try {
        const webhookData = req.body;

        // 1. Xác thực chữ ký bảo mật từ PayOS
        const verifiedData = payos.verifyPaymentWebhookData(webhookData);

        // 2. Kiểm tra mã thành công (00)
        if (webhookData.code === "00" && verifiedData) {
            const { orderCode } = verifiedData;

            const { Op } = require('sequelize');
            const order = await Order.findOne({
                where: { note: { [Op.like]: `%[PayOSCode:${orderCode}]%` } }
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
                console.log(`[PayOS] Đơn hàng ${order.id} (Code: ${orderCode}) đã thanh toán thành công.`);
            }
        }
        return res.json({ message: "Webhook received" });
    } catch (error) {
        console.error("PayOS Webhook Error:", error);
        return res.status(200).json({ message: "Success but with verification skip" });
    }
};

// Các hàm bổ trợ hiển thị thông báo trên trình duyệt
exports.paymentSuccess = (req, res) => {
    res.send("<div style='text-align:center; padding-top:100px;'><h1>Thanh toán thành công!</h1><p>Vui lòng quay lại ứng dụng.</p></div>");
};

exports.paymentCancel = (req, res) => {
    res.send("<div style='text-align:center; padding-top:100px;'><h1>Đã hủy thanh toán</h1><p>Bạn có thể thử lại sau.</p></div>");
};
