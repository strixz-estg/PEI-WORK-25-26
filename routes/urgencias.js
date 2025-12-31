const express = require('express');
const router = express.Router();
const Urgencia = require('../models/Urgencia');

router.post('/', async (req, res) => {
    try {
        console.log("--> [API] A gravar Urgência...");
        const novoRegisto = new Urgencia(req.body);
        await novoRegisto.save();
        
        console.log("--> [API] Sucesso. ID:", novoRegisto._id);
        res.status(201).json({ 
            status: 'success', 
            message: 'Dados de urgência integrados.', 
            id: novoRegisto._id 
        });
    } catch (err) {
        console.error("--> [API] Erro ao gravar:", err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;