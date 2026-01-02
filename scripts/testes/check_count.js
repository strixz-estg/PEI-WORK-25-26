const mongoose = require('mongoose');
const uri = 'mongodb+srv://GROUP-7:GROUP-7PEI@cluster-pei-group7.ee7vrls.mongodb.net/healthtime?appName=CLUSTER-PEI-GROUP7';

(async () => {
    try {
        await mongoose.connect(uri);
        console.log("🔍 A verificar datas na coleção 'urgencias'...");

        const total = await mongoose.connection.db.collection('urgencias').countDocuments();
        const validDates = await mongoose.connection.db.collection('urgencias').countDocuments({ "Header.LastUpdate": { $type: "date" } });
        const nullDates = await mongoose.connection.db.collection('urgencias').countDocuments({ "Header.LastUpdate": null });

        console.log(`\n📊 RELATÓRIO:`);
        console.log(`Total Documentos: ${total}`);
        console.log(`✅ Com Data Válida: ${validDates} (Estes são os que a API vê)`);
        console.log(`❌ Com Data Null:   ${nullDates} (Estes são os ignorados)`);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();