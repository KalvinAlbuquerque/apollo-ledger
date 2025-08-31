// src/pages/HelpPage.jsx
import React, { useState } from 'react';
import styles from './HelpPage.module.css';

function HelpPage() {
  const [currentPage, setCurrentPage] = useState(0); // 0 para a página inicial, 1 para Primeiro Acesso, etc.

  const sections = [
    { id: 'intro', title: 'Manual de Uso Oikonomos' },
    { id: 'first-login', title: '1. Primeiro Acesso' }, // NOVA SEÇÃO
    { id: 'dashboard', title: '2. O Dashboard' },
    { id: 'management', title: '3. Gerenciamento' },
    { id: 'reports', title: '4. Relatórios' },
    { id: 'forecast', title: '5. Previsões' },
    { id: 'telegram', title: '6. Bot do Telegram' },
  ];

  const renderPageContent = () => {
    switch (currentPage) {
      case 0:
        return (
          <section id="intro">
            <h2>Bem-vindo!</h2>
            <p>
              Nossa missão é fornecer a você uma ferramenta poderosa, mas simples, para entender e controlar sua vida financeira. Acreditamos que, com as informações certas, você pode tomar decisões mais inteligentes e alcançar seus objetivos.
            </p>
            <p>
              <strong>Dica Rápida:</strong> Viu um ícone de interrogação <strong>?</strong> em alguma seção? Clique nele para obter uma explicação rápida sobre aquela funcionalidade específica, sem precisar sair da tela!
            </p>
            <p>
              Use o menu de navegação ao lado para explorar cada seção do manual.
            </p>
          </section>
        );
      case 1:
        return (
          <section id="first-login">
            <h2>1. Primeiros Passos para a Jornada Financeira</h2>
            <p>
              Bem-vindo ao Apollo! Para começar sua jornada em direção ao controle financeiro, siga este guia simples e rápido. A configuração inicial é o alicerce para que todo o sistema funcione perfeitamente para você.
            </p>

            <h3>Passo 1: Configure seu Perfil</h3>
            <p>
              Sua primeira parada é na sua área pessoal, na página Minha Conta. Nela, você pode verificar se suas informações de perfil estão corretas. Altere seu nome de usuário e adicione um apelido se desejar.
            </p>
            <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
              <li>Adicione seu Apelido para personalizar sua experiência.</li>
              <li>Defina o Nome Completo para identificação.</li>
            </ul>

            <h3>Passo 2: Construa a Fundação Financeira</h3>
            <p>
              Agora, é hora de criar a estrutura onde todas as suas transações serão registradas. Acesse a Central de Gerenciamento e siga as instruções:
            </p>
            <ol>
              <li>
                Na aba Contas, crie todas as suas contas. Pense em cada lugar onde seu dinheiro está guardado.
                <br />Exemplos: "Carteira Física", "Nubank", "Poupança de Emergência".
              </li>
              <li>
                Na mesma aba, escolha a sua conta mais usada e clique no botão de estrela (⭐) para torná-la sua Conta Padrão. Isso torna o registro de transações via Telegram ainda mais rápido.
              </li>
              <li>
                Mude para a aba Categorias. Crie categorias de Despesa e Renda que reflitam seu estilo de vida. Quanto mais detalhado, mais precisos serão seus relatórios!
                <br />Exemplos de Despesa: "Alimentação", "Transporte", "Moradia".
                <br />Exemplos de Renda: "Salário", "Freelance", "Renda Extra".
              </li>
            </ol>
            <p>
              🎉 Parabéns! Com sua primeira conta e categorias criadas, você está pronto para voltar ao Dashboard e começar a registrar suas finanças. As outras seções de Gerenciamento (Orçamentos, Metas, Contas a Pagar) podem ser exploradas e configuradas a qualquer momento.
            </p>
          </section>
        );
      case 2:
        return (
          <section id="dashboard">
            <h2>2. O Dashboard: Sua Central de Comando</h2>
            <p>
              O Dashboard foi projetado para ser o seu painel de controle diário. Siga estes passos para extrair o máximo de informação e manter suas finanças em dia.
            </p>
            <h3>Passo 1: Comece pela Visão Geral</h3>
            <p>
              Assim que você entra no Dashboard, os três cartões no topo da página oferecem um resumo rápido da sua situação financeira no período de tempo ativo.
            </p>
            <ul>
              <li><strong>Rendas no Período:</strong> Mostra a soma total de todo o dinheiro que entrou nas suas contas.</li>
              <li><strong>Despesas no Período:</strong> A soma de todo o dinheiro que saiu. Inclui gastos, contribuições para metas e pagamentos de contas.</li>
              <li><strong>Saldo Atual em Contas:</strong> Este valor representa a soma do saldo atual de todas as suas contas cadastradas. É o seu patrimônio líquido em tempo real.</li>
            </ul>
            <h3>Passo 2: Registre sua Primeira Transação</h3>
            <p>
              A ação mais importante é registrar suas operações. Clique no botão <strong>"+ Adicionar Transação"</strong> para abrir o modal e escolha o tipo de operação:
            </p>
            <ul>
              <li><strong>Despesa:</strong> Para registrar um gasto.</li>
              <li><strong>Renda:</strong> Para registrar uma entrada de dinheiro.</li>
              <li><strong>Transferência:</strong> Para mover dinheiro entre duas contas que você cadastrou.</li>
            </ul>
            <p>Preença os campos (valor, conta, categoria e descrição) e salve. Isso atualizará automaticamente todos os cartões e gráficos!</p>
            <h3>Passo 3: Mude a Perspectiva com os Filtros</h3>
            <p>
              Quer ver como você gastou no mês passado ou na última semana? Use a seção <strong>"Filtros & Opções"</strong> para alterar o período de visualização. Você pode usar os botões de atalho ("Hoje", "Mês", etc.) ou definir uma faixa de datas personalizada.
            </p>
            <h3>Passo 4: Analise seus Hábitos com os Gráficos</h3>
            <p>
              Os gráficos oferecem uma forma visual de entender para onde seu dinheiro está indo.
            </p>
            <ul>
              <li>Use os botões de navegação (&lt; e &gt;) para alternar entre a visão de despesas por categoria e a de rendas por origem.</li>
              <li>O <strong>"Top 10 Categorias de Despesa"</strong> mostra as categorias em que você mais gastou no período, ajudando a identificar rapidamente seus maiores fluxos de saída.</li>
            </ul>
            <h3>Passo 5: Mantenha a Tabela de Transações Organizada</h3>
            <p>
              A tabela no final da página é o seu histórico detalhado.
            </p>
            <ul>
              <li><strong>Editar e Excluir:</strong> Use os botões ao lado de cada transação para fazer ajustes pontuais.</li>
              <li><strong>Ações em Massa:</strong> Para apagar várias transações de uma vez, clique em <strong>"Selecionar Vários"</strong>, marque as linhas desejadas e clique em "Excluir Selecionados".</li>
            </ul>
            <h3>Passo 6: Importando Transações em Massa via CSV</h3>
            <p>
              Se você tem muitas transações para registrar de uma vez, a importação via CSV é a ferramenta ideal. Siga as regras abaixo para garantir que seu arquivo seja processado corretamente.
            </p>
            <ol>
              <li>
                <strong>Baixe o Modelo:</strong> Na área de transações, clique no menu de três pontinhos (⋮) e selecione "Baixar Modelo CSV". Isso garante que você tenha as colunas corretas.
              </li>
              <li>
                <strong>Preencha o Ficheiro:</strong> Abra o ficheiro `modelo_transacoes.csv` em um editor de planilhas e preencha as linhas com suas transações, seguindo as regras abaixo.
              </li>
              <li>
                <strong>Importe o Ficheiro:</strong> No mesmo menu, clique em "Importar CSV" e selecione seu ficheiro preenchido.
              </li>
            </ol>

            <h4 style={{ color: 'var(--vermelho-destaque)' }}>⚠️ Regras de Validação (Muito Importante!)</h4>
            <p>
              O sistema valida cada linha do seu ficheiro antes de importar. Se <strong>qualquer erro</strong> for encontrado, a importação inteira será cancelada. Verifique se seu ficheiro segue estas regras:
            </p>
            <ul>
              <li><strong>data:</strong> Use o formato <strong>AAAA-MM-DD</strong> (ex: `2025-12-31`).</li>
              <li><strong>tipo:</strong> Deve ser exatamente `despesa` ou `renda` (sem acentos e em minúsculas).</li>
              <li><strong>categoria:</strong> O nome da categoria deve ser <strong>exatamente igual</strong> a uma categoria que você já criou no sistema (em "Gerenciamento"). O sistema diferencia maiúsculas de minúsculas.</li>
              <li><strong>valor:</strong> Use um ponto como separador decimal (ex: `15.50`). Não use vírgulas ou símbolos de moeda.</li>
              <li><strong>conta:</strong> O nome da conta deve ser <strong>exatamente igual</strong> a uma conta que você já criou.</li>
              <li><strong>descricao:</strong> Campo opcional para detalhes extras.</li>
            </ul>
            <p>
              Se a importação falhar, o sistema mostrará uma mensagem de erro indicando a linha e o problema específico (ex: "Erro na linha 5: Categoria 'almoço' não encontrada."). Corrija seu ficheiro e tente novamente.
            </p>
          </section>
        );
      case 3:
        return (
          <section id="management">
            <h2>3. A Central de Gerenciamento: Configurando a Base</h2>
            <p>
              Esta é a página mais importante para começar a usar o Oikonomos. Aqui você define a "estrutura" da sua vida financeira, organizando todas as bases para um controle financeiro completo.
            </p>
            <h3>Passo 1: Crie suas Contas</h3>
            <p>
              Comece listando todas as suas fontes de dinheiro. Pode ser uma conta bancária (corrente ou poupança), uma conta digital, o saldo do seu cartão de crédito (como uma conta de saldo negativo) ou sua carteira física.
            </p>
            <ul>
              <li><strong>Campo "Nome":</strong> Dê um nome fácil para a conta, como "Nubank", "Itaú" ou "Carteira".</li>
              <li><strong>Caixa "É uma reserva?":</strong> Marque esta opção para contas que você não usa no dia a dia, como fundos de emergência ou investimentos.</li>
              <li><strong>Botão "⭐":</strong> Clique na estrela ao lado de uma conta para defini-la como sua conta padrão. Isso agilizará os lançamentos rápidos de gastos e rendas pelo Telegram.</li>
            </ul>
            <h3>Passo 2: Defina suas Categorias</h3>
            <p>
              As categorias são essenciais para classificar suas transações e ter relatórios significativos. Crie categorias que façam sentido para o seu estilo de vida.
            </p>
            <ul>
              <li><strong>Tipo "Despesa":</strong> Para gastos. Exemplos: "Alimentação", "Transporte", "Lazer".</li>
              <li><strong>Tipo "Renda":</strong> Para entradas de dinheiro. Exemplos: "Salário", "Freelance", "Presente".</li>
            </ul>
            <h3>Passo 3: Estabeleça seus Orçamentos</h3>
            <p>
              Os orçamentos são os limites de gastos mensais que você define para cada categoria de despesa.
            </p>
            <ul>
              <li>O sistema lista todas as suas categorias de despesa. Basta inserir o valor máximo que você planeja gastar em cada uma.</li>
              <li>Após salvar, o Dashboard mostrará o progresso de cada orçamento em tempo real. Você será alertado quando se aproximar do limite.</li>
            </ul>
            <h3>Passo 4: Gerencie suas Metas de Poupança</h3>
            <p>
              Use esta seção para planejar e acompanhar seus objetivos financeiros.
            </p>
            <ul>
              <li><strong>Crie uma Meta:</strong> Nomeie-a (ex: "Viagem Paris"), defina um valor alvo (ex: R$ 5.000) e uma data alvo. O sistema calculará o quanto você precisa guardar por mês para atingir o objetivo a tempo.</li>
              <li><strong>Contribua:</strong> Use o botão "+ Adicionar" para transferir dinheiro de uma das suas contas para a meta. O sistema registrará automaticamente a transação.</li>
            </ul>
            <h3>Passo 5: Organize suas Contas a Pagar</h3>
            <p>
              Registre aqui suas contas fixas e dívidas para nunca mais esquecer de um vencimento.
            </p>
            <ul>
              <li><strong>Adicione uma Conta:</strong> Inclua descrição, valor, categoria e data de vencimento.</li>
              <li><strong>Marque como Paga:</strong> Ao pagar uma conta, clique em "Paga". O sistema registrará a despesa na sua conta e marcará a dívida como paga.</li>
              <li><strong>Contas Recorrentes:</strong> Se uma conta se repete todos os meses, marque a opção "Repetir mensalmente" para que o sistema a crie automaticamente no próximo mês.</li>
            </ul>
          </section>
        );
      case 4:
        return (
          <section id="reports">
            <h2>4. Relatórios: Análise Profunda</h2>
            <p>
              Enquanto o Dashboard oferece uma foto do momento, a página de Relatórios permite que você analise a evolução das suas finanças ao longo do tempo. É a ferramenta ideal para identificar tendências e padrões.
            </p>
            <p>
              Para usar esta página, comece selecionando o período de tempo que você deseja analisar no filtro superior. Depois, explore os gráficos abaixo para obter uma análise completa.
            </p>
            <h3>4.1. Fluxo de Caixa Mensal</h3>
            <p>
              Este gráfico de barras compara suas rendas e despesas de cada mês. Ele te dá uma visão clara se você está operando no positivo (barra de renda maior que a de despesa) ou no negativo.
            </p>
            <ul>
              <li><strong>O que observar:</strong> Procure por meses com grandes discrepâncias entre renda e despesa para entender os motivos (gastos inesperados, bônus, etc.).</li>
            </ul>
            <h3>4.2. Evolução de Despesas por Categoria</h3>
            <p>
              Aqui, você pode selecionar uma categoria específica (como "Alimentação") e ver como seus gastos nessa área evoluem mês a mês.
            </p>
            <ul>
              <li><strong>O que observar:</strong> Este gráfico é perfeito para ver se seus esforços para reduzir gastos em uma categoria estão funcionando. Um declínio na linha significa que você está gastando menos.</li>
            </ul>
            <h3>4.3. Evolução do Saldo vs. Despesas Acumuladas</h3>
            <p>
              Este é um dos relatórios mais importantes para a sua saúde financeira. Ele mostra o crescimento do seu saldo total (linha azul) e o total acumulado das suas despesas (linha vermelha).
            </p>
            <ul>
              <li><strong>O que observar:</strong> Idealmente, a linha do seu saldo deve crescer de forma consistente e se distanciar da linha de despesas. Isso é um sinal de que você está poupando e construindo patrimônio de forma eficiente.</li>
            </ul>
          </section>
        );
      case 5:
        return (
          <section id="forecast">
            <h2>5. Previsões: Planejando o Futuro</h2>
            <p>
              A página de Previsões é sua "bola de cristal" financeira. Ela permite que você planeje o próximo mês, ajudando a antecipar despesas e a garantir que suas contas fechem no positivo.
            </p>

            <h3>Passo 1: Comece com a Média de Gastos</h3>
            <p>
              Na primeira coluna, o sistema calcula automaticamente a média dos seus gastos nos últimos 3 meses.
            </p>
            <ul>
              <li><strong>O que fazer:</strong> Use esta lista como um guia. Clique no botão "Adicionar à previsão" (+) para incluir uma média de gasto à sua projeção. Isso permite que você ajuste manualmente o valor, caso precise.</li>
            </ul>

            <h3>Passo 2: Monte a Projeção de Despesas</h3>
            <p>
              A previsão de despesas é montada automaticamente a partir de duas fontes:
            </p>
            <ul>
              <li><strong>Contas Fixas:</strong> Suas contas a pagar (aluguel, internet, etc.) que vencem no próximo mês são adicionadas automaticamente à lista.</li>
              <li><strong>Contas Variáveis:</strong> As médias de gastos que você selecionou no passo 1 também são adicionadas aqui.</li>
              <li><strong>O que fazer:</strong> Você pode usar o ícone de lixeira (🗑️) para remover qualquer despesa que não seja aplicável à sua previsão.</li>
            </ul>

            <h3>Passo 3: Insira suas Rendas Previstas</h3>
            <p>
              Use a seção "Rendas Previstas" para inserir o valor total que você espera receber no próximo mês (salário, bônus, etc.).
            </p>
            <ul>
              <li><strong>O que fazer:</strong> Clique em "+ Adicionar Renda" para inserir múltiplas fontes de entrada de dinheiro.</li>
            </ul>

            <h3>Passo 4: Analise o Resumo da Previsão</h3>
            <p>
              A coluna da direita mostra um resumo em tempo real da sua simulação.
            </p>
            <ul>
              <li><strong>Saldo Final Previsto:</strong> O sistema subtrai o total de despesas do total de rendas para mostrar seu provável saldo final. Se o valor for negativo, é um sinal de alerta para ajustar suas despesas.</li>
              <li><strong>Gráfico:</strong> O gráfico de barras compara visualmente suas rendas e despesas projetadas.</li>
            </ul>

            <h3>Passo 5: Salve sua Previsão</h3>
            <p>
              Quando estiver satisfeito com o cenário, clique em "Salvar Previsão" para registrar sua projeção. Você poderá consultá-la no futuro para comparar o que foi planejado com o que realmente aconteceu.
            </p>
          </section>
        );
      case 6:
        return (
          <section id="telegram">
            <h2>6. Usando o Bot do Telegram</h2>
            <p>
              Uma das funcionalidades mais poderosas do Oikonomos é a capacidade de registrar suas finanças de qualquer lugar, usando o Telegram. Chega de esquecer de anotar aquele cafezinho!
            </p>

            <h3>Passo 1: Como Começar</h3>
            <p>
              Para usar o bot, você precisa vinculá-lo à sua conta do Oikonomos. É um processo rápido e seguro:
            </p>
            <ol>
              <li>Encontre o bot Oikonomos no Telegram (procure pelo nome de usuário do seu bot).</li>
              <li>Inicie uma conversa. Ele pedirá seu e-mail. Envie o <strong>mesmo e-mail</strong> que você usa para acessar este dashboard.</li>
              <li>Pronto! Sua conta do Telegram estará vinculada.</li>
            </ol>
            <p>
              O bot foi projetado para entender a linguagem natural. A sintaxe é simples e rápida para que você possa registrar suas finanças em segundos.
            </p>

            <h3>Passo 2: Comandos para Transações</h3>
            <p>
              Estes comandos são a maneira mais fácil de registrar seus movimentos financeiros:
            </p>
            <ul>
              <li>
                <strong>Registrar um Gasto:</strong> Use o formato `valor categoria descrição`. O bot debitará o valor da sua conta padrão.
                <br />Exemplo: <code>15,50 alimentação almoço com a equipe</code>
              </li>
              <li>
                <strong>Registrar uma Renda:</strong> Use o formato `+ valor categoria descrição`. O bot adicionará o valor à sua conta padrão.
                <br />Exemplo: <code>+ 1200 salário adiantamento</code>
              </li>
              <li>
                <strong>Transação Rápida (sempre na conta padrão):</strong> Use um asterisco `*` no início para pular a etapa de seleção de conta.
                <br />Exemplo de Gasto Rápido: <code>* 5,50 café</code>
                <br />Exemplo de Renda Rápida: <code>*+ 100 presente de aniversário</code>
              </li>
              <li>
                <strong>Pagar uma Conta Agendada:</strong> Basta mencionar o nome da conta agendada. O bot buscará a conta e a marcará como paga.
                <br />Exemplo: <code>pagar aluguel</code>
              </li>
              <li>
                <strong>Fazer uma Transferência:</strong> Use o formato `transferir valor da contaA para contaB`.
                <br />Exemplo: <code>transferir 100 da nubank para carteira</code>
              </li>
              <li>
                <strong>Contribuir para uma Meta:</strong> Use o comando `guardar valor nome da meta`. O valor é deduzido de uma categoria de despesa e adicionado à sua meta.
                <br />Exemplo: <code>guardar 50 fundo de emergência</code>
              </li>
              <li>
                <strong>Sacar de uma Meta:</strong> Use `sacar valor nome da meta para categoria de renda`.
                <br />Exemplo: <code>sacar 200 fundo de emergência para renda extra</code>
              </li>
            </ul>

            <h3>Passo 3: Comandos para Consultas</h3>
            <p>
              Use o comando `ver` para obter informações rápidas sobre suas finanças:
            </p>
            <ul>
              <li>
                <strong>Ver Categorias:</strong> `ver categorias`
                <br />Lista todas as suas categorias de renda e despesa cadastradas.
              </li>
              <li>
                <strong>Ver Orçamentos:</strong> `ver orçamentos`
                <br />Mostra o status de todos os seus orçamentos do mês. Você também pode filtrar por categoria: `ver orçamento alimentação`.
              </li>
              <li>
                <strong>Ver Contas Agendadas:</strong> `ver contas`
                <br />Mostra todas as contas do mês. Você pode usar filtros como `ver contas pendentes` ou `ver contas pagas`.
              </li>
              <li>
                <strong>Ver Gastos de Hoje:</strong> `ver gastos hoje`
                <br />Mostra o total de gastos do dia. Use `ver gastos hoje categorizado` para ver a lista detalhada por categoria.
              </li>
              <li>
                <strong>Ver Saldo Diário:</strong> `ver hoje`
                <br />Mostra quanto você ainda pode gastar por dia em cada categoria, com base no seu orçamento mensal.
              </li>
            </ul>
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <div className={styles.page}>
      <h1>{sections[currentPage].title}</h1>

      <div className={styles.mainContent}>
        <div className={styles.contentColumn}>
          {renderPageContent()}
        </div>

        <nav className={styles.summaryNav}>
          <h3>Navegação Rápida</h3>
          <ul>
            {sections.map((section, index) => (
              <li key={section.id}>
                <a
                  href="#!"
                  onClick={() => setCurrentPage(index)}
                  className={currentPage === index ? styles.activeLink : ''}
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export default HelpPage;