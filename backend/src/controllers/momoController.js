const axios = require('axios');
const crypto = require('crypto');
const { Order, RestaurantTable } = require('../models');

// Thông tin cấu hình MoMo (Đây là tài khoản Test - Bạn có thể thay bằng tài khoản thật sau)
const partnerCode = "MOMO2KAX20250505_TEST";
const accessKey = "96VLU5SQikbYKx8h";
const secretKey = "EAZqkJl5AHgiL2pl7bLhkeL2j8HJx92i";
const momoEndpoint = "https://test-payment.momo.vn/v2/gateway/api/create";

exports.createMomoPayment = async (req, res, next) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findByPk(orderId);

        if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

        const requestId = partnerCode + new Date().getTime();
        const orderInfo = "Thanh toan don hang #" + orderId;
        const redirectUrl = "appdatmon://payment-result"; // Link quay lại app sau khi thanh toán
        const ipnUrl = "http://54.81.9.236:3000/api/momo/callback"; // Link MoMo gọi về server bạn (Phải là IP thật)
        const amount = order.finalPrice.toString();
        const extraData = "";
        const orderGroupId = "";
        const autoCapture = true;
        const requestType = "captureWallet";

        const rawSignature = "accessKey=" + accessKey + "&amount=" + amount + "&extraData=" + extraData + "&ipnUrl=" + ipnUrl + "&orderId=" + orderId + "&orderInfo=" + orderInfo + "&partnerCode=" + partnerCode + "&redirectUrl=" + redirectUrl + "&requestId=" + requestId + "&requestType=" + requestType;

        const signature = crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');

        const requestBody = {
            partnerCode,
            partnerName: "Future Sushi",
            storeId: "FutureSushiStore",
            requestId,
            amount,
            orderId,
            orderInfo,
            redirectUrl,
            ipnUrl,
            lang: "vi",
            requestType,
            autoCapture,
            extraData,
            orderGroupId,
            signature
        };

        const response = await axios.post(momoEndpoint, requestBody);
        res.json(response.data); // Trả về payUrl và deeplink

    } catch (error) {
        console.error("MoMo Create Error:", error.response?.data || error.message);
        res.status(500).json({ message: "Lỗi kết nối MoMo" });
    }
};

/**
 * MoMo Webhook (IPN) - MoMo gọi vào đây khi thanh toán xong
 */
exports.momoCallback = async (req, res) => {
    try {
        const { orderId, resultCode, message } = req.body;
        console.log(`MoMo Callback cho đơn hàng ${orderId}: ${message} (Code: ${resultCode})`);

        if (resultCode === 0) { // Thành công
            const order = await Order.findByPk(orderId);
            if (order && order.paymentStatus !== 'PAID') {
                await order.update({
                    paymentStatus: 'PAID',
                    status: 'COMPLETED',
                    paymentMethod: 'TRANSFER'
                });

                if (order.table_id) {
                    await RestaurantTable.update({ status: 'AVAILABLE' }, { where: { id: order.table_id } });
                }
                console.log(`Đơn hàng ${orderId} đã tự động thanh toán thành công.`);
            }
        }

        res.status(204).send(); // Phản hồi cho MoMo là đã nhận được

    } catch (error) {
        console.error("MoMo Callback Error:", error);
        res.status(500).send();
    }
};
