<?php
// painel.php - Painel Web para visualizar logs do chatbot

$host = 'localhost';
$user = 'root';
$password = '';
$database = 'chat_bot';

$conn = new mysqli($host, $user, $password, $database);
if ($conn->connect_error) {
    die('Erro na conexão com o banco de dados: ' . $conn->connect_error);
}

// Filtro por número (opcional)
$filtro_numero = isset($_GET['numero']) ? $conn->real_escape_string($_GET['numero']) : '';
$sql = "SELECT * FROM historico_logs";
if ($filtro_numero) {
    $sql .= " WHERE numero_usuario LIKE '%$filtro_numero%'";
}
$sql .= " ORDER BY data_hora DESC LIMIT 100";

$result = $conn->query($sql);
?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Painel de Logs - ChatBot</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body class="bg-light">
<div class="container mt-5">
    <h2 class="mb-4">Histórico de Perguntas e Respostas</h2>

    <form method="get" class="row g-3 mb-4">
        <div class="col-auto">
            <input type="text" name="numero" class="form-control" placeholder="Filtrar por número" value="<?= htmlspecialchars($filtro_numero) ?>">
        </div>
        <div class="col-auto">
            <button type="submit" class="btn btn-primary">Filtrar</button>
        </div>
    </form>

    <table class="table table-bordered table-striped">
        <thead class="table-dark">
            <tr>
                <th>ID</th>
                <th>Número</th>
                <th>Pergunta</th>
                <th>Resposta</th>
                <th>Data/Hora</th>
            </tr>
        </thead>
        <tbody>
            <?php while ($row = $result->fetch_assoc()): ?>
                <tr>
                    <td><?= $row['id'] ?></td>
                    <td><?= htmlspecialchars($row['numero_usuario']) ?></td>
                    <td><?= nl2br(htmlspecialchars($row['pergunta'])) ?></td>
                    <td><?= nl2br(htmlspecialchars($row['resposta'])) ?></td>
                    <td><?= $row['data_hora'] ?></td>
                </tr>
            <?php endwhile; ?>
        </tbody>
    </table>
</div>
</body>
</html>
