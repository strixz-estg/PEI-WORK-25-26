const mongoose = require('mongoose');

const mongoURI = 'mongodb+srv://GROUP-7:GROUP-7PEI@cluster-pei-group7.ee7vrls.mongodb.net/db_hospital?appName=CLUSTER-PEI-GROUP7';

(async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log("🚀 A INICIAR MIGRAÇÃO TOTAL (TODAS AS CONSULTAS)...");

        const pipeline = [
            // --- 1. LIMPEZA INICIAL ---
            {
                $addFields: {
                    ServiceKeyInt: { $toInt: "$ServiceKey" },
                    HospitalNameClean: { $trim: { input: "$HospitalName" } },
                    CountInt: { $toInt: "$NumberOfPeople" },
                    TimeDouble: { $toDouble: "$AverageWaitingTime_Speciality_Priority_Institution" }
                }
            },

            // --- 2. JOIN COM SERVIÇOS ---
            {
                $lookup: {
                    from: "raw_servicos",
                    localField: "ServiceKeyInt",
                    foreignField: "ServiceKey",
                    as: "service_info"
                }
            },
            { $unwind: "$service_info" },

            // --- 3. FILTRO: APENAS CONSULTAS ---
            { $match: { "service_info.TypeCode": 2 } },

            // --- 4. JOIN COM HOSPITAIS ---
            {
                $lookup: {
                    from: "raw_hospitais",
                    localField: "HospitalNameClean",
                    foreignField: "HospitalName",
                    as: "hospital_info"
                }
            },
            { 
                $unwind: { 
                    path: "$hospital_info", 
                    preserveNullAndEmptyArrays: true 
                } 
            },

            // --- 5. PREPARAÇÃO ---
            {
                $project: {
                    InstitutionId: { $ifNull: ["$hospital_info.HospitalID", 999999] },
                    HospitalName: { $ifNull: ["$hospital_info.HospitalName", "$HospitalNameClean"] },
                    Year: "$Year",
                    Month: { $trim: { input: { $ifNull: ["$MonthPortuguese", "Dezembro"] } } },
                    
                    ServiceKey: "$ServiceKeyInt",
                    Speciality: "$service_info.Speciality",
                    
                    RawPriority: { $toInt: "$service_info.PriorityCode" },
                    Count: "$CountInt", 
                    Time: "$TimeDouble"
                }
            },

            // --- 6. AGRUPAMENTO POR ESPECIALIDADE ---
            {
                $group: {
                    _id: {
                        InstitutionId: "$InstitutionId",
                        Year: "$Year",
                        Month: "$Month",
                        Speciality: "$Speciality"
                    },
                    
                    HospitalName: { $first: "$HospitalName" },
                    ServiceKey: { $first: "$ServiceKey" }, 

                    // --- CONTAGENS (Counts) ---
                    SumOnc: { 
                        $sum: { $cond: [{ $eq: ["$RawPriority", 3] }, "$Count", 0] } 
                    },
                    SumNonOnc: { 
                        $sum: { $cond: [{ $ne: ["$RawPriority", 3] }, "$Count", 0] } 
                    },
                    
                    // --- TEMPOS PONDERADOS (Para AverageWaitDays) ---
                    WeightNonOnc: { $sum: { $cond: [{ $ne: ["$RawPriority", 3] }, { $multiply: ["$Time", "$Count"] }, 0] } },
                    WeightOnc: { $sum: { $cond: [{ $eq: ["$RawPriority", 3] }, { $multiply: ["$Time", "$Count"] }, 0] } },

                    // --- TEMPOS ESPECÍFICOS (Para AverageResponseTime) ---
                    TimeNormal: { $max: { $cond: [{ $eq: ["$RawPriority", 1] }, "$Time", 0] } },       // Prioridade 1
                    TimePrioritario: { $max: { $cond: [{ $eq: ["$RawPriority", 2] }, "$Time", 0] } },  // Prioridade 2
                    TimeMuitoPrioritario: { $max: { $cond: [{ $eq: ["$RawPriority", 3] }, "$Time", 0] } } // Prioridade 3
                }
            },

            // --- 7. FORMATAR O OBJETO DA CONSULTA (Igual ao JSON pedido) ---
            {
                $project: {
                    InstitutionId: "$_id.InstitutionId",
                    HospitalName: "$HospitalName",
                    Year: "$_id.Year",
                    Month: "$_id.Month",
                    
                    EntryObject: {
                        ServiceKey: "$ServiceKey",
                        Speciality: "$_id.Speciality",
                        
                        Stats: {
                            WaitingListCounts: {
                                General: { $add: ["$SumNonOnc", "$SumOnc"] },
                                NonOncological: "$SumNonOnc",
                                Oncological: "$SumOnc"
                            },
                            AverageWaitDays: {
                                General: {
                                    $cond: [
                                        { $eq: [{ $add: ["$SumNonOnc", "$SumOnc"] }, 0] }, 0,
                                        { $divide: [{ $add: ["$WeightNonOnc", "$WeightOnc"] }, { $add: ["$SumNonOnc", "$SumOnc"] }] }
                                    ]
                                },
                                NonOncological: { 
                                    $cond: [{ $eq: ["$SumNonOnc", 0] }, 0, { $divide: ["$WeightNonOnc", "$SumNonOnc"] }] 
                                },
                                Oncological: { 
                                    $cond: [{ $eq: ["$SumOnc", 0] }, 0, { $divide: ["$WeightOnc", "$SumOnc"] }] 
                                }
                            },
                            AverageResponseTime: {
                                Normal: "$TimeNormal",
                                Prioritario: "$TimePrioritario",
                                MuitoPrioritario: "$TimeMuitoPrioritario"
                            }
                        }
                    }
                }
            },

            // --- 8. AGRUPAMENTO FINAL POR HOSPITAL  ---
            {
                $group: {
                    _id: {
                        InstitutionId: "$InstitutionId",
                        Year: "$Year",
                        Month: "$Month"
                    },
                    HospitalName: { $first: "$HospitalName" },
                    ConsultationEntryList: { $push: "$EntryObject" } 
                }
            },

            // --- 9. ESTRUTURA FINAL ---
            {
                $project: {
                    _id: { 
                        $concat: [
                            { $toString: "$_id.InstitutionId" }, "_", 
                            { $toString: "$_id.Year" }, "_", 
                            "$_id.Month"
                        ] 
                    },
                    Header: {
                        InstitutionId: "$_id.InstitutionId",
                        HospitalName: "$HospitalName",
                        SubmissionDate: new Date(),
                        DateReference: {
                            Month: "$_id.Month",
                            Year: "$_id.Year"
                        }
                    },
                    Data: {
                        ConsultationEntry: "$ConsultationEntryList"
                    }
                }
            },

            // --- 10. GRAVAR ---
            {
                $merge: {
                    into: { db: "healthtime", coll: "consultas" }, // Coleção CONSULTAS
                    whenMatched: "replace",
                    whenNotMatched: "insert"
                }
            }
        ];

        await mongoose.connection.db.collection('raw_temposesperaconsultacirurgia').aggregate(pipeline).toArray();
        console.log(" MIGRAÇÃO DE CONSULTAS CONCLUÍDA.");
        process.exit(0);

    } catch (err) {
        console.error("Erro:", err);
        process.exit(1);
    }
})();