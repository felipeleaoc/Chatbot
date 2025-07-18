const fs = require('fs');
const pdfParse = require('pdf-parse');
const mysql = require('mysql2/promise');

async function extrairTextoPDF(caminhoArquivo) {
    const dataBuffer = fs.readFileSync(caminhoArquivo);
    const data = await pdfParse(dataBuffer);
    return data.text; // já preserva quebras de linha e estrutura básica
}

async function salvarNoBanco(nomeArquivo, textoExtraido) {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'chat_bot'
    });

    // Verifica se já existe o arquivo, para atualizar ou inserir
    const [rows] = await connection.execute(
        "SELECT id FROM arquivos_pdf WHERE nome_arquivo = ?",
        [nomeArquivo]
    );

    if (rows.length > 0) {
        await connection.execute(
            "UPDATE arquivos_pdf SET conteudo = ?, data_atualizacao = NOW() WHERE id = ?",
            [textoExtraido, rows[0].id]
        );
        console.log(`Atualizado o arquivo: ${nomeArquivo}`);
    } else {
        await connection.execute(
            "INSERT INTO arquivos_pdf (nome_arquivo, conteudo, data_atualizacao) VALUES (?, ?, NOW())",
            [nomeArquivo, textoExtraido]
        );
        console.log(`Inserido novo arquivo: ${nomeArquivo}`);
    }

    await connection.end();
}

async function processarPDF(caminhoArquivo) {
    try {
        const texto = await extrairTextoPDF(caminhoArquivo);
        const nomeArquivo = caminhoArquivo.split(/[\\/]/).pop();
        await salvarNoBanco(nomeArquivo, texto);
    } catch (error) {
        console.error('Erro ao processar PDF:', error);
    }
}

// Exemplo de uso:
const caminhoPDF = './TELETRABALHO.pdf';
processarPDF(caminhoPDF);
