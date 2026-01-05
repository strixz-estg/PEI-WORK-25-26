const mongoose = require('mongoose');

// Sub-schema para métricas de triagem
const TriageMetricSchema = new mongoose.Schema({
    Time: Number,
    Length: Number
}, { _id: false });

// Sub-schema para a escala de cores
const TriageScaleSchema = new mongoose.Schema({
    NonUrgent: TriageMetricSchema,
    LessUrgent: TriageMetricSchema,
    Urgent: TriageMetricSchema,
    VeryUrgent: TriageMetricSchema
}, { _id: false });

const UrgenciaSchema = new mongoose.Schema({
    Header: {
        InstitutionId: { type: Number, required: true },
        HospitalName: String,
        
        // --- NOVO CAMPO AUTOMÁTICO ---
        Address: String, 
        
        LastUpdate: Date,
        ExtractionDate: Date
    },
    Data: {
        EmergencyTypeCode: String,
        Status: String, // "Aberta" / "Fechada"
        WaitingTriage: TriageScaleSchema,
        ObservationTriage: TriageScaleSchema
    }
}, { timestamps: true });

module.exports = mongoose.model('Urgencia', UrgenciaSchema);