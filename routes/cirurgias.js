const express = require('express');
const router = express.Router();
const Cirurgia = require('../models/Cirurgia');
const Hospital = require('../models/Hospital');
const Service = require('../models/Service');

const forceArray = (item) => Array.isArray(item) ? item : [item];

router.post('/', async (req, res) => {
    try {
        console.log("--> [API] A processar Cirurgia (Auto-Calc & Merge)...");
        const root = req.body.SurgeryReport;
        if (!root) return res.status(400).json({ status: 'error', message: "XML vazio." });

        // --- 1. VALIDAÇÃO E INJEÇÃO DE HEADER ---
        const hospitalId = root.Header.InstitutionId;
        const hospital = await Hospital.findOne({ InstitutionId: hospitalId });

        if (!hospital) return res.status(404).json({ status: 'error', message: `Hospital ${hospitalId} desconhecido.` });

        // Injeção Ordenada
        const originalHeader = root.Header;
        const newHeader = {
            InstitutionId: originalHeader.InstitutionId,
            HospitalName: hospital.HospitalName, // Injetado
            SubmissionDate: originalHeader.SubmissionDate,
            DateReference: originalHeader.DateReference
        };
        root.Header = newHeader;

        // --- 2. PREPARAÇÃO DOS DADOS E CÁLCULOS ---
        let newEntries = [];
        if (root.SurgicalData && root.SurgicalData.SurgeryEntry) {
            newEntries = forceArray(root.SurgicalData.SurgeryEntry);
        }

        for (const entry of newEntries) {
            // Validação Serviço
            const service = await Service.findOne({ ServiceKey: entry.ServiceKey });
            if (!service) return res.status(404).json({ status: 'error', message: `Serviço ${entry.ServiceKey} não encontrado.` });
            if (service.TypeCode !== 1) return res.status(400).json({ status: 'error', message: `Serviço ${entry.ServiceKey} não é CIRURGIA.` });

            // A. Cálculo de Totais (General Count)
            const countNon = parseInt(entry.Stats.WaitingListCounts.NonOncological || 0);
            const countOnc = parseInt(entry.Stats.WaitingListCounts.Oncological || 0);
            const totalCount = countNon + countOnc;
            entry.Stats.WaitingListCounts.General = totalCount;

            // B. Cálculo de Média Ponderada (General Wait Days)
            const avgNon = parseFloat(entry.Stats.AverageWaitDays.NonOncological || 0);
            const avgOnc = parseFloat(entry.Stats.AverageWaitDays.Oncological || 0);
            let avgGeneral = 0;
            if (totalCount > 0) {
                avgGeneral = ((avgNon * countNon) + (avgOnc * countOnc)) / totalCount;
            }
            entry.Stats.AverageWaitDays.General = parseFloat(avgGeneral.toFixed(2));
        }

        // --- 3. LÓGICA DE MERGE (UPSERT) ---
        let doc = await Cirurgia.findOne({
            "Header.InstitutionId": hospitalId,
            "Header.DateReference.Year": root.Header.DateReference.Year,
            "Header.DateReference.Month": root.Header.DateReference.Month
        });

        if (!doc) {
            root.SurgicalData.SurgeryEntry = newEntries;
            doc = new Cirurgia(root);
        } else {
            console.log(`   -> A fundir com documento existente: ${doc._id}`);
            doc.Header.HospitalName = hospital.HospitalName;
            doc.Header.SubmissionDate = new Date();

            newEntries.forEach(newEntry => {
                const existingEntry = doc.SurgicalData.SurgeryEntry.find(e => e.ServiceKey == newEntry.ServiceKey);

                if (existingEntry) {
    // --- 1. GUARDAR VALORES ANTIGOS PARA OS PESOS (ANTES DE SOMAR) ---
    // Geral
    const countOld_Gen = existingEntry.Stats.WaitingListCounts.General || 0;
    const avgOld_Gen = existingEntry.Stats.AverageWaitDays.General || 0;

    // Não Oncológico
    const countOld_Non = existingEntry.Stats.WaitingListCounts.NonOncological || 0;
    const avgOld_Non = existingEntry.Stats.AverageWaitDays.NonOncological || 0;

    // Oncológico
    const countOld_Onc = existingEntry.Stats.WaitingListCounts.Oncological || 0;
    const avgOld_Onc = existingEntry.Stats.AverageWaitDays.Oncological || 0;

    // --- 2. VALORES NOVOS (DO XML) ---
    const countNew_Gen = newEntry.Stats.WaitingListCounts.General || 0;
    const avgNew_Gen = newEntry.Stats.AverageWaitDays.General || 0;

    const countNew_Non = newEntry.Stats.WaitingListCounts.NonOncological || 0;
    const avgNew_Non = newEntry.Stats.AverageWaitDays.NonOncological || 0;

    const countNew_Onc = newEntry.Stats.WaitingListCounts.Oncological || 0;
    const avgNew_Onc = newEntry.Stats.AverageWaitDays.Oncological || 0;

    // --- 3. ATUALIZAR CONTAGENS (SOMAR) ---
    existingEntry.Stats.WaitingListCounts.General += countNew_Gen;
    existingEntry.Stats.WaitingListCounts.NonOncological += countNew_Non;
    existingEntry.Stats.WaitingListCounts.Oncological += countNew_Onc;

    // --- 4. RECALCULAR MÉDIAS PONDERADAS (CORRIGIDO) ---
    
    // Função auxiliar para média ponderada
    const calcWeighted = (avgA, countA, avgB, countB) => {
        const total = countA + countB;
        if (total === 0) return 0;
        return ((avgA * countA) + (avgB * countB)) / total;
    };

    // Agora usamos o count específico para cada tipo!
    existingEntry.Stats.AverageWaitDays.General = calcWeighted(avgOld_Gen, countOld_Gen, avgNew_Gen, countNew_Gen);
    
    existingEntry.Stats.AverageWaitDays.NonOncological = calcWeighted(avgOld_Non, countOld_Non, avgNew_Non, countNew_Non);
    
    existingEntry.Stats.AverageWaitDays.Oncological = calcWeighted(avgOld_Onc, countOld_Onc, avgNew_Onc, countNew_Onc);

    // Arredondar para 2 casas decimais para ficar bonito na BD
    existingEntry.Stats.AverageWaitDays.General = parseFloat(existingEntry.Stats.AverageWaitDays.General.toFixed(2));
    existingEntry.Stats.AverageWaitDays.NonOncological = parseFloat(existingEntry.Stats.AverageWaitDays.NonOncological.toFixed(2));
    existingEntry.Stats.AverageWaitDays.Oncological = parseFloat(existingEntry.Stats.AverageWaitDays.Oncological.toFixed(2));

} else {
    doc.SurgicalData.SurgeryEntry.push(newEntry);
}
            });
        }

        await doc.save();
        res.status(200).json({ status: 'success', id: doc._id, message: "Cirurgias integradas." });

    } catch (err) {
        console.error("❌ Erro:", err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;