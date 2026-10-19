# Titan Quest 2 Build Calculator

Calculadora de builds de **Titan Quest II** que roda no navegador, num único arquivo HTML.

- Monte a build escolhendo 2 masteries, pontos, modifiers e feats.
- Carregue o seu personagem direto do save do jogo (build, equipamentos, charms e relíquias).
- Veja o dano real por acerto e por segundo da skill principal, com velocidade de ataque, crítico, Rage, Energy (custo, regeneração, reservas) e cooldown.
- Botão de sugestões: até 3 mudanças que aumentam o DPS, dentro das 2 masteries da build, mais trocas de equipamento e afixos.

Todas as regras e números vêm dos arquivos do jogo (Titan Quest II Early Access 0.7.0) e foram calibrados contra os tooltips do jogo.

## Como usar

Abra `titan-quest-2-build-calculator.html` no navegador. Para carregar um personagem, use o botão de importar e escolha os arquivos do save em
`%LOCALAPPDATA%\TQ2\Saved\SaveGames`.

## Como gerar o HTML

```
python tools/patch_html.py
```

Junta `src/atlas_base.html` com os scripts de `src/` e gera o HTML final.

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `src/` | Página base, motor de cálculo (`calc.js`), interface (`calc_ui.js`), otimizador (`optimize.js`), importador de save (`import.js`) e dados extraídos do jogo |
| `tools/` | Extração dos arquivos do jogo (Python) e testes (Node) |

## Testes

```
node tools/test_all.js titan-quest-2-build-calculator.html "%LOCALAPPDATA%\TQ2\Saved\SaveGames"
node tools/test_opt.js titan-quest-2-build-calculator.html "%LOCALAPPDATA%\TQ2\Saved\SaveGames"
```

Projeto de fã, sem vínculo com a THQ Nordic ou a Grimlore Games.
