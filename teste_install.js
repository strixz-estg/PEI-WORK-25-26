try {
    const validator = require('xsd-schema-validator');
    console.log("✅ O pacote 'xsd-schema-validator' foi carregado com sucesso!");
    
    const { spawnSync } = require('child_process');
    const javaCheck = spawnSync('java', ['-version']);
    
    if (javaCheck.error) {
        console.error("❌ AVISO: O pacote está instalado, mas o JAVA não foi detetado.");
        console.error("   O validador NÃO vai funcionar sem Java.");
    } else {
        console.log("✅ Java detetado. O sistema está pronto para validar XSD.");
    }

} catch (e) {
    console.error("❌ Erro: O pacote não está instalado. Corre 'npm install xsd-schema-validator'.");
}