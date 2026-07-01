const jwt = require("jsonwebtoken");

require("dotenv").config();

exports.verifyToken = (req, res, next) => {

    try {

        const authHeader = req.headers.authorization;

        if (!authHeader) {

            return res.status(401).json({
                message: "No token"
            });

        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'secret_key'
        );

        req.user = decoded;

        next();

    } catch (error) {

        return res.status(401).json({
            message: "Invalid token"
        });

    }

};

exports.isAdmin = (req, res, next) => {
    if (req.user && req.user.role && req.user.role.toUpperCase() === "ADMIN") {
        next();
    } else {
        return res.status(403).json({
            message: "Access denied. Admin only."
        });
    }
};