const express = require('express');
const router = express.Router();
const payosController = require('../controllers/payosController');

// App gọi để lấy link thanh toán
router.post('/create-payment-link', payosController.createPaymentLink);

// PayOS gọi về thông báo kết quả
router.post('/webhook', payosController.payosWebhook);

module.exports = router;
