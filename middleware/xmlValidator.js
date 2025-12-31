const { XMLParser } = require('fast-xml-parser');
const validator = require('xsd-schema-validator');
const path = require('path');
const fs = require('fs');
const os = require('os');

const parser = new XMLParser({
    explicitArray: false,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    numberParseOptions: { hex: true, leadingZeros: false }
});

module.exports = async (req, res, next) => {
    // 1. Verificar se é XML e se tem corpo
    if (req.get('Content-Type') && 
       (req.get('Content-Type').includes('xml')) && 
       typeof req.body === 'string') {

        console.log(`\n--> [Validator] A processar pedido XML em: ${req.path}`);

        // 2. Mapeamento da Rota para o Ficheiro XSD
        let xsdFile = '';
        if (req.path.includes('/urgencias')) xsdFile = 'Urgency.xsd';
        else if (req.path.includes('/consultas')) xsdFile = 'Consultations.xsd';
        else if (req.path.includes('/cirurgias')) xsdFile = 'Surgeries.xsd';
        else return next(); // Rota não validada

        // Caminho ABSOLUTO para o ficheiro XSD na pasta xml_schemas
        // O path.resolve garante que o caminho fica correto no Windows (C:\...)
        const schemaPath = path.resolve(__dirname, '../xml_schemas', xsdFile);
        
        // Validação de Segurança: O XSD existe?
        if (!fs.existsSync(schemaPath)) {
            console.error(`❌ ERRO: XSD não encontrado em: ${schemaPath}`);
            return res.status(500).json({ 
                status: 'error', 
                message: 'Erro de configuração no servidor (XSD em falta).' 
            });
        }

        // 3. Criar Ficheiro Temporário para o XML
        // O Java prefere validar ficheiro contra ficheiro
        const tempXmlPath = path.join(os.tmpdir(), `temp_payload_${Date.now()}.xml`);
        
        try {
            // === PASSO CRÍTICO: SANITIZAÇÃO ===
            // Remove espaços antes do <?xml e remove o BOM (\uFEFF)
            // Isto resolve 90% dos erros "Content is not allowed in prolog"
            const cleanXml = req.body.trim().replace(/^\uFEFF/, '');

            // Escreve o XML limpo no disco com encoding UTF-8 forçado
            fs.writeFileSync(tempXmlPath, cleanXml, { encoding: 'utf8' });

            // 4. VALIDAR (Ficheiro Temp -> Ficheiro XSD Externo)
            await validator.validateXML({ file: tempXmlPath }, schemaPath);
            
            console.log('✅ [Validator] Sucesso! XML válido.');

            // 5. Converter para JSON e passar à rota
            const parsed = parser.parse(cleanXml);
            req.body = parsed;
            next();

        } catch (err) {
            console.error("❌ [Validator] Falha na validação XSD.");
            
            // Tratamento de erros para mostrar mensagens úteis
            let errorMessage = "O formato do XML não está correto.";
            
            if (err.messages && err.messages.length > 0) {
                errorMessage = err.messages.join(' | ');
            } else if (err.message) {
                errorMessage = err.message;
            }

            console.error("   Detalhes:", errorMessage);

            return res.status(400).json({
                status: 'error',
                message: "XML inválido segundo o XSD.",
                details: errorMessage
            });

        } finally {
            // 6. Limpeza (Apagar ficheiro temporário do XML)
            if (fs.existsSync(tempXmlPath)) {
                try { fs.unlinkSync(tempXmlPath); } catch(e) {}
            }
            // NOTA: Não apagamos o schemaPath porque é o ficheiro real do projeto!
        }
    } else {
        next();
    }
};