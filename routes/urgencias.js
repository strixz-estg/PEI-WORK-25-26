const express = require('express');
const router = express.Router();
const Urgencia = require('../models/Urgencia');
const Hospital = require('../models/Hospital'); 

router.post('/', async (req, res) => {
    try {
        console.log("--> [API] A gravar Urgência (com injeção automática)...");
        const data = req.body.UrgencyRegister;

        if (!data) return res.status(400).json({ status: 'error', message: "XML malformado." });

        const hospitalId = data.Header.InstitutionId;
        const hospital = await Hospital.findOne({ InstitutionId: hospitalId });

        if (!hospital) {
            return res.status(404).json({ status: 'error', message: `Hospital ${hospitalId} não encontrado.` });
        }

        // --- 1. RECONSTRUÇÃO ORDENADA DO HEADER ---
        // Garante a ordem: ID -> Nome -> Morada -> Datas
        const originalHeader = data.Header;
        
        // Construir morada se existir
        let fullAddress = "Morada desconhecida";
        if (hospital.Location) {
            fullAddress = `${hospital.Location.Address}, ${hospital.Location.PostalCode} ${hospital.Location.City}`;
        }

        const newHeader = {
            InstitutionId: originalHeader.InstitutionId,
            HospitalName: hospital.HospitalName, // Injetado (Do Mongo)
            Address: fullAddress,                // Injetado (Do Mongo)
            LastUpdate: originalHeader.LastUpdate,
            ExtractionDate: originalHeader.ExtractionDate
        };
        data.Header = newHeader;

        // --- 2. GRAVAR ---
        const novoRegisto = new Urgencia(data);
        await novoRegisto.save();
        
        console.log(`Urgência gravada: ${hospital.HospitalName}`);
        res.status(201).json({ status: 'success', id: novoRegisto._id });

    } catch (err) {
        console.error("Erro:", err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;