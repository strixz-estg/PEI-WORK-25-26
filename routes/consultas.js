const express = require('express');
const router = express.Router();
const Consulta = require('../models/Consulta');
const Hospital = require('../models/Hospital');
const Service = require('../models/Service');

const forceArray = (item) => {
    if (!item) return [];
    return Array.isArray(item) ? item : [item];
};

const calcWeightedAvg = (avgA, countA, avgB, countB) => {
    const totalCount = countA + countB;
    if (totalCount === 0) return 0;
    
    // Proteção: Se a média antiga for 0 mas houver contagem, 
    // e a nova média for válida, usamos a nova média como referência para tudo
    if (avgA === 0 && countA > 0 && avgB > 0) avgA = avgB;

    const totalDays = (avgA * countA) + (avgB * countB);
    return parseFloat((totalDays / totalCount).toFixed(2));
};

router.post('/', async (req, res) => {
    try {
        console.log("--> [API] A processar Consulta (Com Correção de Histórico a Zero)...");
        const root = req.body.ConsultationsRegister;
        
        if (!root?.Header?.InstitutionId) return res.status(400).json({ status: 'error', message: "XML inválido." });

        const hospitalId = root.Header.InstitutionId;
        const year = root.Header.DateReference?.Year;
        const month = root.Header.DateReference?.Month;

        if (!year || !month) return res.status(400).json({ status: 'error', message: "DataReference incompleta." });

        const customId = `${hospitalId}_${year}_${month}`;
        const hospital = await Hospital.findOne({ InstitutionId: hospitalId });
        if (!hospital) return res.status(404).json({ status: 'error', message: `Hospital ${hospitalId} desconhecido.` });

        // Cache Serviços
        let rawEntries = [];
        if (root.Data && root.Data.ConsultationEntry) rawEntries = forceArray(root.Data.ConsultationEntry);
        const serviceKeys = rawEntries.map(e => e.ServiceKey);
        const servicesFound = await Service.find({ ServiceKey: { $in: serviceKeys } }).lean();
        const serviceMap = new Map(servicesFound.map(s => [s.ServiceKey.toString(), s]));

        // Buscar Documento
        let doc = await Consulta.findById(customId);

        if (!doc) {
            console.log(` -> Novo Doc: ${customId}`);
            root.Header.HospitalName = hospital.HospitalName;
            root.Header.SubmissionDate = new Date();
            doc = new Consulta(root);
            doc._id = customId;
            doc.Data.ConsultationEntry = [];
        } else {
            console.log(` -> Update Doc: ${customId}`);
            doc.Header.SubmissionDate = new Date();
        }

        rawEntries.forEach(xmlEntry => {
            const svcKey = xmlEntry.ServiceKey.toString();
            
            // Dados XML
            const stats = xmlEntry.Stats || {};
            const xmlWait = stats.AverageWaitDays || {};
            const xmlCounts = stats.WaitingListCounts || {};
            const xmlResp = stats.AverageResponseTime || {};

            // --- 1. SANITIZAÇÃO PRÉVIA DO XML  ---
            // Se "NonOncological" for 0, tenta usar o "General" do XML
            if (parseFloat(xmlWait.NonOncological || 0) === 0) {
                const gen = parseFloat(xmlWait.General || 0);
                if (gen > 0) xmlWait.NonOncological = gen;
            }
            if (parseFloat(xmlWait.Oncological || 0) === 0 && parseInt(xmlCounts.Oncological || 0) > 0) {
                const gen = parseFloat(xmlWait.General || 0);
                if (gen > 0) xmlWait.Oncological = gen;
            }

            // Encontrar na BD
            let dbEntry = doc.Data.ConsultationEntry.find(e => e.ServiceKey == svcKey);

            if (!dbEntry) {
                // Criar Novo
                const svc = serviceMap.get(svcKey);
                const newEntry = {
                    ServiceKey: xmlEntry.ServiceKey,
                    Speciality: xmlEntry.Speciality || (svc ? svc.Description : "Desconhecido"),
                    Stats: {
                        WaitingListCounts: { General:0, NonOncological:0, Oncological:0 },
                        AverageWaitDays: { General:0, NonOncological:0, Oncological:0 },
                        AverageResponseTime: { Normal:0, Prioritario:0, MuitoPrioritario:0 }
                    }
                };
                doc.Data.ConsultationEntry.push(newEntry);
                dbEntry = doc.Data.ConsultationEntry[doc.Data.ConsultationEntry.length - 1];
            }

            const dbWait = dbEntry.Stats.AverageWaitDays;
            const dbCounts = dbEntry.Stats.WaitingListCounts;
            const dbResp = dbEntry.Stats.AverageResponseTime;

            if ((dbWait.NonOncological || 0) === 0 && (dbCounts.NonOncological || 0) > 0) {
                if (dbWait.General > 0) dbWait.NonOncological = dbWait.General;
                else if (xmlWait.NonOncological > 0) dbWait.NonOncological = xmlWait.NonOncological;
            }

            if ((dbWait.Oncological || 0) === 0 && (dbCounts.Oncological || 0) > 0) {
                if (dbWait.General > 0) dbWait.Oncological = dbWait.General;
                else if (xmlWait.Oncological > 0) dbWait.Oncological = xmlWait.Oncological;
            }
            // -----------------------------------------------------------

            const qtdNewNonOnco = parseInt(xmlCounts.NonOncological || 0);
            const qtdNewOnco = parseInt(xmlCounts.Oncological || 0);
            const qtdOldNonOnco = dbCounts.NonOncological || 0;
            const qtdOldOnco = dbCounts.Oncological || 0;

            // 3. Média Ponderada 
            dbWait.NonOncological = calcWeightedAvg(dbWait.NonOncological, qtdOldNonOnco, xmlWait.NonOncological, qtdNewNonOnco);
            dbWait.Oncological = calcWeightedAvg(dbWait.Oncological, qtdOldOnco, xmlWait.Oncological, qtdNewOnco);

            // 4. Somar Quantidades
            dbCounts.NonOncological = qtdOldNonOnco + qtdNewNonOnco;
            dbCounts.Oncological = qtdOldOnco + qtdNewOnco;
            dbCounts.General = dbCounts.NonOncological + dbCounts.Oncological;

            // 5. Recalcular Média Geral 
            const totalDays = (dbWait.NonOncological * dbCounts.NonOncological) + (dbWait.Oncological * dbCounts.Oncological);
            if (dbCounts.General > 0) {
                dbWait.General = parseFloat((totalDays / dbCounts.General).toFixed(2));
            } else {
                dbWait.General = 0;
            }

            // 6. Response Time
            ['Normal', 'Prioritario', 'MuitoPrioritario'].forEach(k => {
                const valXML = parseFloat(xmlResp[k] || 0);
                const valDB = parseFloat(dbResp[k] || 0);
                if (valXML > 0) dbResp[k] = valDB > 0 ? (valDB + valXML) / 2 : valXML;
            });
        });

        doc.markModified('Data.ConsultationEntry');
        await doc.save();

        res.status(200).json({ status: 'success', id: doc._id, message: "Dados processados e histórico de zeros corrigido." });

    } catch (err) {
        console.error("Erro:", err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;