import React from 'react';
import styles from './ExtractManager.module.css';

const BANCOS = [
  {
    id: 'bradesco',
    nome: 'Bradesco',
    formatos: '.csv',
    descricao: 'Extrato CSV exportado pelo Internet Banking do Bradesco.',
    colunas: 'Data ; Histórico ; Docto. ; Crédito (R$) ; Débito (R$) ; Saldo (R$)',
    instrucoes: 'Acesse o Internet Banking → Extratos → Exportar → Formato CSV.',
    status: 'suportado',
  },
  {
    id: 'ofx',
    nome: 'OFX Genérico',
    formatos: '.ofx',
    descricao: 'Formato padrão OFX/QFX exportado pela maioria dos bancos brasileiros (Itaú, Bradesco, Nubank, etc.).',
    colunas: 'Padrão OFX (XML estruturado)',
    instrucoes: 'Acesse o Internet Banking do seu banco → Exportar extrato → Formato OFX ou QFX.',
    status: 'suportado',
  },
  {
    id: 'apollo',
    nome: 'Formato Apollo',
    formatos: '.csv',
    descricao: 'Formato personalizado que você preenche manualmente ou exporta de qualquer planilha. Ideal quando o extrato do seu banco não é suportado.',
    colunas: 'data ; historico ; destinatario_remetente ; valor ; tipo',
    instrucoes: 'Baixe o modelo abaixo, preencha com seus lançamentos e envie para o Apollo.',
    status: 'suportado',
  },
];

const APOLLO_TEMPLATE = [
  'data;historico;destinatario_remetente;valor;tipo',
  '2026-07-10;Pagamento;Uber do Brasil;45.50;debito',
  '2026-07-10;Pix recebido;João Silva;200.00;credito',
  '2026-07-11;Supermercado;Assai Atacadista;312.80;debito',
  '2026-07-12;Salário;Empresa XYZ;5000.00;credito',
].join('\n');

const STATUS_LABEL = {
  suportado: { label: 'Suportado', color: '#39ff14' },
  em_breve: { label: 'Em breve', color: '#f5a623' },
};

function ExtractManager() {
  const handleDownloadTemplate = () => {
    const blob = new Blob([APOLLO_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_apollo.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.container}>
      <h2>Extratos Bancários</h2>
      <p className={styles.subtitle}>
        Formatos de extrato suportados pelo Apollo AI. Envie o arquivo pelo chat do Apollo para importar suas transações automaticamente.
      </p>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Banco / Formato</th>
              <th>Arquivo</th>
              <th>Colunas reconhecidas</th>
              <th>Como exportar</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {BANCOS.map(b => (
              <tr key={b.id}>
                <td>
                  <strong>{b.nome}</strong>
                  <p className={styles.descCell}>{b.descricao}</p>
                </td>
                <td><code className={styles.code}>{b.formatos}</code></td>
                <td><code className={styles.code}>{b.colunas}</code></td>
                <td className={styles.instrucoes}>{b.instrucoes}</td>
                <td>
                  <span className={styles.badge} style={{ color: STATUS_LABEL[b.status].color, borderColor: STATUS_LABEL[b.status].color }}>
                    {STATUS_LABEL[b.status].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.apolloSection}>
        <div className={styles.apolloHeader}>
          <div>
            <h3>Formato Apollo — Modelo CSV</h3>
            <p className={styles.subtitle}>
              Use quando o extrato do seu banco não é suportado, ou quando quiser lançar transações manualmente em lote antes de enviar para categorização via Apollo AI.
            </p>
          </div>
          <button className={styles.downloadBtn} onClick={handleDownloadTemplate}>
            Baixar modelo .csv
          </button>
        </div>

        <div className={styles.formatSpec}>
          <p className={styles.specLabel}>Especificação das colunas</p>
          <div className={styles.colGrid}>
            {[
              { col: 'data', obrig: true, desc: 'Data da transação. Formatos aceitos: AAAA-MM-DD ou DD/MM/AAAA' },
              { col: 'historico', obrig: false, desc: 'Descrição do lançamento (ex: "Pagamento", "PIX recebido")' },
              { col: 'destinatario_remetente', obrig: false, desc: 'Para quem foi pago ou de quem veio. Melhora muito a categorização pela IA' },
              { col: 'valor', obrig: true, desc: 'Valor positivo. Use ponto ou vírgula como decimal' },
              { col: 'tipo', obrig: true, desc: '"debito" ou "despesa" para saída de dinheiro; "credito" ou "renda" para entrada' },
            ].map(({ col, obrig, desc }) => (
              <div key={col} className={styles.colCard}>
                <div className={styles.colName}>
                  <code>{col}</code>
                  {obrig ? <span className={styles.required}>obrigatório</span> : <span className={styles.optional}>opcional</span>}
                </div>
                <p className={styles.colDesc}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExtractManager;
