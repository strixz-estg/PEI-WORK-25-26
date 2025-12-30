const express = require('express');
const { XMLParser } = require('fast-xml-parser');
const validator = require('xsd-schema-validator');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const parser = new XMLParser({
    explicitArray: false,
    ignoreAttributes: false,
    attributeNamePrefix: "@_", 
    numberParseOptions: {
        hex: true,
        leadingZeros: false,
    }
});

const xmlValidationMiddleware = [
    express.text({ type: ['application/xml', 'text/xml'] }),

    async (req, res, next) => {
        if (req.get('Content-Type') && 
           (req.get('Content-Type').includes('xml')) && 
           typeof req.body === 'string') {

            console.log('--> Recebida requisição XML. A validar...');

            const schemaPath = path.join(__dirname, ''); //caminhos xsd !!

            if (!fs.existsSync(schemaPath)) {
                return res.status(500).json({ 
                    status: 'error', 
                    message: 'Ficheiro XSD não encontrado no servidor.' 
                });
            }

            try {
             
                await validator.validateXML(req.body.trim(), schemaPath);
                
                const parsed = parser.parse(req.body);
                
                req.body = parsed;
                
                console.log('--> XML Válido e convertido com sucesso.');
                next(); 

            } catch (err) {
                console.error("Erro na validação:", err);

                if (err.valid === false || (err.message && err.message.includes('invalid xml'))) {
                    return res.status(400).json({
                        status: 'error',
                        message: "Formato XML inválido ou não corresponde ao XSD",
                        validationErrors: err.messages || err.message 
                    });
                }

                return res.status(500).json({
                    status: 'error',
                    message: "Erro interno no processamento do XML",
                    details: err.message
                });
            }
        } else {
            next();
        }
    }
];

app.use(xmlValidationMiddleware);
app.use(express.json()); 

// --- ROTAS DA API ---

// Rota para Receber Urgências
app.post('/api/urgencias', (req, res) => {
    console.log("Dados de Urgência Recebidos:", req.body);
    
    res.json({
        status: 'success',
        message: 'Urgência recebida e validada!',
        dadosProcessados: req.body
    });
    // para usares os campos depois :
    const nomeHospital = dados.Header.HospitalName; 
    // = "Hospital São João"
});

// Rota para Receber Consultas
app.post('/api/consultas', (req, res) => {
    console.log("Dados de Consulta Recebidos:", req.body);
    res.json({
        status: 'success',
        message: 'Consultas recebidas e validadas!',
        dadosProcessados: req.body
    });
});

// Rota para Receber Cirurgias
app.post('/api/cirurgias', (req, res) => {
    console.log("Dados de Cirurgia Recebidos:", req.body);
    res.json({
        status: 'success',
        message: 'Cirurgias recebidas e validadas!',
        dadosProcessados: req.body
    });
});

// Inicia o Servidor
app.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});