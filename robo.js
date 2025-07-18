const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const mysql = require('mysql2/promise');

// --- Configurações do Banco de Dados ---
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'chat_bot',
};

// --- CONFIGURAÇÃO DO ATENDENTE ---
const ATENDENTE_NUMERO = '556232162999@c.us'; 
const ATENDENTE_NUMERO1 = '556232162950@c.us';

// --- MENSAGEM DE PESQUISA DE SATISFAÇÃO ---
const MENSAGEM_PESQUISA_SATISFACAO = `📢 A Diretoria de Gestão de Pessoas quer ouvir você!

Após o seu atendimento, pedimos que responda nossa pesquisa de satisfação. É rápida e vai nos ajudar a melhorar cada vez mais.

👉 Acesse aqui a Pesquisa de Satisfação:
https://forms.gle/8by6NSmRMYz7V4DQ9

Agradecemos pela colaboração!
DGP – Diretoria de Gestão de Pessoas / TJGO`;


// --- Estado da conversa por usuário ---
const userState = {};
const delay = ms => new Promise(res => setTimeout(res, ms));

// --- FUNÇÕES DE BUSCA NO BANCO DE DADOS ---
// ... (todas as suas funções de busca permanecem as mesmas)
async function buscarMacroTemas() {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute(`SELECT DISTINCT MacroTema FROM perguntas_e_respostas WHERE MacroTema IS NOT NULL AND MacroTema != '' ORDER BY MacroTema ASC`);
        return rows.map(row => row.MacroTema);
    } catch (err) { console.error('Erro ao buscar MacroTemas:', err); return []; } finally { await connection.end(); }
}
async function buscarTemasPorMacroTema(macroTema) {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute(`SELECT DISTINCT Tema FROM perguntas_e_respostas WHERE MacroTema = ? ORDER BY Tema ASC`, [macroTema]);
        return rows.map(row => row.Tema);
    } catch (err) { console.error(`Erro ao buscar Temas para ${macroTema}:`, err); return []; } finally { await connection.end(); }
}
async function buscarPerguntasPorTema(tema) {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute(`SELECT id, Pergunta FROM perguntas_e_respostas WHERE Tema = ? ORDER BY id ASC`, [tema]);
        return rows;
    } catch (err) { console.error(`Erro ao buscar Perguntas para ${tema}:`, err); return []; } finally { await connection.end(); }
}
async function buscarRespostaPorId(perguntaId) {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute(`SELECT Respostas FROM perguntas_e_respostas WHERE id = ?`, [perguntaId]);
        return rows.length > 0 ? rows[0].Respostas : "Não foi possível encontrar a resposta para esta pergunta.";
    } catch (err) { console.error('Erro ao buscar resposta por ID:', err); return "Ocorreu um erro ao consultar a base de dados."; } finally { await connection.end(); }
}
async function buscarCategoriasDeDocumentos() {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute(`SELECT DISTINCT Categoria FROM documentos_e_requerimentos WHERE Categoria IS NOT NULL AND Categoria != '' ORDER BY Categoria ASC`);
        return rows.map(row => row.Categoria);
    } catch (err) { console.error('Erro ao buscar Categorias de Documentos:', err); return []; } finally { await connection.end(); }
}
async function buscarSubCategoriasDeDocumentos(categoria) {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute(`SELECT DISTINCT SubCategoria FROM documentos_e_requerimentos WHERE Categoria = ? AND SubCategoria IS NOT NULL AND SubCategoria != '' ORDER BY SubCategoria ASC`, [categoria]);
        return rows.map(row => row.SubCategoria);
    } catch (err) { console.error('Erro ao buscar SubCategorias de Documentos:', err); return []; } finally { await connection.end(); }
}
async function buscarDocumentosPorCategoria(categoria) {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute(`SELECT NomeDocumento, LinkPDF FROM documentos_e_requerimentos WHERE Categoria = ? ORDER BY NomeDocumento ASC`, [categoria]);
        return rows;
    } catch (err) { console.error(`Erro ao buscar Documentos para ${categoria}:`, err); return []; } finally { await connection.end(); }
}
async function buscarDocumentosPorSubCategoria(subCategoria) {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute(`SELECT NomeDocumento, LinkPDF FROM documentos_e_requerimentos WHERE SubCategoria = ? ORDER BY NomeDocumento ASC`, [subCategoria]);
        return rows;
    } catch (err) { console.error(`Erro ao buscar Documentos para ${subCategoria}:`, err); return []; } finally { await connection.end(); }
}
async function buscarLinkPorTema(tema) {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute(`SELECT Respostas FROM perguntas_e_respostas WHERE Tema = ? ORDER BY id DESC LIMIT 1`, [tema]);
        return rows.length > 0 ? rows[0].Respostas : "Link não encontrado.";
    } catch (err) { console.error(`Erro ao buscar link para o tema ${tema}:`, err); return "Erro ao consultar o link."; } finally { await connection.end(); }
}
async function salvarLog(numero, nome, pergunta, resposta) {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const sql = 'INSERT INTO historico_logs (numero_usuario, nome_usuario, pergunta, resposta) VALUES (?, ?, ?, ?)';
        await connection.execute(sql, [numero, nome, pergunta, resposta]);
        console.log(`Log salvo para o usuário ${numero} (${nome})`);
    } catch (err) { console.error('Erro ao salvar log no banco de dados:', err); } finally { await connection.end(); }
}

