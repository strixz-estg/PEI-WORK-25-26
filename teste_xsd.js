const validator = require('xsd-schema-validator');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

// 1. VERIFICAÇÃO PRÉVIA: O JAVA ESTÁ INSTALADO?
console.log("--> 1. A verificar instalação do Java...");
const javaCheck = spawnSync('java', ['-version']);

if (javaCheck.error) {
    console.error("❌ ERRO CRÍTICO: O comando 'java' não foi encontrado.");
    console.error("   Solução: Instala o Java (JDK/JRE) e reinicia o terminal.");
    process.exit(1);
} else {
    console.log("✅ Java detetado com sucesso.");
}

// 2. PREPARAÇÃO DO CAMINHO (FIX PARA WINDOWS)
// Resolve o caminho absoluto
let schemaPath = path.resolve(__dirname, 'xml_schemas', 'Urgency.xsd');

// Truque para Windows: O Java prefere barras normais '/' em vez de '\'
if (process.platform === 'win32') {
    schemaPath = schemaPath.replace(/\\/g, '/');
}

console.log("--> 2. A testar XSD no caminho:", schemaPath);

// XML Válido para teste
const xmlValido = `<?xml version="1.0" encoding="UTF-8"?>
<UrgencyRegister>
    <Header>
        <InstitutionId>151</InstitutionId>
        <HospitalName>Hospital Teste</HospitalName>
        <Timestamp>2025-12-30T10:30:00</Timestamp>
    </Header>
    <Data>
        <Typology>Geral</Typology>
        <OpenState>Aberta</OpenState>
        <Address>Rua Teste</Address>
        <WaitingPatients>
            <NonUrgent>1</NonUrgent>
            <LessUrgent>2</LessUrgent>
            <Urgent>3</Urgent>
            <VeryUrgent>4</VeryUrgent>
        </WaitingPatients>
        <ObservingPatients>
            <NonUrgent>0</NonUrgent>
            <LessUrgent>0</LessUrgent>
            <Urgent>0</Urgent>
            <VeryUrgent>0</VeryUrgent>
        </ObservingPatients>
    </Data>
</UrgencyRegister>`;

// 3. EXECUÇÃO DO TESTE
if (!fs.existsSync(path.resolve(__dirname, 'xml_schemas', 'Urgency.xsd'))) {
    console.error("❌ ERRO: O ficheiro Urgency.xsd não existe na pasta xml_schemas!");
} else {
    console.log("--> 3. A executar validação...");
    
    validator.validateXML(xmlValido, schemaPath)
        .then(() => {
            console.log("\n✅ SUCESSO TOTAL: O validador está a funcionar!");
            console.log("   Isto confirma que o Java e o ficheiro XSD estão corretos.");
        })
        .catch(err => {
            console.error("\n❌ FALHA NA VALIDAÇÃO:");
            console.error("   Mensagem:", err.message);
            console.error("   Detalhes:", err);
        });
}