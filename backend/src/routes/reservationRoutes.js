const express = require('express');
const router = express.Router();
const reservationController = require('../controllers/reservationController');

router.post('/', reservationController.createReservation);
router.get('/', reservationController.getAllReservations);
router.put('/:id/check-in', reservationController.checkIn);
router.put('/:id/cancel', reservationController.cancelReservation);

module.exports = router;
