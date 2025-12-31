const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 1. Encontrar o JAR da biblioteca
// Normalmente está em node_modules/xsd-schema-validator/resources ou lib
const libraryPath = path.resolve(__dirname, 'node_modules', 'xsd-schema-validator');
let jarPath = '';

// Procura o jar recursivamente (porque a versão pode mudar)
function findJar(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            const found = findJar(fullPath);
            if (found) return found;
        } else if (file.endsWith('.jar') && file.includes('validator')) {
            return fullPath;
        }
    }
    return null;
}

jarPath = findJar(libraryPath);

if (!jarPath) {
    console.error("❌ Erro Crítico: Não encontrei o ficheiro .jar da biblioteca!");
    process.exit(1);
}

console.log("--> JAR Encontrado:", jarPath);

// 2. Ficheiros de Teste
const xsdPath = path.resolve(__dirname, 'xml_schemas', 'Urgency.xsd');
const xmlPath = path.resolve(__dirname, 'temp_debug.xml'); // Vamos criar um aqui mesmo

// XML de Teste
const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
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
fs.writeFileSync(xmlPath, xmlContent);

// 3. Executar JAVA manualmente
// Comando equivalente: java -jar validator.jar -xml ficheiro.xml -xsd esquema.xsd
console.log("--> A executar comando Java manualmente...");
const javaProcess = spawn('java', ['-jar', jarPath, '-xml', xmlPath, '-xsd', xsdPath]);

javaProcess.stdout.on('data', (data) => {
    console.log(`[JAVA STDOUT]: ${data}`);
});

javaProcess.stderr.on('data', (data) => {
    console.error(`[JAVA STDERR]: ${data}`); // AQUI VAI APARECER O ERRO REAL!
});

javaProcess.on('close', (code) => {
    console.log(`Processo Java terminou com código: ${code}`);
    fs.unlinkSync(xmlPath); // Limpar
});