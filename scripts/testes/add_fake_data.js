const mongoose = require('mongoose');
const uri = 'mongodb+srv://GROUP-7:GROUP-7PEI@cluster-pei-group7.ee7vrls.mongodb.net/healthtime?appName=CLUSTER-PEI-GROUP7';

(async () => {
    try {
        await mongoose.connect(uri);
        console.log("A gerar dados extra (sem apagar os originais)...");

        const collection = mongoose.connection.db.collection('urgencias');
        
        // Buscar 50 documentos existentes para usar como "molde"
        const templates = await collection.find({}).limit(50).toArray();

        const newDocs = [];
        const baseDate = new Date();

        // Vamos criar 200 registos falsos espalhados pelo dia
        for (let i = 0; i < 200; i++) {
            // Escolhe um documento aleatório para copiar
            const template = templates[Math.floor(Math.random() * templates.length)];
            
            // Cria uma cópia (sem o _id original)
            const fakeDoc = { ...template };
            delete fakeDoc._id; // O Mongo vai gerar um novo ID

            // Define uma hora aleatória
            const randomHour = Math.floor(Math.random() * 24);
            const randomMinute = Math.floor(Math.random() * 60);
            
            const newDate = new Date(baseDate);
            newDate.setHours(randomHour, randomMinute, 0, 0);

            fakeDoc.Header.LastUpdate = newDate;
            newDocs.push(fakeDoc);
        }

        if (newDocs.length > 0) {
            await collection.insertMany(newDocs);
            console.log(`Adicionados ${newDocs.length} novos registos fictícios.`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();