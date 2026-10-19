// Carrega no vm os dados das masteries direto do HTML gerado (mesmos textos que o navegador usa).
const fs = require('fs'), vm = require('vm');
module.exports = function (ctx, html) {
  const h = fs.readFileSync(html, 'utf8');
  const blocks = h.split(/<script>/).slice(1).map(x => x.split('</script>')[0])
    .filter(c => /window\.TQ2 = \{ masteries|\bTQ2\.add\(\{/.test(c) && c.length < 400000);
  blocks.forEach(c => vm.runInContext(c, ctx));
  return blocks.length;
};
