Feature: Metas de economia
  Como usuario do app, quero guardar dinheiro para um objetivo e acompanhar
  o progresso.

  @critical
  Scenario: Depositar em uma meta existente
    Given uma meta com valor atual de R$100
    When o usuario deposita R$50
    Then o valor atual da meta passa a ser R$150

  @regression
  Scenario: Corrigir um deposito indevido sem ficar negativo
    Given uma meta com valor atual de R$100
    When o usuario faz um deposito de -R$150 (correcao)
    Then o valor atual da meta fica em R$0, nunca negativo

  @regression
  Scenario: Meta concluida
    Given uma meta com valor alvo de R$1000
    When o valor atual atinge ou ultrapassa R$1000
    Then a meta e marcada como concluida
