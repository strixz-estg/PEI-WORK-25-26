const mongoose = require('mongoose');

exports.getUrgencyAverages = async (req, res) => {
    try {
        const { start, end } = req.query;

        // Definir datas padrão se não forem fornecidas
        let startDate, endDate;
        if (start && end) {
            startDate = new Date(start);
            endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);
        } else {
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 365); // Último ano por defeito
        }

        console.log(`📊 Analytics: A procurar entre ${startDate.toISOString()} e ${endDate.toISOString()}`);

        const stats = await mongoose.connection.db.collection('urgencias').aggregate([
            {
                // 1. NORMALIZAÇÃO DE DATA
                // Cria um campo temporário 'dateObj' convertendo o Timestamp (seja String ou Date) para Date real
                $addFields: {
                    dateObj: { $toDate: "$Header.Timestamp" }
                }
            },
            {
                // 2. FILTRO (Usa o campo normalizado)
                $match: {
                    dateObj: {
                        $gte: startDate,
                        $lte: endDate
                    }
                }
            },
            {
                // 3. AGRUPAR
                $group: {
                    _id: "$Data.Typology",
                    avgNonUrgent: { $avg: "$Data.WaitingPatients.NonUrgent" },
                    avgLessUrgent: { $avg: "$Data.WaitingPatients.LessUrgent" },
                    avgUrgent: { $avg: "$Data.WaitingPatients.Urgent" },
                    avgVeryUrgent: { $avg: "$Data.WaitingPatients.VeryUrgent" }
                }
            },
            {
                // 4. FORMATAÇÃO
                $project: {
                    _id: 0,
                    Typology: "$_id",
                    Averages: {
                        NonUrgent: { $round: ["$avgNonUrgent", 1] },
                        LessUrgent: { $round: ["$avgLessUrgent", 1] },
                        Urgent: { $round: ["$avgUrgent", 1] },
                        VeryUrgent: { $round: ["$avgVeryUrgent", 1] }
                    }
                }
            }
        ]).toArray();

        res.json({
            period: { 
                start: startDate.toISOString().split('T')[0], 
                end: endDate.toISOString().split('T')[0] 
            },
            count: stats.length, // Debug: ver quantos grupos encontrou
            results: stats
        });

    } catch (error) {
        console.error("❌ Erro na Query 1:", error);
        res.status(500).json({ error: "Erro ao processar estatísticas." });
    }
};

exports.getTriagePercentages = async (req, res) => {
    try {
        const { start, end } = req.query;

        // Configuração de datas (Igual à anterior)
        let startDate, endDate;
        if (start && end) {
            startDate = new Date(start);
            endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);
        } else {
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 365);
        }

        const stats = await mongoose.connection.db.collection('urgencias').aggregate([
            {
                // 1. Normalizar Data
                $addFields: { dateObj: { $toDate: "$Header.Timestamp" } }
            },
            {
                // 2. Filtro de Tempo
                $match: { dateObj: { $gte: startDate, $lte: endDate } }
            },
            {
                // 3. Agrupar e Somar Totais Absolutos
                $group: {
                    _id: "$Data.Typology",
                    totalBlue: { $sum: "$Data.WaitingPatients.NonUrgent" },
                    totalGreen: { $sum: "$Data.WaitingPatients.LessUrgent" },
                    totalYellow: { $sum: "$Data.WaitingPatients.Urgent" },
                    totalOrange: { $sum: "$Data.WaitingPatients.VeryUrgent" }
                }
            },
            {
                // 4. Calcular o Total Geral (Soma das Cores)
                $addFields: {
                    totalPatients: { 
                        $add: ["$totalBlue", "$totalGreen", "$totalYellow", "$totalOrange"] 
                    }
                }
            },
            {
                // 5. Calcular Percentagens (Evitando divisão por zero)
                $project: {
                    _id: 0,
                    Typology: "$_id",
                    TotalPatients: "$totalPatients",
                    Percentages: {
                        NonUrgent: {
                            $cond: [
                                { $eq: ["$totalPatients", 0] }, 0,
                                { $round: [{ $multiply: [{ $divide: ["$totalBlue", "$totalPatients"] }, 100] }, 1] }
                            ]
                        },
                        LessUrgent: {
                            $cond: [
                                { $eq: ["$totalPatients", 0] }, 0,
                                { $round: [{ $multiply: [{ $divide: ["$totalGreen", "$totalPatients"] }, 100] }, 1] }
                            ]
                        },
                        Urgent: {
                            $cond: [
                                { $eq: ["$totalPatients", 0] }, 0,
                                { $round: [{ $multiply: [{ $divide: ["$totalYellow", "$totalPatients"] }, 100] }, 1] }
                            ]
                        },
                        VeryUrgent: { // <--- AQUI ESTÁ A RESPOSTA AO REQUISITO
                            $cond: [
                                { $eq: ["$totalPatients", 0] }, 0,
                                { $round: [{ $multiply: [{ $divide: ["$totalOrange", "$totalPatients"] }, 100] }, 1] }
                            ]
                        }
                    }
                }
            }
        ]).toArray();

        res.json({
            period: { start, end },
            results: stats
        });

    } catch (error) {
        console.error("❌ Erro na Query 2:", error);
        res.status(500).json({ error: "Erro ao calcular percentagens." });
    }
};

