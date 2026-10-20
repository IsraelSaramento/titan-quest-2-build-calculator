# Titan Quest 2 Build Calculator

Calculadora de builds de Titan Quest II em um HTML único. Responder ao usuário em português.

- Gerar o HTML: `python tools/patch_html.py` (gera `titan-quest-2-build-calculator.html` e, se houver `src/save_*.js`, a versão com personagem).
- Tudo deve vir dos arquivos do jogo ou do save, nunca de números informados à mão.
- Dados pessoais (`src/save_*.js`, `*-phantomn.html`) ficam fora do git.
- Testes: `node tools/test_all.js <html> <pasta SaveGames>` e `node tools/test_opt.js <html> <pasta SaveGames>`.
- Commits e PRs: autor IsraelSaramento
