const { User } = require('../models');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

// 1. Lấy danh sách tất cả người dùng
const getAllUsers = async (req, res) => {
    try {
        const { search } = req.query;
        let where = {};

        if (search) {
            where = {
                [Op.or]: [
                    { fullName: { [Op.like]: `%${search}%` } },
                    { username: { [Op.like]: `%${search}%` } },
                    { email: { [Op.like]: `%${search}%` } },
                    { phone: { [Op.like]: `%${search}%` } }
                ]
            };
        }

        const users = await User.findAll({
            where,
            attributes: { exclude: ['password'] }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: "Lỗi server", error: error.message });
    }
};

// 2. Lấy thông tin chi tiết một người dùng theo ID
const getUserById = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id, {
            attributes: { exclude: ['password'] }
        });

        if (!user) {
            return res.status(404).json({ message: "Không tìm thấy người dùng" });
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: "Lỗi server", error: error.message });
    }
};

// 3. Lấy thông tin cá nhân (Profile)
const getUserProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password'] }
        });

        if (!user) {
            return res.status(404).json({ message: "Không tìm thấy người dùng" });
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: "Lỗi server", error: error.message });
    }
};

// 4. Cập nhật Profile cá nhân
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fullName, email, phone, avatar } = req.body;
        const user = await User.findByPk(userId);

        if (!user) {
            return res.status(404).json({ message: "Không tìm thấy người dùng" });
        }

        await user.update({
            fullName: fullName || user.fullName,
            email: email || user.email,
            phone: phone || user.phone,
            avatar: avatar || user.avatar
        });

        res.json({ message: "Cập nhật hồ sơ thành công", user });
    } catch (error) {
        res.status(500).json({ message: "Lỗi server", error: error.message });
    }
};

// 5. Tạo người dùng mới (Dành cho Admin)
const createUser = async (req, res) => {
    try {
        const { fullName, email, phone, username, password, role } = req.body;

        // Kiểm tra xem username hoặc phone đã tồn tại chưa
        const userExists = await User.findOne({
            where: {
                [Op.or]: [{ username }, { phone }]
            }
        });

        if (userExists) {
            return res.status(400).json({ message: "Tài khoản hoặc số điện thoại đã tồn tại" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            fullName,
            email,
            phone,
            username,
            password: hashedPassword,
            role: role || "CUSTOMER"
        });

        res.status(201).json({
            message: "Tạo người dùng thành công",
            user: {
                id: newUser.id,
                fullName: newUser.fullName,
                username: newUser.username
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Lỗi server", error: error.message });
    }
};

// 5. Cập nhật thông tin người dùng
const updateUser = async (req, res) => {
    try {
        const { fullName, email, phone, username, avatar, points, role, status } = req.body;
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({ message: "Không tìm thấy người dùng" });
        }

        // Cập nhật các trường
        await user.update({
            fullName: fullName || user.fullName,
            email: email || user.email,
            phone: phone || user.phone,
            username: username || user.username,
            avatar: avatar || user.avatar,
            points: points !== undefined ? points : user.points,
            role: role || user.role,
            status: status || user.status
        });

        res.json({ message: "Cập nhật thành công", user });
    } catch (error) {
        res.status(500).json({ message: "Lỗi server", error: error.message });
    }
};

// 6. Xóa người dùng
const deleteUser = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return res.status(404).json({ message: "Không tìm thấy người dùng" });
        }

        await user.destroy();
        res.json({ message: "Xóa người dùng thành công" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi server", error: error.message });
    }
};

module.exports = {
    getAllUsers,
    getUserById,
    getUserProfile,
    updateProfile,
    createUser,
    updateUser,
    deleteUser
};