exports.getPediatricWaitingByRegion = async (req, res) => {
    try {
        const { start, end } = req.query;

        // 1. Configurar Datas
        let startDate, endDate;
        if (start && end) {
            startDate = new Date(start);
            endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);
        } else {
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 365);
        }

        console.log(`📊 Analytics Q3: A procurar Pediatria entre ${startDate.toISOString()} e ${endDate.toISOString()}`);

        const stats = await mongoose.connection.db.collection('urgencias').aggregate([
            {
                // 1. NORMALIZAÇÃO DE DATA
                $addFields: {
                    dateObj: { $toDate: "$Header.Timestamp" }
                }
            },
            {
                // 2. FILTRAR DATA e PEDIATRIA
                $match: {
                    dateObj: { $gte: startDate, $lte: endDate },
                    "Data.Typology": { $regex: "pediatria", $options: "i" }
                }
            },
            {
                // 3. LOOKUP (Juntar com Hospitais)
                $lookup: {
                    from: "raw_hospitais",
                    let: { instId: "$Header.InstitutionId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: [{ $toString: "$HospitalID" }, { $toString: "$$instId" }]
                                }
                            }
                        }
                    ],
                    as: "hospitalInfo"
                }
            },
            { $unwind: "$hospitalInfo" },
            {
                // 4. CALCULAR TOTAL DE PESSOAS À ESPERA
                $addFields: {
                    totalWaiting: {
                        $add: [
                            "$Data.WaitingPatients.NonUrgent",
                            "$Data.WaitingPatients.LessUrgent",
                            "$Data.WaitingPatients.Urgent",
                            "$Data.WaitingPatients.VeryUrgent"
                        ]
                    }
                }
            },
            {
                // 5. AGRUPAR POR REGIÃO (CORRIGIDO AQUI!) ⬇️
                $group: {
                    _id: "$hospitalInfo.NUTSIIDescription", // <--- USAMOS NUTS II COMO REGIÃO
                    AveragePatientsWaiting: { $avg: "$totalWaiting" },
                    TotalReports: { $sum: 1 }
                }
            },
            {
                // 6. FORMATAÇÃO FINAL
                $project: {
                    _id: 0,
                    Region: "$_id", // O ID agora é a NUTSIIDescription
                    AveragePatientsWaiting: { $round: ["$AveragePatientsWaiting", 1] },
                    ReportsAnalyzed: "$TotalReports"
                }
            },
            { $sort: { AveragePatientsWaiting: -1 } }
        ]).toArray();

        res.json({
            period: { start, end },
            results: stats
        });

    } catch (error) {
        console.error("❌ Erro na Query 3:", error);
        res.status(500).json({ error: "Erro ao processar pediatria por região." });
    }
};

