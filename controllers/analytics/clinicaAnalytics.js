const mongoose = require('mongoose');
const { getDates } = require('./utils');

// =================================================================================
// 4. Comparação Oncologia vs Não-Oncologia (Consultas)
// =================================================================================
exports.getOncologyComparison = async (req, res) => {
    try {
        // --- 1. DEFINIR O PERÍODO (Baseado no Header.DateReference) ---
        // Se o user não passar nada, assumimos Dezembro/2024 (o que vimos no teu script)
        const month = req.query.month || "Dezembro";
        const year = parseInt(req.query.year) || 2024;

        console.log(`📊 Query 4 (Oncologia): A analisar ${month}/${year}...`);

        // Filtro inicial de Data
        const dateMatch = {
            "Header.DateReference.Month": month,
            "Header.DateReference.Year": year
        };

        // --- 2. DEFINIR A ESPECIALIDADE OU KEY ---
        let specialtyMatch = {};
        
        if (req.query.serviceKey) {
            // Busca por ID (ex: 14 para Pneumologia)
            const skey = parseInt(req.query.serviceKey);
            specialtyMatch = { "Data.ConsultationEntry.ServiceKey": skey };
            console.log(`   > Filtro: ServiceKey ${skey}`);

        } else if (req.query.specialty || req.query.speciality) {
            // Busca por Nome (ex: "Pneumo")
            const rawName = req.query.specialty || req.query.speciality;
            const cleanName = rawName.trim();
            
            // Regex: Começa por... (^), case-insensitive (i)
            specialtyMatch = { 
                "Data.ConsultationEntry.Speciality": new RegExp(`^${cleanName}`, 'i') 
            };
            console.log(`   > Filtro: Especialidade "${cleanName}"`);

        } else {
            return res.status(400).json({ 
                error: "⚠️ Falta a especialidade! Use '?specialty=Ortopedia' ou '?serviceKey=17'" 
            });
        }

        const stats = await mongoose.connection.db.collection('consultas').aggregate([
            // 1. Filtrar pelo Período
            { $match: dateMatch },

            // 2. Desconstruir o array para poder filtrar a especialidade lá dentro
            { $unwind: "$Data.ConsultationEntry" },
            
            // 3. Filtrar pela Especialidade
            { $match: specialtyMatch },

            // 4. Agrupar por Hospital (caso haja duplicados)
            {
                $group: {
                    _id: "$Header.HospitalName",
                    Speciality: { $first: "$Data.ConsultationEntry.Speciality" },
                    
                    // Médias
                    avgWaitOnco: { $avg: "$Data.ConsultationEntry.Stats.AverageWaitDays.Oncological" },
                    avgWaitNonOnco: { $avg: "$Data.ConsultationEntry.Stats.AverageWaitDays.NonOncological" },
                    
                    // Volume
                    totalOnco: { $sum: "$Data.ConsultationEntry.Stats.WaitingListCounts.Oncological" },
                    totalNonOnco: { $sum: "$Data.ConsultationEntry.Stats.WaitingListCounts.NonOncological" }
                }
            },
            
            // 5. Formatar Saída
            {
                $project: {
                    _id: 0,
                    Hospital: "$_id",
                    Speciality: "$Speciality",
                    
                    WaitDays_Onco: { $round: [{ $ifNull: ["$avgWaitOnco", 0] }, 1] },
                    WaitDays_NonOnco: { $round: [{ $ifNull: ["$avgWaitNonOnco", 0] }, 1] },
                    
                    // Diferença (Não-Onco - Onco)
                    Difference: { 
                        $round: [
                            { $subtract: [
                                { $ifNull: ["$avgWaitNonOnco", 0] }, 
                                { $ifNull: ["$avgWaitOnco", 0] }
                            ]}, 
                            1
                        ] 
                    },
                    
                    // Para veres se há dados reais
                    TotalPatients_Onco: "$totalOnco",
                    TotalPatients_NonOnco: "$totalNonOnco"
                }
            },
            { $sort: { Difference: -1 } }
        ]).toArray();

        res.json({ 
            period: { month, year },
            filter_applied: specialtyMatch,
            count: stats.length,
            results: stats 
        });

    } catch (error) {
        console.error("❌ Erro Query 4:", error);
        res.status(500).json({ error: error.message });
    }
};

