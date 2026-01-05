/**
 * ============================================================================
 * HEALTH TIME API - Entry Point
 * ============================================================================
 * Autor: Grupo 7
 * Unidade Curricular: PEI 2025/2026
 * Descrição: Servidor principal que gere a ingestão de dados hospitalares (XML)
 * e a integração com MongoDB Atlas.
 * ============================================================================
 */
// Configuração forçada do Java para evitar erros de encoding no Windows
process.env.JAVA_TOOL_OPTIONS = '-Duser.language=en -Duser.country=US -Dfile.encoding=UTF-8';

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

// --- IMPORTS DE MÓDULOS INTERNOS ---
// Middleware de Validação XML
const xmlValidationMiddleware = require('./middleware/xmlValidator');

// 1. Rotas de Ingestão (XML)
const urgenciasRoutes = require('./routes/urgencias');
const consultasRoutes = require('./routes/consultas');
const cirurgiasRoutes = require('./routes/cirurgias');
// --- NOVAS ROTAS ---
const hospitaisRoutes = require('./routes/hospitals'); // Certifica-te que criaste este ficheiro
const servicosRoutes = require('./routes/services');   // Certifica-te que criaste este ficheiro

// 2. Rotas de Leitura/Analytics (JSON)
const apiRoutes = require('./routes/api');

// --- CONFIGURAÇÕES INICIAIS ---
const app = express();
const PORT = process.env.PORT || 3000;

// String de Conexão MongoDB Atlas
const mongoURI = 'mongodb+srv://GROUP-7:GROUP-7PEI@cluster-pei-group7.ee7vrls.mongodb.net/healthtime?appName=CLUSTER-PEI-GROUP7';


// ============================================================================
// 1. CONEXÃO À BASE DE DADOS
// ============================================================================
mongoose.connect(mongoURI)
  .then(() => {
      console.log('╔══════════════════════════════════════════╗');
      console.log('║   LIGADO AO MONGODB ATLAS COM SUCESSO!   ║');
      console.log('╚══════════════════════════════════════════╝');
  })
  .catch(err => {
      console.error('ERRO CRÍTICO: Não foi possível ligar à Base de Dados.');
      console.error('Detalhes:', err.message);
  });


// ============================================================================
// 2. MIDDLEWARES GLOBAIS
// ============================================================================

// Logger de Pedidos
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Preparação para XML (String body)
app.use(express.text({ type: ['application/xml', 'text/xml'] }));

// Validador de XML (XSD)
app.use(xmlValidationMiddleware);

// Suporte a JSON padrão
app.use(express.json());


// ============================================================================
// 3. DEFINIÇÃO DE ROTAS (Endpoints)
// ============================================================================

// Health Check
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Health Time API está Online!',
        status: 'OK',
        timestamp: new Date()
    });
});

// --- A. ROTAS DE INGESTÃO (Receber XML) ---
app.use('/api/urgencias', urgenciasRoutes);
app.use('/api/consultas', consultasRoutes);
app.use('/api/cirurgias', cirurgiasRoutes);
// --- NOVOS ENDPOINTS ---
app.use('/api/hospitais', hospitaisRoutes); // Endpoint para Hospitals.xml
app.use('/api/servicos', servicosRoutes);   // Endpoint para Services.xml

// --- B. ROTAS DE ANALYTICS (Enviar JSON) ---
app.use('/api', apiRoutes);


// ============================================================================
// 4. TRATAMENTO DE ERROS
// ============================================================================

// Rota 404
app.use((req, res, next) => {
    res.status(404).json({
        status: 'error',
        message: 'Rota não encontrada. Verifique o URL.'
    });
});

// Erro 500
app.use((err, req, res, next) => {
    console.error('Erro Interno:', err.stack);
    res.status(500).json({
        status: 'error',
        message: 'Ocorreu um erro interno no servidor.',
        error: err.message
    });
});


// ============================================================================
// 5. INICIALIZAÇÃO DO SERVIDOR
// ============================================================================
app.listen(PORT, () => {
    console.log(`\nServidor Health Time a correr na porta: ${PORT}`);
    console.log(`➜  Local:   http://localhost:${PORT}`);
    console.log(`➜  Ingestão: /api/urgencias, /api/consultas, /api/cirurgias`);
    console.log(`➜  Catálogos: /api/hospitais, /api/servicos`);
    console.log(`➜  Analytics: /api/analytics/...\n`);
});

// Graceful Shutdown
process.on('SIGINT', async () => {
    console.log('\n A encerrar servidor...');
    await mongoose.connection.close();
    console.log('MongoDB desconectado.');
    process.exit(0);
});