exports.getOncologyComparison = async (req, res) => {
    try {
        const { start, end, specialty } = req.query;

        // 1. Configurar Datas
        let startDate, endDate;
        if (start && end) {
            startDate = new Date(start);
            endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);
        } else {
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 365);
        }

        // Se não indicar especialidade, usa "Geral" ou tenta apanhar todas
        // Mas para esta comparação fazer sentido, devias sempre indicar uma (ex: Urologia)
        const specialtyRegex = specialty ? new RegExp(specialty, 'i') : /./;

        console.log(`📊 Analytics Q4: Comparação Oncologia p/ Hospital (${specialty || 'Todas'})`);

        const stats = await mongoose.connection.db.collection('consultas').aggregate([
            {
                // 1. Normalizar Data (Aceita YYYY-MM do histórico e ISO do XML)
                $addFields: { dateObj: { $toDate: "$Header.ReferencePeriod" } }
            },
            {
                // 2. Filtro de Data
                $match: { dateObj: { $gte: startDate, $lte: endDate } }
            },
            {
                // 3. ABRIR O ARRAY (Importante: As consultas estão dentro de uma lista)
                $unwind: "$Data.Consultation"
            },
            {
                // 4. FILTRAR PELA ESPECIALIDADE
                $match: {
                    "Data.Consultation.Speciality": specialtyRegex
                }
            },
            {
                // 5. AGRUPAR POR HOSPITAL
                $group: {
                    _id: "$Header.HospitalName",
                    
                    // Cálculo das Médias de Tempo (Dias)
                    AvgTimeNormal: { $avg: "$Data.Consultation.AverageResponseTimes.Normal" },
                    AvgTimePriority: { $avg: "$Data.Consultation.AverageResponseTimes.Priority" },
                    
                    // Volume de Doentes (Para contextualizar)
                    TotalNonOnco: { $sum: "$Data.Consultation.WaitingListCounts.NonOncological" },
                    TotalOnco: { $sum: "$Data.Consultation.WaitingListCounts.Oncological" }
                }
            },
            {
                // 6. FORMATAÇÃO E CÁLCULO DA DIFERENÇA
                $project: {
                    _id: 0,
                    Hospital: "$_id",
                    Patients: {
                        NonOncological: "$TotalNonOnco",
                        Oncological: "$TotalOnco"
                    },
                    AverageWaitDays: {
                        NonOncology_Normal: { $round: ["$AvgTimeNormal", 1] },
                        Oncology_Priority: { $round: ["$AvgTimePriority", 1] }
                    },
                    // Gap: Diferença entre Normal e Prioritário (Quanto tempo "poupam" os oncológicos)
                    TimeDifference: { 
                        $round: [{ $subtract: ["$AvgTimeNormal", "$AvgTimePriority"] }, 1] 
                    }
                }
            },
            { $sort: { TimeDifference: -1 } } // Ordenar pelos hospitais com maior distinção positiva
        ]).toArray();

        res.json({
            period: { start, end },
            specialty: specialty || "Todas",
            results: stats
        });

    } catch (error) {
        console.error("❌ Erro na Query 4:", error);
        res.status(500).json({ error: "Erro ao comparar oncologia." });
    }
};

// ... (funções anteriores ficam iguais)

