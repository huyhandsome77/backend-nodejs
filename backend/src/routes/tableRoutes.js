const express = require('express');
const router = express.Router();
const tableController = require('../controllers/tableController');

router.get('/', tableController.getAllTables);
router.get('/qr/:qrCode', tableController.getTableByQRCode);
router.put('/:id/status', tableController.updateTableStatus);

module.exports = router;
