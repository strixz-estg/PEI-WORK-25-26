const express = require('express');
const router = express.Router();

// Importar os Controladores Divididos
const urgenciaController = require('../controllers/analytics/urgenciaAnalytics');
const clinicaController = require('../controllers/analytics/clinicaAnalytics');

// ==================================================================
// URGÊNCIAS
// ==================================================================
router.get('/analytics/urgencias/medias', urgenciaController.getUrgencyAverages);           // Q1
router.get('/analytics/urgencias/percentagens', urgenciaController.getTriagePercentages);   // Q2
router.get('/analytics/urgencias/pediatria/regiao', urgenciaController.getPediatricWaitingByRegion); // Q3
router.get('/analytics/urgencias/pediatria/top10', urgenciaController.getTop10Pediatric);   // Q7
router.get('/analytics/urgencias/evolucao-temporal', urgenciaController.getFlowEvolution);  // Q8

// ==================================================================
// CLÍNICA (Consultas & Cirurgias)
// ==================================================================
router.get('/analytics/cirurgias/estatisticas', clinicaController.getSurgeryStats);// Q5
router.get('/analytics/consultas/oncologia', clinicaController.getOncologyComparison);      // Q4
router.get('/analytics/cirurgias/medias', clinicaController.getSurgeryStats);               // Q5
router.get('/analytics/cruzamento/discrepancia', clinicaController.getConsultationVsSurgery);  // Q6

module.exports = router;