exports.getSurgeryStats = async (req, res) => {
    try {
        const { start, end, specialty } = req.query;

        // 1. Configurar o "Mês" (Datas)
        // Se o utilizador não mandar datas, assumimos o último ano disponível
        let startDate, endDate;
        if (start && end) {
            startDate = new Date(start);
            endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);
        } else {
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 365);
        }

        // Filtro de Especialidade (Opcional - ex: "Oftalmologia")
        const specialtyRegex = specialty ? new RegExp(specialty, 'i') : /./;

        console.log(`📊 Analytics Q5: Cirurgias entre ${startDate.toISOString()} e ${endDate.toISOString()}`);

        const stats = await mongoose.connection.db.collection('cirurgias').aggregate([
            {
                // 1. NORMALIZAR DATA
                // O campo ReferencePeriod está no formato "YYYY-MM" (string) no histórico
                $addFields: { 
                    dateObj: { $toDate: "$SurgeryReport.Header.ReferencePeriod" } 
                }
            },
            {
                // 2. FILTRAR PELO MÊS/PERÍODO
                $match: { dateObj: { $gte: startDate, $lte: endDate } }
            },
            {
                // 3. UNWIND (Fundamental!)
                // "Explodir" o array para analisar cada especialidade individualmente
                $unwind: "$SurgeryReport.SurgicalData.SurgeryEntry"
            },
            {
                // 4. FILTRAR POR ESPECIALIDADE
                $match: {
                    "SurgeryReport.SurgicalData.SurgeryEntry.Specialty": specialtyRegex
                }
            },
            {
                // 5. AGRUPAR POR ESPECIALIDADE
                $group: {
                    _id: "$SurgeryReport.SurgicalData.SurgeryEntry.Specialty",
                    
                    // Média do Tempo de Espera (Dias)
                    AvgWaitDays: { $avg: "$SurgeryReport.SurgicalData.SurgeryEntry.AverageWaitTimeDays" },
                    
                    // Comparação de Listas (Volumes)
                    TotalGeneral: { $sum: "$SurgeryReport.SurgicalData.SurgeryEntry.WaitingListCounts.General" },
                    TotalOncological: { $sum: "$SurgeryReport.SurgicalData.SurgeryEntry.WaitingListCounts.Oncological" },
                    
                    // Quantos relatórios foram analisados para esta média
                    Count: { $sum: 1 }
                }
            },
            {
                // 6. FORMATAÇÃO FINAL
                $project: {
                    _id: 0,
                    Specialty: "$_id",
                    AverageWaitTimeDays: { $round: ["$AvgWaitDays", 1] },
                    WaitingListComparison: {
                        General_Volume: "$TotalGeneral",
                        Oncological_Volume: "$TotalOncological"
                    },
                    ReportsAnalyzed: "$Count"
                }
            },
            { $sort: { AverageWaitTimeDays: -1 } } // Ordenar das mais demoradas para as mais rápidas
        ]).toArray();

        res.json({
            period: { start, end },
            results: stats
        });

    } catch (error) {
        console.error("❌ Erro na Query 5:", error);
        res.status(500).json({ error: "Erro ao processar estatísticas de cirurgias." });
    }
};

