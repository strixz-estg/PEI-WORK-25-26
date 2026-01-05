const mongoose = require('mongoose');

const mongoURI = 'mongodb+srv://GROUP-7:GROUP-7PEI@cluster-pei-group7.ee7vrls.mongodb.net/db_hospital?appName=CLUSTER-PEI-GROUP7';

(async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log("A iniciar migração de Hospitais (db_hospital -> healthtime)...");

        const pipeline = [
            {
                $project: {
                    _id: 0,
                    InstitutionId: "$HospitalID", 
                    HospitalName: "$HospitalName",
                    Description: "$Description",
                    
                    // --- REESTRUTURAÇÃO HIERÁRQUICA ---
                    Location: {
                        Address: "$Address", 
                        PostalCode: {
                            $let: {
                                vars: { match: { $regexFind: { input: "$Address", regex: /\d{4}-\d{3}/ } } },
                                in: { $ifNull: ["$$match.match", "0000-000"] }
                            }
                        },
                        City: {
                            $let: {
                                vars: { parts: { $split: ["$Address", " "] } },
                                in: { $arrayElemAt: [{ $split: ["$Address", " "] }, -1] }
                            }
                        },
                        District: "$District",
                        Coordinates: {
                            Lat: "$Latitude",
                            Long: "$Longitude"
                        }
                    },
                    
                    Contacts: {
                        Phone: { $toString: "$PhoneNum" },
                        Email: "$Email",
                        Website: ""
                    },
                    
                    Region: {
                        Nuts1: "$NUTSIDescription",
                        Nuts2: "$NUTSIIDescription",
                        Nuts3: "$NUTSIIIDescription"
                    }
                }
            },
            {
                $merge: {
                    into: { db: "healthtime", coll: "hospitals" }, // <--- DESTINO 
                    on: "InstitutionId",
                    whenMatched: "replace",
                    whenNotMatched: "insert"
                }
            }
        ];

        await mongoose.connection.db.collection('raw_hospitais').aggregate(pipeline).toArray();
        
        console.log("Hospitais migrados para 'healthtime' com sucesso!");
        process.exit(0);

    } catch (err) {
        console.error("Erro:", err);
        process.exit(1);
    }
})();