// --- Inicialização do WhatsApp Client ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('WhatsApp conectado. ✅'));

// --- LÓGICA PRINCIPAL DO CHATBOT ---
client.on('message', async msg => {
    const number = msg.from;
    const messageBody = msg.body.trim();
    const currentState = userState[number] ? userState[number].state : null;

    // --- Início do Fluxo ou Comando "menu" ---
    if (messageBody.toLowerCase() === 'menu' || !currentState) {
        
        // ★ ALTERAÇÃO ★: Lógica para evitar mensagens duplicadas
        const now = Date.now();
        const lastMenuTime = userState[number]?.lastMenuTimestamp || 0;
        if (now - lastMenuTime < 10000) { // Ignora se o último menu foi enviado há menos de 10 segundos
            console.log(`Ignorando solicitação de menu duplicada para ${number}`);
            return; 
        }

        const contact = await msg.getContact();
        const firstName = contact.pushname ? contact.pushname.split(" ")[0] : 'usuário';

        const macroTemas = await buscarMacroTemas();

        userState[number] = {
            state: 'aguardando_menu_principal',
            macroTemas: macroTemas,
            nome: firstName,
            lastMenuTimestamp: now // ★ ALTERAÇÃO ★: Registra o momento do envio do menu
        };

        let menuMessage = `Olá, ${firstName}! 👋\n\nSou o Assistente Virtual da Diretoria de Gestão de Pessoas do TJGO.\n\nSobre qual assunto você gostaria de saber?\n\n`;
        menuMessage += `*0* - Requerimentos\n`;
        macroTemas.forEach((tema, index) => {
            menuMessage += `*${index + 1}* - ${tema}\n`;
        });

        await msg.reply(menuMessage);
        return;
    }

    // --- Máquina de Estados da Conversa ---
    switch (currentState) {
        // ... (todo o resto do seu código switch...case permanece exatamente igual) ...
        case 'aguardando_menu_principal':
            const opcaoInicial = parseInt(messageBody);
            if (isNaN(opcaoInicial)) { await msg.reply('Opção inválida. Por favor, digite apenas o número correspondente.'); return; }
            if (opcaoInicial === 0) {
                const categorias = await buscarCategoriasDeDocumentos();
                if (categorias.length === 0) { await msg.reply('Desculpe, não encontrei nenhuma categoria de requerimento no momento.'); delete userState[number]; return; }
                userState[number].state = 'selecionar_categoria_requerimento';
                userState[number].categorias = categorias;
                let catMsg = 'Você selecionou *Requerimentos*.\n\nQual o tipo de requerimento, por favor?\n\n';
                categorias.forEach((cat, index) => { catMsg += `*${index + 1}* - ${cat}\n`; });
                catMsg += '\nDigite o número da categoria ou "menu" para voltar ao início.';
                await msg.reply(catMsg);
            } else {
                const macroTemaIndex = opcaoInicial - 1;
                const macroTemasDisponiveis = userState[number].macroTemas;
                if (macroTemaIndex >= 0 && macroTemaIndex < macroTemasDisponiveis.length) {
                    const macroTemaSelecionado = macroTemasDisponiveis[macroTemaIndex];
                    const temas = await buscarTemasPorMacroTema(macroTemaSelecionado);
                    if (temas.length === 0) { await msg.reply(`Desculpe, não encontrei temas para "${macroTemaSelecionado}".`); delete userState[number]; await msg.reply('Digite "menu" para começar de novo.'); return; }
                    userState[number].state = 'selecionar_tema';
                    userState[number].macroTemaSelecionado = macroTemaSelecionado;
                    userState[number].temas = temas;
                    let temasMsg = `Você selecionou "*${macroTemaSelecionado}*".\n\nAgora, escolha um tema mais específico:\n\n`;
                    temas.forEach((tema, index) => { temasMsg += `*${index + 1}* - ${tema}\n`; });
                    temasMsg += '\nDigite o número do tema ou "menu" para voltar.';
                    await msg.reply(temasMsg);
                } else { await msg.reply('Opção inválida. Por favor, digite o número de um dos itens do menu acima.'); }
            }
            break;
        case 'selecionar_categoria_requerimento':
            const catIndex = parseInt(messageBody) - 1;
            const categoriasDisponiveis = userState[number].categorias;
            if (catIndex >= 0 && catIndex < categoriasDisponiveis.length) {
                const categoriaSelecionada = categoriasDisponiveis[catIndex];
                const subCategorias = await buscarSubCategoriasDeDocumentos(categoriaSelecionada);
                if (subCategorias.length > 0) {
                    userState[number].state = 'selecionar_subcategoria_documento';
                    userState[number].subCategorias = subCategorias;
                    userState[number].categoriaSelecionada = categoriaSelecionada;
                    let subCatMsg = `Ótimo. Dentro de "*${categoriaSelecionada}*", sobre qual assunto você deseja um documento?\n\n`;
                    subCategorias.forEach((subCat, index) => { subCatMsg += `*${index + 1}* - ${subCat}\n`; });
                    subCatMsg += '\n*0* - Voltar\nDigite o número do assunto ou "menu" para ir ao início.';
                    await msg.reply(subCatMsg);
                } else {
                    const documentos = await buscarDocumentosPorCategoria(categoriaSelecionada);
                    if(documentos.length === 0) { await msg.reply(`Não encontrei documentos para a categoria "*${categoriaSelecionada}*".`); delete userState[number]; await msg.reply('Digite "menu" para começar de novo.'); return; }
                    userState[number].state = 'selecionar_documento';
                    userState[number].documentos = documentos;
                    userState[number].categoriaSelecionada = categoriaSelecionada;
                    let docMsg = `Certo. Aqui estão os documentos para "*${categoriaSelecionada}*":\n\n`;
                    documentos.forEach((doc, index) => { docMsg += `*${index + 1}* - ${doc.NomeDocumento}\n`; });
                    docMsg += '\n*0* - Voltar\nDigite o número do documento ou "menu" para ir ao início.';
                    await msg.reply(docMsg);
                }
            } else { await msg.reply('Opção inválida. Por favor, digite o número de uma das categorias acima.'); }
            break;
        case 'selecionar_subcategoria_documento':
            if (messageBody === '0') {
                const categorias = userState[number].categorias;
                userState[number].state = 'selecionar_categoria_requerimento';
                let catMsg = 'Ok, voltando.\n\nQual o tipo de requerimento, por favor?\n\n';
                categorias.forEach((cat, index) => { catMsg += `*${index + 1}* - ${cat}\n`; });
                catMsg += '\nDigite o número da categoria ou "menu" para voltar ao início.';
                await msg.reply(catMsg);
                return;
            }
            const subCatIndex = parseInt(messageBody) - 1;
            const subCategoriasDisponiveis = userState[number].subCategorias;
            if (subCatIndex >= 0 && subCatIndex < subCategoriasDisponiveis.length) {
                const subCategoriaSelecionada = subCategoriasDisponiveis[subCatIndex];
                const documentos = await buscarDocumentosPorSubCategoria(subCategoriaSelecionada);
                if (documentos.length === 0) { await msg.reply(`Não encontrei documentos para "*${subCategoriaSelecionada}*".`); return; }
                userState[number].state = 'selecionar_documento';
                userState[number].documentos = documentos;
                userState[number].subCategoriaSelecionada = subCategoriaSelecionada;
                let docMsg = `Certo. Aqui estão os documentos para "*${subCategoriaSelecionada}*":\n\n`;
                documentos.forEach((doc, index) => { docMsg += `*${index + 1}* - ${doc.NomeDocumento}\n`; });
                docMsg += '\n*0* - Voltar\nDigite o número do documento ou "menu" para ir ao início.';
                await msg.reply(docMsg);
            } else { await msg.reply('Opção inválida. Por favor, digite o número de um dos assuntos acima.'); }
            break;
        case 'selecionar_documento':
            if (messageBody === '0') {
                const subCategorias = userState[number].subCategorias;
                if (subCategorias && subCategorias.length > 0) {
                    const categoriaSelecionada = userState[number].categoriaSelecionada;
                    userState[number].state = 'selecionar_subcategoria_documento';
                    let subCatMsg = `Ok, voltando.\n\nDentro de "*${categoriaSelecionada}*", sobre qual assunto você deseja um documento?\n\n`;
                    subCategorias.forEach((subCat, index) => { subCatMsg += `*${index + 1}* - ${subCat}\n`; });
                    subCatMsg += '\n*0* - Voltar\nDigite o número do assunto ou "menu" para ir ao início.';
                    await msg.reply(subCatMsg);
                } else {
                    const categorias = userState[number].categorias;
                    userState[number].state = 'selecionar_categoria_requerimento';
                    let catMsg = 'Ok, voltando.\n\nQual o tipo de requerimento, por favor?\n\n';
                    categorias.forEach((cat, index) => { catMsg += `*${index + 1}* - ${cat}\n`; });
                    catMsg += '\nDigite o número da categoria ou "menu" para voltar ao início.';
                    await msg.reply(catMsg);
                }
                return;
            }
            const docIndex = parseInt(messageBody) - 1;
            const documentosDisponiveis = userState[number].documentos;
            if (docIndex >= 0 && docIndex < documentosDisponiveis.length) {
                const docSelecionado = documentosDisponiveis[docIndex];
                const respostaFinal = `Aqui está o seu documento:\n\n*${docSelecionado.NomeDocumento}*\n\nLink: ${docSelecionado.LinkPDF}`;
                const nomeUsuario = userState[number]?.nome || 'N/A';
                await salvarLog(number, nomeUsuario, `Solicitou o documento: ${docSelecionado.NomeDocumento}`, respostaFinal);
                await msg.reply(respostaFinal);
                await delay(1500);
                userState[number].state = 'aguardando_confirmacao_documento';
                userState[number].documentoSelecionadoTexto = docSelecionado.NomeDocumento;
                userState[number].linkDoDocumento = docSelecionado.LinkPDF;
                const confirmacaoMsg = 'Esta informação foi útil?\n\n*1* - Sim\n*2* - Não, quero ver outros documentos\n*3* - Não, quero falar com um atendente\n*4* - Encerrar e voltar ao menu';
                await msg.reply(confirmacaoMsg);
            } else { await msg.reply('Opção inválida. Por favor, digite o número de um dos documentos acima.'); }
            break;
        case 'selecionar_tema':
            const temaIndex = parseInt(messageBody) - 1;
            const temasDisponiveis = userState[number].temas;
            if (temaIndex >= 0 && temaIndex < temasDisponiveis.length) {
                const temaSelecionado = temasDisponiveis[temaIndex];
                const perguntas = await buscarPerguntasPorTema(temaSelecionado);
                if (perguntas.length === 0) { await msg.reply(`Desculpe, não encontrei perguntas sobre o tema "*${temaSelecionado}*".`); delete userState[number]; await msg.reply('Digite "menu" para começar de novo.'); return; }
                userState[number].state = 'selecionar_pergunta';
                userState[number].temaSelecionado = temaSelecionado;
                userState[number].perguntas = perguntas;
                let perguntasMsg = `Você escolheu "*${temaSelecionado}*".\n\nQual a sua dúvida?\n\n`;
                perguntas.forEach((p, index) => { perguntasMsg += `*${index + 1}* - ${p.Pergunta}\n`; });
                perguntasMsg += '\nDigite o número da pergunta ou "menu" para voltar.';
                await msg.reply(perguntasMsg);
            } else { await msg.reply('Opção inválida. Por favor, digite o número de um dos temas acima.'); }
            break;
        case 'selecionar_pergunta':
            const perguntaIndex = parseInt(messageBody) - 1;
            const perguntasDisponiveis = userState[number].perguntas;
            if (perguntaIndex >= 0 && perguntaIndex < perguntasDisponiveis.length) {
                const perguntaSelecionada = perguntasDisponiveis[perguntaIndex];
                const resposta = await buscarRespostaPorId(perguntaSelecionada.id);
                const nomeUsuario = userState[number]?.nome || 'N/A';
                await salvarLog(number, nomeUsuario, perguntaSelecionada.Pergunta, resposta);
                await msg.reply(resposta);
                await delay(1500);
                userState[number].state = 'aguardando_confirmacao';
                userState[number].perguntaSelecionadaTexto = perguntaSelecionada.Pergunta;
                const confirmacaoMsg = 'Esta informação foi útil?\n\n*1* - Sim\n*2* - Não, quero ver outras perguntas\n*3* - Não, quero falar com um atendente\n*4* - Encerrar e voltar ao menu';
                await msg.reply(confirmacaoMsg);
            } else { await msg.reply('Opção inválida. Por favor, digite o número de uma das perguntas acima.'); }
            break;
        case 'aguardando_confirmacao':
            if (messageBody === '1') {
                await msg.reply('Que bom que ajudei! 👍');
                await delay(1000);
                await msg.reply(MENSAGEM_PESQUISA_SATISFACAO);
                await delay(1500);
                await msg.reply('Se precisar de algo mais, é só digitar "menu". 👋');
                delete userState[number];
            } else if (messageBody === '2') {
                userState[number].state = 'selecionar_pergunta';
                const perguntas = userState[number].perguntas;
                const tema = userState[number].temaSelecionado;
                let perguntasMsg = `Sem problemas. Estamos no tópico "*${tema}*".\n\nEscolha outra pergunta:\n\n`;
                perguntas.forEach((p, index) => { perguntasMsg += `*${index + 1}* - ${p.Pergunta}\n`; });
                perguntasMsg += '\nDigite o número da pergunta ou "menu" para voltar.';
                await msg.reply(perguntasMsg);
            } else if (messageBody === '3') {
                const nomeUsuario = userState[number]?.nome || 'Nome não informado';
                const ultimoTema = userState[number].temaSelecionado || 'Tópico não especificado';
                const linkDoTema = await buscarLinkPorTema(ultimoTema);
                const avisoAtendente = `🔔 *Nova Solicitação de Atendimento* 🔔\n\n*Nome:* ${nomeUsuario}\n*Número:* ${number.replace('@c.us', '')}\n*Dúvida sobre o tema:* "${ultimoTema}"\n*Link de Referência:* ${linkDoTema}\n\nPor favor, inicie a conversa com o usuário.`;
                const avisoUsuario = 'Certo. Sua solicitação foi enviada para um de nossos atendentes. Em breve, alguém entrará em contato com você por este número. Obrigado por aguardar! 🙂';
                try {
                    await msg.reply(avisoUsuario);
                    await client.sendMessage(ATENDENTE_NUMERO, avisoAtendente);
                    await salvarLog(number, nomeUsuario, `Solicitou falar com atendente sobre o tema: ${ultimoTema}`, 'Conversa transferida.');
                } catch (err) { console.error('Erro ao notificar o atendente:', err); await msg.reply('Desculpe, ocorreu um erro ao tentar transferir sua solicitação. Por favor, tente novamente mais tarde.'); } finally { delete userState[number]; }
            } else if (messageBody === '4') {
                delete userState[number];
                await msg.reply('Ok, conversa reiniciada. Digite "menu" para ver as opções novamente.');
            } else { await msg.reply('Opção inválida. Por favor, digite *1*, *2*, *3* ou *4*.'); }
            break;
        case 'aguardando_confirmacao_documento':
            if (messageBody === '1') {
                await msg.reply('Que bom que ajudei! 👍');
                await delay(1000);
                await msg.reply(MENSAGEM_PESQUISA_SATISFACAO);
                await delay(1500);
                await msg.reply('Se precisar de algo mais, é só digitar "menu". 👋');
                delete userState[number];
            } else if (messageBody === '2') {
                userState[number].state = 'selecionar_documento';
                const documentos = userState[number].documentos;
                const subCat = userState[number].subCategoriaSelecionada;
                const cat = userState[number].categoriaSelecionada;
                const titulo = subCat || cat;
                let docMsg = `Sem problemas. Estamos na seção "*${titulo}*".\n\nEscolha outro documento:\n\n`;
                documentos.forEach((doc, index) => { docMsg += `*${index + 1}* - ${doc.NomeDocumento}\n`; });
                docMsg += '\n*0* - Voltar\nDigite o número do documento ou "menu" para ir ao início.';
                await msg.reply(docMsg);
            } else if (messageBody === '3') {
                const nomeUsuario = userState[number]?.nome || 'Nome não informado';
                const ultimoDocumento = userState[number].documentoSelecionadoTexto || 'Documento não especificado';
                const linkDoDocumento = userState[number].linkDoDocumento || 'Link não encontrado';
                const avisoAtendente = `🔔 *Nova Solicitação de Atendimento* 🔔\n\n*Nome:* ${nomeUsuario}\n*Número:* ${number.replace('@c.us', '')}\n*Solicitou o documento:* "${ultimoDocumento}"\n*Link de Referência:* ${linkDoDocumento}\n\nPor favor, inicie a conversa com o usuário.`;
                const avisoUsuario = 'Certo. Sua solicitação foi enviada para um de nossos atendentes. Em breve, alguém entrará em contato com você por este número. Obrigado por aguardar! 🙂';
                try {
                    await msg.reply(avisoUsuario);
                    await client.sendMessage(ATENDENTE_NUMERO, avisoAtendente);
                    await client.sendMessage(ATENDENTE_NUMERO1, avisoAtendente);
                    await salvarLog(number, nomeUsuario, `Solicitou falar com atendente sobre o documento: ${ultimoDocumento}`, 'Conversa transferida.');
                } catch (err) { console.error('Erro ao notificar o atendente:', err); await msg.reply('Desculpe, ocorreu um erro ao tentar transferir sua solicitação. Por favor, tente novamente mais tarde.'); } finally { delete userState[number]; }
            } else if (messageBody === '4') {
                delete userState[number];
                await msg.reply('Ok, conversa reiniciada. Digite "menu" para ver as opções novamente.');
            } else { await msg.reply('Opção inválida. Por favor, digite *1*, *2*, *3* ou *4*.'); }
            break;

        default:
            await msg.reply('Não consegui entender. Digite "menu" para ver as opções disponíveis.');
            break;
    }
});

// Tratamento de erros
client.on('auth_failure', msg => {
    console.error('Falha na autenticação:', msg);
});
client.on('disconnected', (reason) => {
    console.log('WhatsApp desconectado:', reason);
});
process.on('SIGINT', async () => {
    console.log('Encerrando o bot...');
    await client.destroy();
    process.exit(0);
});

client.initialize();