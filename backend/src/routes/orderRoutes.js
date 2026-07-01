const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

router.get('/', orderController.getAllOrders);
router.post('/', orderController.createOrder);
router.get('/:id', orderController.getOrderById);
router.put('/:id/status', orderController.updateOrderStatus);
router.delete('/:id', orderController.deleteOrder);

router.get('/table/:tableId', orderController.getCurrentOrderByTable);
router.put('/:id/pay', orderController.payOrder);

module.exports = router;
