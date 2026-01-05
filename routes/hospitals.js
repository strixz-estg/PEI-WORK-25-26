const express = require('express');
const router = express.Router();
const Hospital = require('../models/Hospital');

const forceArray = (item) => Array.isArray(item) ? item : [item];

router.post('/', async (req, res) => {
    try {
        console.log("--> [API] A processar Hospitais (XML)...");
        
        const rawData = req.body.Hospitals && req.body.Hospitals.Hospital;
        
        if (!rawData) {
            return res.status(400).json({ status: 'error', message: 'XML sem dados de Hospital.' });
        }

        const hospitalsList = forceArray(rawData);

        const promises = hospitalsList.map(h => {
            return Hospital.findOneAndUpdate(
                { InstitutionId: h.InstitutionId },
                h, 
                { upsert: true, new: true }
            );
        });

        await Promise.all(promises);

        res.status(200).json({ 
            status: 'success', 
            message: `${hospitalsList.length} hospitais processados.` 
        });

    } catch (err) {
        console.error("--> [API] Erro:", err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;