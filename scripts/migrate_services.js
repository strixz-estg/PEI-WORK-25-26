const mongoose = require('mongoose');

// Aponta para a origem: db_hospital
const mongoURI = 'mongodb+srv://GROUP-7:GROUP-7PEI@cluster-pei-group7.ee7vrls.mongodb.net/db_hospital?appName=CLUSTER-PEI-GROUP7';

(async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log("🔄 A iniciar migração de Serviços (com correção 0->1)...");

        const pipeline = [
            {
                $project: {
                    _id: 0,
                    ServiceKey: 1,
                    Speciality: 1,
                    TypeCode: 1,
                    
                    // --- CORREÇÃO DE CÓDIGO (0 -> 1) ---
                    // Se for 0, força 1. Se for null, força 1. Caso contrário, mantém.
                    PriorityCode: {
                        $cond: {
                            if: { $or: [ { $eq: ["$PriorityCode", 0] }, { $not: ["$PriorityCode"] } ] },
                            then: 1,
                            else: "$PriorityCode"
                        }
                    },
                    
                    // --- DESCRIÇÕES AUTOMÁTICAS (Baseadas no código já corrigido acima) ---
                    // Nota: Como o $project corre em paralelo, usamos a mesma lógica condicional 
                    // dentro do switch ou repetimos a lógica para garantir consistência.
                    TypeDescription: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$TypeCode", 1] }, then: "Cirurgia" },
                                { case: { $eq: ["$TypeCode", 2] }, then: "Consulta" }
                            ],
                            default: "Desconhecido"
                        }
                    },
                    PriorityDescription: {
                        $switch: {
                            branches: [
                                // A lógica aqui tem de prever o valor original, ou usamos $let para ser mais limpo.
                                // Simplificação: Assumimos que 0 e 1 dão a mesma descrição.
                                { case: { $in: ["$PriorityCode", [0, 1]] }, then: "Normal (Nao Oncologico)" },
                                { case: { $eq: ["$PriorityCode", 2] }, then: "Prioritário (Nao Oncologico)" },
                                { case: { $eq: ["$PriorityCode", 3] }, then: "Muito Prioritário (Oncologico)" }
                            ],
                            default: "Normal (Nao Oncologico)"
                        }
                    }
                }
            },
            {
                // Gravar na DB de destino (healthtime)
                $merge: {
                    into: { db: "healthtime", coll: "services" },
                    on: "ServiceKey",
                    whenMatched: "replace",
                    whenNotMatched: "insert"
                }
            }
        ];

        await mongoose.connection.db.collection('raw_servicos').aggregate(pipeline).toArray();
        
        console.log("✅ Serviços migrados e corrigidos (0->1) com sucesso!");
        process.exit(0);

    } catch (err) {
        console.error("❌ Erro:", err);
        process.exit(1);
    }
})();