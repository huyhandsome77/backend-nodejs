const PayOS = require("@payos/node");
const { Order, RestaurantTable } = require("../models");

// CỐ GẮNG LẤY CLASS CHUẨN TỪ THƯ VIỆN
const PayOSClass = (PayOS && PayOS.default) ? PayOS.default : PayOS;

let payos;
try {
    payos = new PayOSClass(
        process.env.PAYOS_CLIENT_ID,
        process.env.PAYOS_API_KEY,
        process.env.PAYOS_CHECKSUM_KEY
    );
    console.log("PayOS initialized. Available methods:", Object.keys(payos));
} catch (err) {
    console.error("PayOS initialization failed:", err.message);
}

exports.createPaymentLink = async (req, res, next) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findByPk(orderId);
        if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

        const domain = "http://54.81.9.236:3000";
        const orderCode = Number(String(order.id) + String(Math.floor(Date.now() / 1000)).slice(-4));

        const paymentBody = {
            orderCode: orderCode,
            amount: Math.round(Number(order.finalPrice)),
            description: `THANH TOAN DH ${order.id}`,
            returnUrl: `${domain}/api/payos/payment-success`,
            cancelUrl: `${domain}/api/payos/payment-cancel`,
        };

        // KIỂM TRA LẠI HÀM TRƯỚC KHI GỌI
        if (typeof payos.createPaymentLink !== 'function') {
            // Trường hợp SDK version mới yêu cầu gọi qua đối tượng khác
            console.log("Object payos status:", payos);
            throw new Error("SDK PayOS không khả dụng. Vui lòng restart server.");
        }

        const paymentLinkResponse = await payos.createPaymentLink(paymentBody);
        await order.update({ note: (order.note || "") + ` [PayOSCode:${orderCode}]` });

        res.json(paymentLinkResponse);
    } catch (error) {
        console.error("PayOS Detail Error:", error);
        res.status(500).json({ message: "Lỗi tạo link thanh toán", details: error.message });
    }
};

exports.payosWebhook = async (req, res) => {
    try {
        const webhookData = req.body;
        if (webhookData.code === "00") {
            const { orderCode } = webhookData.data;
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
                console.log(`[PayOS] Đơn hàng ${order.id} đã thanh toán thành công.`);
            }
        }
        return res.json({ message: "Webhook received" });
    } catch (error) {
        console.error("PayOS Webhook Error:", error);
        return res.status(200).json({ message: "Success with errors" });
    }
};

exports.paymentSuccess = (req, res) => {
    res.send("<div style='text-align:center; padding-top:100px;'><h1>Thanh toán thành công!</h1><p>Vui lòng quay lại ứng dụng.</p></div>");
};

exports.paymentCancel = (req, res) => {
    res.send("<div style='text-align:center; padding-top:100px;'><h1>Đã hủy thanh toán</h1><p>Bạn có thể thử lại sau.</p></div>");
};

exports.debugPayOS = async (req, res) => {
    try {
        const debugInfo = {
            env: {
                clientId: process.env.PAYOS_CLIENT_ID ? "PRESENT" : "MISSING",
                apiKey: process.env.PAYOS_API_KEY ? "PRESENT" : "MISSING",
                checksumKey: process.env.PAYOS_CHECKSUM_KEY ? "PRESENT" : "MISSING"
            },
            payosObject: {
                exists: !!payos,
                type: typeof payos,
                methods: payos ? Object.keys(payos) : [],
                constructorName: payos?.constructor?.name
            },
            libType: typeof PayOS
        };

        res.json(debugInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
