import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Pages HTML uses repository-relative assets and links',()=>{
  for(const file of ['static/index.html','static/admin.html']){
    const html=readFileSync(file,'utf8');
    assert.doesNotMatch(html,/(?:src|href)="\//);
    assert.match(html,/\.\/config\.js/);
  }
});

test('Pages workflow deploys only the generated artifact',()=>{
  const workflow=readFileSync('.github/workflows/pages.yml','utf8');
  assert.match(workflow,/npm run build:pages/);
  assert.match(workflow,/path: dist/);
  assert.match(workflow,/actions\/deploy-pages@v4/);
});