// =================================================================================
// 5. Estatísticas Cirurgias (Geral vs Oncológica)
// =================================================================================
exports.getSurgeryStats = async (req, res) => {
    try {
        // --- 1. LÓGICA DE FILTRO POR MÊS/ANO (Referência) ---
        let matchStage = {};
        let logMessage = "Todos os dados";

        // Filtro por Mês (Obrigatório ou Opcional conforme o requisito)
        if (req.query.month) {
            // Regex para ser case-insensitive (aceita "Dezembro", "dezembro", "DEZEMBRO")
            const monthRegex = new RegExp(`^${req.query.month.trim()}$`, 'i');
            matchStage["Header.DateReference.Month"] = monthRegex;
            logMessage = `Mês: ${req.query.month}`;
        }

        // Filtro por Ano (Recomendado para não misturar anos diferentes)
        if (req.query.year) {
            // Aceita string "2024" ou int 2024
            const yearVal = parseInt(req.query.year); // Tenta converter para número
            
            // O dataset pode ter o ano como String ou Number, o $in resolve ambos
            matchStage["Header.DateReference.Year"] = { $in: [yearVal, req.query.year.toString()] };
            logMessage += ` | Ano: ${req.query.year}`;
        }

        // Filtro Opcional por Especialidade
        if (req.query.specialty) {
            matchStage["SurgicalData.SurgeryEntry.SurgicalSpeciality"] = new RegExp(req.query.specialty, 'i');
        }

        console.log(`📊 Query 5 (Cirurgias por Mês) -> ${logMessage}`);

        const stats = await mongoose.connection.db.collection('cirurgias').aggregate([
            // 1. Filtrar pelo Mês/Ano de Referência (Antes de fazer unwind é mais rápido)
            { $match: matchStage },

            // 2. Abrir o array de cirurgias
            { $unwind: "$SurgicalData.SurgeryEntry" },

            // 3. (Opcional) Se houver filtro de especialidade, aplica-se aqui também
            // para garantir que só processamos o necessário
            ...(req.query.specialty ? [{ $match: { "SurgicalData.SurgeryEntry.SurgicalSpeciality": new RegExp(req.query.specialty, 'i') } }] : []),

            // 4. Agrupar por Especialidade
            {
                $group: {
                    _id: "$SurgicalData.SurgeryEntry.SurgicalSpeciality",
                    
                    // --- CÁLCULO PONDERADO ---
                    weightedSumGeneral: { 
                        $sum: { $multiply: ["$SurgicalData.SurgeryEntry.Stats.AverageWaitDays.General", "$SurgicalData.SurgeryEntry.Stats.WaitingListCounts.General"] } 
                    },
                    weightedSumOnco: { 
                        $sum: { $multiply: ["$SurgicalData.SurgeryEntry.Stats.AverageWaitDays.Oncological", "$SurgicalData.SurgeryEntry.Stats.WaitingListCounts.Oncological"] } 
                    },
                    
                    totalGeneral: { $sum: "$SurgicalData.SurgeryEntry.Stats.WaitingListCounts.General" },
                    totalOnco: { $sum: "$SurgicalData.SurgeryEntry.Stats.WaitingListCounts.Oncological" }
                }
            },
            {
                $project: {
                    Speciality: "$_id",
                    _id: 0,
                    
                    AvgWaitGeneral: { 
                        $cond: [ { $eq: ["$totalGeneral", 0] }, 0, { $round: [{ $divide: ["$weightedSumGeneral", "$totalGeneral"] }, 1] } ]
                    },
                    AvgWaitOncological: { 
                        $cond: [ { $eq: ["$totalOnco", 0] }, 0, { $round: [{ $divide: ["$weightedSumOnco", "$totalOnco"] }, 1] } ]
                    },
                    
                    VolumeGeneral: "$totalGeneral",
                    VolumeOncological: "$totalOnco"
                }
            },
            { $sort: { AvgWaitGeneral: -1 } }
        ]).toArray();

        res.json({ 
            filter: { month: req.query.month, year: req.query.year },
            count: stats.length, // Agora deve dar 39 (ou perto disso)
            results: stats 
        });
        
    } catch (error) {
        console.error("❌ Erro Query 5:", error);
        res.status(500).json({ error: error.message });
    }
};