exports.getConsultationVsSurgery = async (req, res) => {
    try {
        const { start, end, specialty, hospital } = req.query;

        // 1. Configurar Datas
        let startDate, endDate;
        if (start && end) {
            startDate = new Date(start);
            endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);
        } else {
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 365);
        }

        // Filtros opcionais
        const specialtyRegex = specialty ? new RegExp(specialty, 'i') : /./;
        const hospitalRegex = hospital ? new RegExp(hospital, 'i') : /./;

        console.log(`📊 Analytics Q6: Cruzamento Consultas <-> Cirurgias`);

        const stats = await mongoose.connection.db.collection('consultas').aggregate([
            // --- PARTE 1: PREPARAR AS CONSULTAS ---
            {
                $addFields: { dateObj: { $toDate: "$Header.ReferencePeriod" } }
            },
            {
                $match: { 
                    dateObj: { $gte: startDate, $lte: endDate },
                    "Header.HospitalName": hospitalRegex
                }
            },
            { $unwind: "$Data.Consultation" },
            {
                $match: { "Data.Consultation.Speciality": specialtyRegex }
            },

            // --- PARTE 2: CRUZAR COM CIRURGIAS ($lookup) ---
            {
                $lookup: {
                    from: "cirurgias",
                    let: { 
                        hospName: "$Header.HospitalName",
                        specName: "$Data.Consultation.Speciality"
                    },
                    pipeline: [
                        { 
                            // Encontrar o mesmo hospital na coleção cirurgias
                            $match: { 
                                $expr: { $eq: ["$SurgeryReport.Header.HospitalName", "$$hospName"] } 
                            } 
                        },
                        { $unwind: "$SurgeryReport.SurgicalData.SurgeryEntry" },
                        { 
                            // Encontrar a mesma especialidade
                            $match: { 
                                $expr: { $eq: ["$SurgeryReport.SurgicalData.SurgeryEntry.Specialty", "$$specName"] } 
                            } 
                        }
                    ],
                    as: "surgeryData"
                }
            },

            // --- PARTE 3: LIMPEZA E CÁLCULOS ---
            {
                // O lookup devolve um array. Se estiver vazio, não houve cirurgia correspondente.
                // Mantemos o documento mesmo sem cirurgia (preservarNullAndEmptyArrays)
                $unwind: { path: "$surgeryData", preserveNullAndEmptyArrays: true }
            },
            {
                $project: {
                    _id: 0,
                    Hospital: "$Header.HospitalName",
                    Specialty: "$Data.Consultation.Speciality",
                    
                    // Tempo Consulta (Normal)
                    WaitConsultation: { $ifNull: ["$Data.Consultation.AverageResponseTimes.Normal", 0] },
                    
                    // Tempo Cirurgia (Do lookup)
                    WaitSurgery: { $ifNull: ["$surgeryData.SurgeryReport.SurgicalData.SurgeryEntry.AverageWaitTimeDays", 0] }
                }
            },
            {
                // Calcular Total e Agrupar (caso haja duplicados no período)
                $group: {
                    _id: { Hospital: "$Hospital", Specialty: "$Specialty" },
                    AvgWaitConsultation: { $avg: "$WaitConsultation" },
                    AvgWaitSurgery: { $avg: "$WaitSurgery" }
                }
            },
            {
                $project: {
                    _id: 0,
                    Hospital: "$_id.Hospital",
                    Specialty: "$_id.Specialty",
                    Times: {
                        ConsultationDays: { $round: ["$AvgWaitConsultation", 1] },
                        SurgeryDays: { $round: ["$AvgWaitSurgery", 1] },
                        // Soma total da jornada do paciente
                        TotalJourneyDays: { $round: [{ $add: ["$AvgWaitConsultation", "$AvgWaitSurgery"] }, 1] }
                    }
                }
            },
            { $sort: { "Times.TotalJourneyDays": -1 } } // Ordenar pelos casos mais críticos
        ]).toArray();

        res.json({
            period: { start, end },
            results: stats
        });

    } catch (error) {
        console.error("❌ Erro na Query 6:", error);
        res.status(500).json({ error: "Erro ao cruzar consultas e cirurgias." });
    }
};

exports.getTop10Pediatric = async (req, res) => {
    try {
        const { start, end } = req.query;

        // Datas
        let startDate, endDate;
        if (start && end) {
            startDate = new Date(start);
            endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);
        } else {
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 365);
        }

        console.log(`📊 Analytics Q7: Top 10 Pediatria`);

        const stats = await mongoose.connection.db.collection('urgencias').aggregate([
            {
                // 1. Data e Filtro Pediatria
                $addFields: { dateObj: { $toDate: "$Header.Timestamp" } }
            },
            {
                $match: {
                    dateObj: { $gte: startDate, $lte: endDate },
                    "Data.Typology": { $regex: "pediatria", $options: "i" }
                }
            },
            {
                // 2. Calcular Carga Total (Pessoas à espera)
                $addFields: {
                    totalWaiting: {
                        $add: [
                            "$Data.WaitingPatients.NonUrgent",
                            "$Data.WaitingPatients.LessUrgent",
                            "$Data.WaitingPatients.Urgent",
                            "$Data.WaitingPatients.VeryUrgent"
                        ]
                    }
                }
            },
            {
                // 3. Agrupar por Hospital (Calcular Média de Carga)
                $group: {
                    _id: "$Header.InstitutionId", // ID do Hospital
                    HospitalName: { $first: "$Header.HospitalName" }, // Guardar o nome
                    AvgPatientsWaiting: { $avg: "$totalWaiting" }
                }
            },
            {
                // 4. ORDENAR (O Segredo do Top): Do menor para o maior (Ascending)
                $sort: { AvgPatientsWaiting: 1 }
            },
            {
                // 5. LIMITAR (Só queremos o Top 10)
                $limit: 10
            },
            {
                // 6. LOOKUP (Ir buscar morada, email, telefone)
                $lookup: {
                    from: "raw_hospitais",
                    let: { instId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: [{ $toString: "$HospitalID" }, { $toString: "$$instId" }] }
                            }
                        }
                    ],
                    as: "details"
                }
            },
            { 
                $unwind: {
                    path: "$details",
                    preserveNullAndEmptyArrays: true 
                }
            },
            {
                // 7. Formatação Bonita
                $project: {
                    _id: 0,
                    Rank: 1, 
                    // Se não tiver nome no raw_hospitais, usa o ID ou "Desconhecido"
                    Hospital: { $ifNull: ["$details.HospitalName", { $concat: ["Hospital ID: ", { $toString: "$_id" }] }] },
                    // Se não tiver região, diz "N/A"
                    Region: { $ifNull: ["$details.NUTSIIDescription", "Região Desconhecida"] }, 
                    Contacts: {
                        Phone: { $ifNull: ["$details.PhoneNum", "N/A"] },
                        Email: { $ifNull: ["$details.Email", "N/A"] }
                    },
                    Metric_AvgPeopleWaiting: { $round: ["$AvgPatientsWaiting", 1] }
                }
            }
        ]).toArray();

        // Adicionar contador de Rank manualmente no array final
        const rankedStats = stats.map((item, index) => ({ Rank: index + 1, ...item }));

        res.json({
            period: { start, end },
            top10: rankedStats
        });

    } catch (error) {
        console.error("❌ Erro na Query 7:", error);
        res.status(500).json({ error: "Erro ao calcular Top 10." });
    }
};


