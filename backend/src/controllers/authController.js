const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { Op } = require("sequelize");
require("dotenv").config();

//
// REGISTER
//
exports.register = async (req, res) => {
    try {
        const { fullName, email, phone, username, password } = req.body;

        // 1. Kiểm tra xem người dùng đã tồn tại chưa (kiểm tra cả phone và username)
        const userExists = await User.findOne({
            where: {
                [Op.or]: [{ phone }, { username }]
            }
        });

        if (userExists) {
            const message = userExists.phone === phone
                ? 'Số điện thoại này đã được đăng ký!'
                : 'Tên đăng nhập này đã tồn tại!';
            return res.status(400).json({ message });
        }

        // 2. Mã hóa mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Tạo User
        const user = await User.create({
            fullName,
            email,
            phone,
            username,
            password: hashedPassword
        });

        return res.status(201).json({
            message: "Đăng ký thành công!",
            user: {
                id: user.id,
                fullName: user.fullName,
                username: user.username,
                phone: user.phone
            }
        });

    } catch (error) {
        return res.status(500).json({
            message: "Lỗi server",
            error: error.message
        });
    }
};

//
// LOGIN
//
exports.login = async (req, res) => {
    try {
        const { account, password } = req.body;

        if (!account || !password) {
            return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin!" });
        }

        // 1. Tìm user theo username HOẶC phone
        const user = await User.findOne({
            where: {
                [Op.or]: [
                    { username: account },
                    { phone: account }
                ]
            }
        });

        if (!user) {
            return res.status(404).json({ message: "Tài khoản không tồn tại!" });
        }

        // 2. Kiểm tra mật khẩu
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Mật khẩu không chính xác!" });
        }

        // 3. Tạo Token
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET || 'secret_key',
            { expiresIn: "7d" }
        );

        return res.status(200).json({
            message: "Đăng nhập thành công!",
            token,
            user: {
                id: user.id,
                fullName: user.fullName,
                username: user.username,
                phone: user.phone,
                role: user.role,
            }
        });

    } catch (error) {
        return res.status(500).json({
            message: "Lỗi server",
            error: error.message
        });
    }
};
