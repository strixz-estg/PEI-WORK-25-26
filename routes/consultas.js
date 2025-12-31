const express = require('express');
const router = express.Router();
const Consulta = require('../models/Consulta');

router.post('/', async (req, res) => {
    try {
        console.log("--> [API] A gravar Consulta...");
        const novoRegisto = new Consulta(req.body);
        await novoRegisto.save();

        console.log("--> [API] Sucesso. ID:", novoRegisto._id);
        res.status(201).json({ 
            status: 'success', 
            message: 'Dados de consulta integrados.', 
            id: novoRegisto._id 
        });
    } catch (err) {
        console.error("--> [API] Erro ao gravar:", err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;