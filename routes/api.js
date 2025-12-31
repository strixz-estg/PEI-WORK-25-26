const express = require('express');
const router = express.Router();

// Importar o Controlador de Analytics
const analyticsController = require('../controllers/analyticsController');

// ==================================================================
// ROTAS DE ANALYTICS (Leitura de Dados / Dashboards)
// ==================================================================

// Query 1: Médias de Urgência (Por Tipologia e Triagem)
// Exemplo de uso: GET /api/analytics/urgencias/medias?start=2024-01-01&end=2024-12-31
router.get('/analytics/urgencias/medias', analyticsController.getUrgencyAverages);
router.get('/analytics/urgencias/percentagens', analyticsController.getTriagePercentages);
router.get('/analytics/urgencias/pediatria/regiao', analyticsController.getPediatricWaitingByRegion);
router.get('/analytics/consultas/oncologia', analyticsController.getOncologyComparison);
router.get('/analytics/cirurgias/medias', analyticsController.getSurgeryStats);
router.get('/analytics/geral/tempos-totais', analyticsController.getConsultationVsSurgery);
router.get('/analytics/urgencias/pediatria/top10', analyticsController.getTop10Pediatric);
router.get('/analytics/urgencias/evolucao-temporal', analyticsController.getFlowEvolution);

// Aqui vamos adicionar as próximas (Query 2, 3, 4...) à medida que as fizermos

module.exports = router;