const express = require('express');
const router = express.Router();
const payosController = require('../controllers/payosController');

// App gọi để lấy link thanh toán
router.post('/create-payment-link', payosController.createPaymentLink);

// PayOS gọi về thông báo kết quả (IPN)
router.post('/webhook', payosController.payosWebhook);

// Trang thông báo hiển thị trên trình duyệt sau khi thanh toán
router.get('/payment-success', payosController.paymentSuccess);
router.get('/payment-cancel', payosController.paymentCancel);

module.exports = router;
