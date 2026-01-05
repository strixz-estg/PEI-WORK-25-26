const mongoose = require('mongoose');
const { getDates } = require('./utils');

// Query 1: Médias
// =================================================================================
// 1. Médias de Utentes em Espera (Por Tipologia e Categoria de Triagem)
// =================================================================================
exports.getUrgencyAverages = async (req, res) => {
    try {
        const { startDate, endDate } = getDates(req.query.start, req.query.end);
        console.log(` Query 1 (Médias Urgência): ${startDate.toISOString()} - ${endDate.toISOString()}`);

        const stats = await mongoose.connection.db.collection('urgencias').aggregate([
            {
                $match: {
                    "Header.LastUpdate": { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: "$Data.EmergencyTypeCode", // Agrupa por código (ex: "1", "2")
                    avgNonUrgent: { $avg: "$Data.WaitingTriage.NonUrgent.Length" },
                    avgLessUrgent: { $avg: "$Data.WaitingTriage.LessUrgent.Length" },
                    avgUrgent: { $avg: "$Data.WaitingTriage.Urgent.Length" },
                    avgVeryUrgent: { $avg: "$Data.WaitingTriage.VeryUrgent.Length" }
                }
            },
            {
                $project: {
                    _id: 0,
                    TypologyCode: "$_id",
                    Averages: {
                        NonUrgent: { $round: ["$avgNonUrgent", 1] },
                        LessUrgent: { $round: ["$avgLessUrgent", 1] },
                        Urgent: { $round: ["$avgUrgent", 1] },
                        VeryUrgent: { $round: ["$avgVeryUrgent", 1] }
                    }
                }
            }
        ]).toArray();

        res.json({ period: { start: startDate, end: endDate }, results: stats });
    } catch (error) {
        console.error("❌ Erro Query 1:", error);
        res.status(500).json({ error: error.message });
    }
};

// =================================================================================
// 2. Percentagens por Categoria (Com suporte a período do dia)
// =================================================================================
// controllers/analytics/urgenciaAnalytics.js

exports.getTriagePercentages = async (req, res) => {
    try {
        const { startDate, endDate } = getDates(req.query.start, req.query.end);
        
        console.log(` Query 2 (Total Real): ${startDate.toISOString()} a ${endDate.toISOString()}`);

        const stats = await mongoose.connection.db.collection('urgencias').aggregate([
            {
                $match: {
                    "Header.LastUpdate": { $gte: startDate, $lte: endDate }
                }
            },
            {
                $project: {
                    HospitalName: "$Header.HospitalName",
                    hour: { $hour: "$Header.LastUpdate" },
                    waiting: "$Data.WaitingTriage"
                }
            },
            {
                $addFields: {
                    period: {
                        $switch: {
                            branches: [
                                { case: { $and: [{ $gte: ["$hour", 8] }, { $lt: ["$hour", 12] }] }, then: "Manha" },
                                { case: { $and: [{ $gte: ["$hour", 12] }, { $lt: ["$hour", 19] }] }, then: "Tarde" }
                            ],
                            default: "Noite"
                        }
                    },
                    totalInRecord: {
                        $sum: [
                            "$waiting.NonUrgent.Length", "$waiting.LessUrgent.Length",
                            "$waiting.Urgent.Length", "$waiting.VeryUrgent.Length"
                        ]
                    }
                }
            },
            
            {
                $group: {
                    _id: { 
                        Hospital: "$HospitalName", 
                        Period: "$period" 
                    },
                    DocsProcessados: { $sum: 1 },
                    totalPatients: { $sum: "$totalInRecord" },
                    sumNonUrgent: { $sum: "$waiting.NonUrgent.Length" },
                    sumLessUrgent: { $sum: "$waiting.LessUrgent.Length" },
                    sumUrgent: { $sum: "$waiting.Urgent.Length" },
                    sumVeryUrgent: { $sum: "$waiting.VeryUrgent.Length" }
                }
            },
            {
                $project: {
                    _id: 0,
                    Hospital: "$_id.Hospital",
                    Period: "$_id.Period",
                    SnapshotsAnalyzed: "$DocsProcessados",
                    TotalPatients: "$totalPatients",
                    Percentages: {
                        // Proteção contra divisão por zero
                        NonUrgent: { 
                            $cond: [ { $eq: ["$totalPatients", 0] }, 0, 
                                { $round: [{ $multiply: [{ $divide: ["$sumNonUrgent", "$totalPatients"] }, 100] }, 1] } 
                            ]
                        },
                        LessUrgent: { 
                            $cond: [ { $eq: ["$totalPatients", 0] }, 0, 
                                { $round: [{ $multiply: [{ $divide: ["$sumLessUrgent", "$totalPatients"] }, 100] }, 1] } 
                            ]
                        },
                        Urgent: { 
                            $cond: [ { $eq: ["$totalPatients", 0] }, 0, 
                                { $round: [{ $multiply: [{ $divide: ["$sumUrgent", "$totalPatients"] }, 100] }, 1] } 
                            ]
                        },
                        VeryUrgent: { 
                            $cond: [ { $eq: ["$totalPatients", 0] }, 0, 
                                { $round: [{ $multiply: [{ $divide: ["$sumVeryUrgent", "$totalPatients"] }, 100] }, 1] } 
                            ]
                        }
                    }
                }
            },
            {
                $addFields: {
                    periodOrder: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$Period", "Manha"] }, then: 1 },
                                { case: { $eq: ["$Period", "Tarde"] }, then: 2 },
                                { case: { $eq: ["$Period", "Noite"] }, then: 3 }
                            ],
                            default: 4
                        }
                    }
                }
            },
            { $sort: { Hospital: 1, periodOrder: 1 } },
            { $project: { periodOrder: 0 } }
        ]).toArray();

        const totalRegistos = stats.reduce((acc, item) => acc + item.SnapshotsAnalyzed, 0);

        res.json({ 
            period: { start: startDate, end: endDate }, 
            count: stats.length,
            totalSnapshots: totalRegistos, 
            results: stats 
        });
        
    } catch (error) {
        console.error("Erro Query 2:", error);
        res.status(500).json({ error: error.message });
    }
};
// =================================================================================
// 3. Tempo Médio Espera Pediatria por Região
// =================================================================================
exports.getPediatricWaitingByRegion = async (req, res) => {
    try {
        const { startDate, endDate } = getDates(req.query.start, req.query.end);
        
        const PEDIATRIC_CODES = [
            "1", "2", "URGPED", "10012", "PED", 
            "URG3", "302000", "CHTV289C", "URG2"
        ]; 

        const stats = await mongoose.connection.db.collection('urgencias').aggregate([
            {
                $match: {
                    "Header.LastUpdate": { $gte: startDate, $lte: endDate },
                    "Data.EmergencyTypeCode": { $in: PEDIATRIC_CODES } 
                }
            },
            {
                $lookup: {
                    from: "hospitals",
                    localField: "Header.InstitutionId",
                    foreignField: "InstitutionId",
                    as: "hospitalInfo"
                }
            },
            { $unwind: "$hospitalInfo" },

            {
                $group: {
                    _id: "$hospitalInfo.Region.Nuts2", 
                    avgWaitTime: {
                        $avg: {
                            $avg: [ 
                                "$Data.WaitingTriage.NonUrgent.Time",
                                "$Data.WaitingTriage.LessUrgent.Time",
                                "$Data.WaitingTriage.Urgent.Time",
                                "$Data.WaitingTriage.VeryUrgent.Time"
                            ]
                        }
                    },
                    uniqueHospitals: { $addToSet: "$Header.InstitutionId" }
                }
            },
            {
                $project: {
                    Region: "$_id",
                    _id: 0,
                    AvgWaitTimeMinutes: { $round: ["$avgWaitTime", 1] },
                    HospitalsCount: { $size: "$uniqueHospitals" }
                }
            },
            { $sort: { AvgWaitTimeMinutes: -1 } }
        ]).toArray();

        res.json({ 
            period: { start: startDate, end: endDate },
            count: stats.length,
            results: stats 
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
// =================================================================================
// 7. Top 10 Hospitais (Menores tempos urgência Pediátrica)
// =================================================================================
exports.getTop10Pediatric = async (req, res) => {
    try {
        const { startDate, endDate } = getDates(req.query.start, req.query.end);
        
        // --- LISTA COMPLETA DE CÓDIGOS  ---
        const PEDIATRIC_CODES = [
            "1", "2", "URGPED", "10012", "PED", 
            "URG3", "302000", "CHTV289C"
        ]; 

        console.log(` Query 7 (Top 10 Pediatria - Códigos Totais): ${startDate.toISOString()} a ${endDate.toISOString()}`);

        const stats = await mongoose.connection.db.collection('urgencias').aggregate([
            {
                $match: {
                    "Header.LastUpdate": { $gte: startDate, $lte: endDate },
                    "Data.EmergencyTypeCode": { $in: PEDIATRIC_CODES } 
                }
            },
            {
                $project: {
                    InstitutionId: "$Header.InstitutionId",
                    HospitalName: "$Header.HospitalName",
                    snapshotAvg: {
                        $avg: [
                            "$Data.WaitingTriage.NonUrgent.Time",
                            "$Data.WaitingTriage.LessUrgent.Time",
                            "$Data.WaitingTriage.Urgent.Time",
                            "$Data.WaitingTriage.VeryUrgent.Time"
                        ]
                    }
                }
            },
            {
                // Agrupar por Hospital (Média das médias ao longo do tempo)
                $group: {
                    _id: "$InstitutionId",
                    Hospital: { $first: "$HospitalName" },
                    GlobalAvgTime: { $avg: "$snapshotAvg" }
                }
            },
            { $sort: { GlobalAvgTime: 1 } }, // 1 = Ordem Crescente (Menor tempo é melhor)
            { $limit: 10 },
            {
                // Ir buscar detalhes do hospital
                $lookup: {
                    from: "hospitals",
                    localField: "_id",
                    foreignField: "InstitutionId",
                    as: "info"
                }
            },
            { $unwind: { path: "$info", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    // Removemos o Rank daqui para calcular no JavaScript
                    Hospital: "$Hospital",
                    Region: { $ifNull: ["$info.Region.Nuts2", "$info.Region", "N/D"] }, 
                    Contact: { $ifNull: ["$info.Contacts.Phone", "$info.PhoneNum", "N/D"] },
                    AvgTimeMinutes: { $round: ["$GlobalAvgTime", 1] }
                }
            }
        ]).toArray();

        // --- CORREÇÃO DO RANK ---
        // Adiciona o Rank (1, 2, 3...) ao resultado final
        const ranked = stats.map((item, index) => ({ 
            Rank: index + 1, 
            ...item
        }));

        res.json({ 
            period: { start: startDate, end: endDate },
            count: ranked.length,
            results: ranked 
        });

    } catch (error) {
        console.error("Erro Query 7:", error);
        res.status(500).json({ error: error.message });
    }
};
// =================================================================================
// 8. Evolução Temporal (Buckets de 15 minutos)
// =================================================================================
exports.getFlowEvolution = async (req, res) => {
    try {
        const { startDate, endDate } = getDates(req.query.start, req.query.end);
        
        // --- CÓDIGOS DE URGÊNCIA GERAL (Descobertos por ti) ---
        const GENERAL_CODES = [
            "URG1", "GER", "CHUA050D", "1", 
            "URGGER", "CHTV6429", "10011", "301000"
        ];

        console.log(` Query 8 (Evolução Geral - 15min): ${startDate.toISOString()} a ${endDate.toISOString()}`);

        const stats = await mongoose.connection.db.collection('urgencias').aggregate([
            {
                $match: {
                    "Header.LastUpdate": { $gte: startDate, $lte: endDate },
                    // FILTRO NOVO: Apenas Urgência Geral
                    "Data.EmergencyTypeCode": { $in: GENERAL_CODES }
                }
            },
            // 1. Extrair Hora, Minuto e Dados
            {
                $project: {
                    hour: { $hour: "$Header.LastUpdate" },
                    minute: { $minute: "$Header.LastUpdate" },
                    
                    // VOLUME (Quantas pessoas estão à espera)
                    totalPatients: {
                        $sum: [
                            "$Data.WaitingTriage.NonUrgent.Length",
                            "$Data.WaitingTriage.LessUrgent.Length",
                            "$Data.WaitingTriage.Urgent.Length",
                            "$Data.WaitingTriage.VeryUrgent.Length"
                        ]
                    },

                    // TEMPO (Média de espera neste instante)
                    avgTimeSnapshot: {
                        $avg: [
                            "$Data.WaitingTriage.NonUrgent.Time",
                            "$Data.WaitingTriage.LessUrgent.Time",
                            "$Data.WaitingTriage.Urgent.Time",
                            "$Data.WaitingTriage.VeryUrgent.Time"
                        ]
                    }
                }
            },
            // 2. Calcular Bucket de 15 minutos
            {
                $addFields: {
                    bucketMinute: { $subtract: ["$minute", { $mod: ["$minute", 15] }] }
                }
            },
            // 3. Agrupar por Hora + Bucket
            {
                $group: {
                    _id: { hour: "$hour", minute: "$bucketMinute" },
                    AvgVolume: { $avg: "$totalPatients" },    
                    AvgWaitTime: { $avg: "$avgTimeSnapshot" } 
                }
            },
            // 4. Ordenar Cronologicamente
            { $sort: { "_id.hour": 1, "_id.minute": 1 } },
            // 5. Formatar
            {
                $project: {
                    _id: 0,
                    TimeSlot: {
                        $concat: [
                            { $toString: "$_id.hour" }, ":",
                            {
                                $cond: {
                                    if: { $lt: ["$_id.minute", 10] },
                                    then: { $concat: ["0", { $toString: "$_id.minute" }] },
                                    else: { $toString: "$_id.minute" }
                                }
                            }
                        ]
                    },
                    AvgPatients: { $round: ["$AvgVolume", 1] },
                    AvgWaitTime: { $round: ["$AvgWaitTime", 1] }
                }
            }
        ]).toArray();

        // --- CALCULAR TOP 3 PICOS (Baseado no Volume de Pacientes) ---
        const top3Peaks = [...stats]
            .sort((a, b) => b.AvgPatients - a.AvgPatients)
            .slice(0, 3);

        res.json({ 
            filter: "Urgência Geral",
            period: { start: startDate, end: endDate },
            count: stats.length,
            top3_peaks: top3Peaks,
            timeline: stats
        });

    } catch (error) {
        console.error("Erro Query 8:", error);
        res.status(500).json({ error: error.message });
    }
};