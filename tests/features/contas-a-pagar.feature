Feature: Contas a pagar
  Como usuario do app, quero controlar contas fixas (aluguel, assinaturas)
  para nao perder o prazo de pagamento.

  @critical
  Scenario: Marcar uma conta como paga no mes atual
    Given uma conta a pagar com dia de vencimento 15, ainda nao paga este mes
    When o usuario marca a conta como paga
    Then a conta aparece como "pagoEsteMes" verdadeiro
    And a conta deixa de contar como vencida, mesmo apos o dia 15

  @regression
  Scenario: Vencimento ajustado em mes mais curto
    Given uma conta a pagar com dia de vencimento 31
    When o mes atual tem menos de 31 dias (ex: fevereiro)
    Then o vencimento e calculado no ultimo dia do mes

  @critical
  Scenario: Conta vencida sem pagamento
    Given uma conta a pagar com dia de vencimento 5
    When hoje e depois do dia 5 e a conta nao foi paga este mes
    Then a conta aparece como vencida na listagem
