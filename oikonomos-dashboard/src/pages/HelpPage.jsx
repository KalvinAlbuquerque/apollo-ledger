import React from 'react';
import styles from './HelpPage.module.css';

function HelpPage() {
  return (
    <div className={styles.page}>
      <h1>Manual de Uso Oikonomos</h1>
      
      <section>
        <h2>Bem-vindo!</h2>
        <p>
          Nossa missão é fornecer a você uma ferramenta poderosa, mas simples, para entender e controlar sua vida financeira. Acreditamos que, com as informações certas, você pode tomar decisões mais inteligentes e alcançar seus objetivos.
        </p>
        <p>
          <strong>Dica Rápida:</strong> Viu um ícone de interrogação <strong>?</strong> em alguma seção? Clique nele para obter uma explicação rápida sobre aquela funcionalidade específica, sem precisar sair da tela!
        </p>
      </section>

      {/* SUMÁRIO RÁPIDO */}
      <nav className={styles.summaryNav}>
        <h3>Navegação Rápida</h3>
        <ul>
          <li><a href="#dashboard">1. O Dashboard: Sua Central de Comando</a></li>
          <li><a href="#management">2. A Central de Gerenciamento: Configurando a Base</a></li>
          <li><a href="#reports">3. Relatórios: Análise Profunda</a></li>
          <li><a href="#forecast">4. Previsões: Planejando o Futuro</a></li>
          <li><a href="#telegram">5. Bônus: Usando o Bot do Telegram</a></li>
        </ul>
      </nav>

      {/* SEÇÃO 1: DASHBOARD */}
      <section id="dashboard">
        <h2>1. O Dashboard: Sua Central de Comando</h2>
        <p>
          O Dashboard é a primeira tela que você vê e foi projetado para te dar uma visão geral e imediata da sua saúde financeira no período selecionado.
        </p>
        <h3>1.1. Resumo do Período</h3>
        <p>No topo da página, você encontra três cartões principais:</p>
        <ul>
          <li><strong>Rendas no Período:</strong> Mostra a soma de todo o dinheiro que entrou nas suas contas dentro do período de tempo definido nos filtros.</li>
          <li><strong>Despesas no Período:</strong> A soma de todo o dinheiro que saiu das suas contas no mesmo período.</li>
          <li><strong>Saldo do Período:</strong> A diferença simples entre as rendas e as despesas (`Rendas - Despesas`).</li>
        </ul>
        <h3>1.2. Filtros e Período</h3>
        <p>Por padrão, o Dashboard mostra os dados do <strong>mês atual</strong>. Você pode mudar essa visualização a qualquer momento usando a seção de filtros.</p>
        <h3>1.3. Gráficos e Ranking</h3>
        <p>Esta área visual ajuda a entender para onde seu dinheiro está indo, mostrando seus gastos por categoria e suas maiores fontes de despesa no período.</p>
        <h3>1.4. Progresso dos Orçamentos</h3>
        <p>Esta seção é o seu "termômetro" de gastos. Ela compara suas despesas atuais com os limites (orçamentos) que você definiu na página de <strong>Gerenciamento</strong>. Se uma barra ficar vermelha, é um sinal de alerta!</p>
        <h3>1.5. Histórico de Transações</h3>
        <p>Aqui fica a lista detalhada de todas as operações do período filtrado, onde você pode adicionar, editar ou excluir lançamentos.</p>
      </section>

      {/* SEÇÃO 2: GERENCIAMENTO */}
      <section id="management">
        <h2>2. A Central de Gerenciamento: Configurando a Base</h2>
        <p>
          Esta é a página mais importante para começar a usar o Oikonomos. Aqui você define a "estrutura" da sua vida financeira. Organizar bem esta seção tornará o resto do sistema muito mais fácil e automático.
        </p>
        <h3>2.1. Contas</h3>
        <p>Cadastre todas as suas fontes de dinheiro: conta corrente, poupança, cartão de crédito, carteira física, etc. Marque uma como padrão (⭐) para agilizar os lançamentos no Telegram.</p>
        <h3>2.2. Categorias</h3>
        <p>Crie as categorias que descrevem suas transações (ex: "Alimentação", "Transporte", "Salário"). Isso é essencial para os relatórios e orçamentos.</p>
        <h3>2.3. Orçamentos</h3>
        <p>Defina um teto de gastos mensal para cada categoria de despesa. O sistema irá te avisar no Dashboard conforme você se aproxima ou ultrapassa o limite.</p>
        <h3>2.4. Metas</h3>
        <p>Crie metas de poupança (ex: "Viagem de Férias"), defina um valor alvo e acompanhe seu progresso. O sistema calcula até o valor ideal a ser guardado por mês.</p>
        <h3>2.5. Contas a Pagar</h3>
        <p>Registre suas contas fixas (aluguel, internet) ou dívidas. Se a conta for recorrente, o sistema a criará automaticamente para o próximo mês após o pagamento.</p>
      </section>
      
      {/* SEÇÃO 3: RELATÓRIOS */}
      <section id="reports">
        <h2>3. Relatórios: Análise Profunda</h2>
        <p>
          Enquanto o Dashboard oferece uma foto do momento, a página de Relatórios permite que você analise a evolução das suas finanças ao longo do tempo. É a ferramenta ideal para identificar tendências e padrões.
        </p>
        <ul>
          <li><strong>Fluxo de Caixa Mensal:</strong> Compare o total de rendas e despesas de cada mês, lado a lado. Ajuda a ver rapidamente se você está operando no positivo ou no negativo mês a mês.</li>
          <li><strong>Evolução de Despesas por Categoria:</strong> Este gráfico de linhas mostra como seus gastos em diferentes categorias mudam com o tempo. Ideal para ver se aquele gasto com "Lazer" está aumentando ou se você conseguiu reduzir os custos com "Alimentação".</li>
          <li><strong>Evolução do Saldo vs. Despesas Acumuladas:</strong> Acompanhe o crescimento do seu patrimônio (saldo) e compare com o total de despesas acumuladas. Uma ótima maneira de visualizar seu progresso financeiro a longo prazo.</li>
        </ul>
      </section>

      {/* SEÇÃO 4: PREVISÕES */}
      <section id="forecast">
        <h2>4. Previsões: Planejando o Futuro</h2>
        <p>
          A página de Previsões é sua bola de cristal financeira. Ela permite que você planeje o mês seguinte, ajudando a antecipar despesas e a garantir que suas contas fechem antes mesmo do mês começar.
        </p>
        <ul>
          <li><strong>Como funciona?</strong> O sistema utiliza a média dos seus gastos dos últimos 3 meses e suas "Contas a Pagar" já cadastradas para criar uma projeção de despesas.</li>
          <li><strong>Planeje suas Rendas:</strong> No campo "Rendas Previstas", informe suas fontes de renda esperadas para o próximo mês (como o salário).</li>
          <li><strong>Simule o Cenário:</strong> Com as rendas e as despesas projetadas, o sistema calcula o seu provável saldo final. Se o resultado for negativo, você tem tempo de sobra para se planejar e cortar gastos.</li>
          <li><strong>Salve a Previsão:</strong> Você pode salvar suas previsões para consultá-las no futuro e comparar o planejado com o realizado.</li>
        </ul>
      </section>
      
      {/* SEÇÃO 5: TELEGRAM */}
      <section id="telegram">
        <h2>5. Bônus: Usando o Bot do Telegram</h2>
        <p>
          Uma das funcionalidades mais poderosas do Oikonomos é a capacidade de registrar suas finanças de qualquer lugar, usando o Telegram. Chega de esquecer de anotar aquele cafezinho!
        </p>
        <h3>Como Configurar</h3>
        <ol>
          <li>Encontre o bot Oikonomos no Telegram (procure pelo nome de usuário do seu bot).</li>
          <li>Inicie uma conversa e o bot pedirá seu e-mail. Envie o <strong>mesmo e-mail</strong> que você usa para acessar este dashboard.</li>
          <li>Pronto! Sua conta do Telegram estará vinculada.</li>
        </ol>
        
        <h3>Comandos Principais</h3>
        <p>A sintaxe foi criada para ser rápida e intuitiva:</p>
        <ul>
            <li><strong>Registrar Gasto:</strong> <code>15,50 alimentação almoço com a equipe</code></li>
            <li><strong>Registrar Renda:</strong> <code>+ 1200 salário adiantamento</code></li>
            <li><strong>Pagar uma Conta Agendada:</strong> <code>pagar aluguel</code></li>
            <li><strong>Transferência:</strong> <code>transferir 100 da nubank para carteira</code></li>
            <li><strong>Ver Orçamento de uma Categoria:</strong> <code>ver orçamento alimentação</code></li>
            <li><strong>Ver Gastos de Hoje:</strong> <code>ver gastos hoje</code></li>
            <li><strong>Ajuda:</strong> Envie <code>?</code> ou <code>ajuda</code> a qualquer momento para ver a lista completa de comandos no próprio bot.</li>
        </ul>
      </section>
    </div>
  );
}

export default HelpPage;