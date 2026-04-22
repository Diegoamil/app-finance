Documentação de Regras de Negócio: Desafio Financeiro de 15 Dias
1. Lógica Principal do Sistema (Core Mechanic)
A metodologia visa criar o hábito da organização financeira através de um processo faseado e diário
.
Regra do Time-Gate (Bloqueio de 24h): O desenvolvedor deve implementar um sistema de nós ou etapas em que o usuário não pode pular dias ou fazer tudo de uma vez
. Quando o usuário conclui as tarefas de um dia, um cronômetro de 24 horas deve ser iniciado no banco de dados para liberar o próximo passo no front-end
.

--------------------------------------------------------------------------------
2. Mapeamento da Metodologia para Funcionalidades (Dia a Dia)
Dia 1: Diagnóstico Brutal
A Metodologia: Levantar tudo o que entra e sai de dinheiro referente aos últimos três meses e identificar os três maiores gastos fora do custo fixo
.
Funcionalidade (Dev):
Formulário de lançamento de transações (entradas e saídas) com integração opcional de Open Finance para puxar extratos ou campo para upload de arquivos
.
A tela deve forçar o usuário a destacar/selecionar manualmente seus 3 maiores gastos variáveis
.
Dia 2: Mapeamento de Dívidas
A Metodologia: Listar todas as dívidas (mesmo as que estão em dia) e ordená-las pela maior taxa de juros, pois são as que crescem mais rápido
.
Funcionalidade (Dev):
Painel de CRUD (Create, Read, Update, Delete) para dívidas contendo os campos: Credor, Valor Total, Parcelas Restantes e Taxa de Juros
.
O sistema deve ordenar a lista automaticamente de forma decrescente com base na taxa de juros inserida
.
Dia 3: Classificação dos Gastos
A Metodologia: Separar os gastos do Dia 1 em apenas três categorias (Essenciais, Importantes e Supérfluos)
.
Funcionalidade (Dev):
Sistema de Tags ou categorias Hardcoded (não permitir que o usuário crie novas).
O usuário deve classificar transações entre: Essenciais (moradia, alimentação, saúde), Importantes (transporte, educação) e Supérfluos (delivery, assinaturas)
.
Dia 4: Corte de Supérfluos
A Metodologia: Cancelar pelo menos dois gastos supérfluos recorrentes
.
Funcionalidade (Dev):
O sistema filtra os gastos classificados como "Supérfluos" no dia anterior.
O usuário deve marcar um checkbox confirmando o cancelamento de pelo menos dois itens dessa lista para liberar o dia seguinte
.
Dia 5: Renegociação
A Metodologia: Ligar para os dois credores com as maiores taxas de juros (do Dia 2) para pedir descontos ou redução de juros. Se não tiver dívidas, buscar economizar em contas fixas, como trocar plano de celular ou energia
.
Funcionalidade (Dev):
O sistema exibe o "Top 2 Dívidas" do banco de dados
.
Área de texto livre para o usuário atuar como um "diário de negociação", anotando a proposta recebida de cada credor
.
Dia 6: Orçamento Base Zero
A Metodologia: Projetar o mês seguinte utilizando a regra 50/30/20
.
Funcionalidade (Dev):
Calculadora visual que pega a renda total e divide o teto de gastos: 50% necessidades, 30% desejos e 20% investimentos/dívidas
.
Se o usuário planejar gastos que ultrapassem essas fatias, o front-end deve exibir alertas (ex: "gasto ultrapassou X% da meta")
.
Dia 7: Automação Financeira
A Metodologia: Colocar contas essenciais em débito automático e programar transferência de investimentos, garantindo previsibilidade e gerando um saldo real
.
Funcionalidade (Dev):
Checklist interativo confirmando as automações.
Recurso de Saldo Projetado: o sistema pega o saldo atual e já subtrai visualmente os valores das contas automatizadas cadastradas, para o usuário "ver a conta diminuir" logo no início do mês
.
Dia 8: Reserva de Emergência
A Metodologia: Calcular o custo exato de um mês de vida focado apenas no essencial para definir a meta da reserva inicial
.
Funcionalidade (Dev):
O back-end soma todas as despesas marcadas com a tag "Essencial"
.
O sistema gera uma barra de progresso (meta de economia) usando esse valor exato como alvo, sendo o equivalente a 1 mês de custo de vida
.
Dia 9: Detox de Consumo
A Metodologia: Passar 24 horas gastando R$ 0 com itens não essenciais e mapear as vontades de compra
.
Funcionalidade (Dev):
Bloqueio visual para adicionar novos gastos supérfluos no app neste dia.
Um formulário estilo "Diário de Impulsos" para o usuário registrar o que sentiu vontade de comprar e o valor que economizou resistindo
.
Dia 10: Auditoria da Renda
A Metodologia: Buscar e listar três possibilidades reais de gerar dinheiro extra nos próximos 30 dias usando habilidades próprias
.
Funcionalidade (Dev):
Uma interface onde o usuário declara suas principais fontes de renda e é obrigado a preencher três campos de texto detalhando ideias de trabalhos como freelancer ou renda extra (ensinar, consertar, etc.)
.
Dia 11: A Regra das 72 Horas
A Metodologia: Barrar compras por impulso criando um tempo de reflexão para gastos de valor relevante
.
Funcionalidade (Dev - Mecânica Chave):
O app calcula dinamicamente 2% da renda do usuário
.
Sempre que o usuário tentar adicionar um gasto futuro acima de R$ 100 ou acima desses 2%, o item é enviado para uma Lista de Espera.
O botão de "Aprovar Compra" no app fica desabilitado através de um timer de 72 horas
.
Dia 12, 13 e 14: Educação, Alinhamento e Revisão
A Metodologia: Entender conceitos econômicos, alinhar as finanças com familiares e revisar os ganhos obtidos
.
Funcionalidade (Dev):
Dia 12: Campos de textarea vazios que só validam o dia quando o usuário digita explicações sobre "Juros Compostos", "Inflação" e "Custo de Oportunidade"
.
Dia 13: Checkbox de "Accountability", confirmando que apresentou seus dados financeiros para parceiro ou amigo
.
Dia 14: Interface que renderiza dados do Dia 1 lado a lado com os dados atuais (Dia 14). Requer 3 inputs do usuário listando vitórias alcançadas no período
.
Dia 15 e 16: Nova Rotina e Graduação
A Metodologia: Criar alarmes definitivos de checagem financeira e migrar para a fase de aprendizado sobre investimentos
.
Funcionalidade (Dev):
Dia 15: Integração com as APIs nativas do celular (Notificações Push / Calendário) para definir alertas: um de 15 minutos todo domingo, e um de 1 hora no dia 1º de cada mês
.
Dia 16: Tela de "Vitória/Graduação" com um botão de Call-To-Action (ex: redirecionamento para um sistema como a UVP), informando que a fase de organização acabou e agora inicia a fase de fazer o dinheiro trabalhar