const express = require('express');
const router = express.Router();
const Cirurgia = require('../models/Cirurgia');
const Hospital = require('../models/Hospital');
const Service = require('../models/Service');

// Função auxiliar para garantir arrays
const forceArray = (item) => Array.isArray(item) ? item : [item];

// Função auxiliar para cálculo de médias ponderadas
const calcWeighted = (avgA, countA, avgB, countB) => {
    const total = countA + countB;
    if (total === 0) return 0;
    return ((avgA * countA) + (avgB * countB)) / total;
};

router.post('/', async (req, res) => {
    try {
        console.log("--> [API] A processar Cirurgia (Auto-Calc & Merge)...");
        const root = req.body.SurgeryReport;
        
        // Validação básica
        if (!root) return res.status(400).json({ status: 'error', message: "XML vazio ou inválido." });

        // --- 1. VALIDAÇÃO E INJEÇÃO DE HEADER ---
        const hospitalId = root.Header.InstitutionId;
        const hospital = await Hospital.findOne({ InstitutionId: hospitalId });

        if (!hospital) {
            return res.status(404).json({ status: 'error', message: `Hospital ${hospitalId} desconhecido.` });
        }

        // Injeção de dados no Header
        const originalHeader = root.Header;
        const newHeader = {
            InstitutionId: originalHeader.InstitutionId,
            HospitalName: hospital.HospitalName, // Injetado da BD
            SubmissionDate: new Date(),          // Data de agora
            DateReference: originalHeader.DateReference
        };
        root.Header = newHeader;

        // --- 2. PREPARAÇÃO DOS DADOS E CÁLCULOS INICIAIS ---
        let newEntries = [];
        if (root.SurgicalData && root.SurgicalData.SurgeryEntry) {
            newEntries = forceArray(root.SurgicalData.SurgeryEntry);
        }

        // Loop de validação e pré-cálculo
        for (const entry of newEntries) {
            // Validação Serviço
            const service = await Service.findOne({ ServiceKey: entry.ServiceKey });
            if (!service) return res.status(404).json({ status: 'error', message: `Serviço ${entry.ServiceKey} não encontrado.` });
            if (service.TypeCode !== 1) return res.status(400).json({ status: 'error', message: `Serviço ${entry.ServiceKey} não é do tipo CIRURGIA.` });

            // A. Cálculo de Totais (General Count)
            const countNon = parseInt(entry.Stats.WaitingListCounts.NonOncological || 0);
            const countOnc = parseInt(entry.Stats.WaitingListCounts.Oncological || 0);
            const totalCount = countNon + countOnc;
            
            entry.Stats.WaitingListCounts.General = totalCount;

            // B. Cálculo de Média Ponderada Inicial (General Wait Days)
            // Calculamos a média geral baseada nas partes (Onco + Não Onco)
            const avgNon = parseFloat(entry.Stats.AverageWaitDays.NonOncological || 0);
            const avgOnc = parseFloat(entry.Stats.AverageWaitDays.Oncological || 0);
            
            let avgGeneral = 0;
            if (totalCount > 0) {
                avgGeneral = ((avgNon * countNon) + (avgOnc * countOnc)) / totalCount;
            }
            entry.Stats.AverageWaitDays.General = parseFloat(avgGeneral.toFixed(2));
        }

        // --- 3. LÓGICA DE MERGE (UPSERT) ---
        // Tenta encontrar documento existente para este Hospital + Ano + Mês
        let doc = await Cirurgia.findOne({
            "Header.InstitutionId": hospitalId,
            "Header.DateReference.Year": root.Header.DateReference.Year,
            "Header.DateReference.Month": root.Header.DateReference.Month
        });

        if (!doc) {
            // ==============================================================================
            // CORREÇÃO CRÍTICA: GERAR O _id MANUALMENTE
            // ==============================================================================
            const customId = `${hospitalId}_${root.Header.DateReference.Year}_${root.Header.DateReference.Month}`;
            
            console.log(`   -> Criando novo registo mensal: ${customId}`);
            
            root._id = customId; // Atribui o ID ao objeto antes de criar o Mongoose Document
            root.SurgicalData.SurgeryEntry = newEntries;
            
            doc = new Cirurgia(root);

        } else {
            console.log(`   -> A fundir com documento existente: ${doc._id}`);
            
            // Atualiza Header
            doc.Header.HospitalName = hospital.HospitalName;
            doc.Header.SubmissionDate = new Date();

            // Processa cada entrada nova contra as existentes
            newEntries.forEach(newEntry => {
                const existingEntry = doc.SurgicalData.SurgeryEntry.find(e => e.ServiceKey == newEntry.ServiceKey);

                if (existingEntry) {
                    // --- ATUALIZAR ENTRADA EXISTENTE ---
                    
                    // 1. Valores Antigos
                    const countOld_Gen = existingEntry.Stats.WaitingListCounts.General || 0;
                    const avgOld_Gen = existingEntry.Stats.AverageWaitDays.General || 0;
                    
                    const countOld_Non = existingEntry.Stats.WaitingListCounts.NonOncological || 0;
                    const avgOld_Non = existingEntry.Stats.AverageWaitDays.NonOncological || 0;

                    const countOld_Onc = existingEntry.Stats.WaitingListCounts.Oncological || 0;
                    const avgOld_Onc = existingEntry.Stats.AverageWaitDays.Oncological || 0;

                    // 2. Valores Novos
                    const countNew_Gen = newEntry.Stats.WaitingListCounts.General || 0;
                    const avgNew_Gen = newEntry.Stats.AverageWaitDays.General || 0;

                    const countNew_Non = newEntry.Stats.WaitingListCounts.NonOncological || 0;
                    const avgNew_Non = newEntry.Stats.AverageWaitDays.NonOncological || 0;

                    const countNew_Onc = newEntry.Stats.WaitingListCounts.Oncological || 0;
                    const avgNew_Onc = newEntry.Stats.AverageWaitDays.Oncological || 0;

                    // 3. Atualizar Contagens (Soma simples)
                    existingEntry.Stats.WaitingListCounts.General += countNew_Gen;
                    existingEntry.Stats.WaitingListCounts.NonOncological += countNew_Non;
                    existingEntry.Stats.WaitingListCounts.Oncological += countNew_Onc;

                    // 4. Recalcular Médias (Média Ponderada: Antigo vs Novo)
                    // General
                    existingEntry.Stats.AverageWaitDays.General = parseFloat(
                        calcWeighted(avgOld_Gen, countOld_Gen, avgNew_Gen, countNew_Gen).toFixed(2)
                    );
                    
                    // Não Oncológico
                    existingEntry.Stats.AverageWaitDays.NonOncological = parseFloat(
                        calcWeighted(avgOld_Non, countOld_Non, avgNew_Non, countNew_Non).toFixed(2)
                    );

                    // Oncológico
                    existingEntry.Stats.AverageWaitDays.Oncological = parseFloat(
                        calcWeighted(avgOld_Onc, countOld_Onc, avgNew_Onc, countNew_Onc).toFixed(2)
                    );

                } else {
                    // --- NOVA ENTRADA (Serviço que não existia antes neste mês) ---
                    doc.SurgicalData.SurgeryEntry.push(newEntry);
                }
            });
        }

        // Salvar na Base de Dados
        await doc.save();
        
        console.log(`✅ Sucesso: ${doc._id} salvo.`);
        res.status(200).json({ status: 'success', id: doc._id, message: "Cirurgias integradas com sucesso." });

    } catch (err) {
        console.error("❌ Erro Crítico:", err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;