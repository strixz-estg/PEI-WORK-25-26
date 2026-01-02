const express = require('express');
const router = express.Router();
const Service = require('../models/Service');

const forceArray = (item) => Array.isArray(item) ? item : [item];

// --- FUNÇÕES DE TRADUÇÃO (Mapas de Negócio) ---
const getPriorityDescription = (code) => {
    switch (parseInt(code)) {
        case 1: return "Normal (Nao Oncologico)";
        case 2: return "Prioritário (Nao Oncologico)";
        case 3: return "Muito Prioritário (Oncologico)";
        default: return "Desconhecido";
    }
};

const getTypeDescription = (code) => {
    switch (parseInt(code)) {
        case 1: return "Cirurgia";
        case 2: return "Consulta";
        default: return "Desconhecido";
    }
};

router.post('/', async (req, res) => {
    try {
        console.log("--> [API] A processar Serviços (com enriquecimento)...");

        const rawData = req.body.Services && req.body.Services.Service;
        if (!rawData) {
            return res.status(400).json({ status: 'error', message: 'XML sem dados de Serviço.' });
        }

        const servicesList = forceArray(rawData);

        const promises = servicesList.map(s => {
            // 1. Ler os códigos do XML
            const typeCode = parseInt(s.TypeCode);
            const priorityCode = parseInt(s.PriorityCode);

            // 2. Preparar o objeto com os campos extra
            const enrichedService = {
                ServiceKey: s.ServiceKey,
                Speciality: s.Speciality,
                TypeCode: typeCode,
                PriorityCode: priorityCode,
                // Campos Automáticos
                TypeDescription: getTypeDescription(typeCode),
                PriorityDescription: getPriorityDescription(priorityCode)
            };

            // 3. Upsert na Base de Dados
            return Service.findOneAndUpdate(
                { ServiceKey: s.ServiceKey },
                enrichedService,
                { upsert: true, new: true }
            );
        });

        await Promise.all(promises);

        res.status(200).json({ 
            status: 'success', 
            message: `${servicesList.length} serviços processados e enriquecidos.` 
        });

    } catch (err) {
        console.error("--> [API] Erro:", err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;