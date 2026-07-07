'use strict';
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const outMain = path.join(rootDir, 'main.js');

const srcFiles = [
  'src/core/constants.js',
  'src/core/store.js',
  'src/core/schema.js',
  'src/core/parser.js',
  'src/utils/helpers.js',
  'src/ui/styles.js',
  'src/ui/layoutgen.js',
  'src/ui/render.js',
  'src/api/generate.js',
  'src/ui/panel.js',
  'src/ui/toolbar.js',
  'src/index.js',
];

const HEADER = `(() => {
  const log = (...args) => console.log('[status-panel]', ...args);

  let parentDoc, parent$;
  try {
    parentDoc = window.parent.document;
    parent$ = window.parent.$;
  } catch (e) {
    log('Failed to access parent:', e);
  }

`;

const FOOTER = `
})();
`;

function build() {
  const body = srcFiles
    .map((f) => {
      const base = path.basename(f);
      const label = `  // ${'─'.repeat(3)} ${base} ${'─'.repeat(Math.max(0, 60 - base.length))}`;
      const abs = path.join(rootDir, f);
      const code = fs
        .readFileSync(abs, 'utf8')
        .split('\n')
        .map((line) => '  ' + line)
        .join('\n');
      return label + '\n\n' + code;
    })
    .join('\n\n');

  const js = HEADER + body + FOOTER;

  fs.writeFileSync(outMain, js, 'utf8');

  const distDir = path.join(rootDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'status-panel.js'), js, 'utf8');

  const scriptJson = JSON.stringify(
    {
      type: 'script',
      enabled: true,
      name: 'Status Panel',
      id: 'status-panel',
      info:
        '状态栏引擎（全局脚本）：面板定义存于角色卡 data.extensions.status_panel，随卡导出/导入；识别回复中的状态块（可配置标记，JSON 或 键:值）并渲染面板；缺少状态块时可用面板上的「重试」手动生成。通过 SP 面板按钮管理。Status panel engine (global script): per-character definitions live in the character card and travel with it; engine settings never touch the card.',
      button: {
        enabled: true,
        // SP 重载 is a dev-workflow button provided by the loader JSON, not shipped here.
        buttons: [
          { name: 'SP 面板', visible: true },
        ],
      },
      data: {},
      content: js,
    },
    null,
    2,
  );
  fs.writeFileSync(path.join(distDir, 'status-panel.json'), scriptJson, 'utf8');

  const lines = js.split('\n').length;
  console.log(`Build complete (${lines} lines)`);
  console.log(`  → ${path.relative(rootDir, outMain)}`);
  console.log('  → dist/status-panel.js');
  console.log('  → dist/status-panel.json');
}

build();

if (process.argv.includes('--watch')) {
  const srcDir = path.join(rootDir, 'src');
  console.log('Watching src/ for changes... (Ctrl+C to stop)');
  fs.watch(srcDir, { recursive: true }, (_event, filename) => {
    if (filename) console.log(`  changed: ${filename}`);
    build();
  });
}
