const mongoose = require('mongoose');

const mongoURI = 'mongodb+srv://GROUP-7:GROUP-7PEI@cluster-pei-group7.ee7vrls.mongodb.net/db_hospital?appName=CLUSTER-PEI-GROUP7';

(async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log("🚀 A INICIAR MIGRAÇÃO TOTAL (TODAS AS CIRURGIAS)...");

        const pipeline = [
            // --- 1. LIMPEZA INICIAL ---
            // Convertemos tudo o que é necessário, mas NÃO FILTRAMOS NADA AQUI
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

            // --- 3. FILTRO ÚNICO: TEM DE SER CIRURGIA ---
            // Aqui dizemos: "Queremos tudo o que seja TypeCode 1".
            // Independentemente de ser Prio 0, 1, 2 ou 3. Tudo passa.
            { $match: { "service_info.TypeCode": 1 } },

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
                    SurgicalSpeciality: "$service_info.Speciality", // Nome da Especialidade
                    
                    // Lemos a prioridade TAL E QUAL como ela vem da base de dados
                    RawPriority: { $toInt: "$service_info.PriorityCode" },

                    Count: "$CountInt", 
                    Time: "$TimeDouble"
                }
            },

            // --- 6. AGRUPAMENTO POR NOME DA ESPECIALIDADE ---
            {
                $group: {
                    _id: {
                        InstitutionId: "$InstitutionId",
                        Year: "$Year",
                        Month: "$Month",
                        SurgicalSpeciality: "$SurgicalSpeciality" // Junta tudo o que tem o mesmo nome
                    },
                    
                    HospitalName: { $first: "$HospitalName" },
                    ServiceKey: { $first: "$ServiceKey" }, 

                    // --- AQUI ESTÁ A LÓGICA "APANHA TUDO" ---
                    
                    // Se a prioridade for EXATAMENTE 3, é oncológico.
                    SumOnc: { 
                        $sum: { $cond: [{ $eq: ["$RawPriority", 3] }, "$Count", 0] } 
                    },

                    // Se a prioridade for QUALQUER OUTRA COISA (0, 1, 2, 99...), é Não Oncológico.
                    // Isto garante que NENHUM registo fica para trás.
                    SumNonOnc: { 
                        $sum: { $cond: [{ $ne: ["$RawPriority", 3] }, "$Count", 0] } 
                    },
                    
                    // Mesma lógica para os tempos (pesos)
                    WeightNonOnc: { $sum: { $cond: [{ $ne: ["$RawPriority", 3] }, { $multiply: ["$Time", "$Count"] }, 0] } },
                    WeightOnc: { $sum: { $cond: [{ $eq: ["$RawPriority", 3] }, { $multiply: ["$Time", "$Count"] }, 0] } }
                }
            },

            // --- 7. FORMATAR O OBJETO DA ESPECIALIDADE ---
            {
                $project: {
                    InstitutionId: "$_id.InstitutionId",
                    HospitalName: "$HospitalName",
                    Year: "$_id.Year",
                    Month: "$_id.Month",
                    
                    EntryObject: {
                        ServiceKey: "$ServiceKey",
                        SurgicalSpeciality: "$_id.SurgicalSpeciality",
                        
                        Stats: {
                            WaitingListCounts: {
                                Oncological: "$SumOnc",
                                NonOncological: "$SumNonOnc",
                                General: { $add: ["$SumNonOnc", "$SumOnc"] }
                            },
                            AverageWaitDays: {
                                Oncological: { 
                                    $cond: [{ $eq: ["$SumOnc", 0] }, 0, { $divide: ["$WeightOnc", "$SumOnc"] }] 
                                },
                                NonOncological: { 
                                    $cond: [{ $eq: ["$SumNonOnc", 0] }, 0, { $divide: ["$WeightNonOnc", "$SumNonOnc"] }] 
                                },
                                General: {
                                    $cond: [
                                        { $eq: [{ $add: ["$SumNonOnc", "$SumOnc"] }, 0] }, 0,
                                        { $divide: [{ $add: ["$WeightNonOnc", "$WeightOnc"] }, { $add: ["$SumNonOnc", "$SumOnc"] }] }
                                    ]
                                }
                            }
                        }
                    }
                }
            },

            // --- 8. AGRUPAMENTO FINAL POR HOSPITAL ---
            {
                $group: {
                    _id: {
                        InstitutionId: "$InstitutionId",
                        Year: "$Year",
                        Month: "$Month"
                    },
                    HospitalName: { $first: "$HospitalName" },
                    SurgeryEntryList: { $push: "$EntryObject" }
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
                    SurgicalData: {
                        SurgeryEntry: "$SurgeryEntryList"
                    }
                }
            },

            // --- 10. GRAVAR ---
            {
                $merge: {
                    into: { db: "healthtime", coll: "cirurgias" },
                    whenMatched: "replace",
                    whenNotMatched: "insert"
                }
            }
        ];

        await mongoose.connection.db.collection('raw_temposesperaconsultacirurgia').aggregate(pipeline).toArray();
        console.log("✅ MIGRAÇÃO TOTAL CONCLUÍDA.");
        process.exit(0);

    } catch (err) {
        console.error("❌ Erro:", err);
        process.exit(1);
    }
})();