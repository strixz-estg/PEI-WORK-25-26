const mongoose = require('mongoose');

// Ligação à DB
const mongoURI = 'mongodb+srv://GROUP-7:GROUP-7PEI@cluster-pei-group7.ee7vrls.mongodb.net/db_hospital?appName=CLUSTER-PEI-GROUP7';

(async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log("A TESTAR A REDE DE SEGURANÇA (Regra: Prioridade 0 -> Não Oncológico)...");

        const db = mongoose.connection.db;

        // 1. VAMOS ENCONTRAR UM HOSPITAL QUE TENHA MUITOS DADOS DE PRIORIDADE 0
        // (Baseado nos debugs anteriores, o Hospital de Braga é um bom candidato)
        const targetHospitalName = "Hospital de Braga"; 

        console.log(`Alvo do Teste: "${targetHospitalName}"`);

        const pipeline = [
            // 1. Filtros Básicos
            { $addFields: { HospitalNameClean: { $trim: { input: "$HospitalName" } }, ServiceKeyInt: { $toInt: "$ServiceKey" } } },
            
            // Usamos $regex para garantir que apanha o nome mesmo com ligeiras diferenças
            { $match: { HospitalNameClean: { $regex: "Hospital de Braga", $options: "i" } } },

            // 2. Join com Serviços
            {
                $lookup: {
                    from: "raw_servicos",
                    localField: "ServiceKeyInt",
                    foreignField: "ServiceKey",
                    as: "s"
                }
            },
            { $unwind: "$s" },
            { $match: { "s.TypeCode": 1 } }, // Só Cirurgias

            // 3. PROJEÇÃO DE TESTE
            {
                $project: {
                    Speciality: "$s.Speciality",
                    
                    // AQUI VEMOS O VALOR ORIGINAL (CRU)
                    Raw_Priority_DB: { $toInt: "$s.PriorityCode" },

                    // AQUI APLICAMOS A NOSSA REGRA
                    Converted_Priority: {
                        $cond: [
                            { $eq: [{ $toInt: "$s.PriorityCode" }, 0] }, // Se for 0...
                            1,                                           // ...vira 1
                            { $toInt: "$s.PriorityCode" }                // senão mantém
                        ]
                    }
                }
            },

            // 4. AGRUPAMENTO PARA VER O RESULTADO
            {
                $group: {
                    _id: "$Speciality",
                    
                    // Quantos registos eram originalmente 0?
                    Total_Eram_Zero: { 
                        $sum: { $cond: [{ $eq: ["$Raw_Priority_DB", 0] }, 1, 0] } 
                    },

                    // Onde é que eles foram parar com a nova lógica?
                    Caiu_Em_NaoOncologico: { 
                        $sum: { $cond: [{ $ne: ["$Converted_Priority", 3] }, 1, 0] } 
                    },
                    Caiu_Em_Oncologico: { 
                        $sum: { $cond: [{ $eq: ["$Converted_Priority", 3] }, 1, 0] } 
                    }
                }
            },
            
            // Mostrar apenas os que tinham zeros para provar o ponto
            { $match: { Total_Eram_Zero: { $gt: 0 } } },
            { $limit: 10 } // Mostrar top 10 exemplos
        ];

        const results = await db.collection('raw_temposesperaconsultacirurgia').aggregate(pipeline).toArray();

        console.log("\nRESULTADO DO TESTE:");
        console.table(results);

        // VALIDAÇÃO AUTOMÁTICA
        console.log("\nANÁLISE:");
        let passed = true;
        
        results.forEach(r => {
            // Se eram zero, TÊM de estar em Não Oncológico e NÃO podem estar em Oncológico
            if (r.Total_Eram_Zero !== r.Caiu_Em_NaoOncologico || r.Caiu_Em_Oncologico !== 0) {
                passed = false;
            }
        });

        if (passed && results.length > 0) {
            console.log("SUCESSO: Todos os registos com Prioridade 0 foram convertidos corretamente para 'Não Oncológicos'.");
            console.log("   A coluna 'Caiu_Em_Oncologico' está a 0, como esperado.");
        } else if (results.length === 0) {
             console.log("AVISO: Não foram encontrados dados com Prioridade 0 neste hospital para testar.");
        } else {
            console.log("FALHA: Alguns registos com Prioridade 0 foram parar ao sítio errado!");
        }

        process.exit(0);

    } catch (err) {
        console.error("Erro:", err);
        process.exit(1);
    }
})();