// =================================================================================
// 6. Cruzamento Consultas vs Cirurgias (Discrepância)
// =================================================================================
exports.getConsultationVsSurgery = async (req, res) => {
    try {
        // Filtros opcionais
        const hospitalRegex = req.query.hospital ? new RegExp(req.query.hospital, 'i') : /./;
        const specialtyRegex = req.query.specialty ? new RegExp(req.query.specialty, 'i') : /./;

        // Filtro de Tempo (Mês/Ano) - Igual à Query 5
        let matchStage = { 
            "Header.HospitalName": hospitalRegex 
        };
        
        if (req.query.month) matchStage["Header.DateReference.Month"] = new RegExp(`^${req.query.month.trim()}$`, 'i');
        if (req.query.year) matchStage["Header.DateReference.Year"] = { $in: [parseInt(req.query.year), req.query.year.toString()] };

        console.log(`📊 Query 6 (Cruzamento) -> Hospital: ${req.query.hospital || 'Todos'} | Mês: ${req.query.month || 'Todos'}`);

        const stats = await mongoose.connection.db.collection('consultas').aggregate([
            // 1. Filtrar Consultas
            { $match: matchStage },
            
            // 2. Abrir Especialidades das Consultas
            { $unwind: "$Data.ConsultationEntry" },
            
            // 3. Filtrar Especialidade (se pedido)
            { $match: { "Data.ConsultationEntry.Speciality": specialtyRegex } },

            // 4. JOIN com Cirurgias
            {
                $lookup: {
                    from: "cirurgias",
                    let: { 
                        instId: "$Header.InstitutionId", 
                        spec: "$Data.ConsultationEntry.Speciality",
                        month: "$Header.DateReference.Month",
                        year: "$Header.DateReference.Year"
                    },
                    pipeline: [
                        { $unwind: "$SurgicalData.SurgeryEntry" },
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$Header.InstitutionId", "$$instId"] },
                                        { $eq: ["$Header.DateReference.Month", "$$month"] },
                                        { $eq: ["$Header.DateReference.Year", "$$year"] },
                                        // O nome da especialidade tem de ser igual
                                        { $eq: ["$SurgicalData.SurgeryEntry.SurgicalSpeciality", "$$spec"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "surgeryMatch"
                }
            },
            
            // 5. Manter apenas se houver correspondência (Consultas que também têm Cirurgia)
            { $unwind: "$surgeryMatch" },

            // 6. Calcular e Projetar
            {
                $project: {
                    _id: 0,
                    Hospital: "$Header.HospitalName",
                    Speciality: "$Data.ConsultationEntry.Speciality",
                    Period: { 
                        Month: "$Header.DateReference.Month", 
                        Year: "$Header.DateReference.Year" 
                    },
                    Wait_Consultation: { $round: ["$Data.ConsultationEntry.Stats.AverageWaitDays.General", 1] },
                    Wait_Surgery: { $round: ["$surgeryMatch.SurgicalData.SurgeryEntry.Stats.AverageWaitDays.General", 1] },
                    
                    // Diferença Absoluta (Quem espera mais? Não importa, queremos o tamanho do fosso)
                    Discrepancy: {
                        $round: [
                            { $abs: { $subtract: [
                                "$Data.ConsultationEntry.Stats.AverageWaitDays.General",
                                "$surgeryMatch.SurgicalData.SurgeryEntry.Stats.AverageWaitDays.General"
                            ] } }, 
                            1
                        ]
                    }
                }
            },
            { $sort: { Discrepancy: -1 } }
        ]).toArray();

        res.json({ 
            count: stats.length,
            results: stats 
        });

    } catch (error) {
        console.error("❌ Erro Query 6:", error);
        res.status(500).json({ error: error.message });
    }
};