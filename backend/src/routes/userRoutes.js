const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, isAdmin } = require('../middlewares/authMiddleware');

// 1. Lấy tất cả người dùng (Admin)
router.get('/', verifyToken, isAdmin, userController.getAllUsers);

// 2. Lấy thông tin cá nhân
router.get('/profile', verifyToken, userController.getUserProfile);

// 3. Lấy thông tin chi tiết một người dùng (Admin)
router.get('/:id', verifyToken, isAdmin, userController.getUserById);

// 4. Tạo người dùng mới (Admin)
router.post('/', verifyToken, isAdmin, userController.createUser);

// 5. Cập nhật thông tin người dùng (Admin hoặc chính user đó - ở đây tạm thời để Admin)
router.put('/:id', verifyToken, isAdmin, userController.updateUser);

// 6. Xóa người dùng (Admin)
router.delete('/:id', verifyToken, isAdmin, userController.deleteUser);

module.exports = router;
