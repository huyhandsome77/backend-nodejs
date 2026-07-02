const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.get('/my-orders', verifyToken, orderController.getMyOrders);

router.get('/', orderController.getAllOrders);
router.post('/', orderController.createOrder);
router.get('/:id', orderController.getOrderById);
router.put('/:id/status', orderController.updateOrderStatus);
router.delete('/:id', orderController.deleteOrder);

router.get('/table/:tableId', orderController.getCurrentOrderByTable);
router.get('/:id/payment-qr', orderController.getPaymentQR);
router.put('/:id/pay', orderController.payOrder);

module.exports = router;
