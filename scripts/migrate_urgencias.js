const mongoose = require('mongoose');

// Ligação à base de dados de ORIGEM (db_hospital)
const mongoURI = 'mongodb+srv://GROUP-7:GROUP-7PEI@cluster-pei-group7.ee7vrls.mongodb.net/db_hospital?appName=CLUSTER-PEI-GROUP7';

(async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log("🔄 A iniciar migração de Urgências (Correção Datas + Literal)...");

        const pipeline = [
            {
                $lookup: {
                    from: "raw_hospitais",       
                    localField: "institutionId", 
                    foreignField: "HospitalID",  
                    as: "hospital_info"
                }
            },
            {
                $unwind: {
                    path: "$hospital_info",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 0, 
                    
                    Header: {
                        InstitutionId: "$institutionId",
                        HospitalName: { $ifNull: ["$hospital_info.HospitalName", "Hospital Desconhecido"] },
                        
                        Address: { 
                            $concat: [
                                { $ifNull: ["$hospital_info.Address", "Morada Indisponível"] },
                                ", ",
                                { $ifNull: ["$hospital_info.District", ""] }
                            ]
                        },
                        
                        // CORREÇÃO AQUI: Usar $toDate em vez de $dateFromString
                        // O $toDate aceita tanto Strings como Datas já existentes
                        LastUpdate: { $toDate: "$LastUpdate" },
                        ExtractionDate: { $toDate: "$extractionDate" }
                    },
                    Data: {
                        EmergencyTypeCode: "$EmergencyType.Code",
                        Status: "Aberta", 
                        
                        // --- ESPERA ---
                        WaitingTriage: {
                            NonUrgent: { 
                                Time: { $ifNull: ["$Triage.Blue.Time", { $literal: 0 }] }, 
                                Length: { $ifNull: ["$Triage.Blue.Length", { $literal: 0 }] } 
                            },
                            LessUrgent: { 
                                Time: { $ifNull: ["$Triage.Green.Time", { $literal: 0 }] }, 
                                Length: { $ifNull: ["$Triage.Green.Length", { $literal: 0 }] } 
                            },
                            Urgent: { 
                                Time: { $ifNull: ["$Triage.Yellow.Time", { $literal: 0 }] }, 
                                Length: { $ifNull: ["$Triage.Yellow.Length", { $literal: 0 }] } 
                            },
                            // VeryUrgent = Red + Orange
                            VeryUrgent: { 
                                Length: { 
                                    $add: [
                                        { $ifNull: ["$Triage.Red.Length", 0] }, 
                                        { $ifNull: ["$Triage.Orange.Length", 0] }
                                    ] 
                                },
                                Time: {
                                    $let: {
                                        vars: {
                                            redLen: { $ifNull: ["$Triage.Red.Length", 0] },
                                            orgLen: { $ifNull: ["$Triage.Orange.Length", 0] },
                                            redTime: { $ifNull: ["$Triage.Red.Time", 0] },
                                            orgTime: { $ifNull: ["$Triage.Orange.Time", 0] }
                                        },
                                        in: {
                                            $cond: {
                                                if: { $eq: [{ $add: ["$$redLen", "$$orgLen"] }, 0] },
                                                then: { $literal: 0 },
                                                else: {
                                                    $divide: [
                                                        { $add: [
                                                            { $multiply: ["$$redTime", "$$redLen"] },
                                                            { $multiply: ["$$orgTime", "$$orgLen"] }
                                                        ]},
                                                        { $add: ["$$redLen", "$$orgLen"] }
                                                    ]
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },

                        // --- OBSERVAÇÃO (Zeros Literais) ---
                        ObservationTriage: {
                            NonUrgent: { Time: { $literal: 0 }, Length: { $literal: 0 } },
                            LessUrgent: { Time: { $literal: 0 }, Length: { $literal: 0 } },
                            Urgent: { Time: { $literal: 0 }, Length: { $literal: 0 } },
                            VeryUrgent: { Time: { $literal: 0 }, Length: { $literal: 0 } }
                        }
                    }
                }
            },
            {
                // Gravar na DB de DESTINO (healthtime)
                $merge: {
                    into: { db: "healthtime", coll: "urgencias" },
                    whenMatched: "replace",
                    whenNotMatched: "insert"
                }
            }
        ];

        await mongoose.connection.db.collection('raw_temposesperaemergencia').aggregate(pipeline).toArray();
        
        console.log("✅ Urgências migradas com sucesso!");
        process.exit(0);

    } catch (err) {
        console.error("❌ Erro:", err);
        process.exit(1);
    }
})();