exports.getFlowEvolution = async (req, res) => {
    try {
        const { start, end } = req.query;

        // Datas
        let startDate, endDate;
        if (start && end) {
            startDate = new Date(start);
            endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);
        } else {
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 365);
        }

        console.log(`📊 Analytics Q8: Evolução Temporal (15m)`);

        const stats = await mongoose.connection.db.collection('urgencias').aggregate([
            {
                $addFields: { dateObj: { $toDate: "$Header.Timestamp" } }
            },
            {
                $match: { dateObj: { $gte: startDate, $lte: endDate } }
            },
            {
                // 1. Extrair Hora e Minuto
                $project: {
                    hour: { $hour: "$dateObj" },
                    minute: { $minute: "$dateObj" },
                    totalWaiting: {
                        $add: [
                            "$Data.WaitingPatients.NonUrgent",
                            "$Data.WaitingPatients.LessUrgent",
                            "$Data.WaitingPatients.Urgent",
                            "$Data.WaitingPatients.VeryUrgent"
                        ]
                    }
                }
            },
            {
                // 2. A MAGIA MATEMÁTICA DOS 15 MINUTOS 🧙‍♂️
                // Se são 09:22 -> Queremos que caia no balde "15".
                // Fórmula: Balde = (Minuto - (Minuto % 15))
                $addFields: {
                    bucketMinute: {
                        $subtract: ["$minute", { $mod: ["$minute", 15] }]
                    }
                }
            },
            {
                // 3. Agrupar por Hora + Balde de Minutos
                // Ex: "09" e "15" vira o grupo "09:15"
                $group: {
                    _id: { hour: "$hour", minute: "$bucketMinute" },
                    AvgPatients: { $avg: "$totalWaiting" } // Média de afluência nesse horário
                }
            },
            {
                // 4. Ordenar Cronologicamente (00:00 -> 23:45)
                $sort: { "_id.hour": 1, "_id.minute": 1 }
            },
            {
                // 5. Formatar para String Bonita "HH:MM"
                $project: {
                    _id: 0,
                    TimeSlot: {
                        $concat: [
                            { $toString: "$_id.hour" }, ":",
                            { // Truque para garantir 2 dígitos nos minutos (ex: 00, 15)
                                $cond: {
                                    if: { $lt: ["$_id.minute", 10] },
                                    then: { $concat: ["0", { $toString: "$_id.minute" }] },
                                    else: { $toString: "$_id.minute" }
                                }
                            }
                        ]
                    },
                    AvgPatients: { $round: ["$AvgPatients", 1] }
                }
            }
        ]).toArray();

        res.json({
            period: { start, end },
            results: stats
        });

    } catch (error) {
        console.error("❌ Erro na Query 8:", error);
        res.status(500).json({ error: "Erro na evolução temporal." });
    }
};
