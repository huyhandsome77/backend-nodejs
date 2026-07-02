const express = require('express');
const router = express.Router();
const pointController = require('../controllers/pointController');
const { verifyToken, isAdmin } = require('../middlewares/authMiddleware');

// Chỉ Admin mới được tích điểm thủ công cho khách
router.post('/add-points', verifyToken, isAdmin, pointController.addPointsFromOrder);

module.exports = router;
