Feature: Orcamentos por categoria
  Como usuario do app, quero definir quanto pretendo gastar por categoria no
  mes e ser avisado quando estourar.

  @critical
  Scenario: Criar orcamento novo para uma categoria no mes
    Given nao existe orcamento para a categoria "Lazer" neste mes
    When o usuario define um valor de R$300 para "Lazer"
    Then um orcamento novo e criado com aquele valor

  @critical
  Scenario: Atualizar orcamento existente (upsert)
    Given ja existe um orcamento de R$300 para "Lazer" neste mes
    When o usuario define um novo valor de R$400 para a mesma categoria e mes
    Then o orcamento existente e atualizado, sem duplicar

  @regression
  Scenario Outline: Cor de alerta conforme o percentual gasto
    Given um orcamento com <percentual>% do valor gasto
    Then a barra de progresso mostra a cor <cor>

    Examples:
      | percentual | cor      |
      | 50         | emerald  |
      | 80         | emerald  |
      | 90         | amber    |
      | 100        | amber    |
      | 120        | red      |
